# Implementierungs-Workflow

Für Feature/Task: $ARGUMENTS

## Schritte

1. **Analyse**
   - Anforderung verstehen
   - Betroffene Dateien identifizieren
   - Kurzen Plan erstellen

2. **Implementierung**
   - In kleinen, testbaren Schritten arbeiten
   - Existierende Patterns folgen (siehe CLAUDE.md)
   - Design-System beachten (siehe docs/DESIGN_SYSTEM.md)

3. **Testing**
   - Tests parallel zur Implementierung schreiben/aktualisieren
   - Nach jeder logischen Einheit: Tests ausführen
     - Backend: `cd services/dashboard-backend && npm test`
     - Frontend: `cd services/dashboard-frontend && CI=true npm test`
     - Python: `pytest tests/unit -v`

4. **Commit**
   - Nur bei grünen Tests
   - Atomarer Commit mit beschreibender Message
   - Format: `feat|fix|refactor|test|docs: Kurzbeschreibung`

5. **Task abhaken**
   - In tasks.md als erledigt markieren
   - Kurzes Summary der Änderungen ausgeben

## Bei Problemen

- Blocker in `docs/blockers.md` dokumentieren
- Notification: `./scripts/telegram-notify.sh "BLOCKER: [Beschreibung]"`
- Nicht raten - bei Unklarheit stoppen
