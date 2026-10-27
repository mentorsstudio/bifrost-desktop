// QA visual (fase 19): roda DENTRO da página (page.evaluate). Sem dependências.
// Devolve uma lista de problemas { kind, what, detail }.
// Tipos: overlap, clip, offscreen, tail, double, collide, blank.
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

  // 5b (fase 20). Formas que só aparecem no hover/foco também contam: um halo
  // ::before (mesmo com opacidade 0 agora) com raio diferente, ou qualquer halo
  // dentro de um grupo com indicador (ink) — seriam duas formas ao passar o mouse.
  for (const el of shapes) {
    if (el.classList.contains("m-ink")) continue;
    const s = getComputedStyle(el), r = el.getBoundingClientRect(), rad = Math.min(radius(s), r.height / 2);
    const inInk = !!el.closest(".m-has-ink, .hub-segmented, .seg");
    for (const pseudo of ["::before", "::after"]) {
      const ps = getComputedStyle(el, pseudo);
      if (ps.content === "none" || ps.content === "normal" || ps.display === "none" || !decorated(ps)) continue;
      const pw = parseFloat(ps.width) || r.width;
      if (pw < r.width * 0.8) continue;
      if (inInk) out.push({ kind: "double", what: `${name(el)}${pseudo} (halo dentro de grupo)` });
      else if (Math.abs(Math.min(radius(ps), r.height / 2) - rad) > 2) out.push({ kind: "double", what: `${name(el)}${pseudo} (hover)`, detail: `raio ${radius(ps)} vs ${rad}` });
    }
    // Célula com caixa própria (borda) dentro de um grupo que já tem contorno.
    const g = el.parentElement;
    if (g && inInk) {
      const gs = getComputedStyle(g);
      const gBorder = parseFloat(gs.borderTopWidth) > 0 && gs.borderTopStyle !== "none";
      const eBorder = parseFloat(s.borderTopWidth) > 0 && s.borderTopStyle !== "none" && !/rgba\(\d+, \d+, \d+, 0\)/.test(s.borderTopColor);
      if (gBorder && eBorder) out.push({ kind: "double", what: `${name(g)} > ${name(el)} (célula com borda própria)` });
    }
  }
  // O indicador e a aba ativa: mesmo raio (senão o hover/fundo da aba desenha outra forma).
  for (const ink of document.querySelectorAll(".m-ink")) {
    if (ink.style.opacity !== "1") continue;
    const on = ink.parentElement?.querySelector(".on, [aria-selected=true]");
    if (!on || !vis(on)) continue;
    const a = ink.getBoundingClientRect();
    const ri = Math.min(radius(getComputedStyle(ink)), a.height / 2), ro = Math.min(radius(getComputedStyle(on)), a.height / 2);
    if (Math.abs(ri - ro) > 2) out.push({ kind: "double", what: `indicador × ${name(on)} (raio)`, detail: `${ri} vs ${ro}` });
  }

  // 6 (fase 20). Colisão de texto: cada glifo longe ≥ 6 px da borda do contêiner
  // decorado mais próximo e fora da curva dos cantos.
  const boxOf = (el) => {
    for (let p = el; p && p !== document.body; p = p.parentElement) {
      const s = getComputedStyle(p);
      if (/^(INPUT|TEXTAREA|SELECT)$/.test(p.tagName)) return null;
      const hasBorder = parseFloat(s.borderTopWidth) > 0 && s.borderTopStyle !== "none";
      const hasBg = s.backgroundColor !== "rgba(0, 0, 0, 0)" && s.backgroundColor !== "transparent" || s.backgroundImage !== "none";
      if ((hasBorder || hasBg) && radius(s) >= 4) return { p, s };
      if ((hasBorder || hasBg) && p.getBoundingClientRect().width > 400) return null; // painel grande: não é pílula
    }
    return null;
  };
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if (!n.textContent.trim()) continue;
    const el = n.parentElement;
    if (!el || !vis(el) || el.closest("[aria-hidden=true], .m-leaving, svg, .m-layer, canvas")) continue;
    const box = boxOf(el);
    if (!box) continue;
    const br = box.p.getBoundingClientRect();
    if (br.height > 64 || br.width < 12) continue; // só pílulas, chips e botões
    const bl = parseFloat(box.s.borderLeftWidth) || 0, brw = parseFloat(box.s.borderRightWidth) || 0;
    const L = br.left + bl, R = br.right - brw, T = br.top, B = br.bottom;
    const rad = Math.min(radius(box.s), br.height / 2);
    const range = document.createRange(); range.selectNodeContents(n);
    const c = clipRect(el);
    for (const g of range.getClientRects()) {
      if (g.width < 1) continue;
      const gl = Math.max(g.left, c.x1), gr = Math.min(g.right, c.x2);
      if (gr - gl < 1) continue;
      const top = Math.max(g.top, T), bot = Math.min(g.bottom, B);
      const inset = (y) => { const dy = y < T + rad ? T + rad - y : y > B - rad ? y - (B - rad) : 0; return dy > 0 ? rad - Math.sqrt(Math.max(0, rad * rad - dy * dy)) : 0; };
      const curve = Math.max(inset(top + 2), inset(bot - 2));
      const gap = Math.min(gl - L, R - gr);
      if (gap < 6 || gap < curve + 2) {
        out.push({ kind: "collide", what: `${name(box.p)}`, detail: `texto a ${Math.round(gap)} px da borda (curva ${Math.round(curve)} px)` });
        break;
      }
    }
  }

  // 7 (fase 20). Página aberta sem conteúdo visível abaixo do cabeçalho.
  const page = [...document.querySelectorAll(".hub-page")].find((x) => !x.classList.contains("m-layer") && !x.classList.contains("m-leaving"));
  if (page) {
    const hero = page.querySelector(".bf-hero, .hub-hero");
    const y = hero ? hero.getBoundingClientRect().bottom : page.getBoundingClientRect().top + 80;
    const shown = [...page.querySelectorAll("*")].filter((e) => !e.children.length && (e.textContent || "").trim() && e.getBoundingClientRect().top >= y - 2 && vis(e));
    if (!shown.length) out.push({ kind: "blank", what: `página ${page.dataset.page} vazia abaixo do cabeçalho` });
  }
  // Sem duplicatas.
  const seen = new Set();
  return out.filter((p) => { const k = p.kind + p.what; if (seen.has(k)) return false; seen.add(k); return true; });
})();
