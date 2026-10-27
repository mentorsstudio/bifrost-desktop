# Recorta os corvos da referência em camadas de fantoche (PNG/WebP com alfa) + meta JSON.
#   /workspace/vt/bin/python tools/cut-ravens.py <ref.png> <pasta_saida>
import sys, json, os
import numpy as np, cv2
from PIL import Image
from scipy import ndimage as nd
REF, OUT = sys.argv[1], sys.argv[2]
im = np.array(Image.open(REF).convert("RGBA")).astype(np.float32)
rgb = im[..., :3].copy(); al = im[..., 3]
rgb[al < 128] = 255
PAL = {
  "huginn": {"bg": (255,255,255), "body": (48,48,56), "ink": (16,15,21), "ink2": (25,24,31), "wing": (55,58,73), "sticker": (177,179,187),
             "crest": (48,61,97), "beak": (102,103,117), "beakHi": (146,146,154), "medal": (174,124,75), "eyeoff": (215,215,218)},
  "muninn": {"bg": (255,255,255), "body": (199,195,199), "ink": (15,14,19), "ink2": (24,22,29), "wing": (60,59,69), "sticker": (177,178,187),
             "beak": (99,99,113), "cheek": (216,214,217), "beakHi": (142,141,147), "tongue": (218,119,111), "medal": (175,112,77)},
}
CFG = {
  "huginn": {"x": (164, 752), "y": (72, 835), "cut": 445, "pivot": (300, 450), "brow": (445, 200, 545, 268)},
  "muninn": {"x": (1025, 1616), "y": (114, 835), "cut": 418, "pivot": (210, 420), "brow": None, "wing": "R", "shoulder": (330, 440), "bodyEll": (240, 520, 205, 125)},
}
BAND = 28
meta = {}
def save(name, rgbA):
    Image.fromarray(np.clip(rgbA, 0, 255).astype(np.uint8), "RGBA").save(os.path.join(OUT, name + ".webp"), lossless=False, quality=92, alpha_quality=100, method=6)
def inpaint(img, mask, r=9):
    return cv2.inpaint(np.clip(img, 0, 255).astype(np.uint8), (mask > 0).astype(np.uint8) * 255, r, cv2.INPAINT_TELEA).astype(np.float32)
for who, cfg in CFG.items():
    x0, x1 = cfg["x"]; y0, y1 = cfg["y"]
    R = rgb[y0:y1, x0:x1].copy(); H, W = R.shape[:2]
    names = list(PAL[who]); cols = np.array([PAL[who][n] for n in names], np.float32)
    cls = np.array(names)[((R[:, :, None, :] - cols[None, None]) ** 2).sum(-1).argmin(-1)]
    cls[cls == "ink2"] = "ink"
    if who == "huginn": cls[cls == "eyeoff"] = "bg"
    fg = cls != "bg"
    lab, _ = nd.label(~fg)
    border = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))) - {0}
    outside = np.isin(lab, list(border))
    sil = ~outside
    # alfa suave: dentro = 255; na borda, pela "brancura" do pixel (o adesivo é cinza ~178)
    whit = np.clip((255 - R.min(-1)) / (255 - 178), 0, 1)
    ring = nd.binary_dilation(sil, iterations=2) & ~nd.binary_erosion(sil, iterations=2)
    A = np.where(sil, 1.0, 0.0); A[ring] = np.maximum(A[ring] * 0, whit[ring])
    A[nd.binary_erosion(sil, iterations=2)] = 1
    # cor da borda: desfaz a mistura com o branco (sem halo)
    C = R.copy(); m = (A > 0.02) & (A < 1)
    C[m] = np.clip((R[m] - 255 * (1 - A[m, None])) / A[m, None], 0, 255)
    C[A <= 0.02] = 0
    for _ in range(3):  # sangra a cor para fora (sem franja escura ao filtrar)
        dil = cv2.dilate(C.astype(np.uint8), np.ones((3, 3), np.uint8)).astype(np.float32)
        C = np.where((A[..., None] <= 0.02), dil, C)
    yy, xx = np.mgrid[0:H, 0:W]
    cut = cfg["cut"]
    eyeW = (~fg) & ~outside
    # olhos: cada branco fechado + pupila (buracos)
    el, en = nd.label(eyeW)
    eyes = []
    for i in range(1, en + 1):
        if (el == i).sum() < 400: continue
        pts = np.argwhere(el == i)[:, ::-1].astype(np.int32)
        hull = np.zeros((H, W), np.uint8); cv2.fillPoly(hull, [cv2.convexHull(pts)], 1)
        mm = hull.astype(bool) & ~(nd.binary_erosion(cls == "ink", iterations=0) & ~nd.binary_erosion(hull.astype(bool), iterations=3))
        eyes.append(mm)
    eyes.sort(key=lambda e: np.where(e)[1].mean())
    eyeAll = np.zeros((H, W), bool)
    for e in eyes: eyeAll |= e
    sclera = np.median(R[eyeW], axis=0)
    pupil = eyeAll & (R.min(-1) < 150)
    pupilD = nd.binary_dilation(pupil, iterations=2) & eyeAll
    # cabeça: tudo acima do corte (com rampa suave na faixa do pescoço)
    headA = np.clip((cut - yy) / BAND, 0, 1) * A
    Hc = C.copy()
    # pupilas fora da cabeça (camada própria); sob elas, a esclera
    Hc[pupilD] = sclera
    P = np.zeros((H, W, 4), np.float32); P[..., :3] = C; P[..., 3] = np.where(pupilD, 255, 0)
    P[..., 3] = np.where(pupilD, np.clip((sclera.mean() - R.mean(-1)) / (sclera.mean() - 20), 0, 1) * 255, 0)
    P[..., :3] = np.where(pupilD[..., None], 0, 0) + C * pupilD[..., None]
    # pupila: preto puro com alfa (o brilho é o "furo" claro), recompõe sobre a esclera
    P[..., :3] = PAL[who]["ink"]
    layers = {}
    # sobrancelha (Huginn): tinta na caixa, longe da borda; sob ela, pena (inpaint)
    browInfo = None
    if cfg["brow"]:
        a, b, c, e = cfg["brow"]
        box = np.zeros((H, W), bool); box[b:e, a:c] = True
        inner = nd.binary_erosion(sil, iterations=14)
        mb = box & (cls == "ink") & inner
        l2, n2 = nd.label(mb); s2 = nd.sum(np.ones_like(l2), l2, range(1, n2 + 1)); mb = l2 == (np.argmax(s2) + 1)
        mb = nd.binary_dilation(mb, iterations=2) & box & ~eyeAll
        Bm = np.zeros((H, W, 4), np.float32); Bm[..., :3] = C; Bm[..., 3] = mb * 255
        Hc = inpaint(Hc, mb & ~(cls == "ink") * 0 | mb, 7)
        layers["brow"] = Bm
        ys, xs = np.where(mb); browInfo = [float(xs.mean()), float(ys.mean())]
    beakInfo = None
    if who == "muninn":
        # bico inferior + língua: o maior componente de bico abaixo do superior
        bl, bn = nd.label(np.isin(cls, ["beak", "beakHi", "tongue"]) & (yy < cut + 40))
        bsz = nd.sum(np.ones_like(bl), bl, range(1, bn + 1))
        comps = [i + 1 for i in np.argsort(-bsz)[:3] if bsz[i] > 300]
        comps.sort(key=lambda q: nd.center_of_mass(bl == q)[0])
        if len(comps) > 1:
            lo = np.zeros((H, W), bool)
            for q in comps[1:]: lo |= bl == q
            lo |= (cls == "tongue") & (yy < cut); lo = nd.binary_fill_holes(lo)
            lo = nd.binary_dilation(lo, iterations=6) & sil & ~eyeAll & (yy > np.where(lo)[0].min() - 4)
            L = np.zeros((H, W, 4), np.float32); L[..., :3] = C; L[..., 3] = lo * A * 255
            layers["beakLo"] = L
            ys, xs = np.where(lo)
            # raiz: o canto de trás (lado do rosto, x máximo, Muninn olha à esquerda)
            beakInfo = [float(xs.max() - 10), float(ys.min() + 8)]
            under = nd.binary_erosion(lo, iterations=3)
            Hc[under] = PAL[who]["ink"]
    Hl = np.zeros((H, W, 4), np.float32); Hl[..., :3] = Hc; Hl[..., 3] = headA * 255
    if "beakLo" in layers: Hl[..., 3] = np.where(layers["beakLo"][..., 3] > 0, np.maximum(Hl[..., 3], A * 255), Hl[..., 3])
    # base: corpo + pés (+ a faixa do pescoço); acima disso, transparente
    Bc = C.copy()
    nearOut = ~nd.binary_erosion(sil, iterations=22)
    baseA = A * np.where(nearOut, np.clip((yy - (cut - BAND)) / 18, 0, 1), (yy >= cut - BAND).astype(np.float32))
    wingInfo = None
    if cfg.get("wing"):
        wl, wn = nd.label(cls == "wing")
        sizes = nd.sum(np.ones_like(wl), wl, range(1, wn + 1))
        big = (np.argsort(-sizes)[:2] + 1).tolist()
        big.sort(key=lambda q: nd.center_of_mass(wl == q)[1])
        wm = wl == (big[1] if cfg["wing"] == "R" else big[0])
        # junta as pontas de pena vizinhas (componentes de asa colados na principal)
        near = nd.binary_dilation(wm, iterations=12)
        for q in range(1, wn + 1):
            if sizes[q - 1] > 150 and (near & (wl == q)).any(): wm |= wl == q
        wm = nd.binary_fill_holes(nd.binary_dilation(wm, iterations=9) & sil) & (yy > cut - 40)
        # o adesivo e a tinta de fora da asa vão junto
        wm = (wm | (nd.binary_dilation(wm, iterations=14) & sil & np.isin(cls, ["sticker"]) & ~nd.binary_dilation(sil & ~wm & ~np.isin(cls, ["sticker", "ink"]), iterations=3)))
        # a borda (adesivo/tinta) que sobra em volta da asa vai com ela
        fringe = nd.binary_dilation(wm, iterations=18) & ~wm & (((yy < 640) & (xx > W * 0.5)) | (xx > W * 0.68)) & (A > 0.01) & (np.isin(cls, ["sticker", "ink", "bg"]) | (A < 1))
        wm = wm | fringe
        Wl = np.zeros((H, W, 4), np.float32); Wl[..., :3] = C; Wl[..., 3] = wm * A * 255
        layers["wing"] = Wl
        # sob a asa: corpo pintado (a silhueta do corpo sem a asa, fechada)
        rest = sil & ~wm
        # o corpo por trás: espelha a borda esquerda do peito em torno do medalhão
        med = (cls == "medal") & (yy < cut + 120)
        xc = float(np.where(med)[1].mean()) if med.any() else W / 2
        bodyM = (cls == "body") & (yy > cut - 10)
        hull = np.zeros((H, W), bool)
        for y in range(H):
            xs = np.where(bodyM[y])[0]
            if xs.size < 5: continue
            L = xs.min(); Rr = int(round(2 * xc - L)) + 6
            hull[y, L:max(L, Rr)] = True
        hull = nd.binary_opening(nd.binary_closing(hull, iterations=6), iterations=4)
        ex, ey, erx, ery = cfg["bodyEll"]
        hull |= ((xx - ex) / erx) ** 2 + ((yy - ey) / ery) ** 2 <= 1
        bodyBehind = hull & wm
        Bc[wm] = PAL[who]["body"]
        Bc = cv2.GaussianBlur(Bc, (0, 0), 1.2) * wm[..., None] + Bc * ~wm[..., None]
        baseA = np.where(wm, np.where(bodyBehind, 1.0, 0.0), baseA)
        # contorno do corpo onde a asa cobria
        edge = bodyBehind & ~nd.binary_erosion(bodyBehind, iterations=4)
        Bc[edge] = PAL[who]["ink"]
        st = nd.binary_dilation(bodyBehind, iterations=9) & ~bodyBehind & wm
        Bc[st] = PAL[who]["sticker"]; baseA = np.where(st, 1.0, baseA)
        baseA = np.where(nd.binary_dilation(wm, iterations=4) & ~nd.binary_dilation(bodyBehind, iterations=10) & (yy < 690), 0, baseA)
        wingInfo = list(cfg["shoulder"])
    Bl = np.zeros((H, W, 4), np.float32); Bl[..., :3] = Bc; Bl[..., 3] = baseA * 255
    E = np.zeros((H, W, 4), np.float32); E[..., :3] = 255; E[..., 3] = eyeAll * 255
    save(f"{who}-base", Bl); save(f"{who}-head", Hl); save(f"{who}-pupils", P); save(f"{who}-eyes", E)
    for k, v in layers.items(): save(f"{who}-{k}", v)
    ein = []
    for e in eyes:
        ys, xs = np.where(e)
        ein.append([float(xs.mean()), float(ys.mean()), float((xs.max() - xs.min()) / 2), float((ys.max() - ys.min()) / 2)])
    # cor da pálpebra: a pena logo acima do olho
    lid = [int(v) for v in PAL[who]["body"]]
    meta[who] = {"w": W, "h": H, "pivot": list(cfg["pivot"]), "eyes": ein, "brow": browInfo, "beakRoot": beakInfo,
                 "shoulder": wingInfo, "lid": lid, "ink": list(PAL[who]["ink"]), "layers": ["base", "head", "pupils", "eyes"] + list(layers)}
    print(who, W, H, meta[who]["layers"], len(eyes))
open(os.path.join(OUT, "meta.ts"), "w").write("// GERADO por tools/cut-ravens.py (camadas recortadas da referência).\nexport const ART_META = " + json.dumps(meta) + " as const;\n")
