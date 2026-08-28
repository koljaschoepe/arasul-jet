#!/usr/bin/env python3
"""Jede Route prueft ihre Rolle (Phase C1 des Umbaus vom 26.08.2026).

Das Geraet kennt zwei Rollen, `admin` und `mitarbeiter`. Die Regel lautet:
alles, was nicht Admin ist und nicht ausdruecklich Mitarbeiter, antwortet
403. Im Code heisst das: jede Route in `apps/dashboard-backend/src/routes/`
traegt `requireRole(...)`, entweder in ihrer eigenen Kette oder als
`router.use(requireAuth, requireRole(...))` fuer die ganze Datei.

Ausnahmen gibt es, und zwar genau die in OEFFENTLICH, jede mit Grund. Wer
eine Route ohne Rollenpruefung anlegt, landet hier als Befund, bis sie
entweder prueft oder mit Grund in der Liste steht. Die Liste darf nicht
still wachsen; sie ist der Vertrag darueber, was ohne Anmeldung geht.

Die Routen mit API-Schluessel (`requireApiKey`) sind die Aussenschnittstelle
und bleiben, wie sie sind: der Schluessel ist die Berechtigung, nicht die
Rolle des Menschen, der ihn angelegt hat.

Aufruf
------
    python3 scripts/test/rollenregeln.py [--wurzel <pfad>]     Waechter, 0 oder 1
    python3 scripts/test/rollenregeln.py --json                 Liste aller Routen
                                                                mit Rolle, fuer
                                                                rollen-abnahme.sh
"""
import argparse
import json
import re
import sys
from pathlib import Path

ROUTEN_REL = 'apps/dashboard-backend/src/routes'
INDEX_REL = 'apps/dashboard-backend/src/routes/index.js'
VERBEN = ('get', 'post', 'put', 'patch', 'delete')
ROUTE = re.compile(rf"router\.({'|'.join(VERBEN)})\(")
PFAD = re.compile(r"['\"]([^'\"]*)['\"]")
ROLLE = re.compile(r"requireRole\(([^)]*)\)")
# Eine Routenkette ist selten laenger; ein Multer-Wrapper oder ein langer
# Kommentar vor dem Pfad schiebt aber zwanzig Zeilen dazwischen.
FENSTER = 40

#: Routen ohne Rollenpruefung, jede mit dem Grund, warum das richtig ist.
OEFFENTLICH = {
    'POST /api/auth/login': 'die Anmeldung selbst; vor ihr gibt es keine Rolle',
    'POST /api/auth/logout': (
        'das Abmelden muss auch eine bereits entwertete Sitzung wegraeumen '
        '(Phase D6); es gibt hier nichts zu schuetzen, wer ruft, wird seine '
        'eigenen Cookies los, und die CSRF-Pflicht bleibt'
    ),
    'GET /api/auth/needs-setup': 'sagt der Oberflaeche, ob das Geraet noch keinen Admin hat',
    'POST /api/auth/setup': 'legt den ERSTEN Admin an; schliesst sich selbst, sobald einer da ist',
    'GET /api/auth/session': 'Sitzungsprobe, antwortet 200 in beiden Faellen (Plan 023 C3)',
    'GET /api/auth/verify': 'Forward-Auth fuer Traefik; antwortet 401 statt zu werfen',
    'GET /api/system/heartbeat': 'Lebenszeichen fuer den Selbstheilungs-Agenten, ohne Sitzung',
    'GET /api/settings/password-requirements': 'die Passwortregeln stehen vor dem Passwortwechsel',
    'POST /api/events/webhook/self-healing': 'Webhook des Selbstheilungs-Agenten, gesichert ueber sein Geheimnis',
}


def normalisiere(pfad: str) -> str:
    p = re.sub(r":[A-Za-z_][A-Za-z0-9_]*", ":x", pfad)
    p = p.replace('/*', '/:x')
    return (p.rstrip('/') or '/').lower()


def praefixe(wurzel: Path) -> dict:
    """Datei (ohne .js) -> Montagepfad, aus routes/index.js gelesen."""
    quelle = (wurzel / INDEX_REL).read_text(encoding='utf-8')
    gefunden = {}
    for m in re.finditer(r"router\.use\(\s*'([^']+)'\s*,(.*?)\)\s*;", quelle, re.S):
        datei = re.search(r"require\('\./([^']+)'\)", m.group(2))
        if datei:
            gefunden[datei.group(1)] = m.group(1)
    return gefunden


def rollen_aus(text: str):
    """Die Rollen eines requireRole-Aufrufs, oder None wenn keiner da ist."""
    m = ROLLE.search(text)
    if not m:
        return None
    return sorted(re.findall(r"'([a-z]+)'", m.group(1)))


def routen(wurzel: Path):
    """Jede montierte Route mit Verb, Pfad und dem, was sie schuetzt."""
    montage = praefixe(wurzel)
    ergebnis = []
    for datei in sorted((wurzel / ROUTEN_REL).rglob('*.js')):
        rel = datei.relative_to(wurzel / ROUTEN_REL).as_posix()
        praefix = montage.get(rel[:-3])
        if praefix is None:
            continue
        zeilen = datei.read_text(encoding='utf-8').splitlines()
        datei_rollen = None
        for z in zeilen:
            if z.strip().startswith('router.use(') and 'requireRole' in z:
                datei_rollen = rollen_aus(z)
        anfaenge = [i for i, z in enumerate(zeilen) if ROUTE.search(z)]
        for stelle, i in enumerate(anfaenge):
            ende = anfaenge[stelle + 1] if stelle + 1 < len(anfaenge) else len(zeilen)
            block = '\n'.join(zeilen[i:min(ende, i + FENSTER)])
            verb = ROUTE.search(block).group(1).upper()
            # Der Pfad ist das erste Literal nach dem Verb; Kommentare davor
            # (models.js: '/katalog/*') tragen Backticks, keine Anfuehrungszeichen.
            ohne_kommentare = '\n'.join(
                z for z in block.splitlines() if not z.strip().startswith('//')
            )
            pm = PFAD.search(ohne_kommentare)
            pfad = pm.group(1) if pm else '?'
            voll = normalisiere(f"/api{praefix}{pfad}")
            eigene = rollen_aus(block)
            schutz = 'api-key' if 'requireApiKey' in block else None
            rollen = eigene if eigene is not None else datei_rollen
            ergebnis.append({
                'verb': verb,
                'pfad': voll,
                'datei': rel,
                'zeile': i + 1,
                'rollen': rollen,
                'schutz': schutz or ('rolle' if rollen else None),
            })
    return ergebnis


def befunde(alle, veraltete_pruefen=True):
    """Befunde: Routen ohne Schutz, und Eintraege in OEFFENTLICH ohne Route.

    Letzteres nur im echten Repo (`veraltete_pruefen`): der Selbsttest baut
    einen Wegwerfbaum mit einer Handvoll Routen, und dort fehlen die neun
    oeffentlichen natuerlich alle.
    """
    fehler = []
    genannt = set()
    for r in alle:
        schluessel = f"{r['verb']} {r['pfad']}"
        if r['schutz'] == 'api-key':
            continue
        if r['schutz'] == 'rolle':
            if schluessel in OEFFENTLICH:
                fehler.append((r, 'steht in OEFFENTLICH und prueft trotzdem eine Rolle; eins von beiden ist falsch'))
            continue
        if schluessel in OEFFENTLICH:
            genannt.add(schluessel)
            continue
        fehler.append((r, 'ohne requireRole und ohne Grund in OEFFENTLICH'))
    if veraltete_pruefen:
        for schluessel in sorted(set(OEFFENTLICH) - genannt):
            fehler.append((None, f'{schluessel} steht in OEFFENTLICH, aber es gibt die Route nicht mehr'))
    return fehler


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument('--wurzel', default=Path(__file__).resolve().parents[2])
    p.add_argument('--json', action='store_true')
    args = p.parse_args()
    wurzel = Path(args.wurzel)
    if not (wurzel / ROUTEN_REL).is_dir():
        print('   Rollenregeln: keine Routen gefunden, nichts zu pruefen')
        return 0

    alle = routen(wurzel)
    if args.json:
        print(json.dumps(alle, indent=1, ensure_ascii=False))
        return 0

    # Die oeffentlichen Routen liegen in auth.js; wo die fehlt, ist es ein
    # Wegwerfbaum des Selbsttests, kein Repo mit vergessenen Eintraegen.
    fehler = befunde(alle, veraltete_pruefen=(wurzel / ROUTEN_REL / 'auth.js').exists())
    admin = sum(1 for r in alle if r['rollen'] == ['admin'])
    beide = sum(1 for r in alle if r['rollen'] == ['admin', 'mitarbeiter'])
    schluessel = sum(1 for r in alle if r['schutz'] == 'api-key')
    offen = sum(1 for r in alle if r['schutz'] is None)
    if not fehler:
        print(
            f'   Rollenregeln: {len(alle)} Routen, {admin} nur Admin, {beide} auch Mitarbeiter, '
            f'{schluessel} mit API-Schluessel, {offen} oeffentlich mit Grund'
        )
        return 0
    print(f'   Rollenregeln: {len(fehler)} Befund(e).')
    for r, grund in fehler:
        if r is None:
            print(f'     {grund}')
        else:
            print(f"     {r['verb']} {r['pfad']}  ({ROUTEN_REL}/{r['datei']}:{r['zeile']})")
            print(f'       {grund}')
    return 1


if __name__ == '__main__':
    sys.exit(main())
