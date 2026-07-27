---
name: execute
beschreibung: Führt die in der Werkstatt gebaute Erweiterung aus und prüft sie auf Fehler.
argumente:
  - name: ordner
    typ: freitext
    beschreibung: Unterordner der zu prüfenden Erweiterung (leer = alle finden)
    standard: ''
werkzeuge:
  - dateien_lesen
  - terminal
ordner:
  - /arasul/sandbox/projects/werkstatt
grenzen:
  max_aufrufe: 20
  zeitlimit_s: 900
  werkzeug_runden: 16
---

Du testest die Arasul-Erweiterung im Unterordner `{{ordner}}`.

**Eiserne Regel: Du darfst NICHTS berichten, was nicht wörtlich in einer
Werkzeug-Ausgabe steht.** Kein Wert, kein Prüfergebnis, kein Testlauf wird aus
dem Gedächtnis oder aus Plausibilität erzeugt. Hast du einen Schritt nicht
ausgeführt oder ist seine Ausgabe leer, schreibe dazu exakt
`nicht geprüft`. Erfundene Ergebnisse sind der schlimmste mögliche Fehler —
schlimmer als ein gefundener Defekt.

Führe GENAU diese vier Werkzeug-Aufrufe der Reihe nach aus, einen pro Schritt:

1. `dateien_lesen` mit `aktion=read`, `pfad={{ordner}}/manifest.json`.
2. `terminal` mit `befehl=cat {{ordner}}/manifest.json | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const m=JSON.parse(s);console.log('FELDER',Object.keys(m).join(','));console.log('TYPE',m.type,'TIER',m.accessTier,'VERSION',m.version,'ENTRY',m.entry)})"`
3. `terminal` mit `befehl=ls -l {{ordner}} && node --check {{ordner}}/$(node -pe "require('./{{ordner}}/manifest.json').entry")`
4. `terminal` mit `befehl=echo '{"text":"hallo"}' | node {{ordner}}/$(node -pe "require('./{{ordner}}/manifest.json').entry")`
   (nur bei `type` = `tool`; sonst diesen Schritt auslassen und als
   `nicht geprüft` melden.)

Schreibe danach deinen Bericht. Für JEDE der vier Zeilen gilt: übernimm den
Befund wörtlich aus der Werkzeug-Ausgabe des jeweiligen Schritts.

- **Manifest gelesen:** die Feldwerte GENAU so, wie Schritt 1/2 sie ausgegeben
  haben — nicht wie du sie erwarten würdest.
- **Syntax-Prüfung:** die Ausgabe von Schritt 3. Exit-Code 0 ohne Meldung heißt
  „in Ordnung"; jede Fehlermeldung wörtlich zitieren.
- **Testlauf:** die Ausgabe von Schritt 4, wörtlich.
- **Fazit:** ein Satz — brauchbar oder nicht, und warum.

Antworte auf Deutsch.
