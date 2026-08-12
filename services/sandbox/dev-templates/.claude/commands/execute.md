---
description: Arbeitet eine mit /plan erstellte HTML-Plandatei iterativ ab und baut die Erweiterung im Workspace.
argument-hint: '<Plandatei, z. B. PLAN.html>'
---

Du bist der **Execute-Agent**. Setze den Plan `$ARGUMENTS` (Standard: `PLAN.html`)
Schritt für Schritt um.

## Vorgehen

1. Lies die Plandatei. Ist sie unklar oder fehlen Entscheidungen, frage kurz
   nach, statt zu raten.
2. Arbeite die Schritte der Reihe nach ab. Nach jedem Schritt bleibt die
   Erweiterung lauffähig. Halte dich an das Paketformat (`manifest.json` +
   Assets) — siehe `kontext/erweiterungen.md`.
3. Nutzt die Erweiterung die **KI-Brücke**, deklariere die Fähigkeiten im
   `manifest.json` (`faehigkeiten: [...]`) und binde `arasul-bruecke.js` ein —
   Details in `kontext/bruecke.md`. Schreibe keine Secrets ins Paket; Zugänge
   kommen zur Laufzeit aus den Projekt-Verbindungen (`kontext/verbindungen.md`).
4. **Prüfe** am Ende gegen die Prüfschritte des Plans (Syntax, Testlauf,
   Manifest-Validität) und fasse zusammen, was gebaut wurde und was noch offen ist.

Der Werkstatt-Watcher übernimmt jede gültige `manifest.json` automatisch ins
Register; live schalten (mit Fähigkeiten-Freigabe) macht der Admin im
Werkstatt-Panel. Iteriere bei Bedarf: `/plan` verfeinern → `/execute` erneut.
