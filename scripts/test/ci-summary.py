#!/usr/bin/env python3
"""Genau ein „CI Summary", und es wartet auf jeden Job.

Warum es diese Pruefung gibt: am 25.09.2026 mergte `gh pr merge --auto` den
PR #774 zwanzig Sekunden nach dem Einschalten. Der PR aenderte Doku UND Code,
also liefen zwei Workflows, und beide meldeten einen Check namens
„CI Summary" — der echte aus `test.yml` und ein leerer aus `doku-summary.yml`,
der nach 2 Sekunden gruen war. Das Ruleset auf main kennt nur den NAMEN des
Pflicht-Checks, und der leere genuegte ihm. Im echten Lauf wurden Knip und
Guards rot; main war rot bis #775. Der Kopf von `doku-summary.yml` hatte den
Fall einen Monat vorher benannt und als „ungeprueft" stehen lassen.

Geprueft wird deshalb, ohne PyYAML (der guards-Job richtet kein Python ein):

1. Unter `.github/workflows/` traegt genau EIN Job den Namen „CI Summary",
   und zwar in `test.yml`.
2. `test.yml` hat am Ausloeser weder `paths` noch `paths-ignore`. Ein
   uebersprungener Workflow liefert keinen Pflicht-Check, und das Ruleset
   wartet dann fuer immer (#697) — der alte Ausweg dafuer war genau der
   zweite Workflow.
3. Der Job `ci-summary` laeuft mit `if: always()`, nennt in `needs` JEDEN
   anderen Job der Datei und liest in seiner Liste `ERGEBNISSE` jedes
   Ergebnis. Ein Job, der dort fehlt, kann rot werden, ohne dass es jemand
   merkt — zweimal passiert (python-services, guards), bevor es die Liste gab.

Aufruf
------
    python3 scripts/test/ci-summary.py [--pfad <wurzel>]

Rueckgabe 1 bei einem Befund. Laeuft im guards-Job und in run-tests.sh.
"""
import argparse
import pathlib
import re
import sys

NAME = "CI Summary"
WORKFLOW = ".github/workflows/test.yml"
JOB = "ci-summary"


def jobs_lesen(text):
    """Job-Kennung -> Textblock des Jobs, aus dem Abschnitt `jobs:`."""
    anfang = re.search(r"^jobs:\s*$", text, re.M)
    if not anfang:
        return {}
    rest = text[anfang.end():]
    koepfe = list(re.finditer(r"^  ([A-Za-z0-9_-]+):\s*$", rest, re.M))
    bloecke = {}
    for i, kopf in enumerate(koepfe):
        ende = koepfe[i + 1].start() if i + 1 < len(koepfe) else len(rest)
        bloecke[kopf.group(1)] = rest[kopf.start():ende]
    return bloecke


def ausloeser_lesen(text):
    anfang = re.search(r"^on:\s*$", text, re.M)
    if not anfang:
        return ""
    rest = text[anfang.end():]
    ende = re.search(r"^\S", rest, re.M)
    return rest[: ende.start()] if ende else rest


def needs_lesen(block):
    """Die Liste unter `needs:`, einzeilig, als Folge oder in Klammern."""
    treffer = re.search(r"^    needs:(.*?)(?=^    [A-Za-z_-]+:)", block, re.M | re.S)
    if not treffer:
        return set()
    roh = treffer.group(1)
    roh = re.sub(r"#.*", "", roh)
    return set(re.findall(r"[A-Za-z0-9_-]+", roh))


def pruefen(wurzel):
    befunde = []
    ordner = wurzel / ".github" / "workflows"
    tragen = []
    for datei in sorted(list(ordner.glob("*.yml")) + list(ordner.glob("*.yaml"))):
        for nr, zeile in enumerate(datei.read_text(encoding="utf-8").splitlines(), 1):
            if re.match(rf"^\s+name:\s*['\"]?{re.escape(NAME)}['\"]?\s*$", zeile):
                tragen.append(f"{datei.relative_to(wurzel)}:{nr}")
    erwartet = [t for t in tragen if t.startswith(WORKFLOW + ":")]
    if len(tragen) != 1 or len(erwartet) != 1:
        befunde.append(
            f"„{NAME}“ muss genau einmal vorkommen, in {WORKFLOW}; gefunden: "
            + (", ".join(tragen) or "nirgends")
            + ". Das Ruleset kennt nur den Namen — ein zweiter Traeger kann "
            "den echten ueberstimmen (PR #774, 25.09.2026)."
        )

    datei = wurzel / WORKFLOW
    if not datei.exists():
        befunde.append(f"{WORKFLOW} fehlt.")
        return befunde
    text = datei.read_text(encoding="utf-8")

    if re.search(r"^\s+paths(-ignore)?:", ausloeser_lesen(text), re.M):
        befunde.append(
            f"{WORKFLOW} hat am Ausloeser `paths` oder `paths-ignore`. Ein "
            "uebersprungener Workflow liefert keinen Pflicht-Check; die "
            "Entscheidung gehoert in den Job `changes`."
        )

    jobs = jobs_lesen(text)
    if JOB not in jobs:
        befunde.append(f"In {WORKFLOW} gibt es keinen Job `{JOB}`.")
        return befunde
    block = jobs[JOB]
    if not re.search(r"^    if:\s*always\(\)\s*$", block, re.M):
        befunde.append(f"`{JOB}` laeuft nicht mit `if: always()`.")
    andere = set(jobs) - {JOB}
    needs = needs_lesen(block)
    fehlt = sorted(andere - needs)
    if fehlt:
        befunde.append(f"`{JOB}` wartet nicht auf: {', '.join(fehlt)} (fehlt in `needs`).")
    gelesen = set(re.findall(r"needs\.([A-Za-z0-9_-]+)\.result", block))
    fehlt = sorted(andere - gelesen)
    if fehlt:
        befunde.append(
            f"`{JOB}` liest das Ergebnis nicht von: {', '.join(fehlt)} "
            "(fehlt in `ERGEBNISSE`)."
        )
    return befunde


def main():
    teiler = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    teiler.add_argument("--pfad", default=".")
    args = teiler.parse_args()
    wurzel = pathlib.Path(args.pfad).resolve()
    befunde = pruefen(wurzel)
    if befunde:
        for b in befunde:
            print(f"FEHLER: {b}")
        return 1
    print(f"„{NAME}“ steht einmal, in {WORKFLOW}, und wartet auf jeden Job.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
