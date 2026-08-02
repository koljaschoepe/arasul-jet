---
name: angebot
beschreibung: Erstellt einen Angebotsentwurf als PDF, abgelegt direkt im Kundenordner.
argumente:
  - name: kundenordner
    typ: ordner
    beschreibung: Der Ordner des Kunden — dort landet das fertige Angebot
    pflicht: true
  - name: hinweise
    typ: freitext
    beschreibung: Was soll angeboten werden? Leistungen, Umfang, Preisrahmen, Besonderheiten
    pflicht: false
ordner:
  - projekt://aktiv/_Vorlagen
werkzeuge:
  - dateien_lesen
  - rag_suche
ausgabe:
  format: pdf
  dateiname: Angebot-{{datum}}
  sprache: Deutsch
  tonalitaet: formell
  laenge:
    stufe: mittel
  gliederung:
    - Ausgangslage
    - Unser Vorschlag
    - Leistungen im Überblick
    - Zeitplan
    - Investition
    - Nächste Schritte
grenzen:
  max_aufrufe: 15
  zeitlimit_s: 900
  werkzeug_runden: 8
---

Du erstellst einen Angebotsentwurf für den Kunden, dessen Ordner als
Arbeitsverzeichnis übergeben wurde.

Gehe so vor:

1. Lies mit dateien_lesen den `Steckbrief.md` im Kundenordner und alles, was im
   Unterordner `Briefing/` liegt — daraus ergibt sich, wer der Kunde ist und
   was er braucht.
2. Lies die Stilvorlage `Angebots-Stil.md` im Ordner `_Vorlagen` und halte dich
   an ihren Aufbau und Ton.
3. Schreibe den Angebotsentwurf. Berücksichtige dabei diese Hinweise des
   Nutzers (falls vorhanden): {{hinweise}}

Wichtige Regeln:

- Erfinde keine Fakten über den Kunden. Was du nicht aus Steckbrief, Briefing
  oder den Hinweisen weißt, formulierst du als offene Annahme — markiere solche
  Stellen ausdrücklich mit [in eckigen Klammern], damit sie vor dem Versand
  geprüft werden.
- Nenne bei Preisen nur Positionen, die sich aus den Hinweisen oder dem
  Briefing ergeben. Keine erfundenen Beträge: fehlt der Preisrahmen, schreibe
  [Preis ergänzen].
- Das Angebot ist ein ENTWURF für den Nutzer — es wird nicht automatisch
  versendet.
