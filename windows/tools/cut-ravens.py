# Recria os corvos da referência como camadas de fantoche limpas e completas (WebP com alfa)
# + art/meta.ts. Uso: /workspace/vt/bin/python tools/cut-ravens.py <ref.png> <pasta_saida>
# - Sem o adesivo cinza (ele é gerado ao vivo da silhueta composta, em rig-raster.ts).
# - Cada peça móvel tem o próprio contorno; por baixo, a base é repintada (sem linhas velhas).
# - A cabeça desce sobre o peito com uma gola de penas serrilhada que cobre a junta.
import sys, os, json
import numpy as np, cv2
from PIL import Image
from scipy import ndimage as nd
REF, OUT = sys.argv[1], sys.argv[2]
im = np.array(Image.open(REF).convert("RGBA")).astype(np.float32)
rgb = im[..., :3].copy(); rgb[im[..., 3] < 128] = 255
PAL = {
  "huginn": {"bg": (255,255,255), "body": (48,48,56), "ink": (16,15,21), "ink2": (25,24,31), "wing": (55,58,73), "sticker": (177,179,187),
             "crest": (48,61,97), "beak": (102,103,117), "beakHi": (146,146,154), "medal": (174,124,75), "eyeoff": (215,215,218)},
  "muninn": {"bg": (255,255,255), "body": (199,195,199), "ink": (15,14,19), "ink2": (24,22,29), "wing": (60,59,69), "sticker": (177,178,187),
             "beak": (99,99,113), "cheek": (216,214,217), "beakHi": (142,141,147), "tongue": (218,119,111), "medal": (175,112,77)},
}
CFG = {
  "huginn": {"x": (164, 752), "y": (72, 835), "cut": 445, "pivot": (300, 448), "brow": (445, 200, 545, 268)},
  "muninn": {"x": (1025, 1616), "y": (114, 835), "cut": 418, "pivot": (210, 418), "wing": "R", "bodyEll": (240, 520, 205, 125)},
}
meta = {}
def save(name, C, A):
    out = np.dstack([np.clip(C, 0, 255), np.clip(A, 0, 1) * 255]).astype(np.uint8)
    Image.fromarray(out, "RGBA").save(os.path.join(OUT, name + ".webp"), quality=94, alpha_quality=100, method=6)
def bleed(C, A, n=4):
    C = C.copy()
    for _ in range(n):
        dil = cv2.dilate(C.astype(np.uint8), np.ones((3, 3), np.uint8)).astype(np.float32)
        C = np.where((A[..., None] <= 0.02), dil, C)
    return C
def hull_of(mask):
    pts = np.argwhere(mask)[:, ::-1].astype(np.int32)
    h = np.zeros(mask.shape, np.uint8); cv2.fillPoly(h, [cv2.convexHull(pts)], 1); return h.astype(bool)
for who, cfg in CFG.items():
    P = PAL[who]; ink = np.array(P["ink"], np.float32); body = np.array(P["body"], np.float32)
    x0, x1 = cfg["x"]; y0, y1 = cfg["y"]
    R = rgb[y0:y1, x0:x1].copy(); H, W = R.shape[:2]
    names = list(P); cols = np.array([P[n] for n in names], np.float32)
    cls = np.array(names)[((R[:, :, None, :] - cols[None, None]) ** 2).sum(-1).argmin(-1)]
    cls[cls == "ink2"] = "ink"
    if who == "huginn": cls[cls == "eyeoff"] = "bg"
    fg = cls != "bg"
    lab, _ = nd.label(~fg)
    border = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))) - {0}
    outside = np.isin(lab, list(border))
    yy, xx = np.mgrid[0:H, 0:W]
    # --- silhueta SEM adesivo: o desenho termina no contorno de tinta ---
    stick = (~outside) & (cls == "sticker")
    # o adesivo é a faixa externa: o "sticker" ligado ao fundo
    sl, sn = nd.label(stick | outside)
    outer = np.isin(sl, list(set(np.unique(sl[outside])) - {0}))
    art = ~outer  # tudo que é desenho (tinta para dentro)
    alR = im[y0:y1, x0:x1, 3]
    art &= nd.distance_transform_edt(alR > 200) > 4.5  # a franja externa do adesivo nunca é desenho
    # alfa na borda tinta→adesivo pela escuridão do pixel (antisserrilhado limpo)
    L = R.mean(-1); Lst = np.array(P["sticker"]).mean(); Li = ink.mean()
    edge = nd.binary_dilation(art, iterations=2) & ~nd.binary_erosion(art, iterations=2)
    A = art.astype(np.float32)
    f = np.clip((Lst - L) / (Lst - Li), 0, 1)
    A[edge] = np.where(outer[edge] | (cls[edge] == "sticker"), f[edge], np.maximum(A[edge], f[edge]))
    C = R.copy(); C[edge & (A < 1)] = ink
    # largura do adesivo na referência (para o adesivo ao vivo)
    dt = nd.distance_transform_edt(~art)
    sw = float(np.percentile(dt[stick & outer & ~outside], 95)) if (stick & outer).any() else 10.0
    eyeW = (~fg) & ~outside
    # --- olhos ---
    el, en = nd.label(eyeW)
    eyes = []
    for i in range(1, en + 1):
        if (el == i).sum() < 400: continue
        eyes.append(hull_of(el == i))
    eyes.sort(key=lambda e: np.where(e)[1].mean())
    eyeAll = np.zeros((H, W), bool)
    for e in eyes: eyeAll |= e
    eyeIn = eyeAll & ~nd.binary_dilation(cls == "ink", iterations=0) | (eyeAll & nd.binary_erosion(eyeAll, iterations=4))
    sclera = np.median(R[eyeW], axis=0)
    pupil = eyeAll & (R.min(-1) < 150) & nd.binary_erosion(eyeAll, iterations=3)
    pupD = nd.binary_dilation(pupil, iterations=2) & eyeAll
    pupA = np.where(pupD, np.clip((sclera.mean() - L) / (sclera.mean() - Li), 0, 1), 0)
    cut = cfg["cut"]
    # --- partes ---
    wl, wn = nd.label(cls == "wing")
    wsz = nd.sum(np.ones_like(wl), wl, range(1, wn + 1))
    wingPix = np.zeros((H, W), bool)
    for q in range(1, wn + 1):
        if wsz[q - 1] > 150: wingPix |= wl == q
    nearWing = nd.binary_dilation(wingPix, iterations=10)
    # gola serrilhada: a cabeça desce sobre o peito em "penas" (dentes de 26 px)
    saw = 34 + 16 * np.abs(((xx / 26.0) % 2) - 1)
    ruff = art & (yy >= cut) & (yy < cut + saw) & ~nearWing & np.isin(cls, ["body", "ink", "cheek", "medal"])
    ruff = nd.binary_opening(ruff, iterations=2)
    headM = (art & (yy < cut)) | ruff
    headM &= ~(wingPix & (yy >= cut - 30))  # asas não vão com a cabeça
    layers = {}
    Hc = C.copy()
    Hc[pupD] = sclera  # pupilas em camada própria
    # sobrancelha (Huginn): camada própria; por baixo, pena
    browInfo = None
    if cfg.get("brow"):
        a, b, c, e = cfg["brow"]
        box = np.zeros((H, W), bool); box[b:e, a:c] = True
        mb = box & (cls == "ink") & nd.binary_erosion(art, iterations=14)
        l2, n2 = nd.label(mb); s2 = nd.sum(np.ones_like(l2), l2, range(1, n2 + 1)); mb = l2 == (np.argmax(s2) + 1)
        mb = nd.binary_dilation(mb, iterations=2) & box & ~eyeAll
        bA = np.where(mb, np.clip((body.mean() + 10 - L) / (body.mean() + 10 - Li), 0, 1), 0) if who == "muninn" else mb.astype(np.float32)
        layers["brow"] = (C.copy(), mb.astype(np.float32))
        Hc[nd.binary_dilation(mb, iterations=2)] = body
        ys, xs = np.where(mb); browInfo = [float(xs.mean()), float(ys.mean())]
    beakRoot = None
    if who == "muninn":
        # bico inferior + língua + boca, contorno próprio; por baixo: interior da boca (escuro)
        bl, bn = nd.label(np.isin(cls, ["beak", "beakHi", "tongue"]) & (yy < cut + 40) & ~eyeAll)
        bsz = nd.sum(np.ones_like(bl), bl, range(1, bn + 1))
        comps = [i + 1 for i in np.argsort(-bsz)[:3] if bsz[i] > 300]
        comps.sort(key=lambda q: nd.center_of_mass(bl == q)[0])
        lo = np.zeros((H, W), bool)
        for q in comps[1:]: lo |= bl == q
        lo |= (cls == "tongue") & (yy < cut)
        lo = nd.binary_fill_holes(nd.binary_closing(lo, iterations=4))
        loO = nd.binary_dilation(lo, iterations=7) & art & ~eyeAll & (yy > np.where(lo)[0].min() - 3)
        layers["beakLo"] = (C.copy(), loO.astype(np.float32))
        ys, xs = np.where(lo); beakRoot = [float(xs.max() - 12), float(ys.min() + 6)]
        Hc[nd.binary_erosion(loO, iterations=4)] = ink * 0.9 + np.array([40, 10, 14]) * 0.1  # boca por dentro
    # --- base: corpo e pés; sob a cabeça, pena lisa (sem o contorno do pescoço) ---
    Bc = C.copy(); bA = A * (yy >= cut - 80)
    under = art & (yy < cut + 60) & (yy >= cut - 80) & nd.binary_erosion(art, iterations=8) & ~nearWing
    Bc[under & ~np.isin(cls, ["medal"])] = np.where(np.isin(cls[under & ~np.isin(cls, ["medal"])], ["ink"])[:, None], body, Bc[under & ~np.isin(cls, ["medal"])])
    shoulder = None
    if cfg.get("wing"):
        big = (np.argsort(-wsz)[:2] + 1).tolist(); big.sort(key=lambda q: nd.center_of_mass(wl == q)[1])
        wm = wl == (big[1] if cfg["wing"] == "R" else big[0])
        near = nd.binary_dilation(wm, iterations=12)
        for q in range(1, wn + 1):
            if wsz[q - 1] > 150 and (near & (wl == q)).any(): wm |= wl == q
        wm = nd.binary_fill_holes(nd.binary_closing(wm, iterations=3))
        wmO = nd.binary_dilation(wm, iterations=8) & art  # a asa com o contorno inteiro
        # zona da asa: inclui os riscos soltos das pontas (tinta perto da asa)
        zone = nd.binary_fill_holes(nd.binary_closing(wmO | (art & (cls == "ink") & nd.binary_dilation(wmO, iterations=28) & (xx > 380)), iterations=10))
        wmO = zone & art
        layers["wing"] = (C.copy(), (A * wmO))
        # corpo por trás da asa: elipse do peito ∪ peito visível; contorno de tinta na borda
        ex, ey, erx, ery = cfg["bodyEll"]
        bodyM = (cls == "body") & (yy > cut - 10)
        Lx = np.full(H, -1)
        # borda do peito com "penas" (recortada como no desenho, não uma linha lisa)
        th = np.arctan2((yy - ey) / ery, (xx - ex) / erx)
        rr = np.hypot((xx - ex) / erx, (yy - ey) / ery)
        bump = 1 - 0.035 * np.abs(np.sin(th * 9)) ** 0.6
        behind = (rr <= bump) | (art & ~wmO & (yy > cut))
        behind &= (yy < 650)
        wtop0 = np.where(wm)[0].min()
        # o bolso entre a cabeça e o topo da asa também é peito (sem espinho de contorno ali)
        behind |= wmO & (yy < wtop0 + 70) & (xx < 400)
        behind = nd.binary_opening(nd.binary_closing(behind, iterations=6), iterations=3)
        hole = wmO & behind
        Bc[hole] = body
        # o traço de dentro da asa (asa/peito) que sobrava no peito: vira pena
        inner = ~nd.binary_dilation(~behind, iterations=7)
        diff = np.abs(C - body).max(-1)
        ghost = behind & inner & (nd.binary_dilation(wmO, iterations=4) | (nd.binary_dilation(wmO, iterations=12) & (diff > 6)))
        Bc[ghost] = body
        ring = behind & ~nd.binary_erosion(behind, iterations=6) & wmO & (yy > wtop0 + 22)
        Bc[ring] = ink
        bA = np.where(wmO, np.where(behind, 1.0, 0.0), bA)
        bA = np.where(ring, 1.0, bA)
        pocket = nd.binary_dilation(wmO & (yy < wtop0 + 70) & (xx < 400), iterations=3) & behind
        bA = np.where(pocket, 1.0, bA); Bc[pocket & ~ring] = body
        bA = np.where(nd.binary_dilation(wmO, iterations=6) & ~behind & ((yy < 660) | (xx > 410)), 0, bA)
        wtop = np.where(wm)[0].min()
        dW = nd.distance_transform_edt(~wm)
        wingA = A * (wmO & ~(behind & ~nd.binary_dilation(wm, iterations=8)) & (yy >= wtop - 14) & ~headM & ((xx > 380) | (dW <= 9)))
        layers["wing"] = (C.copy(), wingA)
        bA = np.where((wmO & (yy < wtop - 14)) | (wmO & headM), A, bA)
        # pivô do ombro: o canto de cima, por dentro (escondido pelo peito)
        ys, xs = np.where(wm)
        top = ys.min(); xsTop = xs[ys < top + 30]
        shoulder = [float(xsTop.min() + 18), float(top + 26)]
    headA = A * headM
    if "beakLo" in layers: headA = np.maximum(headA, A * layers["beakLo"][1] * 0)  # (o bico vem por cima)
    save(f"{who}-base", bleed(Bc, bA), bA)
    save(f"{who}-head", bleed(Hc, headA), headA)
    Pc = np.zeros_like(C); Pc[:] = ink
    save(f"{who}-pupils", Pc, pupA)
    save(f"{who}-eyes", np.full_like(C, 255), eyeAll.astype(np.float32))
    if who == "muninn":
        # máscara da pálpebra: o olho com o contorno de fora inteiro (+3 px), por olho
        lm = np.zeros((H, W), bool)
        for e in eyes:
            dk = np.abs(C - body).max(-1) > 9  # tinta e o antisserrilhado dela
            o = nd.binary_fill_holes(nd.binary_dilation(e, iterations=2) | (nd.binary_dilation(e, iterations=14) & dk))
            o = nd.binary_opening(o, iterations=3)
            lm |= nd.binary_dilation(o, iterations=7)
        layers["lidmask"] = (np.full_like(C, 255), cv2.GaussianBlur(lm.astype(np.float32), (0, 0), 1.0))
    for k, (cc, aa) in layers.items(): save(f"{who}-{k}", bleed(cc, aa), aa)
    fits = []
    for e in eyes:
        # elipse ajustada ao contorno de fora do olho (o traço de tinta incluso)
        ring = nd.binary_fill_holes(nd.binary_dilation(e, iterations=2) | (nd.binary_dilation(e, iterations=9) & (cls == "ink")))
        cs, _ = cv2.findContours(ring.astype(np.uint8), cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
        (fx, fy), (fw, fh), fa = cv2.fitEllipse(max(cs, key=len))
        # cor da pena em volta (a pálpebra se funde nela)
        around = nd.binary_dilation(ring, iterations=18) & ~nd.binary_dilation(ring, iterations=6) & np.isin(cls, ["body", "cheek"])
        lc = np.median(C[around], axis=0) if around.any() else body
        fits.append([round(fx, 1), round(fy, 1), round(fw / 2, 1), round(fh / 2, 1), round(float(np.deg2rad(fa)), 3), int(lc[0]), int(lc[1]), int(lc[2])])
    ein = []
    for e in eyes:
        ys, xs = np.where(e)
        ein.append([round(float(xs.mean()), 1), round(float(ys.mean()), 1), float((xs.max() - xs.min()) / 2), float((ys.max() - ys.min()) / 2)])
    meta[who] = {"w": W, "h": H, "pivot": list(cfg["pivot"]), "eyes": ein, "brow": browInfo, "beakRoot": beakRoot, "shoulder": shoulder,
                 "lid": [int(v) for v in P["body"]], "ink": list(P["ink"]), "sticker": list(P["sticker"]), "stickerW": max(7.0, round(sw, 1)),
                 "eyeFit": fits, "layers": ["base", "head", "pupils", "eyes"] + list(layers)}
    print(who, meta[who]["layers"], "adesivo", max(7.0, round(sw, 1)), "ombro", shoulder)
open(os.path.join(OUT, "meta.ts"), "w").write("// GERADO por tools/cut-ravens.py (camadas recriadas da referência).\nexport const ART_META = " + json.dumps(meta) + " as const;\n")
