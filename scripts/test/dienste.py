#!/usr/bin/env python3
"""Jeder Dienst des Compose faehrt beim Bootstrap wirklich hoch.

DER FEHLER, GEGEN DEN DIESE DATEI STEHT (28.08.2026, Werksreset am Orin fuer
Phase G1): `backup-service` war im Compose definiert, sein Image war gebaut --
und der Container war nie angelegt. Ein frisch installiertes Geraet kam ohne
Sicherung hoch: kein naechtliches Backup, kein Wiederherstellungstest, eine
Ansicht "Sicherung", die leer bleibt. Aufgefallen ist es erst, als Abnahme A6
keinen Gegenstand hatte -- und das ist der Verlust einer der drei Sachen, die
die Lizenz kauft.

Die Ursache war eine Liste, die von Hand gepflegt wird. Der Dienst stand im
Kopf von `docker-compose.yml` (Schicht 6), in `scripts/system/ordered-startup.sh`
(PHASE4) und in `scripts/test/dauerlauf-bericht.sh` (Soll-Dienste) -- nur in
`start_services()` in `arasul` nicht, also in genau der Liste, die den Bootstrap
STEUERT. Drei richtige Kopien halten eine falsche nicht auf.

WAS HIER GEPRUEFT WIRD, dreierlei:

  1. START. Jeder Dienst ohne `profiles:` faehrt beim Bootstrap hoch -- entweder
     weil `start_services()` ihn nennt, oder weil ein Dienst, der hochfaehrt,
     ihn per `depends_on` mitzieht (so kommt `docker-proxy` hoch, ohne je
     genannt zu werden). Gerechnet wird die Huelle, nicht die Liste: sonst
     waere `docker-proxy` ein falscher Alarm und `backup-service` -- den zieht
     niemand mit -- waere durchgerutscht.
  2. BAU. Jeder Dienst mit `build:` steht in der Liste von `build_images()`.
     Fehlt er dort, baut ihn `docker compose up` spaeter unsichtbar mit; der
     Bootstrap meldet dann Minuten nichts und sieht aus wie haengend.
  3. DAUERLAUF. Die Soll-Dienste in `dauerlauf-bericht.sh` sind genau die
     Dienste ohne Profil. Was nicht in dieser Liste steht, kann sieben Tage
     lang tot sein, ohne dass der Bericht es meldet.

`profiles:` ist die Ausnahme und bleibt eine: `cloudflared` faehrt nur mit
`--profile tunnel` und soll beim Bootstrap gerade NICHT hochkommen.

Aufruf: python3 scripts/test/dienste.py [--wurzel PFAD]
Rueckgabe 0, wenn jeder Dienst gebaut, gestartet und ueberwacht wird.
"""

from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path


def compose_lesen(datei: Path) -> dict[str, dict]:
    """Dienste einer Compose-Datei: Name -> {build, profil, depends_on}.

    Ein Parser fuer genau die Form, die diese Dateien haben (Dienste auf zwei,
    ihre Schluessel auf vier Leerzeichen), und kein YAML-Modul: die
    Waechter-Reihe der CI laeuft ohne `pip install`, und ein Waechter, der an
    einer fehlenden Abhaengigkeit scheitert, ist keiner.
    """
    dienste: dict[str, dict] = {}
    in_services = False
    name: str | None = None
    schluessel: str | None = None
    for zeile in datei.read_text(encoding="utf-8").splitlines():
        if not zeile.strip() or zeile.lstrip().startswith("#"):
            continue
        if re.match(r"^\S", zeile):
            in_services = zeile.startswith("services:")
            name = schluessel = None
            continue
        if not in_services:
            continue
        einzug = len(zeile) - len(zeile.lstrip())
        if einzug == 2 and zeile.rstrip().endswith(":"):
            name = zeile.strip().rstrip(":")
            schluessel = None
            dienste.setdefault(name, {"build": False, "profil": False, "depends_on": set()})
        elif einzug == 4 and name:
            schluessel = zeile.strip().split(":", 1)[0]
            if schluessel == "build":
                dienste[name]["build"] = True
            elif schluessel == "profiles":
                dienste[name]["profil"] = True
        elif einzug >= 6 and name and schluessel == "depends_on":
            # Beide Formen: `- postgres-db` und `postgres-db:` mit `condition:`.
            eintrag = zeile.strip()
            if eintrag.startswith("- "):
                dienste[name]["depends_on"].add(eintrag[2:].strip())
            elif einzug == 6 and eintrag.endswith(":"):
                dienste[name]["depends_on"].add(eintrag.rstrip(":"))
    return dienste


def compose(wurzel: Path) -> dict[str, dict]:
    """Alle Compose-Dateien zusammengelegt, wie `include` sie zusammenlegt."""
    gesamt: dict[str, dict] = {}
    for datei in sorted((wurzel / "compose").glob("compose.*.yaml")):
        for name, stand in compose_lesen(datei).items():
            if name in gesamt:
                # `compose.secrets.yaml` ergaenzt bestehende Dienste; sie
                # ueberschreibt nichts, also wird nur dazugelegt.
                gesamt[name]["build"] |= stand["build"]
                gesamt[name]["profil"] |= stand["profil"]
                gesamt[name]["depends_on"] |= stand["depends_on"]
            else:
                gesamt[name] = stand
    if not gesamt:
        raise SystemExit("compose/: keine Dienste gefunden")
    return gesamt


def block(quelle: str, funktion: str) -> str:
    """Der Rumpf einer Shell-Funktion, von `name() {` bis zur Zeile `}`."""
    m = re.search(rf"^{re.escape(funktion)}\(\) \{{$(.*?)^\}}$", quelle, re.S | re.M)
    if not m:
        raise SystemExit(f"arasul: Funktion {funktion}() nicht gefunden")
    return m.group(1)


def genannt(rumpf: str, muster: str) -> set[str]:
    """Alle Dienstnamen aus den Zeilen, die auf `muster` passen."""
    namen: set[str] = set()
    for zeile in rumpf.splitlines():
        zeile = zeile.split("#", 1)[0].strip()
        m = re.search(muster, zeile)
        if m:
            namen.update(w for w in m.group(1).split() if not w.startswith("-"))
    return namen


def huelle(start: set[str], dienste: dict[str, dict]) -> set[str]:
    """Was hochfaehrt: die genannten Dienste plus alles, was sie mitziehen."""
    offen = list(start)
    erreicht = set(start)
    while offen:
        for weiter in dienste.get(offen.pop(), {}).get("depends_on", ()):
            if weiter not in erreicht:
                erreicht.add(weiter)
                offen.append(weiter)
    return erreicht


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--wurzel", default=Path(__file__).resolve().parents[2], type=Path)
    args = parser.parse_args()

    dienste = compose(args.wurzel)
    soll = {n for n, s in dienste.items() if not s["profil"]}
    zu_bauen = {n for n in soll if dienste[n]["build"]}

    arasul = (args.wurzel / "arasul").read_text(encoding="utf-8")
    gestartet = genannt(block(arasul, "start_services"), r"docker compose up -d (.+)$")
    gebaut = genannt(block(arasul, "build_images"), r"docker compose build --parallel (.+?) 2>&1")

    fehler = 0

    fehlt = sorted(soll - huelle(gestartet, dienste))
    for name in fehlt:
        print(f"FEHLT  arasul start_services(): {name} faehrt beim Bootstrap nie hoch")
        fehler += 1

    for name in sorted(zu_bauen - gebaut):
        print(f"FEHLT  arasul build_images(): {name} hat build:, wird aber nicht gebaut")
        fehler += 1

    bericht = (args.wurzel / "scripts/test/dauerlauf-bericht.sh").read_text(encoding="utf-8")
    m = re.search(r'^SOLL_DIENSTE="([^"]*)"', bericht, re.M)
    if not m:
        raise SystemExit("dauerlauf-bericht.sh: SOLL_DIENSTE nicht gefunden")
    ueberwacht = set(m.group(1).split())
    for name in sorted(soll - ueberwacht):
        print(f"FEHLT  dauerlauf-bericht.sh SOLL_DIENSTE: {name}")
        fehler += 1
    for name in sorted(ueberwacht - soll):
        print(f"ZUVIEL dauerlauf-bericht.sh SOLL_DIENSTE: {name} gibt es im Compose nicht")
        fehler += 1

    if fehler:
        return 1
    print(
        f"OK  {len(soll)} Dienste ohne Profil: alle gestartet, "
        f"{len(zu_bauen)} davon gebaut, alle im Dauerlauf-Bericht"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
