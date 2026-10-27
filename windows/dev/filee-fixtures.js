// Dados de exemplo do Conversor para as páginas de captura (dev only).
window.__FIXTURES__ = window.__FIXTURES__ || {};
(() => {
  const tools = [
    { id: "ffmpeg", label: "FFmpeg", path: "C:\\Users\\paulo\\AppData\\Local\\Microsoft\\WinGet\\Links\\ffmpeg.exe", downloadable: true, downloadMb: 80, hint: "Áudio e vídeo." },
    { id: "pdfium", label: "PDFium", path: null, downloadable: true, downloadMb: 6, hint: "PDF para imagem e leitura de texto de PDF." },
    { id: "pandoc", label: "Pandoc", path: null, downloadable: false, downloadMb: 0, hint: "RTF, EPUB e documentos de texto. Instale com: winget install JohnMacFarlane.Pandoc" },
    { id: "libreoffice", label: "LibreOffice", path: null, downloadable: false, downloadMb: 0, hint: "Word, Excel e PowerPoint para PDF. Instale com: winget install TheDocumentFoundation.LibreOffice" },
    { id: "magick", label: "ImageMagick", path: null, downloadable: false, downloadMb: 0, hint: "HEIC e formatos raros (opcional, o FFmpeg cobre o HEIC)." },
    { id: "7zip", label: "7-Zip", path: null, downloadable: false, downloadMb: 0, hint: "RAR (ZIP, TAR e 7z já são nativos)." },
  ];
  const t = (id, label, group = "convert", needs = null, ready = true) => ({ id, label, group, needs, ready, needsLabel: ready ? null : "Precisa do PDFium" });
  const plan = {
    files: [
      { path: "C:\\Users\\paulo\\Desktop\\viagem-noruega.png", name: "viagem-noruega.png", ext: "png", category: "image", categoryLabel: "Imagem", size: 4830211 },
      { path: "C:\\Users\\paulo\\Desktop\\aurora.jpg", name: "aurora.jpg", ext: "jpg", category: "image", categoryLabel: "Imagem", size: 2210004 },
    ],
    targets: [t("to:jpg", "JPG"), t("to:png", "PNG"), t("to:webp", "WebP"), t("to:avif", "AVIF", "convert", "ffmpeg"), t("to:bmp", "BMP"), t("to:ico", "ICO"), t("to:pdf", "PDF"), t("merge-pdf", "Juntar em um PDF", "tools"), t("compress", "Comprimir", "tools"), t("resize", "Redimensionar", "tools"), t("zip", "Compactar em ZIP", "tools")],
    tools,
  };
  Object.assign(window.__FIXTURES__, {
    convert_take_pending: plan.files.map((f) => f.path),
    convert_plan: plan,
    convert_tools: tools,
    convert_prefs: { gesture: true, trigger: "ctrl-hold", holdMs: 280, contextMenu: false, outDir: "" },
    convert_start: 1,
  });
  window.__FILEE_PLAN__ = plan;
})();
