# Arasul Development Queue

Letzte Aktualisierung: 2026-01-14

---

## Arbeitsanweisungen

Claude arbeitet diese Liste sequentiell ab:
1. Priority 1 zuerst (von oben nach unten)
2. Nach jedem Task: Tests ausführen, bei Erfolg committen
3. Erledigte Tasks abhaken
4. Bei Blockern: In `docs/blockers.md` dokumentieren

---

## Priority 1 - Heute erledigen

- [x] Test: Verifiziere dass alle Backend-Unit-Tests grün sind und dokumentiere die aktuelle Test-Coverage in docs/session-state.md
  - 2026-01-15: 311/387 Tests bestanden (80.4%), Coverage-Thresholds erfüllt
  - Failures sind umgebungsbedingt (ARM-Timeouts, Container-Timing)

---

## Priority 2 - Diese Woche

- [ ] _Backlog-Items_

---

## Priority 3 - Backlog

- [ ] _Niedrigere Priorität_

---

## Erledigt (zur Referenz)

- [x] 2026-01-14: Autonomes Development Setup eingerichtet
  - .claude/settings.local.json mit Permissions und Hooks
  - Scripts: telegram-notify.sh, run-tests.sh, run-typecheck.sh, claude-autonomous.sh
  - Task-Management: tasks.md, docs/blockers.md, docs/session-state.md
  - Custom Commands: implement, test, review
