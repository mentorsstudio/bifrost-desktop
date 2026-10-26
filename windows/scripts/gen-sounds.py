#!/usr/bin/env python3
"""Sons originais do Bifrost, sintetizados (numpy). Rode: python3 scripts/gen-sounds.py
Sinos suaves afinados numa escala pentatônica "nórdica" (Ré), sopros de vento e
cliques de cristal. 48 kHz, estéreo, 16 bits — os mesmos nomes que o app pede."""
import numpy as np, wave, os
SR = 48000
OUT = os.path.join(os.path.dirname(__file__), "..", "sounds")
rng = np.random.default_rng(1347)
D = {n: 293.66 * 2 ** (s / 12) for n, s in {"D": 0, "E": 2, "F#": 4, "A": 7, "B": 9, "D2": 12, "E2": 14, "F#2": 16, "A2": 19, "B2": 21, "D3": 24, "A0": -5, "D0": -12}.items()}

def t(d): return np.arange(int(SR * d)) / SR

def bell(f, d=0.9, decay=5.0, bright=0.5):
    x = t(d)
    s = np.zeros_like(x)
    for k, a in [(1, 1), (2.01, 0.45 * bright), (3.02, 0.22 * bright), (4.17, 0.12 * bright), (5.43, 0.06 * bright)]:
        s += a * np.sin(2 * np.pi * f * k * x) * np.exp(-decay * k ** 0.6 * x)
    att = np.minimum(1, x / 0.004)
    return s * att

def glass(f, d=0.12):
    x = t(d)
    return np.sin(2 * np.pi * f * x) * np.exp(-40 * x) + 0.3 * np.sin(2 * np.pi * f * 2.76 * x) * np.exp(-60 * x)

def wind(d=0.5, f0=600, f1=2400, amp=0.5):
    n = int(SR * d)
    noise = rng.standard_normal(n)
    # passa-banda móvel simples via soma de senos modulando o ruído filtrado
    x = t(d)
    fc = f0 + (f1 - f0) * (x / d)
    phase = 2 * np.pi * np.cumsum(fc) / SR
    y = np.convolve(noise, np.ones(24) / 24, mode="same") * (0.6 + 0.4 * np.sin(phase))
    env = np.sin(np.pi * np.clip(x / d, 0, 1)) ** 1.5
    return amp * y * env

def seq(parts, d):
    out = np.zeros(int(SR * d))
    for at, sig in parts:
        i = int(SR * at)
        j = min(len(out), i + len(sig))
        out[i:j] += sig[: j - i]
    return out

def slide(f0, f1, d, decay=4):
    x = t(d)
    f = f0 * (f1 / f0) ** (x / d)
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-decay * x) * np.minimum(1, x / 0.005)

def save(name, mono, pan=0.0, gain=0.5):
    m = mono / (np.max(np.abs(mono)) + 1e-9) * gain
    fade = int(SR * 0.01)
    m[-fade:] *= np.linspace(1, 0, fade)
    l = m * (1 - max(0, pan)); r = m * (1 + min(0, pan))
    # leve abertura estéreo: atraso de 0,4 ms num canal
    r = np.concatenate([np.zeros(19), r[:-19]])
    data = (np.stack([l, r], 1) * 32767).astype("<i2")
    with wave.open(os.path.join(OUT, name + ".wav"), "wb") as w:
        w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes(data.tobytes())

os.makedirs(OUT, exist_ok=True)
save("approval", seq([(0, bell(D["A"], 0.9)), (0.14, bell(D["D2"], 0.75)), (0.28, bell(D["F#2"], 0.6))], 0.9))
save("approve", seq([(0, bell(D["D2"], 0.6, 6)), (0.08, bell(D["A2"], 0.52, 6))], 0.6))
save("attach", seq([(0, wind(0.5, 400, 1800, 0.4)), (0.42, bell(D["B"], 0.48, 7))], 0.9))
save("blip", glass(D["A2"], 0.1), gain=0.35)
save("close", seq([(0, wind(0.25, 1800, 500, 0.5)), (0.12, glass(D["D"], 0.3))], 0.43))
save("dizzy", seq([(i * 0.11, bell(D[n], 0.4, 9)) for i, n in enumerate(["B2", "F#2", "D2", "A", "F#", "E", "D"])], 0.98))
save("error", seq([(0, bell(D["D0"] * 2, 0.84, 4, 0.9) + 0.5 * bell(D["D0"] * 2 * 1.06, 0.84, 4, 0.9))], 0.84))
save("finish", seq([(0, bell(D["D"], 1.1)), (0.12, bell(D["F#"], 1.0)), (0.24, bell(D["A"], 0.9)), (0.36, bell(D["D2"], 0.8, 3.5))], 1.16))
save("greet", seq([(0, bell(D["A"], 0.6)), (0.15, bell(D["D2"], 0.6))], 0.75))
save("greeting", seq([(0, wind(2.0, 300, 1500, 0.25))] + [(0.4 + i * 0.32, bell(D[n], 1.6, 2.6)) for i, n in enumerate(["D", "E", "F#", "A", "B", "D2", "E2", "F#2", "A2"])], 4.17))
save("gulp", seq([(0, slide(520, 180, 0.35, 6)), (0.3, glass(D["D"], 0.2))], 0.75))
save("hover", glass(D["D3"], 0.08), gain=0.25)
save("love", seq([(0, bell(D["F#"], 0.7)), (0.12, bell(D["A"], 0.65)), (0.24, bell(D["F#2"], 0.55))], 0.79))
save("open", seq([(0, wind(0.3, 500, 2200, 0.5)), (0.2, glass(D["A2"], 0.3))], 0.5))
save("peek", seq([(0, glass(D["E2"], 0.2)), (0.16, glass(D["A2"], 0.29))], 0.45), gain=0.4)
save("pop", seq([(0, slide(380, 900, 0.12, 20)), (0.05, glass(D["D3"], 0.3))], 0.38))
save("proud", seq([(0, bell(D["D"], 0.86)), (0.1, bell(D["A"], 0.76)), (0.2, bell(D["D2"], 0.66)), (0.3, bell(D["A2"], 0.56))], 0.86))
save("question", seq([(0, bell(D["A"], 0.5, 6)), (0.2, bell(D["B"], 0.5, 6))], 0.7))
save("rate", seq([(0, bell(D["E"], 0.67, 5)), (0.2, bell(D["D"], 0.47, 5))], 0.67))
save("search", seq([(0, wind(0.46, 900, 2600, 0.6))], 0.46))
save("send", seq([(0, wind(0.4, 700, 3000, 0.5)), (0.1, slide(600, 1400, 0.3, 8))], 0.48))
save("slap", seq([(0, wind(0.06, 3000, 3000, 1.0)), (0.02, bell(D["D0"] * 2, 0.55, 9, 0.3))], 0.6))
save("sleep", seq([(0, wind(0.45, 600, 250, 0.5))], 0.45), gain=0.35)
save("think", seq([(0, glass(D["F#2"], 0.2)), (0.14, glass(D["A2"], 0.2)), (0.28, glass(D["F#2"], 0.16))], 0.44), gain=0.35)
save("tick", glass(D["D3"] * 1.5, 0.07), gain=0.3)
save("wink", seq([(0, glass(D["B2"], 0.21))], 0.21), gain=0.4)
save("work", seq([(0, glass(D["D2"], 0.15)), (0.12, glass(D["E2"], 0.15)), (0.24, glass(D["A2"], 0.14))], 0.38), gain=0.35)
save("yawn", seq([(0, slide(500, 260, 0.73, 2.5) * 0.6 + wind(0.73, 400, 300, 0.2))], 0.73))
save("annoyed", seq([(0, bell(D["E"], 0.3, 8)), (0.18, bell(D["D"], 0.4, 8))], 0.59))
print("ok", len(os.listdir(OUT)))
