//! Fase 15 — a ilha como o notch do MacBook.
//!
//! No Windows a ilha vira uma AppBar (SHAppBarMessage ABM_NEW/ABM_SETPOS) que
//! reserva uma faixa fina no alto do monitor dela: janelas maximizadas passam a
//! ficar abaixo, em vez de cobri-la. Um vigia (~750 ms) reafirma o "sempre por
//! cima", reposiciona a reserva quando o monitor/DPI muda e trata a tela cheia
//! (jogo, vídeo, apresentação): por cima ou escondida, conforme o ajuste.
//! A parte pura (`strip_rect`, `fullscreen_policy`) é testada em qualquer SO.

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

#[cfg(windows)]
mod win {
    use super::*;
    use std::sync::atomic::{AtomicBool, Ordering};
    use tauri::Manager;
    use windows::Win32::Foundation::{HWND, LPARAM, RECT};
    use windows::Win32::UI::Shell::{
        SHAppBarMessage, SHQueryUserNotificationState, ABE_TOP, ABM_NEW, ABM_QUERYPOS, ABM_REMOVE, ABM_SETPOS,
        APPBARDATA, QUNS_BUSY, QUNS_PRESENTATION_MODE, QUNS_RUNNING_D3D_FULL_SCREEN,
    };
    use windows::Win32::UI::WindowsAndMessaging::{
        GetWindowRect, SetWindowPos, HWND_NOTOPMOST, HWND_TOPMOST, SWP_NOACTIVATE, SWP_NOMOVE, SWP_NOSIZE, WM_APP,
    };

    static REGISTERED: AtomicBool = AtomicBool::new(false);

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

    fn register(hwnd: HWND, rect: (i32, i32, i32, i32)) {
        unsafe {
            let mut d = data(hwnd);
            if !REGISTERED.load(Ordering::Relaxed) {
                if SHAppBarMessage(ABM_NEW, &mut d) == 0 {
                    return;
                }
                REGISTERED.store(true, Ordering::Relaxed);
            }
            d.rc = RECT { left: rect.0, top: rect.1, right: rect.2, bottom: rect.3 };
            SHAppBarMessage(ABM_QUERYPOS, &mut d);
            // O shell pode empurrar o topo (outra AppBar no alto): mantém a altura.
            d.rc.bottom = d.rc.top + (rect.3 - rect.1);
            SHAppBarMessage(ABM_SETPOS, &mut d);
        }
    }

    pub fn unregister(hwnd: HWND) {
        if REGISTERED.swap(false, Ordering::Relaxed) {
            unsafe {
                let mut d = data(hwnd);
                SHAppBarMessage(ABM_REMOVE, &mut d);
            }
        }
    }

    fn fullscreen_now() -> bool {
        match unsafe { SHQueryUserNotificationState() } {
            Ok(s) => s == QUNS_BUSY || s == QUNS_RUNNING_D3D_FULL_SCREEN || s == QUNS_PRESENTATION_MODE,
            Err(_) => false,
        }
    }

    pub fn start(app: AppHandle) {
        std::thread::spawn(move || {
            let mut last: Option<(Policy, (i32, i32, i32, i32))> = None;
            loop {
                std::thread::sleep(std::time::Duration::from_millis(750));
                let Some(win) = crate::island::window(&app) else { continue };
                let Ok(raw) = win.hwnd() else { continue };
                let hwnd = HWND(raw.0 as *mut _);
                let (reserve, over, pref) = app
                    .try_state::<crate::Shared>()
                    .map(|s| {
                        let st = s.settings.lock().unwrap();
                        (st.notch_reserve, st.notch_over_fullscreen, st.screen.clone())
                    })
                    .unwrap_or((true, false, "primary".into()));
                let Some(m) = crate::island::target_monitor(&app, &pref) else { continue };
                let rect = strip_rect(m.position().x, m.position().y, m.size().width, m.scale_factor());
                let policy = fullscreen_policy(fullscreen_now(), over, reserve);
                unsafe {
                    match policy {
                        Policy::OnTop { reserve } => {
                            // A ilha mora DENTRO da faixa reservada: se o Windows a empurrou para a
                            // área útil (acontece ao registrar a AppBar), volta para o topo do monitor.
                            let mut wr = RECT::default();
                            let off = GetWindowRect(hwnd, &mut wr).is_ok() && wr.top != rect.1;
                            if off {
                                let _ = SetWindowPos(hwnd, Some(HWND_TOPMOST), wr.left, rect.1, 0, 0, SWP_NOSIZE | SWP_NOACTIVATE);
                            } else {
                                let _ = SetWindowPos(hwnd, Some(HWND_TOPMOST), 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE);
                            }
                            if reserve {
                                if last != Some((policy, rect)) {
                                    register(hwnd, rect);
                                }
                            } else {
                                unregister(hwnd);
                            }
                        }
                        Policy::Yield => {
                            unregister(hwnd);
                            if last.map(|l| l.0) != Some(Policy::Yield) {
                                let _ = SetWindowPos(hwnd, Some(HWND_NOTOPMOST), 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE);
                            }
                        }
                    }
                }
                if last != Some((policy, rect)) {
                    crate::log::line(format!("notch: {policy:?} faixa {rect:?}"));
                }
                last = Some((policy, rect));
            }
        });
    }

    pub fn stop(app: &AppHandle) {
        if let Some(win) = crate::island::window(app) {
            if let Ok(raw) = win.hwnd() {
                unregister(HWND(raw.0 as *mut _));
            }
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
}
