---
name: neuer-kunde
beschreibung: Legt einen neuen Kundenordner an — recherchiert die Firma selbstständig im Web und füllt den Steckbrief mit Quellen.
argumente:
  - name: firma
    typ: freitext
    beschreibung: Name der Firma
    pflicht: true
  - name: webseite
    typ: freitext
    beschreibung: Webseite der Firma (z. B. https://www.beispiel.de)
    pflicht: true
ordner:
  - projekt://aktiv
werkzeuge:
  - web_suche
  - web_lesen
  - dateien_schreiben
grenzen:
  max_aufrufe: 20
  zeitlimit_s: 900
  werkzeug_runden: 10
---

Du legst für die Firma {{firma}} einen neuen Kundenordner an. Arbeite die
Schritte der Reihe nach ab und nutze dafür deine Werkzeuge — behaupte nie,
etwas getan zu haben, was du nicht mit einem Werkzeug getan hast.

1. Lies mit web_lesen die Webseite {{webseite}}. Wenn dort Unterseiten wie
   „Über uns", „Kontakt" oder „Impressum" verlinkt sind, lies auch diese.
   Bei Bedarf darfst du zusätzlich mit web_suche nach der Firma suchen.
2. Schreibe mit dateien_schreiben die Datei
   `Kunden/{{firma}}/Steckbrief.md` mit genau diesem Aufbau:

   # Steckbrief: {{firma}}

   | Feld            | Wert         |
   | --------------- | ------------ |
   | Firma           | …            |
   | Webseite        | {{webseite}} |
   | Branche         | …            |
   | Ansprechpartner | …            |
   | E-Mail          | …            |
   | Telefon         | …            |
   | Adresse         | …            |
   | Status          | Interessent  |
   | Letzter Kontakt | …            |

   ## Über die Firma

   Zwei bis vier Sätze: Was macht die Firma, für wen, was ist besonders.

   ## Quellen

   Liste ALLER gelesenen Seiten (vollständige Adressen).

3. Lege mit dateien_schreiben je eine Datei `.ordner` mit dem Inhalt
   `Ablage für {{firma}}` in diesen vier Unterordnern an, damit die Struktur
   entsteht: `Kunden/{{firma}}/Briefing/.ordner`,
   `Kunden/{{firma}}/Meetings/.ordner`, `Kunden/{{firma}}/Angebote/.ordner`,
   `Kunden/{{firma}}/Schriftverkehr/.ordner`.

Wichtige Regeln:

- In den Steckbrief kommt NUR, was auf den gelesenen Seiten steht. Was du
  nicht findest, trägst du als „unbekannt" ein — nichts erfinden.
- Für „Letzter Kontakt" trägst du das heutige Datum ein, falls es sich aus dem
  Zusammenhang ergibt, sonst „—".
- Antworte dem Nutzer zum Schluss kurz: welche Dateien du angelegt hast und
  welche Felder unbekannt blieben.
