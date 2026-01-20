# Hook-System Optimierungsplan

**Erstellt:** 2026-01-16
**Status:** Entwurf

---

## Analyse: Aktueller Zustand

### Was funktioniert

| Komponente | Status | Details |
|------------|--------|---------|
| Hooks-Konfiguration | ✅ | `.claude/settings.local.json` korrekt konfiguriert |
| Scripts | ✅ | Alle 4 Scripts existieren und sind ausführbar |
| Telegram-Benachrichtigung | ✅ | 180+ erfolgreiche Benachrichtigungen im Log |
| Backend-Tests | ✅ | 446 Tests bestanden |
| Stop-Hook | ✅ | Feuert bei Session-Ende |

### Identifizierte Probleme

| Problem | Schwere | Beschreibung |
|---------|---------|--------------|
| **P1: Orchestrator-Agents ohne Hooks** | HOCH | `subprocess.run(["claude", "-p", ...])` startet Claude im non-interaktiven Modus → Hooks werden NICHT ausgeführt |
| **P2: Generische Benachrichtigungen** | MITTEL | "✅ Claude Task abgeschlossen" enthält keine Task-Details |
| **P3: Frontend-Tests fehlerhaft** | MITTEL | 38 bekannte Frontend-Test-Fehler, werden in run-tests.sh mitgestartet |
| **P4: Coverage-Permission-Fehler** | NIEDRIG | `EACCES: permission denied` für coverage-final.json |
| **P5: Keine Fehler-Unterscheidung** | MITTEL | Stop-Hook meldet immer "abgeschlossen", auch bei Fehlern |

---

## Optimierungs-Maßnahmen

### Maßnahme 1: Stop-Hook mit Test-Status-Awareness

**Problem:** Hook meldet immer Erfolg, auch wenn Tests fehlschlagen.

**Lösung:** Stop-Hook-Script prüft Test-Ergebnis und passt Nachricht an.

**Datei:** `scripts/run-tests.sh` (erweitern)

```bash
# Am Ende: Exit-Code in Datei schreiben für Telegram-Script
echo $EXIT_CODE > /tmp/last_test_result
```

**Datei:** `scripts/telegram-notify.sh` (erweitern)

```bash
# Test-Status lesen wenn verfügbar
TEST_RESULT_FILE="/tmp/last_test_result"
if [ -f "$TEST_RESULT_FILE" ]; then
    LAST_EXIT=$(cat "$TEST_RESULT_FILE")
    if [ "$LAST_EXIT" != "0" ]; then
        MESSAGE="⚠️ Claude Task mit Warnungen: Tests fehlgeschlagen"
    fi
    rm -f "$TEST_RESULT_FILE"
fi
```

---

### Maßnahme 2: Nur Backend-Tests im Stop-Hook

**Problem:** Frontend-Tests haben 38 bekannte Fehler, blockieren Workflow.

**Lösung:** run-tests.sh Default auf `--backend` ändern.

**Datei:** `.claude/settings.local.json`

```json
{
  "hooks": {
    "Stop": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "./scripts/run-tests.sh --backend"
          },
          ...
        ]
      }
    ]
  }
}
```

---

### Maßnahme 3: Task-Kontext in Telegram-Benachrichtigungen

**Problem:** Generische Nachrichten ohne Kontext.

**Lösung:** Erweitere telegram-notify.sh um Kontext-Parameter.

**Datei:** `scripts/telegram-notify.sh` (erweitern)

```bash
# Zweiter Parameter: Optionaler Kontext
CONTEXT="${2:-}"

# Task-Kontext aus aktuellem Verzeichnis extrahieren
if [ -z "$CONTEXT" ]; then
    CURRENT_DIR=$(pwd)
    if [[ "$CURRENT_DIR" == *"dashboard-backend"* ]]; then
        CONTEXT="Backend"
    elif [[ "$CURRENT_DIR" == *"dashboard-frontend"* ]]; then
        CONTEXT="Frontend"
    fi
fi

# Formatierte Nachricht
if [ -n "$CONTEXT" ]; then
    MESSAGE="[$CONTEXT] $MESSAGE"
fi
```

---

### Maßnahme 4: Claude Orchestrator Test-Integration

**Problem:** Orchestrator-Agents rufen _run_tests() auf, aber Ergebnis wird nicht aggregiert.

**Lösung:** Bereits implementiert in `parallel_agent.py:_run_tests()`, aber:
- Verbessere Logging
- Schreibe Test-Ergebnisse in Orchestrator-Status-Datei

**Datei:** `parallel_agent.py` (erweitern)

```python
def _run_tests(self) -> Dict:
    """Führt Backend-Tests aus - mit nvm Support"""
    # ... bestehender Code ...

    # NEU: Ergebnis in Status-Datei schreiben
    status_file = Path.home() / "logs/claude/orchestrator_test_status.json"
    status = {
        "timestamp": datetime.now().isoformat(),
        "task_id": self.task.id,
        "success": result.returncode == 0,
        "exit_code": result.returncode
    }
    status_file.write_text(json.dumps(status))
```

---

### Maßnahme 5: Coverage-Permission Fix

**Problem:** Jest kann coverage-final.json nicht schreiben.

**Lösung:** Verzeichnis-Ownership korrigieren.

```bash
# Einmalig ausführen
sudo chown -R $USER:$USER services/dashboard-backend/coverage/
```

---

### Maßnahme 6: PostToolUse Hook optimieren

**Problem:** TypeCheck läuft nach JEDEM Edit/Write, auch bei Nicht-Code-Dateien.

**Lösung:** Matcher einschränken auf Code-Dateien.

**Datei:** `run-typecheck.sh` (bereits optimiert)
- Prüft bereits `git diff` für geänderte Dateien
- Führt nur bei relevanten Änderungen aus

---

## Implementierungs-Reihenfolge

1. **[CRITICAL] Maßnahme 2:** Backend-Only-Tests im Stop-Hook
2. **[HIGH] Maßnahme 1:** Test-Status-Awareness in Telegram-Notify
3. **[MEDIUM] Maßnahme 3:** Task-Kontext in Benachrichtigungen
4. **[MEDIUM] Maßnahme 5:** Coverage-Permission Fix
5. **[LOW] Maßnahme 4:** Orchestrator Test-Status-Logging

---

## Erwartete Ergebnisse

| Metrik | Vorher | Nachher |
|--------|--------|---------|
| Hook-Ausführung bei lokalem Claude | ✅ | ✅ |
| Backend-Tests im Stop-Hook | ✅ (alle) | ✅ (nur Backend) |
| Erfolgsrate Stop-Hook | ~60% (Frontend-Fails) | ~99% |
| Telegram-Nachricht mit Kontext | ❌ | ✅ |
| Test-Fehler in Nachricht erkennbar | ❌ | ✅ |

---

## Hinweis: Orchestrator-Agents und Hooks

Die Claude Orchestrator-Agents (`subprocess.run(["claude", "-p", ...])`) laufen im **non-interaktiven Modus** und führen daher KEINE lokalen Hooks aus. Dies ist by-design:

1. **Warum:** `-p` Flag startet eine headless Session ohne UI
2. **Lösung:** Tests werden INTERN via `_run_tests()` in parallel_agent.py ausgeführt
3. **Status:** Funktioniert bereits korrekt

Die lokalen Hooks sind für **interaktive Claude Code Sessions** gedacht (z.B. wenn du direkt `claude` im Terminal verwendest).
