---
name: erweiterung
beschreibung: Legt in der Erweiterungs-Werkstatt ein Erweiterungs-Gerüst an oder baut es geführt weiter.
argumente:
  - name: beschreibung
    typ: freitext
    beschreibung: Was die Erweiterung tun soll (ein bis drei Sätze)
    pflicht: true
  - name: typ
    typ: auswahl
    beschreibung: Art der Erweiterung
    optionen:
      - app
      - flow
      - tool
    standard: app
werkzeuge:
  - dateien_lesen
  - dateien_schreiben
  - terminal
ordner:
  - /arasul/sandbox/projects/werkstatt
grenzen:
  max_aufrufe: 20
  zeitlimit_s: 900
  werkzeug_runden: 20
---

Du baust in der **Erweiterungs-Werkstatt** eine Arasul-Erweiterung. Lies zuerst
die `ANLEITUNG.md` im Arbeitsverzeichnis (Werkzeug `dateien_lesen`), falls
vorhanden — sie beschreibt das Paketformat verbindlich.

Aufgabe des Nutzers: {{beschreibung}}
Gewünschter Typ: {{typ}} (app | flow | tool).

Gehe so vor:

1. Wähle eine `id` in Kleinbuchstaben-mit-Bindestrichen, passend zur Aufgabe.
   **Lege KEINEN Ordner separat an** — das Werkzeug `dateien_schreiben` schreibt
   Dateien, keine Ordner, und erzeugt fehlende Ordner im Pfad automatisch mit.
2. Schreibe als ERSTES die `manifest.json` unter dem Pfad `<id>/manifest.json`
   (also z. B. `mein-tool/manifest.json`) — damit entsteht der Ordner. Felder:
   `id`, `name`, `description`, `type` (= {{typ}}), `accessTier` (die
   niedrigste, die reicht: internet | internal | full), `version` ("0.1.0"),
   `arasulExtensionVersion` (1) und `entry` (die Startdatei je Typ).
3. Lege danach die Startdatei unter `<id>/<entry>` an:
   - **app**: eine `index.html` (in sich geschlossen, keine externen Skripte).
   - **flow**: eine `workflow.json` (gültiges n8n-Workflow-JSON).
   - **tool**: ein ausführbares Skript (z. B. `tool.mjs`), das stdin liest und
     JSON auf stdout schreibt.
4. Prüfe mit dem Werkzeug `terminal`, dass die Dateien gültig sind
   (z. B. `node --check` für ein `.mjs`, `cat manifest.json | node -e "JSON.parse(require('fs').readFileSync(0))"` für JSON).

Orientiere dich an den mitgelieferten Beispielen (`beispiel-app`,
`beispiel-flow`, `beispiel-tool`), falls sie im Arbeitsverzeichnis liegen.
Erfinde keine Felder, die die ANLEITUNG nicht nennt.

Schreibe zum Schluss eine kurze Antwort: welchen Unterordner du angelegt hast,
welchen Typ, und wie es weitergeht (in der Erweiterungen-Ansicht paketieren).
Antworte auf Deutsch.
