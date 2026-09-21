#!/usr/bin/env python3
"""Testordner fuer die Messung J33: 2.000 Dateien, festes Saatkorn.

Profil nach dem gezaehlten Bestand aus Experiment 010 (UNIT IX: 1.951 Dateien
in 753 Ordnern, fast nur Text): 1.700 kleine Textdateien (2-16 KB), 250
mittlere (64-256 KB), 50 grosse (1-4 MB), verteilt auf 200 Ordner in drei
Ebenen unter zwei Wurzeln (`Projekte/`, `Prozesse/`). Dazu -- NICHT
mitgezaehlt -- was ein Abgleich auslassen soll (`.git/`, `node_modules/`) und
was er mitnehmen MUSS, obwohl es mit einem Punkt anfaengt (`.claude/`).

Aufruf: testordner.py <ziel> [--ohne-ballast]
"""
import os
import random
import sys

ziel = sys.argv[1]
ballast = "--ohne-ballast" not in sys.argv
r = random.Random(33)

ordner = []
for wurzel, n in (("Projekte", 14), ("Prozesse", 6)):
    for i in range(n):
        for j in range(10):
            ordner.append(f"{wurzel}/{wurzel[:4].lower()}-{i:02d}/teil-{j}")
assert len(ordner) == 200

groessen = (
    [r.randint(2_000, 16_000) for _ in range(1700)]
    + [r.randint(64_000, 256_000) for _ in range(250)]
    + [r.randint(1_000_000, 4_000_000) for _ in range(50)]
)
r.shuffle(groessen)


def schreibe(pfad, groesse):
    os.makedirs(os.path.dirname(pfad), exist_ok=True)
    with open(pfad, "wb") as f:
        f.write(r.randbytes(groesse))


summe = 0
for k, g in enumerate(groessen):
    endung = "md" if g < 64_000 else ("pdf" if g < 1_000_000 else "bin")
    schreibe(os.path.join(ziel, ordner[k % 200], f"datei-{k:04d}.{endung}"), g)
    summe += g

if ballast:
    for k in range(50):
        schreibe(os.path.join(ziel, "Projekte/proj-00/.git/objects", f"{k:02x}", "objekt"), 4_000)
    schreibe(os.path.join(ziel, "Projekte/proj-00/.git/HEAD"), 40)
    for k in range(300):
        schreibe(os.path.join(ziel, "Projekte/proj-00/node_modules", f"paket-{k % 30}", f"index-{k}.js"), 3_000)
    schreibe(os.path.join(ziel, ".claude/skills/beispiel/SKILL.md"), 2_000)
    schreibe(os.path.join(ziel, "Projekte/proj-00/.claude/settings.json"), 300)

print(f"{len(groessen)} Dateien, {summe / 1e6:.1f} MB, {len(ordner)} Ordner; Ballast: {ballast}")
