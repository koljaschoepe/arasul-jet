"""Plan 023 G4: das Fachwoerterbuch wird nicht bei jeder Datei geschrieben.

Am 22.08.2026 auf dem Orin gemessen, bei 242 012 Eintraegen:

    17:01:57.625  Contextualized 1 chunks
    17:01:57.950  Domain dictionary updated: 9 new terms, 242012 total
    17:01:57.959  Successfully indexed document

0,33 Sekunden von 0,35 Sekunden Indexierung. Fuer neun Woerter wurde das ganze
Woerterbuch gelesen, nach Haeufigkeit sortiert und zurueckgeschrieben. Bei
hundert Dateien sind das 33 Sekunden, und die Zahl waechst mit dem Woerterbuch.

Verloren gehen kann durch das Sammeln nur, was seit dem letzten Schreiben
dazukam, und das ist abgeleitete Information: sie entsteht beim naechsten
Indexieren erneut.
"""

import importlib
import sys

import pytest


@pytest.fixture
def sc(tmp_path, monkeypatch):
    """Ein frisch geladenes spell_corrector-Modul mit eigenem Woerterbuchpfad."""
    monkeypatch.setenv('DOMAIN_DICT_PATH', str(tmp_path / 'domain-dict.txt'))
    sys.modules.pop('spell_corrector', None)
    modul = importlib.import_module('spell_corrector')
    # Das Nachladen in SymSpell ist hier nicht der Gegenstand.
    monkeypatch.setattr(modul, 'reload_domain_dictionary', lambda: None)
    yield modul
    sys.modules.pop('spell_corrector', None)


def _zeilen(pfad):
    with open(pfad, encoding='utf-8') as f:
        return [z.strip() for z in f if z.strip()]


def test_eine_einzelne_datei_schreibt_noch_nicht(sc, tmp_path):
    sc.update_domain_dictionary(['Rechnung Angebot Kunde'])
    assert not (tmp_path / 'domain-dict.txt').exists(), (
        "Nach einer Datei darf noch nichts auf der Platte stehen."
    )


def test_erzwungenes_schreiben_legt_alles_ab(sc, tmp_path):
    sc.update_domain_dictionary(['Rechnung Angebot Kunde'])
    assert sc.flush_domain_dictionary(force=True) is True
    zeilen = _zeilen(tmp_path / 'domain-dict.txt')
    assert set(z.split()[0] for z in zeilen) == {'rechnung', 'angebot', 'kunde'}


def test_genug_neue_woerter_loesen_das_schreiben_aus(sc, tmp_path, monkeypatch):
    monkeypatch.setattr(sc, 'DOMAIN_DICT_FLUSH_WOERTER', 3)
    sc.update_domain_dictionary(['eins zwei'])
    assert not (tmp_path / 'domain-dict.txt').exists()
    sc.update_domain_dictionary(['drei vier'])
    assert (tmp_path / 'domain-dict.txt').exists()


def test_die_zeit_loest_das_schreiben_aus(sc, tmp_path, monkeypatch):
    monkeypatch.setattr(sc, 'DOMAIN_DICT_FLUSH_S', 0)
    sc.update_domain_dictionary(['eins zwei'])
    assert (tmp_path / 'domain-dict.txt').exists()


def test_vorhandene_haeufigkeiten_gehen_nicht_verloren(sc, tmp_path):
    pfad = tmp_path / 'domain-dict.txt'
    pfad.write_text('rechnung 40\nangebot 7\n', encoding='utf-8')
    sc.update_domain_dictionary(['rechnung rechnung neu'])
    sc.flush_domain_dictionary(force=True)
    stand = dict(z.split() for z in _zeilen(pfad))
    assert stand['rechnung'] == '42'
    assert stand['angebot'] == '7'
    assert stand['neu'] == '1'


def test_es_wird_nach_haeufigkeit_sortiert(sc, tmp_path):
    sc.update_domain_dictionary(['selten haeufig haeufig haeufig'])
    sc.flush_domain_dictionary(force=True)
    zeilen = _zeilen(tmp_path / 'domain-dict.txt')
    assert zeilen[0].split()[0] == 'haeufig'


def test_ohne_neues_wird_nicht_geschrieben(sc, tmp_path):
    # Sonst schriebe der ruhige Zyklus alle paar Sekunden 242 000 Zeilen.
    assert sc.flush_domain_dictionary(force=True) is False
    assert not (tmp_path / 'domain-dict.txt').exists()

    sc.update_domain_dictionary(['wort'])
    sc.flush_domain_dictionary(force=True)
    vorher = (tmp_path / 'domain-dict.txt').stat().st_mtime_ns
    assert sc.flush_domain_dictionary(force=True) is False
    assert (tmp_path / 'domain-dict.txt').stat().st_mtime_ns == vorher


def test_ein_abbruch_mitten_im_schreiben_hinterlaesst_kein_halbes_woerterbuch(sc, tmp_path):
    # Deshalb erst daneben schreiben, dann umbenennen.
    import inspect
    quelle = inspect.getsource(sc.flush_domain_dictionary)
    assert 'os.replace(' in quelle
    schreib = quelle.index("open(tmp,")
    ersetz = quelle.index('os.replace(')
    assert schreib < ersetz


def test_die_platte_wird_nur_einmal_gelesen(sc, tmp_path, monkeypatch):
    # Der eigentliche Gewinn: vorher las jede Datei das ganze Woerterbuch.
    pfad = tmp_path / 'domain-dict.txt'
    pfad.write_text('vorhanden 5\n', encoding='utf-8')
    gelesen = {'n': 0}
    echt = sc._lade_woerterbuch

    def zaehlend():
        gelesen['n'] += 1
        return echt()

    monkeypatch.setattr(sc, '_lade_woerterbuch', zaehlend)
    for i in range(5):
        sc.update_domain_dictionary([f'wort{i}'])
    assert gelesen['n'] == 1
