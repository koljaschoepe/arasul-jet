"""
Der Vorrang des Nutzers an der GPU (Fund vom 22.08.2026).

Geprueft wird das, was schiefgehen kann: eine Frist, die nie ablaeuft, eine
Frist, die eine laengere ueberschreibt, und eine Freigabe, die nicht freigibt.
Alle drei haetten dieselbe Folge — der Indexer arbeitet nie wieder oder gar
nicht anders als vorher.
"""

import time

import gpu_vorrang


def setup_function():
    gpu_vorrang.zuruecksetzen()


def test_ohne_meldung_ist_die_gpu_frei():
    assert gpu_vorrang.gpu_belegt() is False
    assert gpu_vorrang.restsekunden() == 0.0


def test_meldung_belegt_und_laeuft_ab():
    gpu_vorrang.melde_belegt(0.3)
    assert gpu_vorrang.gpu_belegt() is True
    time.sleep(0.4)
    assert gpu_vorrang.gpu_belegt() is False


def test_null_gibt_frei():
    gpu_vorrang.melde_belegt(30)
    assert gpu_vorrang.gpu_belegt() is True
    gpu_vorrang.melde_belegt(0)
    assert gpu_vorrang.gpu_belegt() is False


def test_eine_kuerzere_meldung_verkuerzt_nicht():
    """
    Sonst koennte ein zweiter, kurzer Lauf die Frist des ersten, langen
    verkuerzen, und der Indexer faengt mitten in einer Chat-Antwort an zu
    rechnen.
    """
    gpu_vorrang.melde_belegt(60)
    lang = gpu_vorrang.restsekunden()
    gpu_vorrang.melde_belegt(1)
    assert gpu_vorrang.restsekunden() > lang - 1


def test_hoechstfrist_deckelt():
    """Eine unsinnig grosse Zusage ist ein Ausfall, kein Vorrang."""
    gpu_vorrang.melde_belegt(99999)
    assert gpu_vorrang.restsekunden() <= gpu_vorrang.HOECHSTFRIST_S + 0.1


def test_negative_zahl_gibt_frei_statt_zu_belegen():
    gpu_vorrang.melde_belegt(30)
    gpu_vorrang.melde_belegt(-5)
    assert gpu_vorrang.gpu_belegt() is False
