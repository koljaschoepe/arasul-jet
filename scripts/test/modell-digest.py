#!/usr/bin/env python3
"""Liefert die Registry noch, was die Kurzliste verspricht? (J35, 25.09.2026)

`config/modelle/kurzliste.json` nennt je Modell einen `digest`: den sha256 des
Manifests in der Ollama-Registry. Genau diesen Wert meldet ein Geraet nach dem
Pull unter `/api/tags`, und `scripts/util/modell-holen.sh` vergleicht beide.
Stimmt er nicht, hat die Registry unter derselben Kennung etwas anderes
ausgeliefert -- und das soll nicht erst am Geraet eines Kunden auffallen,
sondern bevor ein Release geschnitten ist.

Der Anlass: das Standardmodell kam bis J35 von Hugging Face
(`hf.co/unsloth/Qwen3.8-27B-GGUF:IQ4_XS`). Dort entsteht das Manifest beim
Abruf; am 25.09.2026 lieferte der config-Blob 404, und die Kennung zeigte auf
eine andere Datei (14,25 GB statt 15,7 GB). Jeder Pull am Orin endete mit EOF,
und niemand hatte vorher gefragt.

Geprueft wird je Modell, ohne Gigabytes zu laden:

  1. Das Manifest ist abrufbar, und sein sha256 ist der `digest` der Liste.
  2. Jede Schicht (und die config) ist abrufbar: HEAD auf den Blob, am Ende
     einer Umleitung 200, und die Laenge ist die im Manifest.
  3. Kleine Schichten (bis 1 MB: config, Vorlage, Parameter, Lizenz) werden
     ganz geladen und ihr sha256 gegen den Digest im Manifest gerechnet.

Aufruf:  python3 scripts/test/modell-digest.py [--kurzliste <datei>]
Rueckgabe: 0 alles stimmt, 1 mindestens ein Befund.
"""

import argparse
import hashlib
import json
import subprocess
import sys
from pathlib import Path

REGISTRY = 'https://registry.ollama.ai'
ANNAHME = 'application/vnd.docker.distribution.manifest.v2+json'
KLEIN = 1_000_000
WURZEL = Path(__file__).resolve().parents[2]


def adresse(kennung):
    """`name[:tag]` -> (namensraum/name, tag). Ohne Namensraum ist es `library`."""
    if kennung.startswith(('hf.co/', 'huggingface.co/')):
        raise ValueError(
            f'{kennung}: Hugging Face erzeugt das Manifest beim Abruf, ein Digest dort ist nicht wiederholbar'
        )
    name, _, tag = kennung.partition(':')
    if '/' not in name:
        name = f'library/{name}'
    return name, tag or 'latest'


class Abruffehler(Exception):
    pass


def holen(url, *, kopf=None):
    """Der Rumpf einer GET-Anfrage, ueber curl (Grund: siehe `kopf_laenge`)."""
    befehl = ['curl', '-sfL', '--max-time', '120', '-A', 'arasul-modell-digest']
    for name, wert in (kopf or {}).items():
        befehl += ['-H', f'{name}: {wert}']
    lauf = subprocess.run([*befehl, url], capture_output=True, check=False)
    if lauf.returncode != 0:
        raise Abruffehler(f'curl {lauf.returncode}')
    return lauf.stdout


def kopf_laenge(url):
    """Content-Length nach HEAD, -1 ohne Angabe, None ohne 200.

    Ueber curl und nicht ueber urllib: dieselbe HEAD-Anfrage brauchte mit
    urllib 40 bis 80 Sekunden je grossem Blob (gemessen 25.09.2026), mit curl
    eine halbe; ein GET auf das Manifest kam gar nicht zurueck. curl faellt
    von IPv6 auf IPv4 zurueck, urllib nicht.
    """
    lauf = subprocess.run(
        ['curl', '-sIL', '--max-time', '60', '-A', 'arasul-modell-digest', url],
        capture_output=True, text=True, check=False,
    )
    if lauf.returncode != 0:
        return None
    status, laenge = None, -1
    for zeile in lauf.stdout.splitlines():
        teile = zeile.split(None, 2)
        if zeile.startswith('HTTP/') and len(teile) > 1:
            status, laenge = teile[1], -1
        elif zeile.lower().startswith('content-length:'):
            laenge = int(zeile.split(':', 1)[1])
    return laenge if status == '200' else None


def pruefe_modell(eintrag):
    befunde = []
    kennung, soll = eintrag['id'], eintrag.get('digest', '')
    try:
        name, tag = adresse(kennung)
    except ValueError as fehler:
        return [str(fehler)]
    try:
        rumpf = holen(f'{REGISTRY}/v2/{name}/manifests/{tag}', kopf={'Accept': ANNAHME})
    except Abruffehler as fehler:
        return [f'{kennung}: Manifest nicht abrufbar ({fehler})']
    ist = 'sha256:' + hashlib.sha256(rumpf).hexdigest()
    if ist != soll:
        befunde.append(
            f'{kennung}: Manifest-Digest {ist} statt {soll} -- die Registry liefert unter '
            'dieser Kennung etwas anderes. Bewusst pruefen und die Kurzliste nachziehen.'
        )
    manifest = json.loads(rumpf)
    schichten = [manifest['config'], *manifest.get('layers', [])]
    gesamt = 0
    for schicht in schichten:
        digest, groesse = schicht['digest'], schicht['size']
        gesamt += groesse
        url = f'{REGISTRY}/v2/{name}/blobs/{digest}'
        try:
            if groesse <= KLEIN:
                inhalt = holen(url)
                gerechnet = 'sha256:' + hashlib.sha256(inhalt).hexdigest()
                if gerechnet != digest:
                    befunde.append(f'{kennung}: Blob {digest[7:19]} hat den Inhalt {gerechnet[7:19]}')
            else:
                laenge = kopf_laenge(url)
                if laenge is None:
                    befunde.append(f'{kennung}: Blob {digest[7:19]} nicht abrufbar (HEAD ohne 200)')
                elif laenge not in (-1, groesse):
                    befunde.append(
                        f'{kennung}: Blob {digest[7:19]} ist {laenge} Bytes lang, das Manifest sagt {groesse}'
                    )
        except Abruffehler as fehler:
            befunde.append(f'{kennung}: Blob {digest[7:19]} nicht abrufbar ({fehler})')
    if not befunde:
        print(f'  ok  {kennung:24} {soll[7:19]}  {len(schichten)} Blobs, {gesamt / 1e9:.2f} GB')
    return befunde


def main():
    teiler = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    teiler.add_argument('--kurzliste', default=str(WURZEL / 'config/modelle/kurzliste.json'))
    args = teiler.parse_args()

    modelle = json.loads(Path(args.kurzliste).read_text(encoding='utf-8'))['modelle']
    befunde = []
    for eintrag in modelle:
        befunde += pruefe_modell(eintrag)
    if befunde:
        print(f'\nmodell-digest: {len(befunde)} Befund(e)')
        for befund in befunde:
            print(f'  - {befund}')
        return 1
    print(f'modell-digest: {len(modelle)} Modelle, jedes liefert die Registry wie gepinnt')
    return 0


if __name__ == '__main__':
    sys.exit(main())
