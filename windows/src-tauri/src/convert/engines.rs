// Os motores do Conversor. Cada ação de formats.rs vira uma chamada aqui:
// imagens com `image` e `resvg`, PDF com `lopdf` (e o PDFium baixado sob
// demanda para rasterizar), compactados com zip/tar/7z em Rust, e o resto com
// a ferramenta opcional detectada em tools.rs (FFmpeg, Pandoc, LibreOffice,
// ImageMagick, 7-Zip). Implementação própria do Bifrost; nada do Filee.

use std::io::{BufRead, BufReader, Read, Write};
use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::sync::atomic::Ordering;

use image::{DynamicImage, GenericImageView, ImageFormat};

use super::formats::{self, Category, Tool};
use super::jobs::{free_path_fs, out_dir_for, stem, Options, Work};
use super::tools;

type R<T> = Result<T, String>;

fn need(tool: Tool) -> R<PathBuf> {
    tools::locate(tool).ok_or_else(|| format!("Precisa do {} — instale em Conversor › Ferramentas.", tool.label()))
}

/// Ponto de entrada da fila.
pub fn execute(w: Work<'_>) -> R<Vec<String>> {
    let action = w.action.to_string();
    let opts = w.options.clone();
    let inputs: Vec<String> = w.inputs.to_vec();
    let cancel = w.cancel;
    let progress = w.progress;
    if cancel.load(Ordering::Relaxed) {
        return Err("cancelado".into());
    }
    match action.as_str() {
        "merge-pdf" => merge_pdf(&inputs, &opts).map(|p| vec![p]),
        "zip" if inputs.len() > 1 => zip_many(&inputs, &opts).map(|p| vec![p]),
        _ => {
            let input = inputs.first().ok_or("Nenhum arquivo.")?;
            single(input, &action, &opts, cancel, progress)
        }
    }
}

fn single(input: &str, action: &str, opts: &Options, cancel: &std::sync::atomic::AtomicBool, progress: &mut dyn FnMut(f32)) -> R<Vec<String>> {
    let src = formats::ext_of(input);
    let cat = formats::category(&src);
    let out = |ext: &str| free_path_fs(&out_dir_for(input, opts), &stem(input), ext);
    let one = |p: PathBuf| Ok(vec![p.to_string_lossy().into_owned()]);
    match (cat, action) {
        (_, "text") => {
            let text = extract_text(input)?;
            let p = out("txt");
            std::fs::write(&p, text).map_err(|e| e.to_string())?;
            one(p)
        }
        (Category::Archive, "extract") => extract_archive(input, opts).map(|p| vec![p]),
        (_, "zip") => zip_many(&[input.to_string()], opts).map(|p| vec![p]),
        (Category::Archive, a) if a == "to:zip" => {
            let dir = extract_archive(input, &Options { out_dir: Some(std::env::temp_dir().to_string_lossy().into_owned()), ..opts.clone() })?;
            let z = out("zip");
            zip_dir(Path::new(&dir), &z)?;
            let _ = std::fs::remove_dir_all(&dir);
            one(z)
        }
        (Category::Image | Category::Vector, a) => {
            let img = load_image(input)?;
            progress(0.4);
            match a {
                "compress" => {
                    let fmt = if src == "png" { "png" } else { "jpg" };
                    let p = free_path_fs(&out_dir_for(input, opts), &format!("{}-comprimido", stem(input)), fmt);
                    save_image(&img, &p, fmt, opts.quality.unwrap_or(72), true)?;
                    one(p)
                }
                "resize" => {
                    let r = resize(&img, opts);
                    let fmt = if matches!(src.as_str(), "svg" | "heic" | "avif") { "png".to_string() } else { src.clone() };
                    let p = free_path_fs(&out_dir_for(input, opts), &format!("{}-{}x{}", stem(input), r.width(), r.height()), &fmt);
                    save_image(&r, &p, &fmt, opts.quality.unwrap_or(90), false)?;
                    one(p)
                }
                "to:pdf" => {
                    let p = out("pdf");
                    images_to_pdf(&[img], &p)?;
                    one(p)
                }
                "to:avif" => {
                    let png = std::env::temp_dir().join(format!("bifrost-{}.png", std::process::id()));
                    img.save_with_format(&png, ImageFormat::Png).map_err(|e| e.to_string())?;
                    let p = out("avif");
                    let r = ffmpeg(&[s(&png), "-c:v".into(), "libaom-av1".into(), "-still-picture".into(), "1".into(), s(&p)], None, cancel, progress);
                    let _ = std::fs::remove_file(&png);
                    r?;
                    one(p)
                }
                a if a.starts_with("to:") => {
                    let fmt = &a[3..];
                    let p = out(fmt);
                    save_image(&img, &p, fmt, opts.quality.unwrap_or(90), false)?;
                    one(p)
                }
                _ => Err(format!("Ação desconhecida: {a}")),
            }
        }
        (Category::Pdf, "compress") => {
            let p = free_path_fs(&out_dir_for(input, opts), &format!("{}-comprimido", stem(input)), "pdf");
            compress_pdf(input, &p)?;
            one(p)
        }
        (Category::Pdf, "split-pdf") => split_pdf(input, opts, progress),
        (Category::Pdf, "to:png" | "to:jpg") => pdf_to_images(input, &action[3..], opts, progress),
        (Category::Pdf, "to:txt") => {
            let p = out("txt");
            std::fs::write(&p, extract_text(input)?).map_err(|e| e.to_string())?;
            one(p)
        }
        (Category::Pdf | Category::Document | Category::Text, a) if a.starts_with("to:") => {
            let fmt = &a[3..];
            let p = out(fmt);
            convert_document(input, &src, fmt, &p)?;
            one(p)
        }
        (Category::Audio | Category::Video, a) => {
            let (fmt, args): (String, Vec<String>) = match a {
                "compress" => {
                    let fmt = src.clone();
                    let mut v = vec![];
                    if cat == Category::Video {
                        v.extend(["-c:v", "libx264", "-crf", "28", "-preset", "medium", "-c:a", "aac", "-b:a", "128k"].map(String::from));
                    } else {
                        v.extend(["-b:a", "96k"].map(String::from));
                    }
                    (fmt, v)
                }
                "resize" => (src.clone(), ["-vf", "scale=-2:720", "-c:v", "libx264", "-crf", "23", "-c:a", "copy"].map(String::from).to_vec()),
                a if a.starts_with("to:") => {
                    let fmt = a[3..].to_string();
                    let args = media_args(&fmt, opts);
                    (fmt, args)
                }
                _ => return Err(format!("Ação desconhecida: {a}")),
            };
            let p = if a == "compress" || a == "resize" {
                let tag = if a == "compress" { "comprimido" } else { "720p" };
                free_path_fs(&out_dir_for(input, opts), &format!("{}-{tag}", stem(input)), &fmt)
            } else {
                out(&fmt)
            };
            let mut full = vec![input.to_string()];
            full.extend(args);
            full.push(s(&p));
            let total = media_duration(input);
            if let Err(e) = ffmpeg(&full, total, cancel, progress) {
                let _ = std::fs::remove_file(&p);
                return Err(e);
            }
            one(p)
        }
        (_, a) => Err(format!("{} não sabe fazer \"{a}\" com .{src}.", "O Conversor")),
    }
}

fn s(p: &Path) -> String {
    p.to_string_lossy().into_owned()
}

// ── Imagens ─────────────────────────────────────────────────────────────────

pub fn load_image(input: &str) -> R<DynamicImage> {
    let ext = formats::ext_of(input);
    match ext.as_str() {
        "svg" => render_svg(input),
        "heic" | "avif" => {
            // ImageMagick lê; senão tenta o FFmpeg.
            let tmp = std::env::temp_dir().join(format!("bifrost-read-{}-{}.png", std::process::id(), stem(input)));
            let ok = if let Some(m) = tools::locate(Tool::Magick) {
                tools::command(&m).arg(input).arg(&tmp).status().map(|s| s.success()).unwrap_or(false)
            } else if let Some(f) = tools::locate(Tool::Ffmpeg) {
                tools::command(&f).args(["-y", "-loglevel", "error", "-i", input, "-frames:v", "1"]).arg(&tmp).status().map(|s| s.success()).unwrap_or(false)
            } else {
                return Err(format!("Para abrir .{ext}, instale o ImageMagick (ou baixe o FFmpeg no Conversor)."));
            };
            if !ok {
                return Err(format!("Não consegui abrir este .{ext}."));
            }
            let img = image::open(&tmp).map_err(|e| e.to_string());
            let _ = std::fs::remove_file(&tmp);
            img
        }
        _ => image::open(input).map_err(|e| format!("Não consegui abrir a imagem: {e}")),
    }
}

fn render_svg(input: &str) -> R<DynamicImage> {
    let data = std::fs::read(input).map_err(|e| e.to_string())?;
    let mut opt = resvg::usvg::Options::default();
    opt.fontdb_mut().load_system_fonts();
    let tree = resvg::usvg::Tree::from_data(&data, &opt).map_err(|e| format!("SVG inválido: {e}"))?;
    let size = tree.size();
    // SVGs pequenos (ícones) saem nítidos: no mínimo 1024 px no lado maior.
    let scale = (1024.0 / size.width().max(size.height())).max(1.0);
    let w = (size.width() * scale).ceil() as u32;
    let h = (size.height() * scale).ceil() as u32;
    let mut pix = resvg::tiny_skia::Pixmap::new(w.max(1), h.max(1)).ok_or("SVG grande demais.")?;
    resvg::render(&tree, resvg::tiny_skia::Transform::from_scale(scale, scale), &mut pix.as_mut());
    // tiny-skia guarda RGBA pré-multiplicado.
    let mut rgba = pix.take();
    for px in rgba.chunks_exact_mut(4) {
        let a = px[3] as u32;
        if a > 0 && a < 255 {
            for c in &mut px[..3] {
                *c = ((*c as u32 * 255 + a / 2) / a).min(255) as u8;
            }
        }
    }
    image::RgbaImage::from_raw(w.max(1), h.max(1), rgba).map(DynamicImage::ImageRgba8).ok_or_else(|| "SVG: buffer inválido".into())
}

pub fn resize(img: &DynamicImage, opts: &Options) -> DynamicImage {
    let (w, h) = img.dimensions();
    let (nw, nh) = target_size(w, h, opts);
    if (nw, nh) == (w, h) {
        return img.clone();
    }
    img.resize_exact(nw, nh, image::imageops::FilterType::Lanczos3)
}

/// Tamanho de destino: lado maior em px, senão porcentagem, senão 50 %.
pub fn target_size(w: u32, h: u32, opts: &Options) -> (u32, u32) {
    if let Some(side) = opts.max_side.filter(|s| *s > 0) {
        let long = w.max(h);
        if long <= side {
            return (w, h);
        }
        let k = side as f64 / long as f64;
        return (((w as f64 * k).round() as u32).max(1), ((h as f64 * k).round() as u32).max(1));
    }
    let pct = opts.percent.filter(|p| *p > 0).unwrap_or(50) as f64 / 100.0;
    (((w as f64 * pct).round() as u32).max(1), ((h as f64 * pct).round() as u32).max(1))
}

pub fn save_image(img: &DynamicImage, path: &Path, fmt: &str, quality: u8, best: bool) -> R<()> {
    let file = std::fs::File::create(path).map_err(|e| e.to_string())?;
    let mut w = std::io::BufWriter::new(file);
    let res = match formats::norm_ext(fmt).as_str() {
        "jpg" => {
            let enc = image::codecs::jpeg::JpegEncoder::new_with_quality(&mut w, quality.clamp(1, 100));
            DynamicImage::ImageRgb8(img.to_rgb8()).write_with_encoder(enc)
        }
        "png" => {
            use image::codecs::png::{CompressionType, FilterType, PngEncoder};
            let enc = if best {
                PngEncoder::new_with_quality(&mut w, CompressionType::Best, FilterType::Adaptive)
            } else {
                PngEncoder::new(&mut w)
            };
            img.write_with_encoder(enc)
        }
        "ico" => {
            let small = if img.width() > 256 || img.height() > 256 { img.resize(256, 256, image::imageops::FilterType::Lanczos3) } else { img.clone() };
            DynamicImage::ImageRgba8(small.to_rgba8()).write_to(&mut w, ImageFormat::Ico)
        }
        "gif" => DynamicImage::ImageRgba8(img.to_rgba8()).write_to(&mut w, ImageFormat::Gif),
        "bmp" => DynamicImage::ImageRgb8(img.to_rgb8()).write_to(&mut w, ImageFormat::Bmp),
        "webp" => DynamicImage::ImageRgba8(img.to_rgba8()).write_to(&mut w, ImageFormat::WebP),
        "tiff" => DynamicImage::ImageRgba8(img.to_rgba8()).write_to(&mut w, ImageFormat::Tiff),
        other => {
            drop(w);
            let _ = std::fs::remove_file(path);
            return Err(format!("Formato de imagem sem suporte: {other}"));
        }
    };
    if let Err(e) = res.map_err(|e| e.to_string()).and_then(|_| w.flush().map_err(|e| e.to_string())) {
        let _ = std::fs::remove_file(path);
        return Err(e);
    }
    Ok(())
}

// ── PDF ─────────────────────────────────────────────────────────────────────

use lopdf::{dictionary, Document, Object, ObjectId, Stream};

/// Cada imagem vira uma página (JPEG embutido), no tamanho da imagem a 96 dpi.
pub fn images_to_pdf(images: &[DynamicImage], out: &Path) -> R<()> {
    let mut doc = Document::with_version("1.5");
    let pages_id = doc.new_object_id();
    let mut kids = Vec::new();
    for img in images {
        let rgb = img.to_rgb8();
        let (w, h) = rgb.dimensions();
        let mut jpg = Vec::new();
        image::codecs::jpeg::JpegEncoder::new_with_quality(&mut jpg, 90).encode_image(&DynamicImage::ImageRgb8(rgb)).map_err(|e| e.to_string())?;
        let img_id = doc.add_object(Stream::new(
            dictionary! {
                "Type" => "XObject", "Subtype" => "Image", "Width" => w as i64, "Height" => h as i64,
                "ColorSpace" => "DeviceRGB", "BitsPerComponent" => 8, "Filter" => "DCTDecode",
            },
            jpg,
        ));
        let pw = w as f32 * 0.75;
        let ph = h as f32 * 0.75;
        let content = format!("q {pw} 0 0 {ph} 0 0 cm /Im0 Do Q");
        let content_id = doc.add_object(Stream::new(dictionary! {}, content.into_bytes()));
        let page_id = doc.add_object(dictionary! {
            "Type" => "Page", "Parent" => pages_id,
            "MediaBox" => vec![0.into(), 0.into(), Object::Real(pw), Object::Real(ph)],
            "Contents" => content_id,
            "Resources" => dictionary! { "XObject" => dictionary! { "Im0" => img_id } },
        });
        kids.push(Object::Reference(page_id));
    }
    let count = kids.len() as i64;
    doc.objects.insert(pages_id, Object::Dictionary(dictionary! { "Type" => "Pages", "Kids" => kids, "Count" => count }));
    let catalog = doc.add_object(dictionary! { "Type" => "Catalog", "Pages" => pages_id });
    doc.trailer.set("Root", catalog);
    doc.compress();
    doc.save(out).map_err(|e| e.to_string())?;
    Ok(())
}

fn load_pdf(p: &str) -> R<Document> {
    Document::load(p).map_err(|e| format!("PDF ilegível ({}): {e}", super::jobs::file_name(p)))
}

/// Junta PDFs (e imagens, cada uma uma página) na ordem dada.
pub fn merge_pdf(inputs: &[String], opts: &Options) -> R<String> {
    if inputs.is_empty() {
        return Err("Nenhum arquivo para juntar.".into());
    }
    let mut docs = Vec::new();
    let mut tmp = Vec::new();
    for (i, p) in inputs.iter().enumerate() {
        if formats::category(&formats::ext_of(p)) == Category::Pdf {
            docs.push(load_pdf(p)?);
        } else {
            let img = load_image(p)?;
            let t = std::env::temp_dir().join(format!("bifrost-merge-{}-{i}.pdf", std::process::id()));
            images_to_pdf(&[img], &t)?;
            docs.push(load_pdf(&s(&t))?);
            tmp.push(t);
        }
    }
    let merged = merge_documents(docs)?;
    for t in tmp {
        let _ = std::fs::remove_file(t);
    }
    let out = free_path_fs(&out_dir_for(&inputs[0], opts), &format!("{}-juntado", stem(&inputs[0])), "pdf");
    let mut merged = merged;
    merged.save(&out).map_err(|e| e.to_string())?;
    Ok(s(&out))
}

/// Junção à moda do exemplo do lopdf: renumera, coleta páginas, um só /Pages.
pub fn merge_documents(docs: Vec<Document>) -> R<Document> {
    use std::collections::BTreeMap;
    let mut max_id = 1;
    let mut pages: BTreeMap<ObjectId, Object> = BTreeMap::new();
    let mut objects: BTreeMap<ObjectId, Object> = BTreeMap::new();
    let mut doc = Document::with_version("1.5");
    for mut d in docs {
        d.renumber_objects_with(max_id);
        max_id = d.max_id + 1;
        let page_ids: Vec<ObjectId> = d.get_pages().into_values().collect();
        for id in page_ids {
            if let Ok(o) = d.get_object(id) {
                pages.insert(id, o.clone());
            }
        }
        objects.extend(d.objects);
    }
    let mut catalog: Option<(ObjectId, Object)> = None;
    let mut pages_obj: Option<(ObjectId, Object)> = None;
    for (id, obj) in objects {
        match obj.type_name().unwrap_or(b"") {
            b"Catalog" => {
                if catalog.is_none() {
                    catalog = Some((id, obj));
                }
            }
            b"Pages" => {
                if let Ok(dict) = obj.as_dict() {
                    let mut dict = dict.clone();
                    if let Some((_, ref old)) = pages_obj {
                        if let Ok(od) = old.as_dict() {
                            dict.extend(od);
                        }
                    }
                    pages_obj = Some((pages_obj.as_ref().map(|(i, _)| *i).unwrap_or(id), Object::Dictionary(dict)));
                }
            }
            b"Page" | b"Outlines" | b"Outline" => {}
            _ => {
                doc.objects.insert(id, obj);
            }
        }
    }
    let (pages_id, pages_o) = pages_obj.ok_or("PDF sem páginas.")?;
    let (cat_id, cat_o) = catalog.ok_or("PDF sem catálogo.")?;
    for (id, obj) in &pages {
        if let Ok(dict) = obj.as_dict() {
            let mut dict = dict.clone();
            dict.set("Parent", pages_id);
            doc.objects.insert(*id, Object::Dictionary(dict));
        }
    }
    if let Ok(dict) = pages_o.as_dict() {
        let mut dict = dict.clone();
        dict.set("Count", pages.len() as u32);
        dict.set("Kids", pages.keys().map(|id| Object::Reference(*id)).collect::<Vec<_>>());
        doc.objects.insert(pages_id, Object::Dictionary(dict));
    }
    if let Ok(dict) = cat_o.as_dict() {
        let mut dict = dict.clone();
        dict.set("Pages", pages_id);
        dict.remove(b"Outlines");
        doc.objects.insert(cat_id, Object::Dictionary(dict));
    }
    doc.trailer.set("Root", cat_id);
    doc.max_id = doc.objects.len() as u32;
    doc.renumber_objects();
    doc.compress();
    Ok(doc)
}

pub fn split_pdf(input: &str, opts: &Options, progress: &mut dyn FnMut(f32)) -> R<Vec<String>> {
    let doc = load_pdf(input)?;
    let n = doc.get_pages().len() as u32;
    if n == 0 {
        return Err("PDF sem páginas.".into());
    }
    let dir = out_dir_for(input, opts).join(format!("{}-paginas", stem(input)));
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let mut outs = Vec::new();
    for page in 1..=n {
        let mut d = doc.clone();
        let others: Vec<u32> = (1..=n).filter(|p| *p != page).collect();
        d.delete_pages(&others);
        d.prune_objects();
        d.compress();
        let p = free_path_fs(&dir, &format!("{} - página {page}", stem(input)), "pdf");
        d.save(&p).map_err(|e| e.to_string())?;
        outs.push(s(&p));
        progress(page as f32 / n as f32);
    }
    Ok(outs)
}

pub fn compress_pdf(input: &str, out: &Path) -> R<()> {
    let mut doc = load_pdf(input)?;
    doc.prune_objects();
    doc.delete_zero_length_streams();
    doc.compress();
    doc.save(out).map_err(|e| e.to_string())?;
    // Se não ficou menor, guarda o original (nunca entrega algo maior).
    let before = std::fs::metadata(input).map(|m| m.len()).unwrap_or(0);
    let after = std::fs::metadata(out).map(|m| m.len()).unwrap_or(u64::MAX);
    if after >= before {
        std::fs::copy(input, out).map_err(|e| e.to_string())?;
    }
    Ok(())
}

fn pdfium() -> R<pdfium_render::prelude::Pdfium> {
    use pdfium_render::prelude::*;
    let lib = need(Tool::Pdfium)?;
    let bindings = Pdfium::bind_to_library(&lib).map_err(|e| format!("PDFium não carregou: {e}"))?;
    Ok(Pdfium::new(bindings))
}

pub fn pdf_to_images(input: &str, fmt: &str, opts: &Options, progress: &mut dyn FnMut(f32)) -> R<Vec<String>> {
    use pdfium_render::prelude::*;
    let pdfium = pdfium()?;
    let doc = pdfium.load_pdf_from_file(input, None).map_err(|e| format!("PDF ilegível: {e}"))?;
    let dpi = opts.dpi.unwrap_or(150).clamp(36, 600) as f32;
    let pages = doc.pages();
    let n = pages.len() as usize;
    let dir = if n > 1 { out_dir_for(input, opts).join(format!("{}-{fmt}", stem(input))) } else { out_dir_for(input, opts) };
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let mut outs = Vec::new();
    for (i, page) in pages.iter().enumerate() {
        let w = (page.width().value / 72.0 * dpi) as i32;
        let cfg = PdfRenderConfig::new().set_target_width(w.max(16));
        let bmp = page.render_with_config(&cfg).map_err(|e| e.to_string())?;
        let img = bmp.as_image().map_err(|e| e.to_string())?;
        let base = if n > 1 { format!("{} - página {}", stem(input), i + 1) } else { stem(input) };
        let p = free_path_fs(&dir, &base, fmt);
        save_image(&img, &p, fmt, opts.quality.unwrap_or(90), false)?;
        outs.push(s(&p));
        progress((i + 1) as f32 / n.max(1) as f32);
    }
    Ok(outs)
}

// ── Texto (também o que a IA lê) ────────────────────────────────────────────

const TEXT_LIMIT: usize = 400_000;

pub fn extract_text(input: &str) -> R<String> {
    let ext = formats::ext_of(input);
    let text = match ext.as_str() {
        "pdf" => pdf_text(input)?,
        "docx" => ooxml_text(input, "word/document.xml")?,
        "odt" => ooxml_text(input, "content.xml")?,
        "html" => strip_tags(&String::from_utf8_lossy(&std::fs::read(input).map_err(|e| e.to_string())?)),
        "rtf" | "epub" => {
            let pandoc = need(Tool::Pandoc)?;
            let o = tools::command(&pandoc).arg(input).args(["-t", "plain"]).output().map_err(|e| e.to_string())?;
            if !o.status.success() {
                return Err(String::from_utf8_lossy(&o.stderr).into_owned());
            }
            String::from_utf8_lossy(&o.stdout).into_owned()
        }
        _ => String::from_utf8_lossy(&std::fs::read(input).map_err(|e| e.to_string())?).into_owned(),
    };
    let mut t = text.replace("\r\n", "\n");
    if t.len() > TEXT_LIMIT {
        let mut cut = TEXT_LIMIT;
        while !t.is_char_boundary(cut) {
            cut -= 1;
        }
        t.truncate(cut);
        t.push_str("\n…");
    }
    Ok(t)
}

fn pdf_text(input: &str) -> R<String> {
    if tools::locate(Tool::Pdfium).is_some() {
        if let Ok(p) = pdfium() {
            if let Ok(doc) = p.load_pdf_from_file(input, None) {
                let mut out = String::new();
                for page in doc.pages().iter() {
                    if let Ok(t) = page.text() {
                        out.push_str(&t.all());
                        out.push_str("\n\n");
                    }
                }
                if !out.trim().is_empty() {
                    return Ok(out);
                }
            }
        }
    }
    let doc = load_pdf(input)?;
    let pages: Vec<u32> = doc.get_pages().keys().copied().collect();
    let mut out = String::new();
    for p in pages {
        if let Ok(t) = doc.extract_text(&[p]) {
            out.push_str(&t);
            out.push('\n');
        }
    }
    if out.trim().is_empty() {
        return Err("Este PDF não tem texto (talvez seja escaneado).".into());
    }
    Ok(out)
}

fn ooxml_text(input: &str, part: &str) -> R<String> {
    let f = std::fs::File::open(input).map_err(|e| e.to_string())?;
    let mut z = zip::ZipArchive::new(f).map_err(|e| e.to_string())?;
    let mut xml = String::new();
    z.by_name(part).map_err(|e| e.to_string())?.read_to_string(&mut xml).map_err(|e| e.to_string())?;
    let xml = xml.replace("</w:p>", "\n").replace("</text:p>", "\n").replace("<w:tab/>", "\t").replace("<w:br/>", "\n");
    Ok(strip_tags(&xml))
}

pub fn strip_tags(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    let mut in_tag = false;
    let lower = s.to_ascii_lowercase();
    let mut skip_until: Option<&str> = None;
    let mut i = 0;
    let bytes = s.as_bytes();
    while i < bytes.len() {
        if let Some(end) = skip_until {
            if lower[i..].starts_with(end) {
                i += end.len();
                skip_until = None;
            } else {
                i += 1;
            }
            continue;
        }
        let c = bytes[i];
        if !in_tag && c == b'<' {
            if lower[i..].starts_with("<script") {
                skip_until = Some("</script>");
                continue;
            }
            if lower[i..].starts_with("<style") {
                skip_until = Some("</style>");
                continue;
            }
            in_tag = true;
            if lower[i..].starts_with("<br") || lower[i..].starts_with("<p") || lower[i..].starts_with("<div") || lower[i..].starts_with("<li") {
                out.push('\n');
            }
        } else if in_tag && c == b'>' {
            in_tag = false;
        } else if !in_tag {
            // Copia o caractere UTF-8 inteiro.
            let ch_len = utf8_len(c);
            out.push_str(&s[i..(i + ch_len).min(s.len())]);
            i += ch_len;
            continue;
        }
        i += 1;
    }
    let out = out.replace("&nbsp;", " ").replace("&amp;", "&").replace("&lt;", "<").replace("&gt;", ">").replace("&quot;", "\"").replace("&#39;", "'");
    let mut lines: Vec<&str> = out.lines().map(str::trim_end).collect();
    lines.dedup_by(|a, b| a.is_empty() && b.is_empty());
    lines.join("\n").trim().to_string()
}

fn utf8_len(b: u8) -> usize {
    match b {
        0x00..=0x7F => 1,
        0xC0..=0xDF => 2,
        0xE0..=0xEF => 3,
        0xF0..=0xF7 => 4,
        _ => 1,
    }
}

// ── Documentos (Pandoc / LibreOffice) ───────────────────────────────────────

fn convert_document(input: &str, src: &str, fmt: &str, out: &Path) -> R<()> {
    if fmt == "txt" {
        return std::fs::write(out, extract_text(input)?).map_err(|e| e.to_string());
    }
    if src == "md" && fmt == "html" {
        let md = std::fs::read_to_string(input).map_err(|e| e.to_string())?;
        let html = format!("<!doctype html><meta charset=\"utf-8\"><title>{}</title>\n{}", stem(input), markdown_to_html(&md));
        return std::fs::write(out, html).map_err(|e| e.to_string());
    }
    let office = fmt == "pdf" || src == "doc" || src == "pdf" || (src == "rtf" && fmt == "docx");
    if office {
        let soffice = need(Tool::LibreOffice)?;
        let dir = std::env::temp_dir().join(format!("bifrost-lo-{}", std::process::id()));
        std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
        let filter = if src == "pdf" { vec!["--infilter=writer_pdf_import".to_string()] } else { vec![] };
        let o = tools::command(&soffice)
            .args(["--headless", "--norestore"])
            .args(filter)
            .args(["--convert-to", fmt, "--outdir"])
            .arg(&dir)
            .arg(input)
            .output()
            .map_err(|e| e.to_string())?;
        let made = dir.join(format!("{}.{fmt}", stem(input)));
        if !o.status.success() || !made.is_file() {
            let _ = std::fs::remove_dir_all(&dir);
            return Err(format!("O LibreOffice não converteu: {}", String::from_utf8_lossy(&o.stderr).trim()));
        }
        std::fs::copy(&made, out).map_err(|e| e.to_string())?;
        let _ = std::fs::remove_dir_all(&dir);
        return Ok(());
    }
    let pandoc = need(Tool::Pandoc)?;
    let to = match fmt {
        "md" => "gfm",
        "txt" => "plain",
        "html" => "html5",
        other => other,
    };
    let o = tools::command(&pandoc).arg(input).args(["-s", "-t", to, "-o"]).arg(out).output().map_err(|e| e.to_string())?;
    if !o.status.success() {
        let _ = std::fs::remove_file(out);
        return Err(format!("O Pandoc não converteu: {}", String::from_utf8_lossy(&o.stderr).trim()));
    }
    Ok(())
}

/// Markdown → HTML mínimo (títulos, listas, ênfase, código), sem dependência.
pub fn markdown_to_html(md: &str) -> String {
    fn esc(s: &str) -> String {
        s.replace('&', "&amp;").replace('<', "&lt;").replace('>', "&gt;")
    }
    fn inline(s: &str) -> String {
        let s = esc(s);
        let mut out = String::new();
        let mut bold = false;
        let mut ital = false;
        let mut code = false;
        let mut chars = s.chars().peekable();
        while let Some(c) = chars.next() {
            match c {
                '`' => { out.push_str(if code { "</code>" } else { "<code>" }); code = !code; }
                '*' if !code && chars.peek() == Some(&'*') => { chars.next(); out.push_str(if bold { "</strong>" } else { "<strong>" }); bold = !bold; }
                '*' | '_' if !code => { out.push_str(if ital { "</em>" } else { "<em>" }); ital = !ital; }
                _ => out.push(c),
            }
        }
        if code { out.push_str("</code>"); }
        if bold { out.push_str("</strong>"); }
        if ital { out.push_str("</em>"); }
        out
    }
    let mut html = String::new();
    let mut in_list = false;
    let mut in_code = false;
    for line in md.lines() {
        if line.trim_start().starts_with("```") {
            html.push_str(if in_code { "</code></pre>\n" } else { "<pre><code>" });
            in_code = !in_code;
            continue;
        }
        if in_code {
            html.push_str(&esc(line));
            html.push('\n');
            continue;
        }
        let t = line.trim();
        let is_item = t.starts_with("- ") || t.starts_with("* ");
        if in_list && !is_item {
            html.push_str("</ul>\n");
            in_list = false;
        }
        if t.is_empty() {
            continue;
        }
        let hashes = t.chars().take_while(|c| *c == '#').count();
        if (1..=6).contains(&hashes) && t[hashes..].starts_with(' ') {
            html.push_str(&format!("<h{hashes}>{}</h{hashes}>\n", inline(t[hashes..].trim())));
        } else if is_item {
            if !in_list {
                html.push_str("<ul>\n");
                in_list = true;
            }
            html.push_str(&format!("<li>{}</li>\n", inline(&t[2..])));
        } else {
            html.push_str(&format!("<p>{}</p>\n", inline(t)));
        }
    }
    if in_list { html.push_str("</ul>\n"); }
    if in_code { html.push_str("</code></pre>\n"); }
    html
}

// ── Áudio e vídeo (FFmpeg) ──────────────────────────────────────────────────

pub fn media_args(fmt: &str, opts: &Options) -> Vec<String> {
    let q = opts.quality.unwrap_or(70).clamp(1, 100) as u32;
    // 100 → crf 18, 1 → crf 40
    let crf = (40 - (q * 22 / 100)).to_string();
    let v: Vec<&str> = match fmt {
        "mp4" | "mov" | "mkv" => vec!["-c:v", "libx264", "-preset", "medium", "-crf", &crf, "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "160k", "-movflags", "+faststart"],
        "webm" => vec!["-c:v", "libvpx-vp9", "-b:v", "0", "-crf", &crf, "-row-mt", "1", "-c:a", "libopus", "-b:a", "128k"],
        "gif" => vec!["-vf", "fps=12,scale='min(640,iw)':-2:flags=lanczos,split[a][b];[a]palettegen[p];[b][p]paletteuse", "-loop", "0", "-an"],
        "mp3" => vec!["-vn", "-c:a", "libmp3lame", "-q:a", "2"],
        "m4a" => vec!["-vn", "-c:a", "aac", "-b:a", "192k"],
        "wav" => vec!["-vn", "-c:a", "pcm_s16le"],
        "ogg" => vec!["-vn", "-c:a", "libvorbis", "-q:a", "5"],
        "flac" => vec!["-vn", "-c:a", "flac"],
        _ => vec![],
    };
    let mut out: Vec<String> = v.into_iter().map(String::from).collect();
    if fmt == "mov" || fmt == "mkv" {
        out.retain(|a| a != "-movflags" && a != "+faststart");
    }
    out
}

fn media_duration(input: &str) -> Option<f64> {
    let f = tools::locate(Tool::Ffmpeg)?;
    let o = tools::command(&f).args(["-hide_banner", "-i", input]).output().ok()?;
    parse_duration(&String::from_utf8_lossy(&o.stderr))
}

/// "Duration: 00:01:02.50," → 62.5
pub fn parse_duration(stderr: &str) -> Option<f64> {
    let at = stderr.find("Duration: ")? + 10;
    let t = stderr[at..].split(',').next()?.trim();
    let mut parts = t.split(':');
    let h: f64 = parts.next()?.parse().ok()?;
    let m: f64 = parts.next()?.parse().ok()?;
    let s: f64 = parts.next()?.parse().ok()?;
    Some(h * 3600.0 + m * 60.0 + s)
}

fn ffmpeg(args: &[String], total: Option<f64>, cancel: &std::sync::atomic::AtomicBool, progress: &mut dyn FnMut(f32)) -> R<()> {
    let bin = need(Tool::Ffmpeg)?;
    let mut child = tools::command(&bin)
        .args(["-y", "-hide_banner", "-nostats", "-loglevel", "error", "-progress", "pipe:1", "-i"])
        .args(args)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("FFmpeg não iniciou: {e}"))?;
    let stderr = child.stderr.take();
    let err_thread = std::thread::spawn(move || {
        let mut s = String::new();
        if let Some(mut e) = stderr {
            let _ = e.read_to_string(&mut s);
        }
        s
    });
    if let Some(out) = child.stdout.take() {
        for line in BufReader::new(out).lines().map_while(Result::ok) {
            if cancel.load(Ordering::Relaxed) {
                let _ = child.kill();
                break;
            }
            if let (Some(t), Some(us)) = (total, line.strip_prefix("out_time_us=").and_then(|v| v.trim().parse::<f64>().ok())) {
                if t > 0.0 {
                    progress((us / 1e6 / t) as f32);
                }
            }
        }
    }
    let status = child.wait().map_err(|e| e.to_string())?;
    let err = err_thread.join().unwrap_or_default();
    if cancel.load(Ordering::Relaxed) {
        return Err("cancelado".into());
    }
    if !status.success() {
        let last = err.lines().last().unwrap_or("erro desconhecido");
        return Err(format!("FFmpeg: {last}"));
    }
    Ok(())
}

// ── Compactados ─────────────────────────────────────────────────────────────

pub fn zip_many(inputs: &[String], opts: &Options) -> R<String> {
    let first = inputs.first().ok_or("Nenhum arquivo.")?;
    let base = if inputs.len() == 1 { stem(first) } else { format!("{}-e-mais-{}", stem(first), inputs.len() - 1) };
    let out = free_path_fs(&out_dir_for(first, opts), &base, "zip");
    let f = std::fs::File::create(&out).map_err(|e| e.to_string())?;
    let mut z = zip::ZipWriter::new(f);
    let o = zip::write::SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated);
    for p in inputs {
        let path = Path::new(p);
        if path.is_dir() {
            add_dir(&mut z, path, &super::jobs::file_name(p), o)?;
        } else {
            z.start_file(super::jobs::file_name(p), o).map_err(|e| e.to_string())?;
            let mut src = std::fs::File::open(path).map_err(|e| e.to_string())?;
            std::io::copy(&mut src, &mut z).map_err(|e| e.to_string())?;
        }
    }
    z.finish().map_err(|e| e.to_string())?;
    Ok(s(&out))
}

fn add_dir(z: &mut zip::ZipWriter<std::fs::File>, dir: &Path, prefix: &str, o: zip::write::SimpleFileOptions) -> R<()> {
    for e in std::fs::read_dir(dir).map_err(|e| e.to_string())?.flatten() {
        let name = format!("{prefix}/{}", e.file_name().to_string_lossy());
        let p = e.path();
        if p.is_dir() {
            add_dir(z, &p, &name, o)?;
        } else {
            z.start_file(name, o).map_err(|e| e.to_string())?;
            let mut src = std::fs::File::open(&p).map_err(|e| e.to_string())?;
            std::io::copy(&mut src, z).map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

fn zip_dir(dir: &Path, out: &Path) -> R<()> {
    let f = std::fs::File::create(out).map_err(|e| e.to_string())?;
    let mut z = zip::ZipWriter::new(f);
    let o = zip::write::SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated);
    for e in std::fs::read_dir(dir).map_err(|e| e.to_string())?.flatten() {
        let p = e.path();
        let name = e.file_name().to_string_lossy().into_owned();
        if p.is_dir() {
            add_dir(&mut z, &p, &name, o)?;
        } else {
            z.start_file(name, o).map_err(|e| e.to_string())?;
            let mut src = std::fs::File::open(&p).map_err(|e| e.to_string())?;
            std::io::copy(&mut src, &mut z).map_err(|e| e.to_string())?;
        }
    }
    z.finish().map_err(|e| e.to_string())?;
    Ok(())
}

/// Extrai para uma pasta nova ao lado (`nome`, `nome (2)`…). Caminhos que
/// escapam da pasta (`../`) são recusados.
pub fn extract_archive(input: &str, opts: &Options) -> R<String> {
    let ext = formats::ext_of(input);
    let dir = free_path_fs(&out_dir_for(input, opts), &stem(input), "");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let r = match ext.as_str() {
        "zip" => {
            let f = std::fs::File::open(input).map_err(|e| e.to_string())?;
            let mut z = zip::ZipArchive::new(f).map_err(|e| e.to_string())?;
            z.extract(&dir).map_err(|e| e.to_string())
        }
        "tar" => tar::Archive::new(std::fs::File::open(input).map_err(|e| e.to_string())?).unpack(&dir).map_err(|e| e.to_string()),
        "tgz" => tar::Archive::new(flate2::read::GzDecoder::new(std::fs::File::open(input).map_err(|e| e.to_string())?)).unpack(&dir).map_err(|e| e.to_string()),
        "gz" => {
            let mut d = flate2::read::GzDecoder::new(std::fs::File::open(input).map_err(|e| e.to_string())?);
            let mut out = std::fs::File::create(dir.join(stem(input))).map_err(|e| e.to_string())?;
            std::io::copy(&mut d, &mut out).map(|_| ()).map_err(|e| e.to_string())
        }
        "7z" => sevenz_rust2::decompress_file(input, &dir).map_err(|e| e.to_string()),
        _ => {
            let sz = need(Tool::SevenZip)?;
            let o = tools::command(&sz).arg("x").arg("-y").arg(format!("-o{}", s(&dir))).arg(input).output().map_err(|e| e.to_string())?;
            if o.status.success() { Ok(()) } else { Err(String::from_utf8_lossy(&o.stderr).into_owned()) }
        }
    };
    if let Err(e) = r {
        let _ = std::fs::remove_dir_all(&dir);
        return Err(format!("Não consegui extrair: {e}"));
    }
    Ok(s(&dir))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::AtomicBool;

    fn tmpdir(tag: &str) -> PathBuf {
        let d = std::env::temp_dir().join(format!("bifrost-conv-test-{tag}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&d);
        std::fs::create_dir_all(&d).unwrap();
        d
    }

    fn run(input: &Path, action: &str, opts: Options) -> R<Vec<String>> {
        let cancel = AtomicBool::new(false);
        let mut p = |_f: f32| {};
        let inputs = vec![s(input)];
        execute(Work { inputs: &inputs, action, options: &opts, cancel: &cancel, progress: &mut p })
    }

    fn sample_png(dir: &Path) -> PathBuf {
        let p = dir.join("amostra.png");
        let img = image::RgbaImage::from_fn(64, 40, |x, y| image::Rgba([(x * 4) as u8, (y * 6) as u8, 128, 255]));
        img.save(&p).unwrap();
        p
    }

    #[test]
    fn image_roundtrips() {
        let d = tmpdir("img");
        let png = sample_png(&d);
        for f in ["jpg", "webp", "bmp", "tiff", "gif", "ico"] {
            let out = run(&png, &format!("to:{f}"), Options::default()).unwrap();
            let img = image::open(&out[0]).unwrap_or_else(|e| panic!("{f}: {e}"));
            assert_eq!(img.dimensions(), (64, 40), "{f}");
        }
        // nunca sobrescreve: segunda conversão vira "amostra (2).jpg"
        let again = run(&png, "to:jpg", Options::default()).unwrap();
        assert!(again[0].ends_with("amostra (2).jpg"), "{}", again[0]);
        let r = run(&png, "resize", Options { max_side: Some(32), ..Default::default() }).unwrap();
        assert_eq!(image::open(&r[0]).unwrap().dimensions(), (32, 20));
        let pdf = run(&png, "to:pdf", Options::default()).unwrap();
        assert_eq!(Document::load(&pdf[0]).unwrap().get_pages().len(), 1);
        let _ = std::fs::remove_dir_all(d);
    }

    #[test]
    fn svg_renders() {
        let d = tmpdir("svg");
        let svg = d.join("runa.svg");
        std::fs::write(&svg, r##"<svg xmlns="http://www.w3.org/2000/svg" width="10" height="20"><rect width="10" height="20" fill="#5ef2c9"/></svg>"##).unwrap();
        let out = run(&svg, "to:png", Options::default()).unwrap();
        let img = image::open(&out[0]).unwrap();
        assert_eq!(img.dimensions(), (512, 1024));
        let _ = std::fs::remove_dir_all(d);
    }

    #[test]
    fn pdf_merge_split_compress() {
        let d = tmpdir("pdf");
        let png = sample_png(&d);
        let a = run(&png, "to:pdf", Options::default()).unwrap()[0].clone();
        let b = run(&png, "to:pdf", Options::default()).unwrap()[0].clone();
        let cancel = AtomicBool::new(false);
        let mut p = |_f: f32| {};
        let inputs = vec![a.clone(), b.clone(), s(&png)];
        let merged = execute(Work { inputs: &inputs, action: "merge-pdf", options: &Options::default(), cancel: &cancel, progress: &mut p }).unwrap();
        let m = Document::load(&merged[0]).unwrap();
        assert_eq!(m.get_pages().len(), 3);
        let parts = run(Path::new(&merged[0]), "split-pdf", Options::default()).unwrap();
        assert_eq!(parts.len(), 3);
        for part in &parts {
            assert_eq!(Document::load(part).unwrap().get_pages().len(), 1);
        }
        let c = run(Path::new(&merged[0]), "compress", Options::default()).unwrap();
        assert!(std::fs::metadata(&c[0]).unwrap().len() <= std::fs::metadata(&merged[0]).unwrap().len());
        let _ = std::fs::remove_dir_all(d);
    }

    #[test]
    fn archives_roundtrip() {
        let d = tmpdir("zip");
        let a = d.join("a.txt");
        std::fs::write(&a, "Huginn e Muninn").unwrap();
        let b = d.join("b.txt");
        std::fs::write(&b, "Bifröst").unwrap();
        let cancel = AtomicBool::new(false);
        let mut p = |_f: f32| {};
        let inputs = vec![s(&a), s(&b)];
        let z = execute(Work { inputs: &inputs, action: "zip", options: &Options::default(), cancel: &cancel, progress: &mut p }).unwrap();
        let out = run(Path::new(&z[0]), "extract", Options::default()).unwrap();
        assert_eq!(std::fs::read_to_string(Path::new(&out[0]).join("b.txt")).unwrap(), "Bifröst");
        let _ = std::fs::remove_dir_all(d);
    }

    #[test]
    fn text_and_markdown() {
        assert_eq!(strip_tags("<p>Olá <b>mundo</b></p><script>x()</script>&amp; fim"), "Olá mundo& fim");
        let h = markdown_to_html("# Título\n\n- **um**\n- dois\n\ntexto `c`");
        assert!(h.contains("<h1>Título</h1>") && h.contains("<li><strong>um</strong></li>") && h.contains("<code>c</code>"));
        let d = tmpdir("md");
        let md = d.join("nota.md");
        std::fs::write(&md, "# Oi\ncorpo").unwrap();
        let out = run(&md, "to:html", Options::default()).unwrap();
        assert!(std::fs::read_to_string(&out[0]).unwrap().contains("<h1>Oi</h1>"));
        let t = run(&md, "text", Options::default()).unwrap();
        assert!(std::fs::read_to_string(&t[0]).unwrap().contains("corpo"));
        let _ = std::fs::remove_dir_all(d);
    }

    #[test]
    fn helpers() {
        assert_eq!(parse_duration("  Duration: 00:01:02.50, start: 0"), Some(62.5));
        assert_eq!(target_size(4000, 2000, &Options { max_side: Some(1000), ..Default::default() }), (1000, 500));
        assert_eq!(target_size(400, 200, &Options { max_side: Some(1000), ..Default::default() }), (400, 200));
        assert_eq!(target_size(400, 200, &Options::default()), (200, 100));
        assert!(media_args("mp3", &Options::default()).contains(&"libmp3lame".to_string()));
        assert!(!media_args("mkv", &Options::default()).contains(&"+faststart".to_string()));
    }
}

#[cfg(test)]
mod online_tests {
    use super::*;
    use std::sync::atomic::AtomicBool;

    /// Baixa o PDFium de verdade e rasteriza um PDF. `cargo test -- --ignored pdfium_download`
    #[test]
    #[ignore]
    fn pdfium_download_and_render() {
        let rt = tokio::runtime::Builder::new_current_thread().enable_all().build().unwrap();
        let lib = rt.block_on(tools::download(Tool::Pdfium, &|_, _| {})).unwrap();
        assert!(lib.is_file());
        let d = std::env::temp_dir().join(format!("bifrost-pdfium-{}", std::process::id()));
        std::fs::create_dir_all(&d).unwrap();
        let img = DynamicImage::ImageRgb8(image::RgbImage::from_pixel(200, 100, image::Rgb([200, 30, 90])));
        let pdf = d.join("t.pdf");
        images_to_pdf(&[img.clone(), img], &pdf).unwrap();
        let cancel = AtomicBool::new(false);
        let mut p = |_f: f32| {};
        let inputs = vec![pdf.to_string_lossy().into_owned()];
        let out = execute(Work { inputs: &inputs, action: "to:png", options: &Options::default(), cancel: &cancel, progress: &mut p }).unwrap();
        assert_eq!(out.len(), 2);
        let px = image::open(&out[0]).unwrap();
        assert!(px.width() > 100);
        let _ = std::fs::remove_dir_all(d);
    }
}

#[cfg(test)]
mod media_tests {
    use super::*;
    use std::sync::atomic::AtomicBool;

    /// Só roda onde há um FFmpeg (no CI do Windows ele costuma faltar: pula).
    #[test]
    fn media_pairs_with_ffmpeg() {
        let Some(ff) = tools::locate(Tool::Ffmpeg) else { return };
        let d = std::env::temp_dir().join(format!("bifrost-media-{}", std::process::id()));
        std::fs::create_dir_all(&d).unwrap();
        let clip = d.join("clip.mp4");
        let ok = tools::command(&ff)
            .args(["-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i", "testsrc=duration=1:size=160x120:rate=10", "-f", "lavfi", "-i", "sine=duration=1", "-shortest", "-y"])
            .arg(&clip)
            .status()
            .map(|s| s.success())
            .unwrap_or(false);
        if !ok {
            return;
        }
        let cancel = AtomicBool::new(false);
        for action in ["to:webm", "to:mkv", "to:gif", "to:mp3", "to:wav", "to:m4a", "compress", "resize"] {
            let mut last = 0.0f32;
            let mut p = |f: f32| last = f;
            let inputs = vec![clip.to_string_lossy().into_owned()];
            let out = execute(Work { inputs: &inputs, action, options: &Options::default(), cancel: &cancel, progress: &mut p }).unwrap_or_else(|e| panic!("{action}: {e}"));
            assert!(std::fs::metadata(&out[0]).unwrap().len() > 0, "{action}");
        }
        let _ = std::fs::remove_dir_all(d);
    }
}
