#!/usr/bin/env python3
"""Optional dev placeholders: writes `consume-eat.wav` / `consume-drink.wav` only.

**Shipped assets:** copy Broth `public/sounds/eating_food.mp3` →
`apps/client/public/audio/ui/consume-eat.mp3` and `drinking_water.mp3` → `consume-drink.mp3`.

For **consume** stems the client tries **mp3 → ogg → wav** (authored clips first). Other UI
stems (e.g. item-pick) still use **wav → ogg → mp3**; remove stray `.wav` placeholders beside MP3
consume assets or the WAV can win on those code paths that use the default order."""

from __future__ import annotations

import math
import random
import struct
import wave
from pathlib import Path

SR = 44100
ROOT = Path(__file__).resolve().parents[2]
OUT_DIR = ROOT / "apps" / "client" / "public" / "audio" / "ui"


def write_wav16(path: Path, samples: list[float]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with wave.open(str(path), "w") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        for s in samples:
            v = int(max(-32767, min(32767, s)))
            w.writeframes(struct.pack("<h", v))


def soft_clip(x: float, drive: float = 0.82) -> float:
    return 32767.0 * math.tanh((x * drive) / 8500.0)


def gen_eat() -> list[float]:
    rng = random.Random(42)
    n = int(0.15 * SR)
    out: list[float] = []
    for i in range(n):
        t = i / SR
        env = math.exp(-t * 24.0)
        crack = (rng.random() * 2.0 - 1.0) * 5600.0 * env
        thump = math.sin(2 * math.pi * 88.0 * t) * 4200.0 * math.exp(-t * 58.0)
        chip = math.sin(2 * math.pi * (2100.0 - 9000.0 * t) * t) * 520.0 * env
        s = crack + thump * (1.0 if t < 0.035 else 0.22) + chip
        out.append(soft_clip(s))
    return out


def gen_drink() -> list[float]:
    rng = random.Random(7)
    n = int(0.26 * SR)
    out: list[float] = []
    for i in range(n):
        t = i / SR
        rise = 1.0 - math.exp(-t * 22.0)
        fall = math.exp(-max(0.0, t - 0.06) * 4.8)
        env = rise * fall
        swish = (rng.random() * 2.0 - 1.0) * 2400.0 * env
        glug = math.sin(2 * math.pi * (125.0 + 35.0 * math.sin(t * 26.0)) * t) * 1250.0 * env
        s = swish + glug
        out.append(soft_clip(s, drive=0.78))
    return out


def main() -> None:
    write_wav16(OUT_DIR / "consume-eat.wav", gen_eat())
    write_wav16(OUT_DIR / "consume-drink.wav", gen_drink())
    print(f"Wrote {OUT_DIR / 'consume-eat.wav'}")
    print(f"Wrote {OUT_DIR / 'consume-drink.wav'}")


if __name__ == "__main__":
    main()
