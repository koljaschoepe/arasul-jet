"""
Vorrang fuer den Nutzer an der einen GPU (Plan 023, Fund vom 22.08.2026).

Das Geraet hat eine GPU. Der Chat serialisiert seine Modellaufrufe im Backend
ueber `services/flows/gpuQueue.js`, und dessen Kopfzeile nennt sich selbst "die
EINE Sperre fuer alle lokalen Modell-Aufrufe". Sie ist es nicht: der Indexer
ist ein eigener Prozess in einem eigenen Container und ruft Ollama direkt auf.
Er kann diese Sperre nicht nehmen.

**Was daraus wurde, gemessen am 22.08.2026 auf dem Orin.** Der Indexer reichert
im Hintergrund an und laedt dafuer `qwen3:14b` (14 GB). Der Chat rechnet mit
dem 27B-Modell (22 GB). Zusammen passen sie nicht in das Budget, also wirft
Ollama das jeweils andere Modell heraus. In `llm_model_switches` stehen fuer
vierzig Minuten 35 Zeilen `auto_unload_ollama_keepalive` im Wechsel und neun
Ladevorgaenge mit 11 827 bis 60 066 Millisekunden. Der Nutzer wartet also bei
jeder Chat-Runde eine halbe bis eine ganze Minute darauf, dass ein Modell
zurueck in den Speicher kommt, das kurz zuvor schon dort war.

**Die Loesung ist eine Frist, kein Schalter.** Das Backend meldet "ich habe die
GPU, halte dich bis T zurueck" und erneuert das, solange es rechnet. Faellt das
Backend aus, laeuft die Frist ab und der Indexer arbeitet weiter. Ein Schalter
haette den Indexer nach einem Absturz fuer immer stillgelegt.

Zurueckgehalten wird nur der START eines Modellaufrufs. Ein laufender Aufruf
wird nicht abgebrochen: das Modell rechnet ohnehin zu Ende, und ein halbes
Ergebnis waere schlechter als gar keins. Dieselbe Ueberlegung steht bei
`ai_services.analyze_document`.
"""

import os
import threading
import time

# Laenger als eine Frist, die das Backend setzt, wartet der Indexer nie. Auch
# nicht, wenn das Backend eine unsinnig grosse Zahl schickt: eine Zusage, die
# der Indexer eine Viertelstunde lang stillegt, waere ein Ausfall, kein
# Vorrang.
HOECHSTFRIST_S = float(os.getenv('GPU_VORRANG_HOECHSTFRIST_S', '120'))

_sperre = threading.Lock()
_frist_bis = 0.0


def melde_belegt(sekunden: float) -> float:
    """
    Setzt die Frist auf `jetzt + sekunden`.

    Eine bereits laufende, laengere Frist wird nicht verkuerzt, ausser die
    Meldung lautet ausdruecklich Null: das ist das Freigeben am Ende.

    :returns: die Sekunden, die tatsaechlich gelten.
    """
    global _frist_bis
    with _sperre:
        if sekunden <= 0:
            _frist_bis = 0.0
            return 0.0
        gilt = min(float(sekunden), HOECHSTFRIST_S)
        neu = time.monotonic() + gilt
        if neu > _frist_bis:
            _frist_bis = neu
        return max(0.0, _frist_bis - time.monotonic())


def gpu_belegt() -> bool:
    """True, solange das Backend die GPU fuer einen Nutzerlauf haelt."""
    with _sperre:
        return time.monotonic() < _frist_bis


def restsekunden() -> float:
    """Wie lange die Frist noch laeuft. Null, wenn sie abgelaufen ist."""
    with _sperre:
        return max(0.0, _frist_bis - time.monotonic())


def zuruecksetzen() -> None:
    """Nur fuer Tests."""
    global _frist_bis
    with _sperre:
        _frist_bis = 0.0
