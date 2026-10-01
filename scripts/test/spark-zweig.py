#!/usr/bin/env python3
"""Der Spark-Zweig der Abbilder bleibt ohne Jetson-Basis (J4, 01.10.2026).

Warum es diesen Waechter gibt
-----------------------------
Am DGX Spark (GB10, DGX OS) gibt es kein L4T. Bis J4 baute der
Einbettungsdienst auf `dustynv/l4t-pytorch` und Ollama mit dem Runner
`cuda_jetpack6`; am Spark liefe das eine gar nicht und das andere still auf
der CPU. Seither waehlt `GPU_DOCKERFILE` (aus config/platforms/dgx-spark.json,
geschrieben von detect-platform.sh) je GPU-Dienst `Dockerfile.spark`. Der
Fehler, gegen den das hier steht, wird nirgends rot: ein Abbild mit
Jetson-Basis baut auf einem arm64-Rechner tadellos und rechnet dann nicht.

Was geprueft wird
-----------------
1. Kein Abbild, das am Spark gebaut wird, hat eine Jetson-Basis: jedes
   Dockerfile unter apps/ und services/ ausser dem Jetson-`Dockerfile` der
   GPU-Dienste (und `_template`), ARG-Vorgaben in `FROM` aufgeloest.
2. Compose waehlt die Dockerfiles der GPU-Dienste ueber `GPU_DOCKERFILE` und
   faellt ohne Eintrag auf das Jetson-`Dockerfile` zurueck; `LD_LIBRARY_PATH`
   des llm-service ist `OLLAMA_LD_LIBRARY_PATH` mit dem alten Pfad als
   Vorgabe. Das ist die Zusage an den Orin: ohne Spark-Eintrag in der .env
   baut und startet er wie vorher.
3. Das Profil dgx-spark nennt `engine: ollama`, bleibt `verification:
   follow-up`, sein `bau.dockerfile` liegt neben beiden GPU-Diensten, und
   sein Bibliothekspfad kennt kein `jetpack`.
"""

import argparse
import json
import pathlib
import re
import sys

GPU_DIENSTE = ('llm-service', 'embedding-service')
JETSON = re.compile(r'l4t|dustynv|jetpack|tegra', re.IGNORECASE)


def basen(text):
    """Die `FROM`-Abbilder eines Dockerfiles, ARG-Vorgaben eingesetzt."""
    vorgaben = dict(re.findall(r'^ARG\s+(\w+)=(\S+)', text, re.MULTILINE))
    aus = []
    for bild in re.findall(r'^FROM\s+(?:--platform=\S+\s+)?(\S+)', text, re.MULTILINE):
        aus.append(re.sub(r'\$\{(\w+)\}', lambda t: vorgaben.get(t.group(1), t.group(0)), bild))
    return aus


def pruefe_basen(wurzel):
    fehler = []
    for pfad in sorted(wurzel.glob('apps/*/Dockerfile*')) + sorted(wurzel.glob('services/*/Dockerfile*')):
        dienst = pfad.parent.name
        if dienst == '_template' or (dienst in GPU_DIENSTE and pfad.name == 'Dockerfile'):
            continue
        for bild in basen(pfad.read_text(encoding='utf-8')):
            if JETSON.search(bild):
                fehler.append(f'{pfad.relative_to(wurzel)}: Jetson-Basis {bild}')
    for dienst in GPU_DIENSTE:
        if not (wurzel / 'services' / dienst / 'Dockerfile.spark').exists():
            fehler.append(f'services/{dienst}/Dockerfile.spark fehlt')
    return fehler


def pruefe_compose(wurzel):
    text = (wurzel / 'compose' / 'compose.ai.yaml').read_text(encoding='utf-8')
    fehler = []
    for dienst in GPU_DIENSTE:
        zeile = f'dockerfile: services/{dienst}/${{GPU_DOCKERFILE:-Dockerfile}}'
        if zeile not in text:
            fehler.append(f'compose/compose.ai.yaml: {dienst} waehlt sein Dockerfile nicht mit `{zeile}`')
    treffer = re.search(r'^\s*LD_LIBRARY_PATH:\s*(\S+)', text, re.MULTILINE)
    if not treffer or not re.fullmatch(r'\$\{OLLAMA_LD_LIBRARY_PATH:-[^}]*cuda_jetpack6\}', treffer.group(1)):
        fehler.append(
            'compose/compose.ai.yaml: LD_LIBRARY_PATH ist nicht '
            '`${OLLAMA_LD_LIBRARY_PATH:-...cuda_jetpack6}` -- entweder steht der '
            'Jetson-Pfad fest da (Spark auf der CPU) oder der Orin hat seine Vorgabe verloren'
        )
    return fehler


def pruefe_profil(wurzel):
    rel = 'config/platforms/dgx-spark.json'
    p = json.loads((wurzel / rel).read_text(encoding='utf-8'))
    fehler = []
    if p.get('engine') != 'ollama':
        fehler.append(f'{rel}: engine ist {p.get("engine")!r}, gebaut ist nur ollama (Beschluss R1)')
    if p.get('verification') != 'follow-up':
        fehler.append(f'{rel}: verification ist {p.get("verification")!r}; gruen wird es erst am Geraet')
    if 'jetpack' in p.get('ld_library_path', ''):
        fehler.append(f'{rel}: ld_library_path nennt jetpack')
    datei = (p.get('bau') or {}).get('dockerfile')
    for dienst in GPU_DIENSTE:
        if not datei or not (wurzel / 'services' / dienst / datei).exists():
            fehler.append(f'{rel}: bau.dockerfile {datei!r} liegt nicht unter services/{dienst}/')
    return fehler


def main():
    zerleger = argparse.ArgumentParser()
    zerleger.add_argument('--wurzel', default='.')
    wurzel = pathlib.Path(zerleger.parse_args().wurzel).resolve()
    fehler = pruefe_basen(wurzel) + pruefe_compose(wurzel) + pruefe_profil(wurzel)
    if fehler:
        print('Spark-Zweig:')
        for f in fehler:
            print(f'  {f}')
        return 1
    print('Spark-Zweig: kein Spark-Abbild auf Jetson-Basis, Orin-Vorgaben in Compose unveraendert.')
    return 0


if __name__ == '__main__':
    sys.exit(main())
