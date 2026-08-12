# AGENTS.md — Arasul-Erweiterung bauen (für Codex & andere Agenten)

Dieser Ordner ist eine **Erweiterungs-Werkstatt** von Arasul: eine Sandbox mit
Terminal, in der du auf der lokalen Basis eine Erweiterung baust — eine App
(eigener Tab), einen Flow (n8n-Automation) oder ein Tool (Konnektor). Am Ende
wird der Ordner zu einem Paket, das der Admin live schaltet.

Claude Code hat dafür die Befehle `/plan`, `/execute`, `/info`
(`.claude/commands/`). Als Codex/anderer Agent folge demselben Ablauf von Hand:

## Ablauf

1. **Planen (wie `/plan`):** Kläre mit dem Nutzer Art (App/Flow/Tool), Zweck,
   benötigte KI-Brücken-Fähigkeiten und Verbindungen, sowie Prüfschritte.
   Schreib das Ergebnis in eine anschaubare `PLAN.html` im Wurzelordner.
2. **Bauen (wie `/execute`):** Setze den Plan Schritt für Schritt um. Halte dich
   ans Paketformat (`manifest.json` + Assets, s. `kontext/erweiterungen.md`).
   Nach jedem Schritt bleibt die Erweiterung lauffähig.
3. **Prüfen:** Syntax-Check, Testlauf, Manifest-Validität — gegen die
   Prüfschritte des Plans.

## Wichtige Regeln

- **Keine Secrets ins Paket.** Externe Zugänge kommen zur Laufzeit aus den
  Projekt-Verbindungen als Env-Variablen bzw. über die generierte `.mcp.json`
  (Claude Code) / Codex-`config.toml` unter `$CODEX_HOME`. Siehe
  `kontext/verbindungen.md`.
- **KI-Brücke nur, was nötig ist.** Deklariere im `manifest.json`
  `"faehigkeiten": [...]` (Teilmenge von `llm`, `rag`, `dateien`, `flows`); der
  Admin gibt sie beim Live-Schalten frei. Nutzung über `arasul-bruecke.js` —
  siehe `kontext/bruecke.md`.
- **Kundendaten sind tabu.** Als Coding-Agent baust du die Basis, du greifst
  nicht auf Kundendaten zu; die gewählte Zugriffsstufe des Projekts steckt den
  Rahmen ab.

Details für Menschen: `ANLEITUNG.md`. Kontext-Dateien: `kontext/`.
