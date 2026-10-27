// Conversor (Filee no Bifrost): a matriz de formatos, a fila de tarefas, os
// motores e as ferramentas opcionais. A página "Conversor" do hub, a ilha
// ("Solte seus arquivos aqui") e o gesto Ctrl+botão direito usam os mesmos
// comandos daqui. Referência de uso: o Filee (MIT, KnifeLemon) — veja
// docs/bifrost-engenharia-reversa.md, "Conversor e gestos (Filee)".

pub mod engines;
pub mod formats;
pub mod jobs;
pub mod prefs;
pub mod ring;
pub mod tools;

use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex};

use serde::Serialize;
use tauri::{AppHandle, Emitter};

use formats::{Category, Target, Tool};
use jobs::{ItemReport, JobSpec};

static NEXT_JOB: AtomicU64 = AtomicU64::new(1);
static JOBS: Mutex<Option<HashMap<u64, Arc<AtomicBool>>>> = Mutex::new(None);

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct FileInfo {
    pub path: String,
    pub name: String,
    pub ext: String,
    pub category: Category,
    pub category_label: &'static str,
    pub size: u64,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct TargetInfo {
    #[serde(flatten)]
    pub target: Target,
    /// A ferramenta exigida está presente (ou nenhuma é exigida).
    pub ready: bool,
    pub needs_label: Option<&'static str>,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Plan {
    pub files: Vec<FileInfo>,
    pub targets: Vec<TargetInfo>,
    pub tools: Vec<tools::ToolStatus>,
    /// O anel do gesto para estes arquivos (fatias no jeito do Filee).
    pub ring: ring::Ring,
}

pub fn plan(paths: &[String]) -> Plan {
    let files: Vec<FileInfo> = paths
        .iter()
        .map(|p| {
            let ext = formats::ext_of(p);
            let category = if std::path::Path::new(p).is_dir() { Category::Other } else { formats::category(&ext) };
            FileInfo {
                path: p.clone(),
                name: jobs::file_name(p),
                category,
                category_label: formats::category_label(category),
                size: std::fs::metadata(p).map(|m| m.len()).unwrap_or(0),
                ext,
            }
        })
        .collect();
    let exts: Vec<String> = files.iter().map(|f| f.ext.clone()).collect();
    let status = tools::status();
    let present = |t: Tool| status.iter().any(|s| s.id == t.id() && s.path.is_some());
    let targets = formats::targets_for_many(&exts)
        .into_iter()
        .map(|t| TargetInfo { ready: t.needs.map(present).unwrap_or(true), needs_label: t.needs.map(Tool::label), target: t })
        .collect();
    let ring_exts: Vec<String> = files.iter().map(|f| if std::path::Path::new(&f.path).is_dir() { "folder".to_string() } else { f.ext.clone() }).collect();
    let ring = ring::ring_for(&ring_exts, &present);
    Plan { files, targets, tools: status, ring }
}

#[tauri::command]
pub fn convert_plan(paths: Vec<String>) -> Plan {
    plan(&paths)
}

#[tauri::command]
pub fn convert_tools() -> Vec<tools::ToolStatus> {
    tools::status()
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct ToolProgress {
    id: String,
    got: u64,
    total: u64,
    done: bool,
    error: Option<String>,
}

#[tauri::command]
pub async fn convert_install_tool(app: AppHandle, id: String) -> Result<String, String> {
    let tool = tools::ALL.iter().copied().find(|t| t.id() == id).ok_or("Ferramenta desconhecida.")?;
    let app2 = app.clone();
    let id2 = id.clone();
    let last = Mutex::new(0u64);
    let cb = move |got: u64, total: u64| {
        let mut l = last.lock().unwrap_or_else(|e| e.into_inner());
        if got - *l >= 512 * 1024 || got == total {
            *l = got;
            let _ = app2.emit("convert-tool", ToolProgress { id: id2.clone(), got, total, done: false, error: None });
        }
    };
    let r = tools::download(tool, &cb).await;
    let _ = app.emit("convert-tool", ToolProgress { id, got: 0, total: 0, done: true, error: r.as_ref().err().cloned() });
    crate::log::line(format!("conversor: ferramenta {} → {:?}", tool.id(), r.as_ref().map(|p| p.display().to_string())));
    r.map(|p| p.to_string_lossy().into_owned())
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct JobDone {
    job: u64,
    items: Vec<ItemReport>,
}

/// Começa uma tarefa em segundo plano; o progresso chega em "convert-item".
pub fn start(app: &AppHandle, spec: JobSpec) -> u64 {
    let job = NEXT_JOB.fetch_add(1, Ordering::Relaxed);
    let cancel = Arc::new(AtomicBool::new(false));
    JOBS.lock().unwrap_or_else(|e| e.into_inner()).get_or_insert_with(HashMap::new).insert(job, cancel.clone());
    let app = app.clone();
    std::thread::spawn(move || {
        crate::log::line(format!("conversor: tarefa {job} {} × {}", spec.action, spec.paths.len()));
        let exec = |w: jobs::Work<'_>| engines::execute(w);
        let items = jobs::run(job, &spec, cancel, &exec, &mut |r| {
            let _ = app.emit("convert-item", r);
        });
        JOBS.lock().unwrap_or_else(|e| e.into_inner()).get_or_insert_with(HashMap::new).remove(&job);
        let _ = app.emit("convert-done", JobDone { job, items });
    });
    job
}

#[tauri::command]
pub fn convert_start(app: AppHandle, spec: JobSpec) -> u64 {
    let mut spec = spec;
    if spec.options.out_dir.as_deref().map(str::trim).unwrap_or("").is_empty() {
        let p = prefs::load();
        if !p.out_dir.trim().is_empty() {
            spec.options.out_dir = Some(p.out_dir);
        }
    }
    start(&app, spec)
}

#[tauri::command]
pub fn convert_cancel(job: u64) {
    if let Some(c) = JOBS.lock().unwrap_or_else(|e| e.into_inner()).get_or_insert_with(HashMap::new).get(&job) {
        c.store(true, Ordering::Relaxed);
    }
}

/// Mostra o arquivo (ou a pasta) no Explorador.
#[tauri::command]
pub fn convert_reveal(path: String) {
    #[cfg(windows)]
    {
        let p = std::path::Path::new(&path);
        let mut cmd = std::process::Command::new("explorer.exe");
        if p.is_dir() {
            cmd.arg(p);
        } else {
            cmd.arg(format!("/select,{}", path));
        }
        let _ = cmd.spawn();
    }
    #[cfg(not(windows))]
    {
        let p = std::path::Path::new(&path);
        let dir = if p.is_dir() { p.to_path_buf() } else { p.parent().map(|d| d.to_path_buf()).unwrap_or_default() };
        let _ = std::process::Command::new("xdg-open").arg(dir).spawn();
    }
}

#[tauri::command]
pub async fn convert_extract_text(path: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || engines::extract_text(&path)).await.map_err(|e| e.to_string())?
}

#[tauri::command]
pub fn convert_prefs() -> prefs::FileePrefs {
    prefs::load()
}

#[tauri::command]
pub fn convert_set_prefs(app: AppHandle, prefs: prefs::FileePrefs) -> Result<prefs::FileePrefs, String> {
    let saved = prefs::save(prefs)?;
    crate::gesture::apply(&app, &saved);
    crate::gesture::context_menu(saved.context_menu);
    let _ = app.emit("filee-prefs", &saved);
    Ok(saved)
}

/// "Escolher arquivos…" do Conversor (diálogo nativo do Windows).
#[tauri::command]
pub async fn convert_pick_files() -> Vec<String> {
    tauri::async_runtime::spawn_blocking(crate::gesture::pick_files).await.unwrap_or_default()
}

/// Entrada da linha de comando: `bifrost-desktop --filee "<arquivo>"` (o menu
/// clássico do Explorador). Abre o Conversor com os arquivos.
pub fn paths_from_args(args: &[String]) -> Option<Vec<String>> {
    let at = args.iter().position(|a| a == "--filee")?;
    let paths: Vec<String> = args[at + 1..].iter().filter(|a| !a.starts_with("--")).cloned().collect();
    (!paths.is_empty()).then_some(paths)
}

#[cfg(test)]
mod tests {
    #[test]
    fn args() {
        let a: Vec<String> = ["bifrost.exe", "--filee", "C:\\a.png", "C:\\b.pdf"].iter().map(|s| s.to_string()).collect();
        assert_eq!(super::paths_from_args(&a).unwrap().len(), 2);
        assert!(super::paths_from_args(&["x".to_string()]).is_none());
    }
}
