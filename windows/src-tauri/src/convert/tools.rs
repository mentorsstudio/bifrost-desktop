// As ferramentas opcionais do Conversor: onde estão (ou se faltam) e o download
// sob demanda das que o Bifrost sabe buscar (FFmpeg e PDFium), para
// %LOCALAPPDATA%\Bifrost\tools. Nada é baixado sem um clique do usuário.

use std::path::{Path, PathBuf};
use std::process::Command;

use serde::Serialize;

use super::formats::Tool;

pub const ALL: [Tool; 6] = [Tool::Ffmpeg, Tool::Pdfium, Tool::Pandoc, Tool::LibreOffice, Tool::Magick, Tool::SevenZip];

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolStatus {
    pub id: &'static str,
    pub label: &'static str,
    pub path: Option<String>,
    pub downloadable: bool,
    /// Tamanho aproximado do download, em MB.
    pub download_mb: u32,
    pub hint: &'static str,
}

pub fn tools_dir() -> PathBuf {
    crate::settings::local_dir().join("tools")
}

fn exe(name: &str) -> String {
    if cfg!(windows) {
        format!("{name}.exe")
    } else {
        name.to_string()
    }
}

/// Procura `name` no PATH.
pub fn which(name: &str) -> Option<PathBuf> {
    let path = std::env::var_os("PATH")?;
    for dir in std::env::split_paths(&path) {
        let p = dir.join(exe(name));
        if p.is_file() {
            return Some(p);
        }
    }
    None
}

fn first_file(cands: impl IntoIterator<Item = PathBuf>) -> Option<PathBuf> {
    cands.into_iter().find(|p| p.is_file())
}

fn env_dir(var: &str) -> Option<PathBuf> {
    std::env::var_os(var).map(PathBuf::from)
}

pub fn pdfium_lib_name() -> &'static str {
    if cfg!(windows) {
        "pdfium.dll"
    } else if cfg!(target_os = "macos") {
        "libpdfium.dylib"
    } else {
        "libpdfium.so"
    }
}

pub fn locate(tool: Tool) -> Option<PathBuf> {
    let own = tools_dir();
    let mut c: Vec<PathBuf> = Vec::new();
    match tool {
        Tool::Ffmpeg => {
            c.push(own.join("ffmpeg").join(exe("ffmpeg")));
            if let Some(p) = which("ffmpeg") {
                c.push(p);
            }
            if let Some(l) = env_dir("LOCALAPPDATA") {
                c.push(l.join(r"Microsoft\WinGet\Links\ffmpeg.exe"));
            }
        }
        Tool::Pdfium => {
            c.push(own.join("pdfium").join(pdfium_lib_name()));
            // O instalador traz o pdfium.dll junto (recurso do Tauri, ao lado do
            // bifrost-desktop.exe): PDF → PNG/JPG funciona sem baixar nada.
            if let Some(dir) = std::env::current_exe().ok().and_then(|e| e.parent().map(|p| p.to_path_buf())) {
                c.push(dir.join("pdfium").join(pdfium_lib_name()));
                c.push(dir.join("resources").join("pdfium").join(pdfium_lib_name()));
                c.push(dir.join(pdfium_lib_name()));
            }
        }
        Tool::Pandoc => {
            if let Some(p) = which("pandoc") {
                c.push(p);
            }
            if let Some(l) = env_dir("LOCALAPPDATA") {
                c.push(l.join(r"Pandoc\pandoc.exe"));
            }
            if let Some(pf) = env_dir("ProgramFiles") {
                c.push(pf.join(r"Pandoc\pandoc.exe"));
            }
        }
        Tool::LibreOffice => {
            if let Some(p) = which("soffice") {
                c.push(p);
            }
            for var in ["ProgramFiles", "ProgramFiles(x86)"] {
                if let Some(pf) = env_dir(var) {
                    c.push(pf.join(r"LibreOffice\program\soffice.exe"));
                }
            }
            c.push(PathBuf::from("/usr/bin/libreoffice"));
        }
        Tool::Magick => {
            if let Some(p) = which("magick") {
                c.push(p);
            }
            if let Some(pf) = env_dir("ProgramFiles") {
                if let Ok(rd) = std::fs::read_dir(&pf) {
                    for e in rd.flatten() {
                        if e.file_name().to_string_lossy().starts_with("ImageMagick") {
                            c.push(e.path().join("magick.exe"));
                        }
                    }
                }
            }
        }
        Tool::SevenZip => {
            for n in ["7z", "7zz"] {
                if let Some(p) = which(n) {
                    c.push(p);
                }
            }
            for var in ["ProgramFiles", "ProgramFiles(x86)"] {
                if let Some(pf) = env_dir(var) {
                    c.push(pf.join(r"7-Zip\7z.exe"));
                }
            }
        }
    }
    first_file(c)
}

pub fn status() -> Vec<ToolStatus> {
    ALL.iter()
        .map(|&t| ToolStatus {
            id: t.id(),
            label: t.label(),
            path: locate(t).map(|p| p.to_string_lossy().into_owned()),
            downloadable: t.downloadable(),
            download_mb: match t {
                Tool::Ffmpeg => 90,
                Tool::Pdfium => 6,
                _ => 0,
            },
            hint: match t {
                Tool::Ffmpeg => "Áudio e vídeo (MP4, MKV, WEBM, MOV, MP3, WAV, GIF…) e AVIF.",
                Tool::Pdfium => "PDF → PNG/JPG e texto de PDF com mais fidelidade.",
                Tool::Pandoc => "Markdown, HTML, DOCX, ODT e EPUB entre si. Instale de pandoc.org.",
                Tool::LibreOffice => "DOC/DOCX/ODT/RTF → PDF e PDF → DOCX. Instale de libreoffice.org.",
                Tool::Magick => "Leitura de HEIC e AVIF. Instale de imagemagick.org.",
                Tool::SevenZip => "Extrair RAR, ISO, CAB. Instale de 7-zip.org.",
            },
        })
        .collect()
}

/// Um processo sem janela de console (Windows).
pub fn command(program: &Path) -> Command {
    #[allow(unused_mut)]
    let mut cmd = Command::new(program);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x0800_0000); // CREATE_NO_WINDOW
    }
    cmd
}

// ── Download sob demanda ─────────────────────────────────────────────────────

/// De onde vem cada ferramenta baixável (binários oficiais/populares, fixos).
fn source(tool: Tool) -> Option<&'static str> {
    match tool {
        Tool::Ffmpeg if cfg!(windows) => Some("https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-win64-gpl.zip"),
        Tool::Ffmpeg => Some("https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-linux64-gpl.tar.xz"),
        Tool::Pdfium if cfg!(windows) => Some("https://github.com/bblanchon/pdfium-binaries/releases/download/chromium%2F7881/pdfium-win-x64.tgz"),
        Tool::Pdfium => Some("https://github.com/bblanchon/pdfium-binaries/releases/download/chromium%2F7881/pdfium-linux-x64.tgz"),
        _ => None,
    }
}

/// Baixa e instala `tool` em tools_dir(). `progress(baixado, total)`.
pub async fn download(tool: Tool, progress: &(dyn Fn(u64, u64) + Send + Sync)) -> Result<PathBuf, String> {
    let url = source(tool).ok_or_else(|| format!("{} não é baixável pelo Bifrost.", tool.label()))?;
    let dir = tools_dir();
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let client = reqwest::Client::builder().user_agent("Bifrost-Desktop").build().map_err(|e| e.to_string())?;
    let mut resp = client.get(url).send().await.map_err(|e| format!("Falha ao baixar {}: {e}", tool.label()))?;
    if !resp.status().is_success() {
        return Err(format!("Falha ao baixar {}: HTTP {}", tool.label(), resp.status()));
    }
    let total = resp.content_length().unwrap_or(0);
    let tmp = dir.join(format!("{}.download", tool.id()));
    let mut file = std::fs::File::create(&tmp).map_err(|e| e.to_string())?;
    let mut got = 0u64;
    use std::io::Write;
    while let Some(chunk) = resp.chunk().await.map_err(|e| e.to_string())? {
        file.write_all(&chunk).map_err(|e| e.to_string())?;
        got += chunk.len() as u64;
        progress(got, total);
    }
    drop(file);
    let result = install(tool, &tmp, &dir);
    let _ = std::fs::remove_file(&tmp);
    result
}

fn install(tool: Tool, archive: &Path, dir: &Path) -> Result<PathBuf, String> {
    let dest = dir.join(tool.id());
    std::fs::create_dir_all(&dest).map_err(|e| e.to_string())?;
    match tool {
        Tool::Ffmpeg if cfg!(windows) => {
            let f = std::fs::File::open(archive).map_err(|e| e.to_string())?;
            let mut z = zip::ZipArchive::new(f).map_err(|e| e.to_string())?;
            for i in 0..z.len() {
                let mut entry = z.by_index(i).map_err(|e| e.to_string())?;
                let name = entry.name().replace('\\', "/");
                let base = name.rsplit('/').next().unwrap_or("").to_string();
                if name.contains("/bin/") && (base == "ffmpeg.exe" || base == "ffprobe.exe") {
                    let mut out = std::fs::File::create(dest.join(&base)).map_err(|e| e.to_string())?;
                    std::io::copy(&mut entry, &mut out).map_err(|e| e.to_string())?;
                }
            }
            let p = dest.join("ffmpeg.exe");
            if p.is_file() { Ok(p) } else { Err("O pacote do FFmpeg não tinha o ffmpeg.exe.".into()) }
        }
        Tool::Ffmpeg => Err("No Linux, instale o ffmpeg pelo gerenciador de pacotes.".into()),
        Tool::Pdfium => {
            let f = std::fs::File::open(archive).map_err(|e| e.to_string())?;
            let mut t = tar::Archive::new(flate2::read::GzDecoder::new(f));
            let want = pdfium_lib_name();
            for entry in t.entries().map_err(|e| e.to_string())? {
                let mut entry = entry.map_err(|e| e.to_string())?;
                let path = entry.path().map_err(|e| e.to_string())?.into_owned();
                if path.file_name().map(|n| n == want).unwrap_or(false) {
                    let out = dest.join(want);
                    entry.unpack(&out).map_err(|e| e.to_string())?;
                    return Ok(out);
                }
            }
            Err("O pacote do PDFium não tinha a biblioteca.".into())
        }
        _ => Err("Ferramenta sem instalador.".into()),
    }
}
