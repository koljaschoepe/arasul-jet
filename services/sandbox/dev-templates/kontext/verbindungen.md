# Projekt-Verbindungen & MCP

Extern gehostete Systeme (z. B. Supabase, Vercel) und MCP-Server werden **pro
Projekt** hinterlegt — verschlüsselt, nie im Klartext im Workspace. So kann der
Coding-Agent sie von hier aus mitverwalten, ohne dass Zugangsdaten im Paket
landen.

## Anlegen

Der Admin legt Verbindungen im Dashboard an (Projekt-Verbindungen). Zwei Arten:

- **`env`** — eine Umgebungsvariable (Name + geheimer Wert), z. B.
  `SUPABASE_URL`, `SUPABASE_KEY`.
- **`mcp`** — ein MCP-Server (Kommando + Argumente, optional ein Token unter
  einem `valueEnv`-Namen).

## Zur Laufzeit

Beim Start einer Terminal-Sitzung injiziert das Backend:

- die **Env-Variablen** (per Name — der geheime Wert steht nie in der
  Kommandozeile, nur in der Umgebung);
- eine generierte **`/workspace/.mcp.json`** (Claude Code liest sie automatisch);
- eine **Codex-`config.toml`** unter `$CODEX_HOME` (= `/workspace/.codex`).

In beiden Konfig-Dateien stehen MCP-Secrets nur als `${ENV}`-Platzhalter — der
echte Token kommt als Env-Variable dazu.

**Regel:** Schreib keine Zugangsdaten in dein Paket oder in Dateien im
Workspace. Lies sie zur Laufzeit aus der Umgebung. Die generierten Konfig-
Dateien werden bei jedem Sitzungsstart neu geschrieben — bearbeite sie nicht
von Hand.
