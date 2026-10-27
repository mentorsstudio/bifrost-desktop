// QA visual (fase 19): roda DENTRO da página (page.evaluate). Sem dependências.
// Devolve uma lista de problemas { kind, what, detail }.
// Tipos: overlap, clip, offscreen, tail, double.
(() => {
  const out = [];
  const vis = (el) => {
    const s = getComputedStyle(el);
    if (s.display === "none" || s.visibility === "hidden" || +s.opacity === 0) return false;
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return false;
    for (let p = el; p; p = p.parentElement) {
      const ps = getComputedStyle(p);
      if (+ps.opacity === 0 || ps.visibility === "hidden") return false;
    }
    return true;
  };
  const name = (el) => {
    const id = el.id ? `#${el.id}` : "";
    const cls = typeof el.className === "string" && el.className ? "." + el.className.trim().split(/\s+/).slice(0, 2).join(".") : "";
    const txt = (el.textContent || "").trim().replace(/\s+/g, " ").slice(0, 28);
    return `${el.tagName.toLowerCase()}${id}${cls}${txt ? ` "${txt}"` : ""}`;
  };
  // Área visível (recortada pelos ancestrais com overflow != visible).
  const clipRect = (el) => {
    let r = el.getBoundingClientRect();
    let x1 = r.left, y1 = r.top, x2 = r.right, y2 = r.bottom;
    for (let p = el.parentElement; p; p = p.parentElement) {
      const s = getComputedStyle(p);
      if (s.overflowX !== "visible" || s.overflowY !== "visible") {
        const q = p.getBoundingClientRect();
        if (s.overflowX !== "visible") { x1 = Math.max(x1, q.left); x2 = Math.min(x2, q.right); }
        if (s.overflowY !== "visible") { y1 = Math.max(y1, q.top); y2 = Math.min(y2, q.bottom); }
      }
    }
    return { x1, y1, x2, y2 };
  };
  const radius = (s) => parseFloat(s.borderTopLeftRadius) || 0;
  const decorated = (s) =>
    (s.backgroundImage !== "none") || (s.backgroundColor !== "rgba(0, 0, 0, 0)" && s.backgroundColor !== "transparent") ||
    (s.boxShadow !== "none") || (parseFloat(s.borderTopWidth) > 0 && s.borderTopStyle !== "none");

  const INTER = "button, a[href], input:not([type=hidden]), select, textarea, [role=button], [role=tab], [role=switch], [role=radio]";
  const inter = [...document.querySelectorAll(INTER)].filter(vis).filter((e) => !e.closest("[aria-hidden=true], .m-leaving"));
  // O corvo: o círculo útil dentro do canvas (o canvas tem folga para chapéus).
  const ravens = [...document.querySelectorAll("#bot-canvas, .raven-canvas, canvas[data-raven]")].filter(vis).map((c) => {
    const r = c.getBoundingClientRect();
    return { el: c, x1: r.left + 26, y1: r.top + 22, x2: r.right - 26, y2: r.bottom - 22 };
  });
  const boxes = inter.map((el) => ({ el, ...clipRect(el) })).filter((b) => b.x2 - b.x1 > 1 && b.y2 - b.y1 > 1);

  // 1. Sobreposição entre interativos (fora pai/filho) e com o corvo.
  const hit = (a, b, m = 1.5) => Math.min(a.x2, b.x2) - Math.max(a.x1, b.x1) > m && Math.min(a.y2, b.y2) - Math.max(a.y1, b.y1) > m;
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i], b = boxes[j];
      if (a.el.contains(b.el) || b.el.contains(a.el)) continue;
      if (a.el.closest("label") && a.el.closest("label") === b.el.closest("label")) continue;
      if (hit(a, b)) out.push({ kind: "overlap", what: `${name(a.el)} × ${name(b.el)}` });
    }
    for (const rv of ravens) if (hit(boxes[i], rv, 4)) out.push({ kind: "overlap", what: `${name(boxes[i].el)} × corvo` });
  }

  // 2. Texto cortado: estoura a caixa sem reticências, ou o ancestral o recorta.
  for (const el of document.querySelectorAll("body *")) {
    if (!vis(el) || el.closest("[aria-hidden=true], .m-leaving, svg")) continue;
    const own = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
    if (!own) continue;
    const s = getComputedStyle(el);
    if (el.scrollWidth > el.clientWidth + 1 && s.overflowX !== "visible" && s.textOverflow !== "ellipsis" && el.clientWidth > 0)
      out.push({ kind: "clip", what: name(el), detail: `${el.scrollWidth}>${el.clientWidth}` });
    else {
      const r = el.getBoundingClientRect(), c = clipRect(el);
      const cut = (r.right - c.x2 > 3 && r.left < c.x2) || (c.x1 - r.left > 3 && r.right > c.x1);
      const ell = s.textOverflow === "ellipsis";
      if (cut && !ell && c.y2 > r.top && c.y1 < r.bottom) out.push({ kind: "clip", what: name(el), detail: "recortado pelo pai" });
    }
  }

  // 3. Fora da janela (na horizontal; na vertical só o que não está numa rolagem).
  const W = innerWidth, H = innerHeight;
  for (const b of boxes) {
    const r = b.el.getBoundingClientRect();
    let scrolled = false;
    for (let p = b.el.parentElement; p; p = p.parentElement) { const s = getComputedStyle(p); if (/(auto|scroll)/.test(s.overflowY)) { scrolled = true; break; } }
    if (r.left < -1 || r.right > W + 1 || (!scrolled && (r.top < -1 || r.bottom > H + 1))) out.push({ kind: "offscreen", what: name(b.el), detail: `${Math.round(r.left)},${Math.round(r.top)} ${Math.round(r.right)},${Math.round(r.bottom)}` });
  }

  // 4. Rolagem com cauda vazia > 40 px.
  for (const el of document.querySelectorAll("body, body *")) {
    const s = getComputedStyle(el);
    if (!/(auto|scroll)/.test(s.overflowY) || el.scrollHeight <= el.clientHeight + 1 || !vis(el)) continue;
    const top = el.getBoundingClientRect().top - el.scrollTop + el.clientTop;
    let bottom = 0;
    for (const d of el.querySelectorAll("*")) {
      if (!vis(d) || d.children.length && getComputedStyle(d).backgroundImage === "none" && getComputedStyle(d).backgroundColor === "rgba(0, 0, 0, 0)" && !d.textContent.trim()) continue;
      const ds = getComputedStyle(d);
      if (ds.position === "fixed" || ds.position === "absolute" && d.parentElement === el) continue;
      bottom = Math.max(bottom, d.getBoundingClientRect().bottom - top);
    }
    const tail = el.scrollHeight - bottom - parseFloat(s.paddingBottom);
    if (tail > 40) out.push({ kind: "tail", what: name(el), detail: `${Math.round(tail)} px vazios` });
  }

  // 5. Contorno duplo: forma decorada atrás/na frente com raio diferente.
  const shapes = [...document.querySelectorAll("button, [role=tab], [role=button], .chip, .hub-item, .tab, .seg button, .pill, .badge, .m-ink")].filter(vis);
  for (const el of shapes) {
    const s = getComputedStyle(el), r = el.getBoundingClientRect(), rad = Math.min(radius(s), r.height / 2);
    if (!decorated(s) && !el.classList.contains("m-ink")) continue;
    for (const pseudo of ["::before", "::after"]) {
      const ps = getComputedStyle(el, pseudo);
      if (ps.content === "none" || ps.content === "normal" || !decorated(ps) || +ps.opacity === 0) continue;
      const pw = parseFloat(ps.width) || r.width;
      if (pw < r.width * 0.8) continue; // ícone/ponto, não uma forma
      if (Math.abs(Math.min(radius(ps), r.height / 2) - rad) > 2) out.push({ kind: "double", what: `${name(el)}${pseudo}`, detail: `raio ${radius(ps)} vs ${rad}` });
    }
    const p = el.parentElement;
    if (p && p !== document.body) {
      const pr = p.getBoundingClientRect(), pst = getComputedStyle(p);
      const same = Math.abs(pr.width - r.width) < 8 && Math.abs(pr.height - r.height) < 8;
      if (same && decorated(pst) && Math.abs(Math.min(radius(pst), pr.height / 2) - rad) > 2)
        out.push({ kind: "double", what: `${name(p)} > ${name(el)}`, detail: `raio ${radius(pst)} vs ${rad}` });
    }
  }
  // O indicador deslizante tem de casar com a aba ativa (posição, tamanho e raio).
  for (const ink of document.querySelectorAll(".m-ink")) {
    if (ink.style.opacity !== "1") continue;
    const c = ink.parentElement, on = c && c.querySelector(".on, [aria-selected=true]");
    if (!on || !vis(on)) continue;
    const a = ink.getBoundingClientRect(), b = on.getBoundingClientRect();
    if (Math.abs(a.left - b.left) > 2 || Math.abs(a.width - b.width) > 2 || Math.abs(a.height - b.height) > 2)
      out.push({ kind: "double", what: `indicador × ${name(on)}`, detail: `${Math.round(a.width)}x${Math.round(a.height)} vs ${Math.round(b.width)}x${Math.round(b.height)}` });
    const os = getComputedStyle(on);
    if (decorated(os) && os.backgroundImage !== "none") out.push({ kind: "double", what: `indicador + fundo próprio em ${name(on)}` });
  }
  // Sem duplicatas.
  const seen = new Set();
  return out.filter((p) => { const k = p.kind + p.what; if (seen.has(k)) return false; seen.add(k); return true; });
})();
