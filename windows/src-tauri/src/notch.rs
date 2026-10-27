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
//! Fase 20: a ilha FLUTUA. Sem AppBar e sem barra nativa: janelas maximizadas
//! usam a tela inteira e a ilha fica por cima só no centro da barra de título,
//! atravessando cliques fora da forma (island.rs). O vigia (500 ms) reafirma o
//! topmost, traz a ilha de volta depois de Win+D/Explorer e trata a tela cheia.
//! Ao iniciar, uma AppBar temporária é registrada e removida para o Explorer
//! soltar a faixa de uma versão antiga.
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
    use std::sync::atomic::{AtomicBool, Ordering};
    use tauri::Manager;
    use windows::core::w;
    use windows::Win32::Foundation::{HWND, LPARAM, LRESULT, RECT, WPARAM};
    use windows::Win32::System::LibraryLoader::GetModuleHandleW;
    use windows::Win32::UI::Shell::{
        SHAppBarMessage, SHQueryUserNotificationState, ABE_TOP, ABM_NEW, ABM_REMOVE, APPBARDATA,
        QUNS_PRESENTATION_MODE, QUNS_RUNNING_D3D_FULL_SCREEN,
    };
    use windows::Win32::UI::WindowsAndMessaging::*;

    unsafe extern "system" fn plain(h: HWND, m: u32, w: WPARAM, l: LPARAM) -> LRESULT { DefWindowProcW(h, m, w, l) }

    static CLEANED: AtomicBool = AtomicBool::new(false);

    /// Fase 20: a v15–v19 registrava uma AppBar. O Explorer só solta a faixa de
    /// uma AppBar morta quando recalcula as AppBars; registrar e remover uma AppBar
    /// temporária força esse recálculo (e uma versão antiga que saiu sem ABM_REMOVE
    /// não deixa a área útil encolhida). Nada mais é reservado.
    fn release_old_reservation() {
        if CLEANED.swap(true, Ordering::Relaxed) { return; }
        unsafe {
            let Ok(inst) = GetModuleHandleW(None) else { return };
            let wc = WNDCLASSW { lpfnWndProc: Some(plain), hInstance: inst.into(), lpszClassName: w!("BifrostNotchCleanup"), ..Default::default() };
            RegisterClassW(&wc);
            let Ok(h) = CreateWindowExW(WS_EX_TOOLWINDOW | WS_EX_NOACTIVATE, w!("BifrostNotchCleanup"), w!(""), WS_POPUP, 0, 0, 1, 1, None, None, Some(inst.into()), None) else { return };
            let mut d = APPBARDATA { cbSize: std::mem::size_of::<APPBARDATA>() as u32, hWnd: h, uCallbackMessage: WM_APP + 0x4F, uEdge: ABE_TOP, rc: RECT::default(), lParam: LPARAM(0) };
            if SHAppBarMessage(ABM_NEW, &mut d) != 0 { SHAppBarMessage(ABM_REMOVE, &mut d); }
            let _ = DestroyWindow(h);
        }
        crate::log::line("notch: ilha flutuante, sem faixa reservada (AppBar antiga liberada)");
    }

    /// Tela cheia de verdade: D3D exclusivo, apresentação, ou a janela da frente
    /// cobre o monitor todo SEM estar maximizada (sem faixa reservada, uma
    /// maximizada com a barra de tarefas oculta também cobre o monitor).
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
            GetWindowRect(fg, &mut r).is_ok() && covers_monitor((r.left, r.top, r.right, r.bottom), mon) && !IsZoomed(fg).as_bool()
        }
    }

    pub fn start(app: AppHandle) {
        std::thread::spawn(move || {
            release_old_reservation();
            let mut last: Option<Policy> = None;
            loop {
                // A cada 500 ms: reafirma o "sempre por cima" e trata a tela cheia.
                std::thread::sleep(std::time::Duration::from_millis(500));
                let Some(win) = crate::island::window(&app) else { continue };
                let Ok(raw) = win.hwnd() else { continue };
                let island = HWND(raw.0 as *mut _);
                let (over, pref) = app
                    .try_state::<crate::Shared>()
                    .map(|s| {
                        let st = s.settings.lock().unwrap();
                        (st.notch_over_fullscreen, st.screen.clone())
                    })
                    .unwrap_or((false, "primary".into()));
                let Some(m) = crate::island::target_monitor(&app, &pref) else { continue };
                let top = m.position().y;
                let mon = (m.position().x, top, m.position().x + m.size().width as i32, top + m.size().height as i32);
                let policy = fullscreen_policy(fullscreen_now(mon, &[island]), over, false);
                unsafe {
                    match policy {
                        Policy::OnTop { .. } => {
                            // Win+D / minimizar tudo / Explorer reiniciado: a ilha volta sem roubar o foco.
                            if IsIconic(island).as_bool() || !IsWindowVisible(island).as_bool() {
                                let _ = ShowWindow(island, SW_SHOWNOACTIVATE);
                            }
                            let mut wr = RECT::default();
                            let off = GetWindowRect(island, &mut wr).is_ok() && wr.top != top;
                            let flags = if off { SWP_NOSIZE | SWP_NOACTIVATE } else { SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE };
                            let _ = SetWindowPos(island, Some(HWND_TOPMOST), wr.left, top, 0, 0, flags);
                        }
                        Policy::Yield => {
                            if last != Some(Policy::Yield) {
                                let _ = SetWindowPos(island, Some(HWND_NOTOPMOST), 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE);
                            }
                        }
                    }
                }
                if last != Some(policy) { crate::log::line(format!("notch: {policy:?} (flutuante)")); }
                last = Some(policy);
            }
        });
    }

    pub fn stop(_app: &AppHandle) {}
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
