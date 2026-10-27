// Fila do Conversor: uma tarefa = uma ação sobre N arquivos. Cada arquivo vira
// um item com estado e progresso; o executor real (engines.rs) é injetado, para
// os testes rodarem a fila sem tocar em imagem nem PDF. Nunca sobrescreve: o
// nome de saída ganha " (2)", " (3)"… e o original fica intacto.

use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

#[derive(Debug, Clone, Default, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase", default)]
pub struct Options {
    /// Qualidade (JPG/WEBP/vídeo), 1–100.
    pub quality: Option<u8>,
    /// Redimensionar: lado maior em pixels.
    pub max_side: Option<u32>,
    /// Redimensionar: porcentagem (se `max_side` não vier).
    pub percent: Option<u32>,
    /// Pasta de saída; vazia = ao lado do original.
    pub out_dir: Option<String>,
    /// DPI para PDF → imagens.
    pub dpi: Option<u32>,
}

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct JobSpec {
    pub paths: Vec<String>,
    /// O `Target::id` escolhido: "to:png", "compress", "merge-pdf"…
    pub action: String,
    #[serde(default)]
    pub options: Options,
}

impl JobSpec {
    /// Ações que juntam todos os arquivos num resultado só.
    pub fn is_combining(&self) -> bool {
        matches!(self.action.as_str(), "merge-pdf") || (self.action == "zip" && self.paths.len() > 1)
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum ItemState {
    Queued,
    Running,
    Done,
    Failed,
    Cancelled,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ItemReport {
    pub job: u64,
    pub index: usize,
    pub name: String,
    pub state: ItemState,
    /// 0.0–1.0
    pub progress: f32,
    pub outputs: Vec<String>,
    pub error: Option<String>,
}

/// O que o executor recebe por item.
pub struct Work<'a> {
    pub inputs: &'a [String],
    pub action: &'a str,
    pub options: &'a Options,
    pub cancel: &'a AtomicBool,
    pub progress: &'a mut dyn FnMut(f32),
}

pub type Executor<'a> = dyn Fn(Work<'_>) -> Result<Vec<String>, String> + Send + Sync + 'a;

/// Roda a tarefa em ordem, reportando cada transição. Devolve os relatórios finais.
pub fn run(job: u64, spec: &JobSpec, cancel: Arc<AtomicBool>, exec: &Executor<'_>, report: &mut dyn FnMut(ItemReport)) -> Vec<ItemReport> {
    let groups: Vec<Vec<String>> = if spec.is_combining() {
        vec![spec.paths.clone()]
    } else {
        spec.paths.iter().map(|p| vec![p.clone()]).collect()
    };
    let mut finals = Vec::with_capacity(groups.len());
    let name_of = |g: &Vec<String>| {
        if g.len() > 1 {
            format!("{} arquivos", g.len())
        } else {
            file_name(&g[0])
        }
    };
    for (index, g) in groups.iter().enumerate() {
        report(ItemReport { job, index, name: name_of(g), state: ItemState::Queued, progress: 0.0, outputs: vec![], error: None });
    }
    for (index, g) in groups.iter().enumerate() {
        let name = name_of(g);
        if cancel.load(Ordering::Relaxed) {
            let r = ItemReport { job, index, name, state: ItemState::Cancelled, progress: 0.0, outputs: vec![], error: None };
            report(r.clone());
            finals.push(r);
            continue;
        }
        report(ItemReport { job, index, name: name.clone(), state: ItemState::Running, progress: 0.0, outputs: vec![], error: None });
        let mut last = 0.0f32;
        let mut tick = |p: f32| {
            let p = p.clamp(0.0, 1.0);
            if p - last >= 0.02 || p >= 1.0 {
                last = p;
                report(ItemReport { job, index, name: name.clone(), state: ItemState::Running, progress: p, outputs: vec![], error: None });
            }
        };
        let result = exec(Work { inputs: g, action: &spec.action, options: &spec.options, cancel: &cancel, progress: &mut tick });
        let r = match result {
            Ok(outputs) => ItemReport { job, index, name, state: ItemState::Done, progress: 1.0, outputs, error: None },
            Err(_) if cancel.load(Ordering::Relaxed) => ItemReport { job, index, name, state: ItemState::Cancelled, progress: 0.0, outputs: vec![], error: None },
            Err(e) => ItemReport { job, index, name, state: ItemState::Failed, progress: 0.0, outputs: vec![], error: Some(e) },
        };
        report(r.clone());
        finals.push(r);
    }
    finals
}

pub fn file_name(p: &str) -> String {
    Path::new(p).file_name().map(|s| s.to_string_lossy().into_owned()).unwrap_or_else(|| p.to_string())
}

pub fn stem(p: &str) -> String {
    let n = file_name(p);
    let lower = n.to_ascii_lowercase();
    if lower.ends_with(".tar.gz") {
        return n[..n.len() - 7].to_string();
    }
    Path::new(&n).file_stem().map(|s| s.to_string_lossy().into_owned()).unwrap_or(n)
}

/// Pasta onde a saída de `input` vai.
pub fn out_dir_for(input: &str, opts: &Options) -> PathBuf {
    match opts.out_dir.as_deref().map(str::trim).filter(|s| !s.is_empty()) {
        Some(d) => PathBuf::from(d),
        None => Path::new(input).parent().map(Path::to_path_buf).unwrap_or_else(|| PathBuf::from(".")),
    }
}

/// Um caminho livre: `dir/base.ext`, senão `dir/base (2).ext`, `(3)`…
pub fn free_path(dir: &Path, base: &str, ext: &str, exists: &dyn Fn(&Path) -> bool) -> PathBuf {
    let dotted = if ext.is_empty() { String::new() } else { format!(".{ext}") };
    let first = dir.join(format!("{base}{dotted}"));
    if !exists(&first) {
        return first;
    }
    for n in 2..10_000 {
        let p = dir.join(format!("{base} ({n}){dotted}"));
        if !exists(&p) {
            return p;
        }
    }
    dir.join(format!("{base}-{}{dotted}", std::process::id()))
}

pub fn free_path_fs(dir: &Path, base: &str, ext: &str) -> PathBuf {
    free_path(dir, base, ext, &|p: &Path| p.exists())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashSet;
    use std::sync::Mutex;

    fn spec(paths: &[&str], action: &str) -> JobSpec {
        JobSpec { paths: paths.iter().map(|s| s.to_string()).collect(), action: action.into(), options: Options::default() }
    }

    #[test]
    fn free_path_never_overwrites() {
        let taken: HashSet<PathBuf> = ["/d/a.png", "/d/a (2).png"].iter().map(PathBuf::from).collect();
        let p = free_path(Path::new("/d"), "a", "png", &|p: &Path| taken.contains(p));
        assert_eq!(p, PathBuf::from("/d/a (3).png"));
        assert_eq!(free_path(Path::new("/d"), "b", "", &|_: &Path| false), PathBuf::from("/d/b"));
    }

    #[test]
    fn stems_and_dirs() {
        assert_eq!(stem("/x/foto.final.JPG"), "foto.final");
        assert_eq!(stem("/x/b.tar.gz"), "b");
        assert_eq!(out_dir_for("/x/y/a.png", &Options::default()), PathBuf::from("/x/y"));
        let o = Options { out_dir: Some("/out".into()), ..Default::default() };
        assert_eq!(out_dir_for("/x/a.png", &o), PathBuf::from("/out"));
        let blank = Options { out_dir: Some("  ".into()), ..Default::default() };
        assert_eq!(out_dir_for("/x/a.png", &blank), PathBuf::from("/x"));
    }

    #[test]
    fn runs_each_file_and_reports() {
        let exec: Box<Executor<'static>> = Box::new(|w: Work<'_>| {
            (w.progress)(0.5);
            if w.inputs[0].ends_with("bad.png") {
                Err("corrompido".into())
            } else {
                Ok(vec![format!("{}.out", w.inputs[0])])
            }
        });
        let log = Mutex::new(Vec::new());
        let finals = run(7, &spec(&["a.png", "bad.png", "c.png"], "to:jpg"), Arc::new(AtomicBool::new(false)), &*exec, &mut |r| log.lock().unwrap().push(r));
        assert_eq!(finals.len(), 3);
        assert_eq!(finals[0].state, ItemState::Done);
        assert_eq!(finals[0].outputs, vec!["a.png.out".to_string()]);
        assert_eq!(finals[1].state, ItemState::Failed);
        assert_eq!(finals[1].error.as_deref(), Some("corrompido"));
        assert_eq!(finals[2].state, ItemState::Done);
        let log = log.into_inner().unwrap();
        // 3 na fila + (running, 0.5, final) × 3
        assert_eq!(log.iter().filter(|r| r.state == ItemState::Queued).count(), 3);
        assert!(log.iter().any(|r| r.state == ItemState::Running && (r.progress - 0.5).abs() < 1e-6));
        assert!(log.iter().all(|r| r.job == 7));
    }

    #[test]
    fn merge_is_one_item() {
        let seen = Mutex::new(0usize);
        let exec = |w: Work<'_>| {
            *seen.lock().unwrap() = w.inputs.len();
            Ok(vec!["m.pdf".to_string()])
        };
        let finals = run(1, &spec(&["a.pdf", "b.pdf", "c.png"], "merge-pdf"), Arc::new(AtomicBool::new(false)), &exec, &mut |_| {});
        assert_eq!(finals.len(), 1);
        assert_eq!(finals[0].name, "3 arquivos");
        assert_eq!(*seen.lock().unwrap(), 3);
    }

    #[test]
    fn cancel_stops_the_rest() {
        let cancel = Arc::new(AtomicBool::new(false));
        let c2 = cancel.clone();
        let exec = move |_w: Work<'_>| {
            c2.store(true, Ordering::Relaxed);
            Err("parado".to_string())
        };
        let finals = run(2, &spec(&["a.mp4", "b.mp4"], "to:webm"), cancel, &exec, &mut |_| {});
        assert_eq!(finals[0].state, ItemState::Cancelled);
        assert_eq!(finals[1].state, ItemState::Cancelled);
    }
}
