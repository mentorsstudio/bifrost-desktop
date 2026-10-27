// Matriz de formatos do Conversor (Filee no Bifrost). Pura: nenhuma E/S aqui,
// para os testes cobrirem cada par. O que cada destino exige (uma ferramenta
// opcional ou nada) também mora aqui, e a interface só mostra o que roda.

use serde::Serialize;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum Category {
    Image,
    Vector,
    Pdf,
    Document,
    Text,
    Audio,
    Video,
    Archive,
    Other,
}

/// Ferramentas externas opcionais. `None` em `needs` = embutido no Bifrost.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum Tool {
    /// FFmpeg: baixado sob demanda para %LOCALAPPDATA%\Bifrost\tools.
    Ffmpeg,
    /// PDFium: baixado sob demanda (PDF → imagens, texto melhor).
    Pdfium,
    /// Pandoc, se instalado.
    Pandoc,
    /// LibreOffice (soffice), se instalado.
    LibreOffice,
    /// ImageMagick, se instalado (HEIC/AVIF de entrada).
    Magick,
    /// 7-Zip, se instalado (RAR, ISO, CAB…).
    SevenZip,
}

impl Tool {
    pub fn id(self) -> &'static str {
        match self {
            Tool::Ffmpeg => "ffmpeg",
            Tool::Pdfium => "pdfium",
            Tool::Pandoc => "pandoc",
            Tool::LibreOffice => "libreoffice",
            Tool::Magick => "magick",
            Tool::SevenZip => "7zip",
        }
    }
    pub fn label(self) -> &'static str {
        match self {
            Tool::Ffmpeg => "FFmpeg",
            Tool::Pdfium => "PDFium",
            Tool::Pandoc => "Pandoc",
            Tool::LibreOffice => "LibreOffice",
            Tool::Magick => "ImageMagick",
            Tool::SevenZip => "7-Zip",
        }
    }
    /// Baixável pelo próprio Bifrost (os outros só são detectados).
    pub fn downloadable(self) -> bool {
        matches!(self, Tool::Ffmpeg | Tool::Pdfium)
    }
}

pub const IMAGES_IN: &[&str] = &["png", "jpg", "jpeg", "webp", "bmp", "tif", "tiff", "gif", "ico"];
/// Imagens que o Bifrost só lê com uma ferramenta (ImageMagick ou FFmpeg).
pub const IMAGES_TOOL_IN: &[&str] = &["heic", "heif", "avif"];
pub const IMAGES_OUT: &[&str] = &["png", "jpg", "webp", "bmp", "tiff", "gif", "ico"];
pub const VIDEO: &[&str] = &["mp4", "mkv", "webm", "mov", "avi", "wmv", "flv", "m4v", "mpeg", "mpg", "ts", "3gp"];
pub const AUDIO: &[&str] = &["mp3", "wav", "m4a", "aac", "ogg", "opus", "flac", "wma", "aiff"];
pub const VIDEO_OUT: &[&str] = &["mp4", "mkv", "webm", "mov", "gif"];
pub const AUDIO_OUT: &[&str] = &["mp3", "wav", "m4a", "ogg", "flac"];
pub const DOCS: &[&str] = &["docx", "odt", "rtf", "doc", "epub"];
pub const TEXTS: &[&str] = &["md", "markdown", "html", "htm", "txt"];
pub const ARCHIVES: &[&str] = &["zip", "7z", "tar", "tgz", "gz", "rar", "iso", "cab"];

pub fn norm_ext(ext: &str) -> String {
    let e = ext.trim_start_matches('.').to_ascii_lowercase();
    match e.as_str() {
        "jpeg" | "jfif" => "jpg".into(),
        "tif" => "tiff".into(),
        "htm" => "html".into(),
        "markdown" => "md".into(),
        "heif" => "heic".into(),
        _ => e,
    }
}

pub fn ext_of(path: &str) -> String {
    let lower = path.to_ascii_lowercase();
    if lower.ends_with(".tar.gz") {
        return "tgz".into();
    }
    std::path::Path::new(path)
        .extension()
        .map(|e| norm_ext(&e.to_string_lossy()))
        .unwrap_or_default()
}

pub fn category(ext: &str) -> Category {
    let e = norm_ext(ext);
    let e = e.as_str();
    if e == "svg" {
        Category::Vector
    } else if e == "pdf" {
        Category::Pdf
    } else if IMAGES_IN.contains(&e) || IMAGES_TOOL_IN.contains(&e) || e == "jpg" || e == "tiff" || e == "heic" {
        Category::Image
    } else if VIDEO.contains(&e) {
        Category::Video
    } else if AUDIO.contains(&e) {
        Category::Audio
    } else if DOCS.contains(&e) {
        Category::Document
    } else if TEXTS.contains(&e) || e == "md" || e == "html" {
        Category::Text
    } else if ARCHIVES.contains(&e) {
        Category::Archive
    } else {
        Category::Other
    }
}

/// Uma ação possível sobre um arquivo (ou uma seleção).
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Target {
    /// "to:png", "compress", "resize", "merge-pdf", "split-pdf", "text", "extract", "zip", "pdf-images"…
    pub id: String,
    pub label: String,
    /// Grupo do menu ("Converter para…", "Ferramentas").
    pub group: &'static str,
    pub needs: Option<Tool>,
}

fn to(fmt: &str, needs: Option<Tool>) -> Target {
    Target { id: format!("to:{fmt}"), label: fmt.to_ascii_uppercase(), group: "convert", needs }
}
fn tool(id: &str, label: &str, needs: Option<Tool>) -> Target {
    Target { id: id.into(), label: label.into(), group: "tools", needs }
}

/// Precisa de ferramenta para LER a imagem?
fn image_reader(src: &str) -> Option<Tool> {
    if IMAGES_TOOL_IN.contains(&src) || src == "heic" {
        Some(Tool::Magick)
    } else {
        None
    }
}

/// Tudo o que dá para fazer com um arquivo de extensão `src` (já normalizada ou não).
pub fn targets_for(src: &str) -> Vec<Target> {
    let src = norm_ext(src);
    let s = src.as_str();
    let mut out = Vec::new();
    match category(s) {
        Category::Image => {
            let reader = image_reader(s);
            for f in IMAGES_OUT {
                if *f != s {
                    out.push(to(f, reader));
                }
            }
            // AVIF de saída: só o FFmpeg (libaom) codifica.
            if s != "avif" {
                out.push(to("avif", Some(Tool::Ffmpeg)));
            }
            out.push(to("pdf", reader));
            out.push(tool("compress", "Comprimir", reader));
            out.push(tool("resize", "Redimensionar", reader));
        }
        Category::Vector => {
            for f in ["png", "jpg", "webp", "pdf"] {
                out.push(to(f, None));
            }
        }
        Category::Pdf => {
            out.push(to("png", Some(Tool::Pdfium)));
            out.push(to("jpg", Some(Tool::Pdfium)));
            out.push(to("txt", None));
            out.push(to("docx", Some(Tool::LibreOffice)));
            out.push(tool("compress", "Comprimir", None));
            out.push(tool("split-pdf", "Dividir páginas", None));
            out.push(tool("merge-pdf", "Juntar PDFs", None));
        }
        Category::Document => {
            for f in ["pdf", "docx", "odt", "html", "md", "txt", "epub"] {
                if f == s {
                    continue;
                }
                let needs = if f == "pdf" || s == "doc" || s == "rtf" && f == "docx" {
                    Some(Tool::LibreOffice)
                } else if f == "txt" && s == "docx" {
                    None
                } else {
                    Some(Tool::Pandoc)
                };
                out.push(to(f, needs));
            }
        }
        Category::Text => {
            for f in ["pdf", "docx", "odt", "html", "md", "txt", "epub"] {
                if f == s {
                    continue;
                }
                let needs = match (s, f) {
                    (_, "txt") => None,
                    ("md", "html") => None,
                    (_, "pdf") => Some(Tool::LibreOffice),
                    _ => Some(Tool::Pandoc),
                };
                out.push(to(f, needs));
            }
        }
        Category::Video => {
            for f in VIDEO_OUT {
                if *f != s {
                    out.push(to(f, Some(Tool::Ffmpeg)));
                }
            }
            for f in ["mp3", "m4a", "wav"] {
                out.push(to(f, Some(Tool::Ffmpeg)));
            }
            out.push(tool("compress", "Comprimir", Some(Tool::Ffmpeg)));
            out.push(tool("resize", "Redimensionar (720p)", Some(Tool::Ffmpeg)));
        }
        Category::Audio => {
            for f in AUDIO_OUT {
                if *f != s {
                    out.push(to(f, Some(Tool::Ffmpeg)));
                }
            }
            out.push(tool("compress", "Comprimir", Some(Tool::Ffmpeg)));
        }
        Category::Archive => {
            let needs = match s {
                "zip" | "7z" | "tar" | "tgz" | "gz" => None,
                _ => Some(Tool::SevenZip),
            };
            out.push(tool("extract", "Extrair aqui", needs));
            if s != "zip" {
                out.push(to("zip", needs));
            }
        }
        Category::Other => {}
    }
    if !matches!(category(s), Category::Archive) {
        out.push(tool("zip", "Compactar em ZIP", None));
    }
    if text_extractable(s) {
        out.push(tool("text", "Extrair texto", text_tool(s)));
    }
    out
}

/// Ações que valem para toda a seleção (interseção), mais as de grupo.
pub fn targets_for_many(exts: &[String]) -> Vec<Target> {
    let Some(first) = exts.first() else { return Vec::new() };
    let mut common = targets_for(first);
    for e in &exts[1..] {
        let other = targets_for(e);
        common.retain(|t| other.iter().any(|o| o.id == t.id));
    }
    if exts.len() > 1 {
        common.retain(|t| t.id != "merge-pdf");
        let all_pdf_or_image = exts.iter().all(|e| matches!(category(e), Category::Pdf | Category::Image));
        if all_pdf_or_image {
            common.push(tool("merge-pdf", "Juntar PDFs", None));
        }
        if !common.iter().any(|t| t.id == "zip") {
            common.push(tool("zip", "Compactar em ZIP", None));
        }
    }
    common
}

pub fn text_extractable(ext: &str) -> bool {
    let e = norm_ext(ext);
    matches!(e.as_str(), "pdf" | "docx" | "odt" | "txt" | "md" | "html" | "rtf" | "epub" | "csv" | "json" | "xml" | "log")
}

fn text_tool(ext: &str) -> Option<Tool> {
    match norm_ext(ext).as_str() {
        "rtf" | "epub" => Some(Tool::Pandoc),
        _ => None,
    }
}

/// O que o Ctrl+botão direito mostra: o nome curto de cada categoria.
pub fn category_label(c: Category) -> &'static str {
    match c {
        Category::Image => "Imagem",
        Category::Vector => "Vetor",
        Category::Pdf => "PDF",
        Category::Document => "Documento",
        Category::Text => "Texto",
        Category::Audio => "Áudio",
        Category::Video => "Vídeo",
        Category::Archive => "Arquivo compactado",
        Category::Other => "Arquivo",
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn ids(v: &[Target]) -> Vec<String> {
        v.iter().map(|t| t.id.clone()).collect()
    }

    #[test]
    fn ext_normalised() {
        assert_eq!(ext_of(r"C:\a\Foto.JPEG"), "jpg");
        assert_eq!(ext_of("/x/backup.tar.gz"), "tgz");
        assert_eq!(ext_of("semext"), "");
        assert_eq!(norm_ext(".TIF"), "tiff");
    }

    #[test]
    fn categories() {
        assert_eq!(category("png"), Category::Image);
        assert_eq!(category("HEIC"), Category::Image);
        assert_eq!(category("svg"), Category::Vector);
        assert_eq!(category("pdf"), Category::Pdf);
        assert_eq!(category("mkv"), Category::Video);
        assert_eq!(category("m4a"), Category::Audio);
        assert_eq!(category("docx"), Category::Document);
        assert_eq!(category("md"), Category::Text);
        assert_eq!(category("7z"), Category::Archive);
        assert_eq!(category("exe"), Category::Other);
    }

    #[test]
    fn image_pairs_are_builtin_except_avif() {
        let t = targets_for("png");
        assert!(!ids(&t).contains(&"to:png".to_string()), "não converte para si mesmo");
        for f in ["jpg", "webp", "bmp", "tiff", "gif", "ico", "pdf"] {
            let x = t.iter().find(|x| x.id == format!("to:{f}")).unwrap();
            assert_eq!(x.needs, None, "{f}");
        }
        assert_eq!(t.iter().find(|x| x.id == "to:avif").unwrap().needs, Some(Tool::Ffmpeg));
        assert!(ids(&t).contains(&"compress".into()) && ids(&t).contains(&"resize".into()));
    }

    #[test]
    fn heic_needs_a_reader() {
        let t = targets_for("heic");
        assert!(t.iter().filter(|x| x.group == "convert" && x.id != "to:avif").all(|x| x.needs == Some(Tool::Magick)));
    }

    #[test]
    fn svg_to_png_builtin() {
        assert_eq!(targets_for("svg").iter().find(|x| x.id == "to:png").unwrap().needs, None);
    }

    #[test]
    fn pdf_tools() {
        let t = ids(&targets_for("pdf"));
        for id in ["to:png", "to:txt", "compress", "split-pdf", "merge-pdf", "text"] {
            assert!(t.contains(&id.to_string()), "{id}");
        }
    }

    #[test]
    fn media_need_ffmpeg() {
        for e in ["mp4", "mov", "wav", "ogg"] {
            assert!(targets_for(e).iter().filter(|x| x.group == "convert").all(|x| x.needs == Some(Tool::Ffmpeg)), "{e}");
        }
        assert!(ids(&targets_for("mp4")).contains(&"to:mp3".into()));
        assert!(ids(&targets_for("mp4")).contains(&"to:gif".into()));
    }

    #[test]
    fn docs_need_pandoc_or_office() {
        let t = targets_for("docx");
        assert_eq!(t.iter().find(|x| x.id == "to:pdf").unwrap().needs, Some(Tool::LibreOffice));
        assert_eq!(t.iter().find(|x| x.id == "to:md").unwrap().needs, Some(Tool::Pandoc));
        assert_eq!(t.iter().find(|x| x.id == "to:txt").unwrap().needs, None);
        assert_eq!(targets_for("md").iter().find(|x| x.id == "to:html").unwrap().needs, None);
    }

    #[test]
    fn archives() {
        let z = targets_for("zip");
        assert_eq!(z.iter().find(|x| x.id == "extract").unwrap().needs, None);
        assert!(!ids(&z).contains(&"zip".into()));
        assert_eq!(targets_for("rar").iter().find(|x| x.id == "extract").unwrap().needs, Some(Tool::SevenZip));
    }

    #[test]
    fn selection_intersects_and_merges() {
        let t = ids(&targets_for_many(&["pdf".into(), "png".into()]));
        assert!(t.contains(&"merge-pdf".into()));
        assert!(t.contains(&"zip".into()));
        assert!(!t.contains(&"split-pdf".into()));
        let m = ids(&targets_for_many(&["mp4".into(), "png".into()]));
        assert!(!m.contains(&"merge-pdf".into()));
        assert!(m.contains(&"zip".into()));
        assert!(targets_for_many(&[]).is_empty());
    }

    #[test]
    fn unknown_still_zips() {
        assert_eq!(ids(&targets_for("exe")), vec!["zip".to_string()]);
    }
}
