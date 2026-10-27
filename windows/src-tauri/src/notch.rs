//! Fase 15 — a ilha como o notch do MacBook.
//!
//! No Windows a ilha vira uma AppBar (SHAppBarMessage ABM_NEW/ABM_SETPOS) que
//! reserva uma faixa fina no alto do monitor dela: janelas maximizadas passam a
//! ficar abaixo, em vez de cobri-la. Um vigia (~750 ms) reafirma o "sempre por
//! cima", reposiciona a reserva quando o monitor/DPI muda e trata a tela cheia
//! (jogo, vídeo, apresentação): por cima ou escondida, conforme o ajuste.
//! Fase 18: a reserva passou da janela da ilha para uma BARRA nativa (Win32,
//! sem webview) com a cor escura do tema, que atravessa cliques. A ilha
//! compacta fica sempre por cima dela, centrada, como o recorte do notch.
//! Causa do bug da v17: (1) a ilha recolhia ("hidden", 0 px) depois do ocioso,
//! (2) `QUNS_BUSY` dava "tela cheia" com qualquer app sem borda e o vigia caía
//! em `Yield` (deixava de ser topmost e soltava a faixa), (3) nada pintava a
//! faixa: aparecia o papel de parede.
//! A parte pura (`strip_rect`, `fullscreen_policy`, `covers_monitor`,
//! `parse_rgb`) é testada em qualquer SO.

use tauri::AppHandle;

/// Altura lógica da faixa reservada: a da ilha compacta (NOTCH_H do front).
pub const RESERVE_H: f64 = 32.0;

/// A faixa reservada, em pixels físicos: a largura do monitor, `RESERVE_H` de altura.
pub fn strip_rect(mon_x: i32, mon_y: i32, mon_w: u32, scale: f64) -> (i32, i32, i32, i32) {
    let h = (RESERVE_H * scale).round().max(1.0) as i32;
    (mon_x, mon_y, mon_x + mon_w as i32, mon_y + h)
}

#[derive(Debug, PartialEq, Clone, Copy)]
pub enum Policy {
    /// Topmost e com a faixa reservada.
    OnTop { reserve: bool },
    /// Tela cheia e o usuário pediu para sumir: deixa de ser topmost e solta a faixa.
    Yield,
}

pub fn fullscreen_policy(fullscreen: bool, over_fullscreen: bool, reserve: bool) -> Policy {
    if fullscreen && !over_fullscreen {
        Policy::Yield
    } else {
        // Em tela cheia a área útil não vale: não há o que reservar.
        Policy::OnTop { reserve: reserve && !fullscreen }
    }
}

/// Uma janela em primeiro plano cobre o monitor inteiro (inclusive a faixa)?
/// Maximizadas param abaixo da faixa reservada; só tela cheia de verdade cobre o topo.
pub fn covers_monitor(win: (i32, i32, i32, i32), mon: (i32, i32, i32, i32)) -> bool {
    win.0 <= mon.0 && win.1 <= mon.1 && win.2 >= mon.2 && win.3 >= mon.3
}

/// "#rrggbb" → COLORREF (0x00bbggrr). Inválido: None.
pub fn parse_rgb(hex: &str) -> Option<u32> {
    let h = hex.trim().trim_start_matches('#');
    if h.len() != 6 { return None; }
    let v = u32::from_str_radix(h, 16).ok()?;
    let (r, g, b) = (v >> 16 & 0xff, v >> 8 & 0xff, v & 0xff);
    Some(b << 16 | g << 8 | r)
}

/// Cor da barra (COLORREF). Começa quase preta; o front manda a do tema.
pub static BAR_RGB: std::sync::atomic::AtomicU32 = std::sync::atomic::AtomicU32::new(0x0010_0a0a);

/// O front avisa a cor escura do tema (tema trocado ao vivo).
#[tauri::command]
pub fn notch_bar_color(hex: String) {
    if let Some(c) = parse_rgb(&hex) {
        BAR_RGB.store(c, std::sync::atomic::Ordering::Relaxed);
    }
}

#[cfg(windows)]
mod win {
    use super::*;
    use std::sync::atomic::{AtomicBool, AtomicU32, Ordering};
    use tauri::Manager;
    use windows::core::w;
    use windows::Win32::Foundation::{COLORREF, HWND, LPARAM, LRESULT, RECT, WPARAM};
    use windows::Win32::Graphics::Gdi::{CreateSolidBrush, DeleteObject, FillRect, GetDC, ReleaseDC, InvalidateRect, HBRUSH, HDC};
    use windows::Win32::System::LibraryLoader::GetModuleHandleW;
    use windows::Win32::UI::Shell::{
        SHAppBarMessage, SHQueryUserNotificationState, ABE_TOP, ABM_NEW, ABM_QUERYPOS, ABM_REMOVE, ABM_SETPOS,
        APPBARDATA, QUNS_PRESENTATION_MODE, QUNS_RUNNING_D3D_FULL_SCREEN,
    };
    use windows::Win32::UI::WindowsAndMessaging::*;

    static REGISTERED: AtomicBool = AtomicBool::new(false);
    static BAR: std::sync::atomic::AtomicUsize = std::sync::atomic::AtomicUsize::new(0);
    static REREGISTER: AtomicBool = AtomicBool::new(false);
    static TASKBAR_CREATED: AtomicU32 = AtomicU32::new(0);
    static PAINTED: AtomicU32 = AtomicU32::new(u32::MAX);
    static BRUSH: std::sync::atomic::AtomicIsize = std::sync::atomic::AtomicIsize::new(0);

    fn data(hwnd: HWND) -> APPBARDATA {
        APPBARDATA {
            cbSize: std::mem::size_of::<APPBARDATA>() as u32,
            hWnd: hwnd,
            uCallbackMessage: WM_APP + 0x4E,
            uEdge: ABE_TOP,
            rc: RECT::default(),
            lParam: LPARAM(0),
        }
    }

    fn register(hwnd: HWND, rect: (i32, i32, i32, i32)) -> (i32, i32, i32, i32) {
        unsafe {
            let mut d = data(hwnd);
            if !REGISTERED.load(Ordering::Relaxed) {
                if SHAppBarMessage(ABM_NEW, &mut d) == 0 {
                    return rect;
                }
                REGISTERED.store(true, Ordering::Relaxed);
            }
            d.rc = RECT { left: rect.0, top: rect.1, right: rect.2, bottom: rect.3 };
            SHAppBarMessage(ABM_QUERYPOS, &mut d);
            // A faixa é do topo do monitor e tem a altura da ilha compacta, sempre.
            d.rc.top = rect.1;
            d.rc.bottom = rect.3;
            SHAppBarMessage(ABM_SETPOS, &mut d);
            (d.rc.left, d.rc.top, d.rc.right, d.rc.bottom)
        }
    }

    fn unregister(hwnd: HWND) {
        if REGISTERED.swap(false, Ordering::Relaxed) {
            unsafe {
                let mut d = data(hwnd);
                SHAppBarMessage(ABM_REMOVE, &mut d);
            }
        }
    }

    fn brush() -> HBRUSH {
        let c = BAR_RGB.load(Ordering::Relaxed);
        if PAINTED.swap(c, Ordering::Relaxed) != c {
            let old = BRUSH.swap(unsafe { CreateSolidBrush(COLORREF(c)) }.0 as isize, Ordering::Relaxed);
            if old != 0 { unsafe { let _ = DeleteObject(HBRUSH(old as *mut _).into()); } }
        }
        HBRUSH(BRUSH.load(Ordering::Relaxed) as *mut _)
    }

    fn paint(hwnd: HWND, dc: HDC) {
        let mut r = RECT::default();
        unsafe {
            let _ = GetClientRect(hwnd, &mut r);
            FillRect(dc, &r, brush());
        }
    }

    unsafe extern "system" fn proc(hwnd: HWND, msg: u32, wp: WPARAM, lp: LPARAM) -> LRESULT {
        let tc = TASKBAR_CREATED.load(Ordering::Relaxed);
        if tc != 0 && msg == tc {
            // O Explorer reiniciou: as AppBars somem com ele, registra de novo.
            REGISTERED.store(false, Ordering::Relaxed);
            REREGISTER.store(true, Ordering::Relaxed);
            return LRESULT(0);
        }
        match msg {
            WM_ERASEBKGND => {
                paint(hwnd, HDC(wp.0 as *mut _));
                LRESULT(1)
            }
            WM_NCHITTEST => LRESULT(HTTRANSPARENT as isize),
            WM_MOUSEACTIVATE => LRESULT(MA_NOACTIVATE as isize),
            _ => DefWindowProcW(hwnd, msg, wp, lp),
        }
    }

    fn create_bar() -> Option<HWND> {
        unsafe {
            TASKBAR_CREATED.store(RegisterWindowMessageW(w!("TaskbarCreated")), Ordering::Relaxed);
            let inst = GetModuleHandleW(None).ok()?;
            let wc = WNDCLASSW {
                lpfnWndProc: Some(proc),
                hInstance: inst.into(),
                lpszClassName: w!("BifrostNotchBar"),
                hCursor: LoadCursorW(None, IDC_ARROW).unwrap_or_default(),
                ..Default::default()
            };
            RegisterClassW(&wc);
            // Camada + transparente = cliques atravessam; tool window = fora do Alt+Tab e da barra.
            let ex = WS_EX_TOOLWINDOW | WS_EX_NOACTIVATE | WS_EX_TOPMOST | WS_EX_LAYERED | WS_EX_TRANSPARENT;
            let h = CreateWindowExW(ex, w!("BifrostNotchBar"), w!("Bifrost notch"), WS_POPUP, 0, 0, 1, 1, None, None, Some(inst.into()), None).ok()?;
            let _ = SetLayeredWindowAttributes(h, COLORREF(0), 255, LWA_ALPHA);
            Some(h)
        }
    }

    fn pump() {
        unsafe {
            let mut m = MSG::default();
            while PeekMessageW(&mut m, None, 0, 0, PM_REMOVE).as_bool() {
                let _ = TranslateMessage(&m);
                DispatchMessageW(&m);
            }
        }
    }

    /// Tela cheia de verdade: D3D exclusivo, apresentação, ou a janela da frente cobre o monitor todo.
    fn fullscreen_now(mon: (i32, i32, i32, i32), own: &[HWND]) -> bool {
        unsafe {
            if let Ok(s) = SHQueryUserNotificationState() {
                if s == QUNS_RUNNING_D3D_FULL_SCREEN || s == QUNS_PRESENTATION_MODE { return true; }
            }
            let fg = GetForegroundWindow();
            if fg.0.is_null() || own.contains(&fg) || fg == GetShellWindow() || fg == GetDesktopWindow() { return false; }
            let mut cls = [0u16; 64];
            let n = GetClassNameW(fg, &mut cls) as usize;
            let cls = String::from_utf16_lossy(&cls[..n]);
            if cls == "Progman" || cls == "WorkerW" || cls == "Shell_TrayWnd" { return false; }
            let mut r = RECT::default();
            GetWindowRect(fg, &mut r).is_ok() && covers_monitor((r.left, r.top, r.right, r.bottom), mon)
        }
    }

    pub fn start(app: AppHandle) {
        std::thread::spawn(move || {
            let Some(bar) = create_bar() else {
                crate::log::line("notch: barra nativa não criada");
                return;
            };
            BAR.store(bar.0 as usize, Ordering::Relaxed);
            let mut last: Option<(Policy, (i32, i32, i32, i32))> = None;
            let mut tick = 0u32;
            let mut color = u32::MAX;
            loop {
                pump();
                std::thread::sleep(std::time::Duration::from_millis(50));
                tick += 1;
                let c = BAR_RGB.load(Ordering::Relaxed);
                if c != color {
                    color = c;
                    unsafe { let _ = InvalidateRect(Some(bar), None, true); }
                    let dc = unsafe { GetDC(Some(bar)) };
                    paint(bar, dc);
                    unsafe { ReleaseDC(Some(bar), dc); }
                }
                if tick % 10 != 0 && !REREGISTER.load(Ordering::Relaxed) { continue; }
                let Some(win) = crate::island::window(&app) else { continue };
                let Ok(raw) = win.hwnd() else { continue };
                let island = HWND(raw.0 as *mut _);
                let (reserve, over, pref) = app
                    .try_state::<crate::Shared>()
                    .map(|s| {
                        let st = s.settings.lock().unwrap();
                        (st.notch_reserve, st.notch_over_fullscreen, st.screen.clone())
                    })
                    .unwrap_or((true, false, "primary".into()));
                let Some(m) = crate::island::target_monitor(&app, &pref) else { continue };
                let rect = strip_rect(m.position().x, m.position().y, m.size().width, m.scale_factor());
                let mon = (m.position().x, m.position().y, m.position().x + m.size().width as i32, m.position().y + m.size().height as i32);
                let policy = fullscreen_policy(fullscreen_now(mon, &[bar, island]), over, reserve);
                let rereg = REREGISTER.swap(false, Ordering::Relaxed);
                unsafe {
                    match policy {
                        Policy::OnTop { reserve } => {
                            // Win+D / minimizar tudo: a ilha volta sem roubar o foco.
                            if IsIconic(island).as_bool() || !IsWindowVisible(island).as_bool() {
                                let _ = ShowWindow(island, SW_SHOWNOACTIVATE);
                            }
                            if reserve {
                                if rereg || last != Some((policy, rect)) {
                                    let got = register(bar, rect);
                                    let _ = SetWindowPos(bar, Some(HWND_TOPMOST), got.0, got.1, got.2 - got.0, got.3 - got.1, SWP_NOACTIVATE | SWP_SHOWWINDOW);
                                } else {
                                    let _ = SetWindowPos(bar, Some(HWND_TOPMOST), 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE | SWP_SHOWWINDOW);
                                }
                            } else {
                                unregister(bar);
                                let _ = ShowWindow(bar, SW_HIDE);
                            }
                            // A ilha mora no topo do monitor, por cima da barra.
                            let mut wr = RECT::default();
                            let off = GetWindowRect(island, &mut wr).is_ok() && wr.top != rect.1;
                            if off {
                                let _ = SetWindowPos(island, Some(HWND_TOPMOST), wr.left, rect.1, 0, 0, SWP_NOSIZE | SWP_NOACTIVATE);
                            } else {
                                let _ = SetWindowPos(island, Some(HWND_TOPMOST), 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE);
                            }
                        }
                        Policy::Yield => {
                            unregister(bar);
                            let _ = ShowWindow(bar, SW_HIDE);
                            if last.map(|l| l.0) != Some(Policy::Yield) {
                                let _ = SetWindowPos(island, Some(HWND_NOTOPMOST), 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE);
                            }
                        }
                    }
                }
                if rereg || last != Some((policy, rect)) {
                    crate::log::line(format!("notch: {policy:?} faixa {rect:?}{}", if rereg { " (explorer reiniciou)" } else { "" }));
                }
                last = Some((policy, rect));
            }
        });
    }

    pub fn stop(_app: &AppHandle) {
        let b = BAR.load(Ordering::Relaxed);
        if b != 0 {
            unregister(HWND(b as *mut _));
        }
    }
}

/// Liga o vigia do notch (só no Windows).
pub fn start(app: AppHandle) {
    #[cfg(windows)]
    win::start(app);
    #[cfg(not(windows))]
    let _ = app;
}

/// Solta a faixa reservada ao sair — senão a área útil fica encolhida até o Explorer reiniciar.
pub fn stop(app: &AppHandle) {
    #[cfg(windows)]
    win::stop(app);
    #[cfg(not(windows))]
    let _ = app;
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reserves_a_compact_island_high_strip_across_the_monitor() {
        assert_eq!(strip_rect(0, 0, 1920, 1.0), (0, 0, 1920, 32));
        assert_eq!(strip_rect(1920, 0, 3840, 1.5), (1920, 0, 5760, 48));
    }

    #[test]
    fn fullscreen_either_yields_or_stays_on_top_without_reserving() {
        assert_eq!(fullscreen_policy(false, false, true), Policy::OnTop { reserve: true });
        assert_eq!(fullscreen_policy(false, false, false), Policy::OnTop { reserve: false });
        assert_eq!(fullscreen_policy(true, false, true), Policy::Yield);
        assert_eq!(fullscreen_policy(true, true, true), Policy::OnTop { reserve: false });
    }

    #[test]
    fn only_true_fullscreen_covers_the_monitor() {
        let mon = (0, 0, 2560, 1440);
        assert!(covers_monitor((0, 0, 2560, 1440), mon));
        assert!(covers_monitor((-8, -8, 2568, 1448), mon));
        // Maximizada: começa abaixo da faixa de 40 px.
        assert!(!covers_monitor((-8, 32, 2568, 1400), mon));
    }

    #[test]
    fn theme_colors_become_colorrefs() {
        assert_eq!(parse_rgb("#0a0f1f"), Some(0x1f0f0a));
        assert_eq!(parse_rgb("ff0000"), Some(0x0000ff));
        assert_eq!(parse_rgb("#xyz"), None);
    }
}
