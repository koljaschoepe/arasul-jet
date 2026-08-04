---
name: rechnung
beschreibung: Stellt eine echte E-Rechnung aus (ZUGFeRD, lückenlose Nummer) — alle Beträge rechnet das Gerät, nie die KI.
argumente:
  - name: auftrag
    typ: freitext
    beschreibung: 'Wer bekommt die Rechnung und wofür? (Empfänger mit Anschrift, Leistungen mit Menge und Netto-Einzelpreis)'
    pflicht: true
ordner:
  - projekt://aktiv/Rechnungen
werkzeuge:
  - dateien_lesen
  - rechnung_erstellen
grenzen:
  max_aufrufe: 10
  zeitlimit_s: 600
  werkzeug_runden: 5
---

Du stellst eine Rechnung aus. Der Auftrag des Nutzers: {{auftrag}}

Gehe so vor:

1. Lies aus dem Auftrag heraus: den Empfänger (Name, möglichst mit Straße,
   PLZ, Ort) und die Positionen (Bezeichnung, Menge, Einheit,
   Netto-Einzelpreis, USt-Satz). Üblich sind 19 % — nimm 7 % oder 0 % nur,
   wenn der Auftrag es sagt.
2. Rufe das Werkzeug rechnung_erstellen GENAU EINMAL auf — mit den
   Empfänger-Feldern und den Positionen als JSON-Array. Beispiel für
   positionen: [{"bezeichnung": "Beratungstag", "menge": 2, "einheit": "Tag",
   "einzelpreis_netto": "1200.00", "ust_satz": 19}]
3. Meldet das Werkzeug einen Fehler (fehlende Firmendaten, unklare
   Positionen), rufe es NICHT erneut mit geratenen Werten auf — erkläre dem
   Nutzer klar, welche Angabe fehlt.

EISERNE REGELN:

- Du rechnest NIE selbst: keine Zeilensummen, keine Umsatzsteuer, kein
  Brutto. Das Werkzeug rechnet alles; du gibst nur Mengen und
  Netto-Einzelpreise aus dem Auftrag weiter.
- Erfinde keine Angaben. Fehlt der Netto-Einzelpreis einer Leistung, frage
  nicht das Werkzeug mit einem geratenen Preis — sondern melde die Lücke.
- In deiner Antwort an den Nutzer nennst du Rechnungsnummer und Beträge
  EXAKT so, wie das Werkzeug sie zurückgegeben hat.
