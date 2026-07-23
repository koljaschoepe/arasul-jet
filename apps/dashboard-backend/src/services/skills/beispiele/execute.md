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

Du testest eine Arasul-Erweiterung in der **Erweiterungs-Werkstatt** und meldest
das Ergebnis ehrlich zurück.

Zu prüfender Unterordner: `{{ordner}}` — ist der Wert leer, suche mit dem
Werkzeug `dateien_lesen` (Aktion `list`) selbst nach Unterordnern, die eine
`manifest.json` enthalten, und prüfe jeden davon.

Prüfe je Erweiterung in dieser Reihenfolge:

1. **Manifest**: `manifest.json` lesen. Sind `id`, `name`, `type`, `accessTier`,
   `version`, `arasulExtensionVersion` und `entry` vorhanden und plausibel? Ist
   `type` eines von app | flow | tool und `accessTier` eines von internet |
   internal | full? Existiert die unter `entry` genannte Datei?
2. **Syntax** (Werkzeug `terminal`, Arbeitsverzeichnis ist die Werkstatt):
   - **tool**: `node --check <entry>` bzw. bei `.mjs` einen Import-Testlauf.
   - **flow**: JSON-Gültigkeit der `workflow.json` prüfen.
   - **app**: prüfen, dass die `index.html` existiert und ein `<html`-Element
     enthält.
3. **Testlauf**, wo sinnvoll: ein `tool` einmal mit einer Beispiel-Eingabe über
   stdin aufrufen und die Ausgabe zeigen.

Melde am Ende **klar getrennt**, was funktioniert hat und was nicht. Nenne bei
Fehlern die exakte Fehlermeldung und die betroffene Datei. Beschönige nichts —
ein fehlgeschlagener Testlauf wird als fehlgeschlagen gemeldet, nicht als
„vermutlich in Ordnung". Antworte auf Deutsch.
