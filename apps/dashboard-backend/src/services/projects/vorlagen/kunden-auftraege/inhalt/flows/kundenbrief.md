---
name: kundenbrief
beschreibung: Schreibt einen Brief an den Kunden im Firmenstil — als Word-Datei im Schriftverkehr-Ordner.
argumente:
  - name: schriftverkehrordner
    typ: ordner
    beschreibung: Der Schriftverkehr-Ordner des Kunden (dort landet der Brief)
    pflicht: true
  - name: anliegen
    typ: freitext
    beschreibung: Worum geht es in dem Brief? Anlass, Kernbotschaft, gewünschte Reaktion
    pflicht: true
ordner:
  - projekt://aktiv
werkzeuge:
  - dateien_lesen
ausgabe:
  format: docx
  dateiname: Brief-{{datum}}
  sprache: Deutsch
  tonalitaet: formell
  laenge:
    stufe: kurz
grenzen:
  max_aufrufe: 8
  zeitlimit_s: 600
  werkzeug_runden: 4
---

Du schreibst einen Brief an den Kunden, dessen Schriftverkehr-Ordner als
Arbeitsverzeichnis übergeben wurde.

Gehe so vor:

1. Lies mit dateien_lesen den `Steckbrief.md` im übergeordneten Kundenordner
   (eine Ebene über dem Arbeitsverzeichnis) — daraus ergeben sich Anrede und
   Ansprechpartner. Lies außerdem `Firmenprofil.md` in der Projekt-Wurzel,
   falls vorhanden — daraus ergibt sich der Absender.
2. Schreibe den Brief zu diesem Anliegen: {{anliegen}}

Regeln:

- Klassischer Geschäftsbrief: Anrede, kurzer Einstieg, Kernbotschaft,
  gewünschte Reaktion, Grußformel.
- Erfinde keine Fakten. Fehlt der Name des Ansprechpartners, schreibe
  „Sehr geehrte Damen und Herren". Fehlende Angaben markierst du mit
  [eckigen Klammern].
- Kein Marketing-Jargon, keine Superlative — freundlich, klar, auf Augenhöhe.
