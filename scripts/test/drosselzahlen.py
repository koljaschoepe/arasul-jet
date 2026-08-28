#!/usr/bin/env python3
"""Die Drosseln des Geraets stehen an drei Stellen, und alle drei sagen dasselbe.

Das Backend legt sie fest (`middleware/rateLimit.js`: Fenster und Zahl je
Limiter). Die Abnahmen muessen sie kennen, um VOR dem Handgriff zu warten statt
an einem 429 rot zu werden, und zwar zweimal: einmal fuer den Browser
(`scripts/test/drossel.mjs`, `DROSSELN`) und einmal fuer curl
(`scripts/test/anmeldung.sh`, der Python-Block in `_arasul_drossel_py`). Ein
Shell-Skript kann kein Node-Modul laden, also stehen die Zahlen zweimal.

Zwei Kopien einer Zahl driften. Der Auftrag vom 28.08.2026 hat es vorgemacht:
der abgebrochene Vorgaenger NANNTE die drei Drosseln, und die Anweisung war,
sie im Code nachzupruefen, statt sie zu glauben. Genau das tut diese Datei bei
jedem Zug: sie liest die Zahlen aus `rateLimit.js` und vergleicht sie mit den
beiden Kopien in den Abnahmen. Faellt eine Aenderung im Backend, faellt hier
die CI, und nicht erst eine Abnahme am Geraet.

Aufruf: python3 scripts/test/drosselzahlen.py [--wurzel PFAD]
Rueckgabe 0, wenn alle drei Stellen dieselben Zahlen tragen.
"""

from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

# Welcher Limiter im Backend welche Drossel der Abnahmen ist.
LIMITER = {
    "anmeldung": "loginLimiter",
    "auth": "generalAuthLimiter",
    "sitzung": "sessionProbeLimiter",
}


def backend(wurzel: Path) -> dict[str, tuple[int, int]]:
    """(max, windowMs) je Drossel, aus `createLimiter(name, windowMs, max, ...)`."""
    quelle = (wurzel / "apps/dashboard-backend/src/middleware/rateLimit.js").read_text(
        encoding="utf-8"
    )
    stand: dict[str, tuple[int, int]] = {}
    for name, limiter in LIMITER.items():
        m = re.search(
            rf"const {limiter} = createLimiter\(\s*'[^']*',\s*([^,]+),\s*(\d+),", quelle
        )
        if not m:
            raise SystemExit(f"rateLimit.js: {limiter} nicht gefunden")
        fenster = eval(m.group(1), {"__builtins__": {}}, {})  # noqa: S307, nur Zahlen und `*`
        stand[name] = (int(m.group(2)), int(fenster))
    return stand


def browser(wurzel: Path) -> dict[str, tuple[int, int]]:
    """Aus `DROSSELN = { anmeldung: { grenze: 10, fensterMs: 15 * 60 * 1000, ... } }`."""
    quelle = (wurzel / "scripts/test/drossel.mjs").read_text(encoding="utf-8")
    stand: dict[str, tuple[int, int]] = {}
    for name in LIMITER:
        m = re.search(rf"{name}: \{{\s*grenze: (\d+),\s*fensterMs: ([^,]+),", quelle)
        if not m:
            raise SystemExit(f"drossel.mjs: Drossel {name} nicht gefunden")
        stand[name] = (int(m.group(1)), int(eval(m.group(2), {"__builtins__": {}}, {})))  # noqa: S307
    return stand


def curl(wurzel: Path) -> dict[str, tuple[int, int]]:
    """Aus dem Python-Block in anmeldung.sh: `"anmeldung": (10, 15 * 60 * 1000),`."""
    quelle = (wurzel / "scripts/test/anmeldung.sh").read_text(encoding="utf-8")
    stand: dict[str, tuple[int, int]] = {}
    for name in LIMITER:
        m = re.search(rf'"{name}": \((\d+), ([^)]+)\)', quelle)
        if not m:
            raise SystemExit(f"anmeldung.sh: Drossel {name} nicht gefunden")
        stand[name] = (int(m.group(1)), int(eval(m.group(2), {"__builtins__": {}}, {})))  # noqa: S307
    return stand


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--wurzel", default=Path(__file__).resolve().parents[2], type=Path)
    args = parser.parse_args()

    soll = backend(args.wurzel)
    fehler = 0
    for ort, ist in (("drossel.mjs", browser(args.wurzel)), ("anmeldung.sh", curl(args.wurzel))):
        for name, (grenze, fenster) in soll.items():
            if ist[name] != (grenze, fenster):
                print(
                    f"FEHLT  {ort}: {name} hat {ist[name][0]} je {ist[name][1]} ms, "
                    f"rateLimit.js sagt {grenze} je {fenster} ms"
                )
                fehler += 1
    if fehler:
        return 1
    zeilen = ", ".join(f"{n} {g} je {f // 1000} s" for n, (g, f) in soll.items())
    print(f"OK  drei Drosseln, drei Stellen, dieselben Zahlen ({zeilen})")
    return 0


if __name__ == "__main__":
    sys.exit(main())
