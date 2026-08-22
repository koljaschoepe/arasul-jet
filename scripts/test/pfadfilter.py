#!/usr/bin/env python3
"""Prueft den Pfadfilter der CI gegen die Dockerfiles (aus der Review von #454).

Warum es diesen Waechter gibt
-----------------------------
`.github/workflows/test.yml` entscheidet seit dem 21.08.2026 mit einem
Ausdruck, ob die fuenf Docker-Bauten noetig sind. Beim ersten Entwurf fehlten
`packages/` und `libs/` darin, obwohl die Dockerfiles
`packages/shared-schemas` und `libs/shared-python/structured_logging.py`
hineinkopieren. Eine Aenderung nur dort haette den Bau still uebersprungen, und
genau diese Sorte Loch hatte dieselbe Datei schon zweimal.

Was geprueft wird
-----------------
1. **Jeder Quellpfad, den eines der GEBAUTEN Images hereinkopiert, muss den Bau
   ausloesen.** Welche Images gebaut werden, steht in der Matrix des Jobs
   `docker-build`; die Liste wird von dort ABGELEITET, nicht abgeschrieben. Wer
   morgen ein Image ergaenzt oder ein neues Verzeichnis hereinkopiert, ohne den
   Filter zu erweitern, macht diesen Waechter rot, statt es erst am kaputten
   Image zu merken. Dockerfiles, die diese CI gar nicht baut, bleiben aussen
   vor: sie haben ihren eigenen Kontext, und ihre COPY-Zeilen sind relativ dazu.
2. **Reine Dokumentation loest nicht aus.** Sonst waere der Filter wirkungslos.
3. **Der Ausdruck ist ueberhaupt auffindbar.** Wird der Job umgebaut oder
   umbenannt, meldet sich der Waechter, statt stillschweigend nichts zu pruefen.

Mehrzeilige COPY-Anweisungen
---------------------------
Ein `COPY` mit `\\` am Zeilenende wird zusammengezogen, bevor es gelesen wird.
Ohne das haette der Waechter die Fortsetzungszeilen still uebergangen und
weniger Kopierquellen gemeldet, statt einen Fehler zu werfen.

Was NICHT geprueft wird
-----------------------
Ob der Filter zu oft baut. Er faellt bewusst offen aus, das kostet Zeit und
niemals Richtigkeit. Dazu gehoert auch, dass die CI bei einem PR mit zwei
Punkten vergleicht statt mit dem Verschmelzungspunkt: waechst `main` waehrend
der PR laeuft, stehen fremde Dateien in der Liste und es wird zu viel gebaut.
Nie zu wenig.

Aufruf
------
    python3 scripts/test/pfadfilter.py [--pfad <wurzel>]

Rueckgabe 1, wenn etwas fehlt. Laeuft im guards-Job mit.
"""
import argparse
import pathlib
import re
import subprocess
import sys

WORKFLOW = ".github/workflows/test.yml"
# Pfade, die keinen Bau ausloesen duerfen. Ohne sie waere der Filter wirkungslos.
NICHT_BAUEN = [
    "docs/plans/active/023-feature-audit/plan.md",
    "README.md",
    "CLAUDE.md",
    ".claude/settings.json",
    "LICENSE",
]


def ausdruck_lesen(wurzel):
    """Holt den grep-Ausdruck aus dem Workflow, statt ihn hier zu wiederholen."""
    datei = wurzel / WORKFLOW
    if not datei.exists():
        return None, f"{WORKFLOW} fehlt"
    text = datei.read_text(encoding="utf-8")
    # Nur im Job `changes` suchen. Vorher stand hier eine Suche ueber die ganze
    # Datei: ein zweiter `grep -qE` in einem anderen Job haette den Waechter
    # still gegen den falschen Ausdruck pruefen lassen. Aus der Review von #454.
    anfang = text.find("\n  changes:")
    if anfang < 0:
        return None, (
            f"In {WORKFLOW} gibt es keinen Job `changes`. Der Pfadfilter wurde "
            "umgebaut oder entfernt; dieser Waechter kann dann nichts pruefen."
        )
    rest = text[anfang + 1:]
    weiter = re.search(r"\n  [A-Za-z0-9_-]+:", rest)
    block = rest[: weiter.start()] if weiter else rest
    treffer = re.search(r"grep -qE '([^']+)'", block)
    if not treffer:
        return None, (
            f"Im Job `changes` von {WORKFLOW} steht kein `grep -qE '...'`. "
            "Der Filter wurde umgebaut oder entfernt. Dieser Waechter kann dann "
            "nichts pruefen und meldet deshalb einen Fehler statt Ruhe."
        )
    return treffer.group(1), None


def gebaute_dockerfiles(wurzel):
    """Die Dockerfiles aus der Matrix des Jobs docker-build, mit ihrem Kontext.

    Bewusst ohne PyYAML: der guards-Job richtet kein Python ein und benutzt das
    des Laeufers. Eine Abhaengigkeit, die dort zufaellig da ist, ist keine.
    """
    text = (wurzel / WORKFLOW).read_text(encoding="utf-8")
    anfang = text.find("\n  docker-build:")
    if anfang < 0:
        return None
    rest = text[anfang + 1:]
    naechster = re.search(r"\n  [A-Za-z0-9_-]+:", rest)
    block = rest[: naechster.start()] if naechster else rest

    aus = []
    for eintrag in block.split("- name:")[1:]:
        datei = re.search(r"dockerfile:\s*(\S+)", eintrag)
        if not datei:
            continue
        kontext = re.search(r"context:\s*(\S+)", eintrag)
        aus.append((datei.group(1), kontext.group(1) if kontext else "."))
    return aus


def logische_zeilen(text):
    """Zeilen eines Dockerfiles, Fortsetzungen mit `\\` am Ende zusammengezogen.

    Aus der Review von #454: eine mehrzeilige COPY-Anweisung haette der Waechter
    sonst nur bis zur ersten Zeile gelesen und den Rest STILL uebergangen. Das
    waere genau die Fehlerklasse gewesen, gegen die er gebaut ist, eine Ebene
    tiefer. Heute hat kein gebautes Dockerfile eine solche Zeile, morgen kann
    das jemand schreiben, ohne an diesen Waechter zu denken.
    """
    aus, puffer = [], ""
    for zeile in text.splitlines():
        blank = zeile.strip()
        if blank.endswith("\\"):
            puffer += blank[:-1].rstrip() + " "
            continue
        aus.append((puffer + blank).strip())
        puffer = ""
    if puffer:
        aus.append(puffer.strip())
    return aus


def kopierquellen(wurzel, dockerfiles):
    """Quellpfade aus den COPY-Zeilen der gebauten Images, bezogen auf den Kontext."""
    quellen = set()
    for name, kontext in dockerfiles:
        pfad = wurzel / name
        if not pfad.exists():
            quellen.add(f"!!fehlt:{name}")
            continue
        vorsatz = "" if kontext in (".", "./", None) else kontext.rstrip("/") + "/"
        for zeile in logische_zeilen(pfad.read_text(encoding="utf-8")):
            zeile = zeile.strip()
            gross = zeile.upper()
            # ADD zaehlt mit. Es kopiert genauso aus dem Kontext, nur mit
            # Zusatzfunktionen, und waere sonst die eine Anweisung, die am
            # Waechter vorbeikommt. Aus der Review von #454.
            if not (gross.startswith("COPY ") or gross.startswith("ADD ")):
                continue
            teile = zeile.split()[1:]
            # ADD von einer URL oder einem git-Verweis holt nichts aus dem Repo.
            if gross.startswith("ADD ") and any(
                t.startswith(("http://", "https://", "git@")) for t in teile
            ):
                continue
            # --from=builder kopiert aus einer frueheren Stufe, nicht aus dem Repo
            if any(t.startswith("--from=") for t in teile):
                continue
            teile = [t for t in teile if not t.startswith("--")]
            for quelle in teile[:-1]:            # das letzte ist das Ziel
                if quelle.startswith("/"):
                    continue
                # `lstrip("./")` entfernt eine ZEICHENMENGE, keinen Praefix.
                # `COPY . .` waere damit zu "" geworden und weiter unten still
                # weggefallen, `.npmrc` zu "npmrc". Beides Loecher der Sorte,
                # gegen die dieses Skript gebaut ist. Aus der Review von #454.
                quelle = quelle.removeprefix("./").rstrip("/")
                if quelle in ("", "."):
                    # Der ganze Kontext wird kopiert. Dann deckt kein Filter der
                    # Welt das ab, und Schweigen waere hier das Schlimmste.
                    quellen.add("!!ganzerkontext:" + name)
                    continue
                quellen.add(vorsatz + quelle)
    return sorted(q for q in quellen if q)


def passt(ausdruck, pfad):
    """Bewusst mit grep geprueft, damit hier dieselbe Maschine urteilt wie in der CI."""
    lauf = subprocess.run(["grep", "-qE", ausdruck], input=pfad + "\n",
                          text=True, capture_output=True)
    return lauf.returncode == 0


def main():
    zerleger = argparse.ArgumentParser()
    zerleger.add_argument("--pfad", default=".")
    args = zerleger.parse_args()
    wurzel = pathlib.Path(args.pfad).resolve()

    ausdruck, fehlermeldung = ausdruck_lesen(wurzel)
    if fehlermeldung:
        print(f"FEHLER: {fehlermeldung}")
        return 1

    fehler = []

    dockerfiles = gebaute_dockerfiles(wurzel)
    if not dockerfiles:
        print("FEHLER: der Job 'docker-build' oder seine Matrix ist nicht auffindbar. "
              "Dieser Waechter kann dann nichts pruefen.")
        return 1

    quellen = kopierquellen(wurzel, dockerfiles)
    fehlend = [q[len("!!fehlt:"):] for q in quellen if q.startswith("!!fehlt:")]
    ganzer = [q[len("!!ganzerkontext:"):] for q in quellen if q.startswith("!!ganzerkontext:")]
    quellen = [q for q in quellen if not q.startswith("!!")]
    if ganzer:
        print("FEHLER: diese Dockerfiles kopieren den GANZEN Kontext (`COPY . .`): "
              + ", ".join(ganzer)
              + "\n       Damit kann jede Datei im Repo das Image aendern und der "
                "Pfadfilter\n       ist nicht mehr zu rechtfertigen. Entweder das "
                "Dockerfile enger fassen\n       oder den Filter fuer dieses Image "
                "aufgeben.")
        return 1
    if fehlend:
        print("FEHLER: in der Matrix steht ein Dockerfile, das es nicht gibt: "
              + ", ".join(fehlend))
        return 1
    if not quellen:
        print("FEHLER: kein einziges COPY in den gebauten Dockerfiles, das kann nicht stimmen")
        return 1
    for quelle in quellen:
        if not passt(ausdruck, quelle):
            fehler.append(
                f"  {quelle}\n"
                f"      wird in ein Image kopiert, loest aber keinen Bau aus. "
                f"Eine Aenderung dort ginge ungeprueft durch."
            )

    for pfad in NICHT_BAUEN:
        if passt(ausdruck, pfad):
            fehler.append(
                f"  {pfad}\n"
                f"      loest einen Bau aus, obwohl es kein Image beruehrt. "
                f"Der Filter spart dann nichts."
            )

    print(f"Ausdruck aus {WORKFLOW}:\n  {ausdruck}\n")
    print(f"Geprueft: {len(quellen)} Kopierquellen aus {len(dockerfiles)} gebauten "
          f"Images, {len(NICHT_BAUEN)} Gegenbeispiele.")
    if fehler:
        print(f"\n{len(fehler)} Befund(e):")
        for f in fehler:
            print(f)
        return 1
    print("Der Pfadfilter deckt jede Kopierquelle ab und laesst Dokumentation durch.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
