// O gesto do Huginn: Ctrl + botão direito (segurado) sobre um arquivo do
// Explorador ou da área de trabalho abre o corvo no cursor, com um balão de
// ações (converter, comprimir, redimensionar, juntar PDFs, extrair texto,
// enviar para a IA). O gancho de mouse (WH_MOUSE_LL) só existe com a opção
// ligada em Ajustes. Também: a entrada clássica "Bifrost ›" do Explorador (HKCU)
// e o diálogo "Escolher arquivos…" do Conversor.

pub mod conflict;
pub mod logic;
#[cfg(windows)]
mod win;

use std::sync::{Mutex, OnceLock};

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, PhysicalPosition, WebviewUrl, WebviewWindow, WebviewWindowBuilder};

use crate::convert::{self, jobs::JobSpec, prefs::FileePrefs};

pub const MENU_LABEL: &str = "filee-menu";
/// Janela quadrada do anel (px lógicos) — igual a RING.size em src/filee/ring.ts.
pub const MENU_W: f64 = 460.0;
pub const MENU_H: f64 = 460.0;
/// Raio (px lógicos) que conta como "dentro do anel"; a página ajusta quando o
/// segundo arco abre (filee_menu_radius).
static RADIUS: std::sync::atomic::AtomicU32 = std::sync::atomic::AtomicU32::new(140);
/// Cada abertura ganha um número, para um "esconder depois" velho não fechar o novo.
static OPEN_GEN: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);

static APP: OnceLock<AppHandle> = OnceLock::new();
/// Arquivos dos menus vindos do Explorador ("Bifrost ›"), esperando o hub.
static PENDING_HUB: Mutex<Vec<String>> = Mutex::new(Vec::new());

fn app() -> Option<&'static AppHandle> {
    APP.get()
}

fn page_url(app: &AppHandle) -> WebviewUrl {
    #[cfg(dev)]
    if let Some(mut base) = app.config().build.dev_url.clone() {
        base.set_path("/fileemenu.html");
        return WebviewUrl::External(base);
    }
    let _ = app;
    WebviewUrl::App("fileemenu.html".into())
}

/// Cria a janela (escondida) já no início — ver create_settings_window: uma
/// WebView2 criada depois da ilha nasce em branco neste app.
pub fn create_window(app: &AppHandle) {
    let _ = APP.set(app.clone());
    let built = WebviewWindowBuilder::new(app, MENU_LABEL, page_url(app))
        .additional_browser_args(crate::BROWSER_ARGS)
        .title("Huginn")
        .inner_size(MENU_W, MENU_H)
        .resizable(false)
        .decorations(false)
        .transparent(true)
        .shadow(false)
        .always_on_top(true)
        .skip_taskbar(true)
        .focused(false)
        .focusable(false)
        .maximizable(false)
        .minimizable(false)
        .closable(false)
        .disable_drag_drop_handler()
        .visible(false)
        .build();
    if let Err(err) = built {
        crate::log::line(format!("filee: janela do menu falhou: {err}"));
    }
}

fn menu() -> Option<WebviewWindow> {
    app()?.get_webview_window(MENU_LABEL)
}

/// Depois do setup: liga o gancho conforme as preferências e alinha o registro.
pub fn setup(app: &AppHandle) {
    let _ = APP.set(app.clone());
    let p = convert::prefs::load();
    apply(app, &p);
    context_menu(p.context_menu);
    // Os argumentos de quem abriu o Bifrost pelo menu do Explorador: depois de a
    // ilha e o hub carregarem a página, ou o evento se perde.
    let args: Vec<String> = std::env::args().collect();
    if args.iter().any(|a| a.starts_with("--filee")) {
        let app = app.clone();
        std::thread::spawn(move || {
            std::thread::sleep(std::time::Duration::from_millis(2500));
            handle_args(&app, &args);
        });
    }
}

/// `--filee <arquivos>` (menu "Bifrost ›" do Explorador) e `--filee-ask <arquivo>`.
/// True quando os argumentos eram nossos.
pub fn handle_args(app: &AppHandle, args: &[String]) -> bool {
    if let Some(at) = args.iter().position(|a| a == "--filee-ask") {
        let paths: Vec<String> = args[at + 1..].iter().filter(|a| !a.starts_with("--")).cloned().collect();
        if !paths.is_empty() {
            ask(app, paths, None);
            return true;
        }
    }
    if let Some(paths) = convert::paths_from_args(args) {
        PENDING_HUB.lock().unwrap_or_else(|e| e.into_inner()).extend(paths.clone());
        crate::show_hub(app, Some("converter"));
        if let Some(w) = app.get_webview_window(crate::HUB_LABEL) {
            let _ = w.emit("converter-files", paths);
        }
        return true;
    }
    false
}

pub fn apply(app: &AppHandle, p: &FileePrefs) {
    let _ = app;
    // Se o Filee instalado usa o mesmo gatilho, não abrimos um segundo menu.
    let clash = conflict::read_filee_settings().and_then(|s| conflict::conflict(&s, &p.trigger));
    if let Some(c) = &clash {
        crate::log::line(format!("filee: gesto desligado — {c}"));
    }
    #[cfg(windows)]
    win::set_enabled(p.gesture && clash.is_none(), logic::Trigger::from_prefs(&p.trigger, p.hold_ms));
    #[cfg(not(windows))]
    let _ = p;
}

pub fn context_menu(on: bool) {
    #[cfg(windows)]
    if let Err(e) = win::context_menu(on) {
        crate::log::line(format!("filee: menu do Explorador: {e}"));
    }
    #[cfg(not(windows))]
    let _ = on;
}

pub fn pick_files() -> Vec<String> {
    #[cfg(windows)]
    return win::pick_files();
    #[cfg(not(windows))]
    Vec::new()
}

// ── O que o gancho chama ────────────────────────────────────────────────────

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct OpenPayload {
    /// Ponto do cursor dentro da janela (px CSS); o anel fica no centro da janela.
    cursor_x: f64,
    cursor_y: f64,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct PlanPayload {
    plan: Option<convert::Plan>,
    error: Option<String>,
    /// Ícone do Windows do arquivo (data:image/png;base64,…), se houver.
    icon: Option<String>,
}

/// Retângulo atual da janela (px físicos) para o "clique fora".
static RECT: Mutex<Option<(i32, i32, i32, i32)>> = Mutex::new(None);

/// Abre o corvo em (x, y) físicos e resolve os arquivos em segundo plano.
#[allow(dead_code)]
pub(crate) fn open_at(x: i32, y: i32, resolve: impl FnOnce() -> Result<Vec<String>, String> + Send + 'static) {
    let Some(win) = menu() else { return };
    let (scale, mon) = match app().and_then(|a| a.monitor_from_point(x as f64, y as f64).ok().flatten()) {
        Some(m) => (m.scale_factor(), Some((m.position().x, m.position().y, m.size().width as i32, m.size().height as i32))),
        None => (1.0, None),
    };
    let size = (MENU_W * scale) as i32;
    let (left, top) = logic::place_ring(x, y, size, mon);
    OPEN_GEN.fetch_add(1, std::sync::atomic::Ordering::SeqCst);
    *RECT.lock().unwrap_or_else(|e| e.into_inner()) = Some((left, top, size, size));
    let _ = win.set_size(tauri::PhysicalSize::new(size as u32, size as u32));
    let _ = win.set_position(PhysicalPosition::new(left, top));
    let _ = win.emit("filee-menu-open", OpenPayload { cursor_x: (x - left) as f64 / scale, cursor_y: (y - top) as f64 / scale });
    let _ = win.show();
    let _ = win.set_always_on_top(true);
    std::thread::spawn(move || {
        let payload = match resolve() {
            Ok(paths) if !paths.is_empty() => PlanPayload { icon: file_icon(&paths[0]), plan: Some(convert::plan(&paths)), error: None },
            Ok(_) => PlanPayload { plan: None, icon: None, error: Some("Passe o mouse sobre um arquivo (ou selecione alguns) e tente de novo.".into()) },
            Err(e) => PlanPayload { plan: None, icon: None, error: Some(e) },
        };
        crate::log::line(format!("filee: gesto com {} arquivo(s)", payload.plan.as_ref().map(|p| p.files.len()).unwrap_or(0)));
        if let Some(win) = menu() {
            let _ = win.emit("filee-menu-plan", payload);
        }
    });
}

/// Botão solto com o menu aberto: o item sob o cursor é escolhido (na página).
#[allow(dead_code)]
pub(crate) fn release_at(x: i32, y: i32) {
    let Some(win) = menu() else { return };
    let scale = win.scale_factor().unwrap_or(1.0);
    let Some((l, t, _, _)) = *RECT.lock().unwrap_or_else(|e| e.into_inner()) else { return };
    #[derive(Serialize, Clone)]
    struct P {
        x: f64,
        y: f64,
    }
    let _ = win.emit("filee-menu-release", P { x: (x - l) as f64 / scale, y: (y - t) as f64 / scale });
}

/// Clique com o menu aberto: fora do círculo do anel (não do retângulo), fecha.
/// True se fechou.
#[allow(dead_code)]
pub(crate) fn click_outside(x: i32, y: i32) -> bool {
    let r = RADIUS.load(std::sync::atomic::Ordering::Relaxed) as f64;
    let scale = menu().and_then(|w| w.scale_factor().ok()).unwrap_or(1.0);
    let inside = RECT
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .map(|rect| logic::inside_ring(x, y, rect, r * scale))
        .unwrap_or(false);
    if !inside {
        retract();
    }
    !inside
}

#[allow(dead_code)]
pub(crate) fn escape() {
    retract();
}

/// Fecha com a animação: o gancho solta na hora, a página recolhe o anel em
/// ordem inversa e chama filee_menu_close; se não chamar, escondemos depois.
fn retract() {
    *RECT.lock().unwrap_or_else(|e| e.into_inner()) = None;
    #[cfg(windows)]
    win::closed();
    let gen = OPEN_GEN.load(std::sync::atomic::Ordering::SeqCst);
    if let Some(win) = menu() {
        let _ = win.emit("filee-menu-escape", ());
    }
    std::thread::spawn(move || {
        std::thread::sleep(std::time::Duration::from_millis(700));
        if OPEN_GEN.load(std::sync::atomic::Ordering::SeqCst) == gen {
            if let Some(win) = menu() {
                let _ = win.hide();
            }
        }
    });
}

/// O ícone do arquivo como o Explorer mostra (só no Windows).
fn file_icon(path: &str) -> Option<String> {
    #[cfg(windows)]
    {
        use base64::Engine;
        let png = win::file_icon_png(path)?;
        return Some(format!("data:image/png;base64,{}", base64::engine::general_purpose::STANDARD.encode(png)));
    }
    #[cfg(not(windows))]
    {
        let _ = path;
        None
    }
}

fn hide() {
    *RECT.lock().unwrap_or_else(|e| e.into_inner()) = None;
    if let Some(win) = menu() {
        let _ = win.hide();
    }
    #[cfg(windows)]
    win::closed();
}

// ── Comandos da página do menu ──────────────────────────────────────────────

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct AskPayload {
    paths: Vec<String>,
    prompt: Option<String>,
}

/// "Enviar para a IA": a ilha abre o chat com o arquivo e os atalhos de pergunta.
pub fn ask(app: &AppHandle, paths: Vec<String>, prompt: Option<String>) {
    crate::files::allow_dropped(paths.iter().cloned());
    if let Some(island) = crate::island::window(app) {
        let _ = island.emit("filee-ask", AskPayload { paths, prompt });
    }
}

#[tauri::command]
pub fn filee_menu_action(app: AppHandle, action: String, paths: Vec<String>, prompt: Option<String>) -> Result<Option<u64>, String> {
    if paths.is_empty() {
        return Err("Nenhum arquivo.".into());
    }
    match action.as_str() {
        "ask" => {
            ask(&app, paths, prompt);
            Ok(None)
        }
        "open-converter" => {
            handle_args(&app, &[String::from("--filee")].into_iter().chain(paths).collect::<Vec<_>>());
            Ok(None)
        }
        _ => Ok(Some(convert::start(&app, JobSpec { paths, action, options: Default::default() }))),
    }
}

#[tauri::command]
pub fn filee_menu_close() {
    hide();
}

/// A página diz o raio do anel (px lógicos) para o clique-fora pelo círculo.
#[tauri::command]
pub fn filee_menu_radius(radius: f64) {
    RADIUS.store(radius.clamp(40.0, 230.0) as u32, std::sync::atomic::Ordering::Relaxed);
}

/// O hub pega os arquivos que chegaram antes de a página existir.
#[tauri::command]
pub fn convert_take_pending() -> Vec<String> {
    std::mem::take(&mut *PENDING_HUB.lock().unwrap_or_else(|e| e.into_inner()))
}

/// Página de desenvolvimento / testes: abre o menu como se fosse o gesto.
#[tauri::command]
pub fn filee_menu_demo(paths: Vec<String>) {
    let (x, y) = (600, 500);
    open_at(x, y, move || Ok(paths));
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct GestureStatus {
    /// Aviso de conflito com o Filee instalado (gesto desligado), se houver.
    conflict: Option<String>,
    /// O Filee está instalado (achamos o settings.json dele).
    filee: bool,
    /// Os gatilhos do Filee, em texto.
    filee_triggers: Vec<String>,
}

/// Para os Ajustes: o gatilho escolhido briga com o do Filee?
#[tauri::command]
pub fn filee_gesture_status(trigger: String) -> GestureStatus {
    let s = conflict::read_filee_settings();
    GestureStatus {
        conflict: s.as_deref().and_then(|j| conflict::conflict(j, &trigger)),
        filee: s.is_some(),
        filee_triggers: s.as_deref().map(conflict::filee_triggers).unwrap_or_default(),
    }
}
