// O anel do gesto, como o do Filee (MIT, © 2026 Myeonggu Kim / KnifeLemon),
// reescrito do zero: um "perfil" por família de arquivo decide as fatias, na
// ordem do relógio a partir das 12h; fatias que não servem para esses arquivos
// ficam apagadas e dizem por quê. Depois das conversões diretas vêm as nossas
// (Comprimir, Redimensionar, Enviar para a IA, Abrir no Conversor). Puro: sem
// E/S, para os testes cobrirem cada perfil.

use serde::Serialize;

use super::formats::{self, Category, Tool};

/// No máximo 12 fatias num anel (como o Filee).
pub const MAX_SLICES: usize = 12;

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RingSlice {
    /// Id da fatia ("to-png", "merge-pdf", "zip-all", "ask"…).
    pub id: String,
    /// O que a fila roda ("to:png", "merge-pdf", "zip"…); vazio num grupo.
    pub action: String,
    pub label: String,
    /// A linha menor sob o nome (o formato de saída, como no Filee).
    pub caption: Option<String>,
    pub enabled: bool,
    /// Por que está apagada ("Mesmo formato", "Precisa do LibreOffice"…).
    pub reason: Option<String>,
    pub needs: Option<Tool>,
    /// Um grupo abre um segundo anel por fora com estas fatias.
    pub children: Vec<RingSlice>,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Ring {
    /// "images", "pdf", "office", "ebooks", "text", "video", "audio", "vector", "archives", "mixed".
    pub profile: &'static str,
    /// O título do miolo: "1 × PNG" ou "3 arquivos".
    pub title: String,
    pub slices: Vec<RingSlice>,
}

/// O que uma fatia faz com um arquivo de extensão `src`.
#[derive(Debug, Clone, Copy, PartialEq)]
enum Sup {
    /// Converte; pode precisar de uma ferramenta.
    Yes(Option<Tool>),
    /// O arquivo já está nesse formato.
    Same,
    No,
}

const LO: Option<Tool> = Some(Tool::LibreOffice);
const PD: Option<Tool> = Some(Tool::Pandoc);
const FF: Option<Tool> = Some(Tool::Ffmpeg);
const PDFIUM: Option<Tool> = Some(Tool::Pdfium);

fn cat(src: &str) -> Category {
    if src == "folder" {
        Category::Other
    } else {
        formats::category(src)
    }
}

/// Lê a imagem? (HEIC/AVIF pedem o ImageMagick ou o FFmpeg.)
fn image_in(src: &str) -> Option<Tool> {
    if formats::IMAGES_TOOL_IN.contains(&src) || src == "heic" {
        Some(Tool::Magick)
    } else {
        None
    }
}

/// Uma ferramenta depois da outra (rota de dois passos): vale a primeira que faltar.
fn chain(a: Option<Tool>, b: Option<Tool>) -> Option<Tool> {
    a.or(b)
}

/// Converter `src` para o formato `fmt` — inclusive pelas rotas de mais de um
/// passo (DOCX → PDF → PNG, PDF → Markdown → EPUB…).
fn to_format(src: &str, fmt: &str) -> Sup {
    if src == fmt {
        return Sup::Same;
    }
    let c = cat(src);
    match (c, fmt) {
        (Category::Image, "png" | "jpg" | "webp" | "bmp" | "tiff" | "gif" | "ico" | "pdf") => Sup::Yes(image_in(src)),
        (Category::Image, "avif") => Sup::Yes(chain(image_in(src), FF)),
        (Category::Vector, "png" | "jpg" | "webp" | "pdf" | "bmp" | "tiff" | "ico") => Sup::Yes(None),
        (Category::Pdf, "png" | "jpg" | "webp" | "tiff") => Sup::Yes(PDFIUM),
        (Category::Pdf, "txt" | "md") => Sup::Yes(None),
        // PDF → Markdown (embutido) → EPUB/HTML (Pandoc)
        (Category::Pdf, "epub" | "html") => Sup::Yes(PD),
        (Category::Pdf, "docx" | "odt") => Sup::Yes(LO),
        (Category::Document | Category::Text, "txt") => match src {
            "docx" | "odt" | "html" | "md" => Sup::Yes(None),
            _ => Sup::Yes(PD),
        },
        (Category::Text, "html") if src == "md" => Sup::Yes(None),
        (Category::Document | Category::Text, "pdf") => Sup::Yes(LO),
        // Documento → PDF (LibreOffice) → imagem (PDFium)
        (Category::Document | Category::Text, "png" | "jpg") => Sup::Yes(chain(LO, PDFIUM)),
        (Category::Document | Category::Text, "docx" | "odt" | "html" | "md" | "epub") => {
            if src == "doc" || (src == "rtf" && fmt == "docx") {
                Sup::Yes(LO)
            } else {
                Sup::Yes(PD)
            }
        }
        (Category::Video, "mp4" | "webm" | "mov" | "gif" | "mkv" | "avi" | "mp3" | "m4a" | "wav") => Sup::Yes(FF),
        (Category::Audio, "mp3" | "m4a" | "wav" | "flac" | "ogg" | "opus" | "aac") => Sup::Yes(FF),
        (Category::Archive, "zip" | "7z" | "tar" | "tgz") => match src {
            "zip" | "7z" | "tar" | "tgz" | "gz" => Sup::Yes(None),
            _ => Sup::Yes(Some(Tool::SevenZip)),
        },
        _ => Sup::No,
    }
}

/// Uma fatia sobre um arquivo.
fn support(id: &str, src: &str) -> Sup {
    let c = cat(src);
    if let Some(fmt) = id.strip_prefix("to-") {
        return to_format(src, fmt);
    }
    match id {
        "half-size" => match c {
            Category::Image => Sup::Yes(image_in(src)),
            _ => Sup::No,
        },
        "pdf-long-image" => match c {
            Category::Pdf => Sup::Yes(PDFIUM),
            Category::Document => Sup::Yes(chain(LO, PDFIUM)),
            _ => Sup::No,
        },
        "pdf-split" => if c == Category::Pdf { Sup::Yes(None) } else { Sup::No },
        // Mesclar: PDFs e imagens direto; documentos e textos passam pelo PDF.
        "merge-pdf" => match c {
            Category::Pdf => Sup::Yes(None),
            Category::Image => Sup::Yes(image_in(src)),
            Category::Vector => Sup::Yes(None),
            Category::Document | Category::Text => Sup::Yes(LO),
            _ => Sup::No,
        },
        "zip-all" => Sup::Yes(None),
        "extract" => match c {
            Category::Archive => match src {
                "zip" | "7z" | "tar" | "tgz" | "gz" => Sup::Yes(None),
                _ => Sup::Yes(Some(Tool::SevenZip)),
            },
            _ => Sup::No,
        },
        "mp4-720" | "mp4-hevc" | "extract-subtitles" => if c == Category::Video { Sup::Yes(FF) } else { Sup::No },
        "mp3-128" => if matches!(c, Category::Audio | Category::Video) { Sup::Yes(FF) } else { Sup::No },
        "compress" => match c {
            Category::Image => Sup::Yes(image_in(src)),
            Category::Pdf => Sup::Yes(None),
            Category::Audio | Category::Video => Sup::Yes(FF),
            _ => Sup::No,
        },
        "resize" => match c {
            Category::Image => Sup::Yes(image_in(src)),
            Category::Vector => Sup::Yes(None),
            Category::Video => Sup::Yes(FF),
            _ => Sup::No,
        },
        _ => Sup::No,
    }
}

/// As fatias de cada perfil, na ordem do Filee (só as que o Bifrost roda).
fn profile_slices(profile: &str) -> &'static [&'static str] {
    match profile {
        "images" => &["to-png", "to-jpg", "to-webp", "to-pdf", "to-tiff", "to-bmp", "to-ico", "half-size"],
        "pdf" => &["to-png", "to-jpg", "pdf-long-image", "to-docx", "to-txt", "to-md", "to-epub", "pdf-split", "merge-pdf"],
        "office" => &["to-pdf", "to-docx", "to-odt", "to-txt", "to-html", "to-epub", "to-png", "merge-pdf"],
        "ebooks" => &["to-pdf", "to-epub", "to-docx", "to-txt", "to-html", "to-md"],
        "text" => &["to-pdf", "to-docx", "to-html", "to-txt", "to-epub"],
        "video" => &["to-mp4", "mp4-720", "mp4-hevc", "to-webm", "to-mov", "to-gif", "to-mp3", "extract-subtitles", "to-mkv", "to-avi"],
        "audio" => &["to-mp3", "mp3-128", "to-m4a", "to-wav", "to-flac", "to-ogg", "to-opus", "to-aac"],
        "vector" => &["to-png", "to-pdf", "to-svg", "to-jpg", "to-webp"],
        "archives" => &["extract", "zip-all", "to-zip", "to-7z", "to-tgz", "to-tar"],
        _ => &["to-pdf", "merge-pdf", "zip-all", "to-png", "to-txt"],
    }
}

/// O perfil de uma extensão (None = só cabe no "mistos").
fn profile_of(src: &str) -> Option<&'static str> {
    if src == "epub" {
        return Some("ebooks");
    }
    Some(match cat(src) {
        Category::Image => "images",
        Category::Pdf => "pdf",
        Category::Document => "office",
        Category::Text => "text",
        Category::Video => "video",
        Category::Audio => "audio",
        Category::Vector => "vector",
        Category::Archive => "archives",
        Category::Other => return None,
    })
}

/// Como o ProfileSelector do Filee: todos os arquivos num mesmo perfil, senão "mistos".
pub fn select_profile(exts: &[String]) -> &'static str {
    let mut it = exts.iter().map(|e| profile_of(e));
    let Some(Some(first)) = it.next() else { return "mixed" };
    if it.all(|p| p == Some(first)) {
        first
    } else {
        "mixed"
    }
}

pub fn slice_label(id: &str) -> String {
    match id {
        "half-size" => "Tamanho 50%".into(),
        "pdf-long-image" => "Imagem longa".into(),
        "pdf-split" => "Dividir PDF".into(),
        "merge-pdf" => "Mesclar PDF".into(),
        "zip-all" => "Um ZIP".into(),
        "extract" => "Extrair".into(),
        "mp4-720" => "MP4 720p".into(),
        "mp4-hevc" => "MP4 HEVC".into(),
        "mp3-128" => "MP3 128k".into(),
        "extract-subtitles" => "Extrair legendas".into(),
        "compress" => "Comprimir".into(),
        "resize" => "Redimensionar".into(),
        "to-md" => "Markdown".into(),
        "to-tgz" => "TAR.GZ".into(),
        id => id.strip_prefix("to-").unwrap_or(id).to_ascii_uppercase(),
    }
}

/// A linha de baixo: o formato que sai (como o Filee); nada quando repete o nome.
fn caption(id: &str, exts: &[String]) -> Option<String> {
    let same = || {
        let mut v: Vec<String> = Vec::new();
        for e in exts {
            let u = if e == "folder" { "Pasta".to_string() } else { e.to_ascii_uppercase() };
            if !v.contains(&u) {
                v.push(u);
            }
        }
        v.truncate(2);
        Some(v.join("/"))
    };
    let c = match id {
        "half-size" | "compress" | "resize" => return same(),
        "merge-pdf" | "pdf-split" => "PDF",
        "zip-all" => "ZIP",
        "pdf-long-image" => "PNG",
        "mp4-720" | "mp4-hevc" => "MP4",
        "mp3-128" => "MP3",
        "extract-subtitles" => "SRT",
        "extract" => "Pasta",
        "to-md" => "MD",
        _ => return None,
    };
    Some(c.into())
}

pub fn action_of(id: &str) -> String {
    match id {
        "zip-all" => "zip".into(),
        "pdf-split" => "split-pdf".into(),
        id => match id.strip_prefix("to-") {
            Some(f) => format!("to:{f}"),
            None => id.into(),
        },
    }
}

fn judge(id: &str, exts: &[String], present: &dyn Fn(Tool) -> bool) -> (bool, Option<String>, Option<Tool>) {
    // Como o Filee: a fatia vale se servir para ao menos um dos arquivos.
    let sups: Vec<Sup> = exts.iter().map(|e| support(id, e)).collect();
    let mut missing: Option<Tool> = None;
    for s in &sups {
        if let Sup::Yes(t) = s {
            match t {
                None => return (true, None, None),
                Some(t) if present(*t) => return (true, None, Some(*t)),
                Some(t) => missing = missing.or(Some(*t)),
            }
        }
    }
    if let Some(t) = missing {
        return (false, Some(format!("Precisa do {}", t.label())), Some(t));
    }
    if sups.iter().any(|s| *s == Sup::Same) {
        return (false, Some("Mesmo formato".into()), None);
    }
    (false, Some("Não serve para estes arquivos".into()), None)
}

fn slice(id: &str, exts: &[String], present: &dyn Fn(Tool) -> bool) -> RingSlice {
    let (enabled, reason, needs) = judge(id, exts, present);
    RingSlice { id: id.into(), action: action_of(id), label: slice_label(id), caption: caption(id, exts), enabled, reason, needs, children: vec![] }
}

/// Os atalhos de "Enviar para a IA" (ids iguais aos de QUICK_PROMPTS na página).
pub const ASK_PROMPTS: &[&str] = &["O que é isso?", "Resumir", "Explicar", "Extrair dados", "Traduzir", "Só abrir o chat"];

/// O anel para estes arquivos. `exts` = extensões normalizadas ("folder" para pastas).
pub fn ring_for(exts: &[String], present: &dyn Fn(Tool) -> bool) -> Ring {
    let profile = select_profile(exts);
    let n = exts.len();
    // Como o Filee: "N × FORMATO" quando todos são de um formato conhecido.
    let title = {
        if n > 0 && exts.iter().all(|e| e == &exts[0]) && profile_of(&exts[0]).is_some() {
            format!("{n} × {}", exts[0].to_ascii_uppercase())
        } else {
            format!("{n} arquivos")
        }
    };
    let mut extras: Vec<RingSlice> = Vec::new();
    for id in ["compress", "resize"] {
        let s = slice(id, exts, present);
        // Nossas extras só aparecem quando servem (não ocupam vaga apagadas).
        if s.enabled || s.needs.is_some() {
            extras.push(s);
        }
    }
    extras.push(RingSlice {
        id: "ask".into(),
        action: String::new(),
        label: "Enviar para a IA".into(),
        caption: Some("Grupo de 6".into()),
        enabled: n > 0,
        reason: None,
        needs: None,
        children: ASK_PROMPTS
            .iter()
            .enumerate()
            .map(|(i, p)| RingSlice {
                id: format!("ask:{i}"),
                action: "ask".into(),
                label: (*p).into(),
                caption: None,
                enabled: true,
                reason: None,
                needs: None,
                children: vec![],
            })
            .collect(),
    });
    extras.push(RingSlice {
        id: "open-converter".into(),
        action: "open-converter".into(),
        label: "Abrir no Conversor".into(),
        caption: Some("Bifrost".into()),
        enabled: n > 0,
        reason: None,
        needs: None,
        children: vec![],
    });
    let room = MAX_SLICES - extras.len();
    let mut slices: Vec<RingSlice> = profile_slices(profile).iter().map(|id| slice(id, exts, present)).collect();
    slices.truncate(room);
    slices.extend(extras);
    Ring { profile, title, slices }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn all(_: Tool) -> bool {
        true
    }
    fn none(_: Tool) -> bool {
        false
    }
    fn ids(r: &Ring) -> Vec<&str> {
        r.slices.iter().map(|s| s.id.as_str()).collect()
    }
    fn e(v: &[&str]) -> Vec<String> {
        v.iter().map(|s| s.to_string()).collect()
    }

    #[test]
    fn perfis_como_o_filee() {
        assert_eq!(select_profile(&e(&["png", "jpg"])), "images");
        assert_eq!(select_profile(&e(&["pdf"])), "pdf");
        assert_eq!(select_profile(&e(&["png", "pdf"])), "mixed");
        assert_eq!(select_profile(&e(&["diff"])), "mixed");
        assert_eq!(select_profile(&e(&["folder"])), "mixed");
        assert_eq!(select_profile(&e(&["epub"])), "ebooks");
        assert_eq!(select_profile(&e(&["zip", "rar"])), "archives");
    }

    #[test]
    fn mistos_igual_ao_print() {
        // .diff: o anel de mistos — PDF, Mesclar PDF, Um ZIP, PNG, TXT.
        let r = ring_for(&e(&["diff"]), &all);
        assert_eq!(&ids(&r)[..5], &["to-pdf", "merge-pdf", "zip-all", "to-png", "to-txt"]);
        assert_eq!(r.title, "1 arquivos");
        let zip = &r.slices[2];
        assert_eq!((zip.label.as_str(), zip.caption.as_deref()), ("Um ZIP", Some("ZIP")));
        let merge = &r.slices[1];
        assert_eq!((merge.label.as_str(), merge.caption.as_deref(), merge.enabled), ("Mesclar PDF", Some("PDF"), false));
        assert!(zip.enabled);
    }

    #[test]
    fn imagens_cheio_com_extras() {
        let r = ring_for(&e(&["png"]), &all);
        assert_eq!(ids(&r), ["to-png", "to-jpg", "to-webp", "to-pdf", "to-tiff", "to-bmp", "to-ico", "half-size", "compress", "resize", "ask", "open-converter"]);
        assert_eq!(r.slices[0].reason.as_deref(), Some("Mesmo formato"));
        assert!(!r.slices[0].enabled && r.slices[1].enabled);
        assert_eq!(r.slices[7].caption.as_deref(), Some("PNG"));
    }

    #[test]
    fn pdf_e_rotas_de_dois_passos() {
        let r = ring_for(&e(&["pdf", "pdf"]), &none);
        assert_eq!(ids(&r)[..9], ["to-png", "to-jpg", "pdf-long-image", "to-docx", "to-txt", "to-md", "to-epub", "pdf-split", "merge-pdf"]);
        assert!(r.slices.len() <= MAX_SLICES);
        let png = &r.slices[0];
        assert_eq!(png.reason.as_deref(), Some("Precisa do PDFium"));
        assert!(r.slices.iter().find(|s| s.id == "merge-pdf").unwrap().enabled);
        assert_eq!(r.title, "2 × PDF");
        // DOCX → PDF → PNG precisa do LibreOffice primeiro.
        let d = ring_for(&e(&["docx"]), &none);
        assert_eq!(d.slices.iter().find(|s| s.id == "to-png").unwrap().reason.as_deref(), Some("Precisa do LibreOffice"));
    }

    #[test]
    fn video_cabe_em_12() {
        let r = ring_for(&e(&["mp4"]), &all);
        assert_eq!(r.slices.len(), MAX_SLICES);
        assert_eq!(&ids(&r)[..3], &["to-mp4", "mp4-720", "mp4-hevc"]);
        assert_eq!(&ids(&r)[8..], &["compress", "resize", "ask", "open-converter"]);
    }

    #[test]
    fn todas_as_fatias_tem_motor() {
        // Toda fatia habilitada com as ferramentas precisa ter uma ação conhecida pela fila.
        for ext in ["png", "heic", "svg", "pdf", "docx", "odt", "rtf", "epub", "md", "txt", "html", "mp4", "mkv", "mp3", "wav", "zip", "7z", "rar", "diff", "folder"] {
            let r = ring_for(&e(&[ext, ext]), &all);
            for s in &r.slices {
                if s.id == "ask" || s.id == "open-converter" {
                    continue;
                }
                if s.enabled {
                    assert!(super::super::engines::knows(&s.action, ext), "{ext}: {} ({})", s.id, s.action);
                }
            }
        }
    }
}
