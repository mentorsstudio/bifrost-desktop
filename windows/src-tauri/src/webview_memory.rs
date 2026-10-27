// Memória dos WebView2 escondidos. O hub, o anel do gesto e o menu da bandeja
// são criados uma vez e só escondidos (uma janela criada depois abre em branco
// neste app), então continuavam com toda a memória da página. Ao esconder, o
// WebView2 recebe MemoryUsageTargetLevel = LOW (o próprio Edge descarta caches
// e comprime o que pode); ao mostrar, volta a NORMAL antes de aparecer.

use tauri::WebviewWindow;
use webview2_com::Microsoft::Web::WebView2::Win32::{
    ICoreWebView2_19, COREWEBVIEW2_MEMORY_USAGE_TARGET_LEVEL_LOW, COREWEBVIEW2_MEMORY_USAGE_TARGET_LEVEL_NORMAL,
};
use wv2_core::Interface;

fn set(win: &WebviewWindow, low: bool) {
    let _ = win.with_webview(move |webview| unsafe {
        let Ok(core) = webview.controller().CoreWebView2() else { return };
        let Ok(core) = core.cast::<ICoreWebView2_19>() else { return };
        let level = if low { COREWEBVIEW2_MEMORY_USAGE_TARGET_LEVEL_LOW } else { COREWEBVIEW2_MEMORY_USAGE_TARGET_LEVEL_NORMAL };
        let _ = core.SetMemoryUsageTargetLevel(level);
    });
}

/// Chame logo depois de esconder a janela.
pub fn hidden(win: &WebviewWindow) {
    set(win, true);
}

/// Chame logo antes de mostrar a janela.
pub fn shown(win: &WebviewWindow) {
    set(win, false);
}
