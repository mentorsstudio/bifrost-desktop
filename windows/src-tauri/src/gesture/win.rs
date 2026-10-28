// Windows: o gancho de mouse (WH_MOUSE_LL) e de teclado (WH_KEYBOARD_LL, só
// para o Esc com o menu aberto), os arquivos sob o cursor pelo Shell
// (IShellWindows → IFolderView2 + UI Automation), o menu clássico "Bifrost ›"
// em HKCU e o diálogo de abrir arquivos. O gancho decide em microssegundos:
// todo trabalho pesado (COM, janelas) roda na thread `filee-gesture`.

use std::sync::mpsc::{channel, Sender};
use std::sync::Mutex;
use std::time::Duration;

use windows::core::{Interface, BSTR, PWSTR};
use windows::Win32::Foundation::{HWND, LPARAM, LRESULT, POINT, WPARAM};
use windows::Win32::System::Com::{
    CoCreateInstance, CoInitializeEx, CoTaskMemFree, CoUninitialize, IServiceProvider, CLSCTX_ALL, CLSCTX_INPROC_SERVER,
    COINIT_APARTMENTTHREADED,
};
use windows::Win32::System::LibraryLoader::GetModuleHandleW;
use windows::Win32::System::Threading::GetCurrentThreadId;
use windows::Win32::System::Variant::VARIANT;
use windows::Win32::UI::Accessibility::{CUIAutomation, IUIAutomation, IUIAutomationElement, UIA_DataItemControlTypeId, UIA_ListItemControlTypeId};
use windows::Win32::UI::Input::KeyboardAndMouse::{
    GetAsyncKeyState, SendInput, INPUT, INPUT_0, INPUT_MOUSE, MOUSEEVENTF_MIDDLEDOWN, MOUSEEVENTF_MIDDLEUP, MOUSEEVENTF_RIGHTDOWN, MOUSEEVENTF_RIGHTUP, MOUSEEVENTF_XDOWN, MOUSEEVENTF_XUP, MOUSEINPUT, MOUSE_EVENT_FLAGS,
};
use windows::Win32::UI::Shell::{
    IFolderView2, IShellBrowser, IShellItem, IShellWindows, IWebBrowser2, ShellWindows, SID_STopLevelBrowser,
    SIGDN_FILESYSPATH, SIGDN_NORMALDISPLAY, SVGIO_ALLVIEW, SWC_DESKTOP, SWFO_NEEDDISPATCH,
};
use windows::Win32::UI::WindowsAndMessaging::{
    CallNextHookEx, DispatchMessageW, GetAncestor, GetClassNameW, GetMessageW, GetParent, PostThreadMessageW, SetWindowsHookExW,
    TranslateMessage, UnhookWindowsHookEx, WindowFromPoint, GA_ROOT, KBDLLHOOKSTRUCT, MSG, MSLLHOOKSTRUCT, WH_KEYBOARD_LL,
    WH_MOUSE_LL, WM_KEYDOWN, WM_LBUTTONDOWN, WM_MBUTTONDOWN, WM_MBUTTONUP, WM_QUIT, WM_RBUTTONDOWN, WM_RBUTTONUP, WM_SYSKEYDOWN, WM_XBUTTONDOWN, WM_XBUTTONUP,
};

use super::logic::{Effect, Machine, Out, Trigger, BTN_MIDDLE, BTN_RIGHT, BTN_X1, BTN_X2, MOD_ALT, MOD_CTRL, MOD_SHIFT, MOD_WIN};

/// Marca os cliques que o próprio Bifrost re-envia (toque rápido).
const MAGIC: usize = 0xB1F0_57;
const VK_CONTROL: i32 = 0x11;
const VK_MENU: i32 = 0x12;
const VK_ESCAPE: u32 = 0x1B;
const VK_SHIFT: i32 = 0x10;
const VK_LWIN: i32 = 0x5B;
const VK_RWIN: i32 = 0x5C;

/// Os modificadores apertados agora (bits MOD_*).
fn mods_now() -> u8 {
    let mut m = 0;
    if key_down(VK_CONTROL) { m |= MOD_CTRL; }
    if key_down(VK_MENU) { m |= MOD_ALT; }
    if key_down(VK_SHIFT) { m |= MOD_SHIFT; }
    if key_down(VK_LWIN) || key_down(VK_RWIN) { m |= MOD_WIN; }
    m
}

static MACHINE: Mutex<Option<Machine>> = Mutex::new(None);
static WORK: Mutex<Option<Sender<Job>>> = Mutex::new(None);
static HOOK_THREAD: Mutex<Option<(u32, std::thread::JoinHandle<()>)>> = Mutex::new(None);

enum Job {
    Effect(Effect),
    Escape,
}

fn key_down(vk: i32) -> bool {
    unsafe { (GetAsyncKeyState(vk) as u16) & 0x8000 != 0 }
}

fn class_of(hwnd: HWND) -> String {
    let mut buf = [0u16; 64];
    let n = unsafe { GetClassNameW(hwnd, &mut buf) };
    String::from_utf16_lossy(&buf[..n.max(0) as usize])
}

/// O cursor está sobre a lista de itens de uma pasta do Explorador ou da área
/// de trabalho (a SHELLDLL_DefView)? Barra de endereço, painel de navegação e
/// qualquer outro programa ficam de fora.
fn eligible(pt: POINT) -> bool {
    unsafe {
        let mut h = WindowFromPoint(pt);
        if h.0.is_null() {
            return false;
        }
        let root = class_of(GetAncestor(h, GA_ROOT));
        if !matches!(root.as_str(), "CabinetWClass" | "ExploreWClass" | "Progman" | "WorkerW") {
            return false;
        }
        for _ in 0..8 {
            if class_of(h) == "SHELLDLL_DefView" {
                return true;
            }
            match GetParent(h) {
                Ok(p) if !p.0.is_null() => h = p,
                _ => break,
            }
        }
        false
    }
}

fn post(job: Job) {
    if let Some(tx) = WORK.lock().unwrap_or_else(|e| e.into_inner()).as_ref() {
        let _ = tx.send(job);
    }
}

unsafe extern "system" fn mouse_hook(code: i32, wparam: WPARAM, lparam: LPARAM) -> LRESULT {
    if code >= 0 {
        let info = &*(lparam.0 as *const MSLLHOOKSTRUCT);
        if info.dwExtraInfo != MAGIC {
            let msg = wparam.0 as u32;
            let (x, y) = (info.pt.x, info.pt.y);
            let mut swallow = false;
            if let Ok(mut guard) = MACHINE.try_lock() {
                if let Some(m) = guard.as_mut() {
                    let btn = m.trigger.button();
                    let xb = ((info.mouseData >> 16) & 0xFFFF) as u16;
                    let this = |down_msg: bool| -> bool {
                        match btn {
                            BTN_RIGHT => msg == if down_msg { WM_RBUTTONDOWN } else { WM_RBUTTONUP },
                            BTN_MIDDLE => msg == if down_msg { WM_MBUTTONDOWN } else { WM_MBUTTONUP },
                            BTN_X1 | BTN_X2 => msg == if down_msg { WM_XBUTTONDOWN } else { WM_XBUTTONUP } && xb == if btn == BTN_X1 { 1 } else { 2 },
                            _ => false,
                        }
                    };
                    let (out, eff) = if this(true) {
                        // Só olha a janela quando um modificador está apertado (ou o
                        // botão não é o direito): um clique comum passa sem custo.
                        let mods = mods_now();
                        let el = (mods != 0 || btn != BTN_RIGHT || m.menu_open()) && eligible(info.pt);
                        m.button_down(mods, el, x, y)
                    } else if this(false) {
                        m.right_up(x, y)
                    } else if msg == WM_LBUTTONDOWN {
                        (Out::Pass, m.left_down(x, y))
                    } else {
                        (Out::Pass, Effect::None)
                    };
                    swallow = out == Out::Swallow;
                    if eff != Effect::None {
                        post(Job::Effect(eff));
                    }
                }
            }
            if swallow {
                return LRESULT(1);
            }
        }
    }
    CallNextHookEx(None, code, wparam, lparam)
}

unsafe extern "system" fn key_hook(code: i32, wparam: WPARAM, lparam: LPARAM) -> LRESULT {
    if code >= 0 {
        let info = &*(lparam.0 as *const KBDLLHOOKSTRUCT);
        let down = matches!(wparam.0 as u32, WM_KEYDOWN | WM_SYSKEYDOWN);
        if down && info.vkCode == VK_ESCAPE {
            let open = MACHINE.try_lock().ok().and_then(|g| g.as_ref().map(Machine::menu_open)).unwrap_or(false);
            if open {
                post(Job::Escape);
                return LRESULT(1);
            }
        }
    }
    CallNextHookEx(None, code, wparam, lparam)
}

/// Foi só um toque: devolve o clique do mesmo botão ao programa.
fn replay_click(btn: u8) {
    let mk = |flags: MOUSE_EVENT_FLAGS, data: u32| INPUT {
        r#type: INPUT_MOUSE,
        Anonymous: INPUT_0 { mi: MOUSEINPUT { dx: 0, dy: 0, mouseData: data, dwFlags: flags, time: 0, dwExtraInfo: MAGIC } },
    };
    let inputs = match btn {
        BTN_MIDDLE => [mk(MOUSEEVENTF_MIDDLEDOWN, 0), mk(MOUSEEVENTF_MIDDLEUP, 0)],
        BTN_X1 => [mk(MOUSEEVENTF_XDOWN, 1), mk(MOUSEEVENTF_XUP, 1)],
        BTN_X2 => [mk(MOUSEEVENTF_XDOWN, 2), mk(MOUSEEVENTF_XUP, 2)],
        _ => [mk(MOUSEEVENTF_RIGHTDOWN, 0), mk(MOUSEEVENTF_RIGHTUP, 0)],
    };
    unsafe {
        SendInput(&inputs, std::mem::size_of::<INPUT>() as i32);
    }
}

fn worker(rx: std::sync::mpsc::Receiver<Job>) {
    for job in rx {
        match job {
            Job::Escape => super::escape(),
            Job::Effect(Effect::StartTimer { token, ms }) => {
                std::thread::spawn(move || {
                    std::thread::sleep(Duration::from_millis(ms as u64));
                    let eff = MACHINE.lock().unwrap_or_else(|e| e.into_inner()).as_mut().map(|m| m.timer(token)).unwrap_or(Effect::None);
                    if eff != Effect::None {
                        post(Job::Effect(eff));
                    }
                });
            }
            Job::Effect(Effect::Open { x, y }) => super::open_at(x, y, move || files_at(x, y)),
            Job::Effect(Effect::Release { x, y }) => super::release_at(x, y),
            Job::Effect(Effect::Replay { .. }) => {
                let btn = MACHINE.lock().unwrap_or_else(|e| e.into_inner()).as_ref().map(|m| m.trigger.button()).unwrap_or(BTN_RIGHT);
                replay_click(btn)
            }
            Job::Effect(Effect::ClickWhileOpen { x, y }) => {
                super::click_outside(x, y);
            }
            Job::Effect(Effect::None) => {}
        }
    }
}

pub fn set_enabled(on: bool, trigger: Trigger) {
    {
        let mut g = MACHINE.lock().unwrap_or_else(|e| e.into_inner());
        match g.as_mut() {
            Some(m) => m.trigger = trigger,
            None => *g = Some(Machine::new(trigger)),
        }
    }
    let mut ht = HOOK_THREAD.lock().unwrap_or_else(|e| e.into_inner());
    if on && ht.is_none() {
        let (tx, rx) = channel();
        *WORK.lock().unwrap_or_else(|e| e.into_inner()) = Some(tx);
        let _ = std::thread::Builder::new().name("filee-gesture".into()).spawn(move || worker(rx));
        let (ready_tx, ready_rx) = channel::<u32>();
        let t = std::thread::Builder::new().name("filee-hook".into()).spawn(move || unsafe {
            let module = GetModuleHandleW(None).ok();
            let mouse = SetWindowsHookExW(WH_MOUSE_LL, Some(mouse_hook), module.map(Into::into), 0);
            let keys = SetWindowsHookExW(WH_KEYBOARD_LL, Some(key_hook), module.map(Into::into), 0);
            if let Err(e) = &mouse {
                crate::log::line(format!("filee: gancho do mouse falhou: {e}"));
            }
            let _ = ready_tx.send(GetCurrentThreadId());
            let mut msg = MSG::default();
            while GetMessageW(&mut msg, None, 0, 0).as_bool() {
                let _ = TranslateMessage(&msg);
                DispatchMessageW(&msg);
            }
            if let Ok(h) = mouse {
                let _ = UnhookWindowsHookEx(h);
            }
            if let Ok(h) = keys {
                let _ = UnhookWindowsHookEx(h);
            }
        });
        if let (Ok(t), Ok(id)) = (t, ready_rx.recv_timeout(Duration::from_secs(3))) {
            *ht = Some((id, t));
            crate::log::line("filee: gesto ligado");
        }
    } else if !on {
        if let Some((id, t)) = ht.take() {
            unsafe {
                let _ = PostThreadMessageW(id, WM_QUIT, WPARAM(0), LPARAM(0));
            }
            let _ = t.join();
            *WORK.lock().unwrap_or_else(|e| e.into_inner()) = None;
            if let Some(m) = MACHINE.lock().unwrap_or_else(|e| e.into_inner()).as_mut() {
                m.closed();
            }
            crate::log::line("filee: gesto desligado");
        }
    }
}

pub fn closed() {
    if let Some(m) = MACHINE.lock().unwrap_or_else(|e| e.into_inner()).as_mut() {
        m.closed();
    }
}

// ── Arquivos sob o cursor ───────────────────────────────────────────────────

struct Com;
impl Com {
    fn init() -> Self {
        unsafe {
            let _ = CoInitializeEx(None, COINIT_APARTMENTTHREADED);
        }
        Com
    }
}
impl Drop for Com {
    fn drop(&mut self) {
        unsafe { CoUninitialize() };
    }
}

fn item_path(item: &IShellItem) -> Option<String> {
    unsafe {
        let p: PWSTR = item.GetDisplayName(SIGDN_FILESYSPATH).ok()?;
        let s = p.to_string().ok();
        CoTaskMemFree(Some(p.0 as *const _));
        s
    }
}

fn item_name(item: &IShellItem) -> Option<String> {
    unsafe {
        let p: PWSTR = item.GetDisplayName(SIGDN_NORMALDISPLAY).ok()?;
        let s = p.to_string().ok();
        CoTaskMemFree(Some(p.0 as *const _));
        s
    }
}

/// A IFolderView2 da janela do Explorador `root` (ou da área de trabalho).
unsafe fn folder_view(root: HWND) -> Option<IFolderView2> {
    let sw: IShellWindows = CoCreateInstance(&ShellWindows, None, CLSCTX_ALL).ok()?;
    let class = class_of(root);
    let browser_of = |disp: windows::Win32::System::Com::IDispatch| -> Option<IFolderView2> {
        let sp: IServiceProvider = disp.cast().ok()?;
        let sb: IShellBrowser = sp.QueryService(&SID_STopLevelBrowser).ok()?;
        let view = sb.QueryActiveShellView().ok()?;
        // Abas do Windows 11 dividem a mesma janela: vale a visível.
        if let Ok(h) = view.GetWindow() {
            if !windows::Win32::UI::WindowsAndMessaging::IsWindowVisible(h).as_bool() {
                return None;
            }
        }
        view.cast().ok()
    };
    if class == "Progman" || class == "WorkerW" {
        let mut hwnd = 0i32;
        let empty = VARIANT::default();
        let disp = sw.FindWindowSW(&VARIANT::from(0i32), &empty, SWC_DESKTOP, &mut hwnd, SWFO_NEEDDISPATCH).ok()?;
        return browser_of(disp);
    }
    let n = sw.Count().ok()?;
    for i in 0..n {
        let Ok(disp) = sw.Item(&VARIANT::from(i)) else { continue };
        let Ok(wb) = disp.cast::<IWebBrowser2>() else { continue };
        let Ok(h) = wb.HWND() else { continue };
        if h.0 as isize != root.0 as isize {
            continue;
        }
        if let Some(fv) = browser_of(disp) {
            return Some(fv);
        }
    }
    None
}

/// O nome do item da lista sob o cursor, pela UI Automation.
unsafe fn hovered_name(pt: POINT) -> Option<String> {
    let ui: IUIAutomation = CoCreateInstance(&CUIAutomation, None, CLSCTX_INPROC_SERVER).ok()?;
    let mut el: IUIAutomationElement = ui.ElementFromPoint(pt).ok()?;
    let walker = ui.ControlViewWalker().ok()?;
    for _ in 0..4 {
        let ct = el.CurrentControlType().ok()?;
        if ct == UIA_ListItemControlTypeId || ct == UIA_DataItemControlTypeId {
            let name: BSTR = el.CurrentName().ok()?;
            let s = name.to_string();
            return (!s.is_empty()).then_some(s);
        }
        el = walker.GetParentElement(&el).ok()?;
    }
    None
}

fn selection(fv: &IFolderView2) -> Vec<String> {
    unsafe {
        let Ok(arr) = fv.GetSelection(false) else { return Vec::new() };
        let n = arr.GetCount().unwrap_or(0);
        (0..n).filter_map(|i| arr.GetItemAt(i).ok()).filter_map(|it| item_path(&it)).collect()
    }
}

/// Os arquivos do gesto: o item sob o cursor — e, se ele faz parte da
/// seleção, a seleção inteira (para "Juntar PDFs").
pub fn files_at(x: i32, y: i32) -> Result<Vec<String>, String> {
    let _com = Com::init();
    unsafe {
        let pt = POINT { x, y };
        let root = GetAncestor(WindowFromPoint(pt), GA_ROOT);
        let fv = folder_view(root).ok_or("Não consegui ler esta pasta do Explorador.")?;
        let selected = selection(&fv);
        let hovered = hovered_name(pt);
        let mut hovered_path = None;
        if let Some(name) = hovered.as_deref() {
            let count = fv.ItemCount(SVGIO_ALLVIEW).unwrap_or(0);
            for i in 0..count {
                let Ok(item) = fv.GetItem::<IShellItem>(i) else { continue };
                if item_name(&item).as_deref() == Some(name) {
                    hovered_path = item_path(&item);
                    break;
                }
            }
        }
        Ok(match hovered_path {
            Some(p) if selected.contains(&p) => selected,
            Some(p) => vec![p],
            None => selected,
        })
    }
}

// ── Menu clássico "Bifrost ›" (HKCU, sem administrador) ─────────────────────

const KEY: &str = r"HKCU\Software\Classes\*\shell\Bifrost";

fn reg(args: &[&str]) -> Result<(), String> {
    let o = crate::convert::tools::command(std::path::Path::new("reg.exe")).args(args).output().map_err(|e| e.to_string())?;
    if o.status.success() {
        Ok(())
    } else {
        Err(String::from_utf8_lossy(&o.stderr).trim().to_string())
    }
}

pub fn context_menu(on: bool) -> Result<(), String> {
    let present = reg(&["query", KEY]).is_ok();
    if !on {
        return if present { reg(&["delete", KEY, "/f"]) } else { Ok(()) };
    }
    let exe = std::env::current_exe().map_err(|e| e.to_string())?.to_string_lossy().into_owned();
    reg(&["add", KEY, "/v", "MUIVerb", "/d", "Bifrost", "/f"])?;
    reg(&["add", KEY, "/v", "Icon", "/d", &format!("{exe},0"), "/f"])?;
    reg(&["add", KEY, "/v", "SubCommands", "/d", "", "/f"])?;
    let items = [("1converter", "Converter no Bifrost…", "--filee"), ("2ia", "Enviar para a IA", "--filee-ask")];
    for (id, label, flag) in items {
        let k = format!(r"{KEY}\shell\{id}");
        reg(&["add", &k, "/v", "MUIVerb", "/d", label, "/f"])?;
        reg(&["add", &format!(r"{k}\command"), "/ve", "/d", &format!("\"{exe}\" {flag} \"%1\""), "/f"])?;
    }
    Ok(())
}

// ── "Escolher arquivos…" ────────────────────────────────────────────────────

pub fn pick_files() -> Vec<String> {
    use windows::Win32::UI::Controls::Dialogs::{GetOpenFileNameW, OFN_ALLOWMULTISELECT, OFN_EXPLORER, OFN_FILEMUSTEXIST, OPENFILENAMEW};
    let mut buf = vec![0u16; 65536];
    let title: Vec<u16> = "Escolha arquivos para converter\0".encode_utf16().collect();
    let mut ofn = OPENFILENAMEW {
        lStructSize: std::mem::size_of::<OPENFILENAMEW>() as u32,
        lpstrFile: PWSTR(buf.as_mut_ptr()),
        nMaxFile: buf.len() as u32,
        lpstrTitle: windows::core::PCWSTR(title.as_ptr()),
        Flags: OFN_ALLOWMULTISELECT | OFN_EXPLORER | OFN_FILEMUSTEXIST,
        ..Default::default()
    };
    if !unsafe { GetOpenFileNameW(&mut ofn) }.as_bool() {
        return Vec::new();
    }
    let parts: Vec<String> = buf.split(|c| *c == 0).take_while(|s| !s.is_empty()).map(String::from_utf16_lossy).collect();
    match parts.len() {
        0 => Vec::new(),
        1 => parts,
        _ => parts[1..].iter().map(|f| format!(r"{}\{}", parts[0].trim_end_matches('\\'), f)).collect(),
    }
}

/// O ícone grande (32 px, ou 48 com DPI alto) do arquivo, como o Explorer o
/// desenha, em PNG. SHGetFileInfoW + GetIconInfo + GetDIBits (BGRA → RGBA).
pub fn file_icon_png(path: &str) -> Option<Vec<u8>> {
    use windows::core::PCWSTR;
    use windows::Win32::Graphics::Gdi::{
        DeleteObject, GetDC, GetDIBits, GetObjectW, ReleaseDC, BITMAP, BITMAPINFO, BITMAPINFOHEADER, BI_RGB, DIB_RGB_COLORS, HGDIOBJ,
    };
    use windows::Win32::Storage::FileSystem::FILE_FLAGS_AND_ATTRIBUTES;
    use windows::Win32::UI::Shell::{SHGetFileInfoW, SHFILEINFOW, SHGFI_ICON, SHGFI_LARGEICON};
    use windows::Win32::UI::WindowsAndMessaging::{DestroyIcon, GetIconInfo, ICONINFO};

    let wide: Vec<u16> = path.encode_utf16().chain(std::iter::once(0)).collect();
    let mut info = SHFILEINFOW::default();
    unsafe {
        let ok = SHGetFileInfoW(
            PCWSTR(wide.as_ptr()),
            FILE_FLAGS_AND_ATTRIBUTES(0),
            Some(&mut info),
            std::mem::size_of::<SHFILEINFOW>() as u32,
            SHGFI_ICON | SHGFI_LARGEICON,
        );
        if ok == 0 || info.hIcon.is_invalid() {
            return None;
        }
        let hicon = info.hIcon;
        let mut ii = ICONINFO::default();
        let res = (|| {
            GetIconInfo(hicon, &mut ii).ok()?;
            let mut bm = BITMAP::default();
            if GetObjectW(HGDIOBJ(ii.hbmColor.0), std::mem::size_of::<BITMAP>() as i32, Some(&mut bm as *mut _ as *mut _)) == 0 {
                return None;
            }
            let (w, h) = (bm.bmWidth, bm.bmHeight);
            if w <= 0 || h <= 0 || w > 256 || h > 256 {
                return None;
            }
            let mut bi = BITMAPINFO::default();
            bi.bmiHeader = BITMAPINFOHEADER {
                biSize: std::mem::size_of::<BITMAPINFOHEADER>() as u32,
                biWidth: w,
                biHeight: -h,
                biPlanes: 1,
                biBitCount: 32,
                biCompression: BI_RGB.0,
                ..Default::default()
            };
            let mut px = vec![0u8; (w * h * 4) as usize];
            let dc = GetDC(None);
            let n = GetDIBits(dc, ii.hbmColor, 0, h as u32, Some(px.as_mut_ptr() as *mut _), &mut bi, DIB_RGB_COLORS);
            ReleaseDC(None, dc);
            if n == 0 {
                return None;
            }
            let has_alpha = px.chunks(4).any(|c| c[3] != 0);
            for c in px.chunks_mut(4) {
                c.swap(0, 2);
                if !has_alpha {
                    c[3] = 255;
                }
            }
            let img = image::RgbaImage::from_raw(w as u32, h as u32, px)?;
            let mut out = std::io::Cursor::new(Vec::new());
            img.write_to(&mut out, image::ImageFormat::Png).ok()?;
            Some(out.into_inner())
        })();
        if !ii.hbmColor.is_invalid() {
            let _ = DeleteObject(HGDIOBJ(ii.hbmColor.0));
        }
        if !ii.hbmMask.is_invalid() {
            let _ = DeleteObject(HGDIOBJ(ii.hbmMask.0));
        }
        let _ = DestroyIcon(hicon);
        res
    }
}
