# Plan-Historie

Diese Seite ersetzt 80 abgeschlossene Plandateien mit zusammen 46074
Zeilen. Sie sind nicht verloren: **jede Datei steht vollstaendig in der
Git-Historie** und laesst sich mit dem Commit aus der letzten Spalte lesen:

```
git show <commit>:docs/plans/done/<datei>
```

Warum ueberhaupt: am 24.08.2026 war die abgeschlossene Plan-Historie
achtzigmal so gross wie der Plan, an dem gearbeitet wurde. Sie kostete keinen
Build und keinen Test, aber jeden Suchtreffer. Wer heute im Repo nach einem
Begriff sucht, soll nicht durch Arbeit von vor fuenf Monaten waten.

**Eine Datei ist geblieben:** die Uebergabe von Plan 023
([`done/023-feature-audit/UEBERGABE.md`](done/023-feature-audit/UEBERGABE.md)).
Dort stehen die acht Fallen, die einen halben Tag gekostet haben, und sie
gelten weiter. `CLAUDE.md` verweist darauf.

Ruhende Plaene stehen weiter unter [`paused/`](paused/README.md), der laufende
unter [`active/`](active/).

## Abgeschlossen

Durchgezogen und abgenommen. Die Nummern sind fortlaufend, die Luecke bei 010 und 020/021 liegt unter `archive/` beziehungsweise `paused/`.

| Plan                                           | Titel                                                                                            | zuletzt    | Commit     | Zeilen |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------ | ---------- | ---------- | -----: |
| `001-workspace-cursor-feinschliff.html`        | Plan 001 · Workspace 2.0 — Feinschliff auf Cursor-Niveau                                         | 2026-07-12 | `5d9455d9` |    942 |
| `002-cursor-shell-neubau.html`                 | Plan 002 · Cursor-Shell 3.0 — Neubau der Workspace-Shell                                         | 2026-07-13 | `242075a5` |    882 |
| `003-shell-panel-sidebar-feinschliff.html`     | Plan 003 · Cursor-Shell 3.1 — Ein rechtes Panel, Kontext-Sidebar & Feinschliff                   | 2026-07-13 | `f047da92` |    881 |
| `004-frontend-kundennutzen-politur.html`       | Plan 004 · Frontend-Politur — Kundennutzen & Komfort                                             | 2026-07-14 | `2849ebcb` |    850 |
| `005-frontend-shell-interaktiv.html`           | Plan 005 · Workspace-Shell: interaktiver Chat, Extensions & Dashboard                            | 2026-07-14 | `98d8e01b` |    822 |
| `006-feature-audit-funktioniert-wirklich.html` | Plan 006 · Feature-Audit „funktioniert wirklich"                                                 | 2026-07-18 | `b670c2e9` |    966 |
| `007-n8n-nahtlos-eingebettet.html`             | Plan 007 · Automationen nahtlos: n8n ohne zweite Anmeldung                                       | 2026-07-15 | `67aa1598` |    916 |
| `008-agenten-orchestrierung-neubau.html`       | Plan 008 · Arasul wird Agenten-Orchestrierung — Neuausrichtung, Entrümpelung, Härtung            | 2026-07-18 | `0c194241` |    950 |
| `009-frontend-feinschliff-cursor-shell.html`   | Plan 009 · Frontend-Feinschliff Runde 2 — Cursor-Shell, Store & robuste Downloads                | 2026-07-20 | `d028a266` |    925 |
| `011-skills-im-chat.html`                      | Plan 011 · Skills im Chat — Agenten & Flüsse raus, Slash-Befehle rein                            | 2026-07-23 | `297a52cc` |   1153 |
| `012-workspace-neuausrichtung.html`            | Plan 012 · Arbeitsumgebung neu ausgerichtet — Ein Ordner-Kontext, Marktplatz-Sidebar, Skills-Zen | 2026-08-05 | `d20d1c88` |    932 |
| `013-ide-flow-plattform.html`                  | Arasul · Plan 013 — IDE & Flow-Plattform                                                         | 2026-07-27 | `377259ac` |    226 |
| `014-standardprojekte.html`                    | Plan 014 · Standardprojekte & verlässliche Flows                                                 | 2026-08-04 | `4f8654b7` |    868 |
| `015-dev-umgebung-bombenfest.html`             | Plan 015 · Dev-Umgebung bombenfest — Terminal & KI-Login                                         | 2026-08-05 | `e435d888` |    954 |
| `016-arbeitsbereich-ux-bombenfest.html`        | Plan 016 · Arbeitsbereich-UX bombenfest                                                          | 2026-08-06 | `fac538af` |    836 |
| `017-werkstatt-erweiterungs-plattform.html`    | Plan 017 · Werkstatt & Erweiterungs-Plattform                                                    | 2026-08-12 | `5921555e` |   1023 |
| `018-projekt-vereinheitlichung.html`           | Plan 018 · Projekt-Vereinheitlichung im Workspace                                                | 2026-08-13 | `c315f326` |    597 |
| `019-chat-agent-ux-und-dateien.html`           | Plan 019 · Chat-Agent-UX auf Cursor-Niveau + große Dateien                                       | 2026-08-14 | `83672239` |    584 |
| `022-frontend-chat-agent-power.html`           | Plan 022 · Frontend-Härtung & Coding-Agent mit voller Power                                      | 2026-08-18 | `425a1ae1` |    628 |
| `023-feature-audit`                            | Plan 023, Feature-Audit Arasul Jet: Umsetzung                                                    | 2026-08-24 | `4837f70b` |   5356 |
| `bugfix-batch-live-audit-2026-07-07.md`        | Bugfix-Batch: Live-Audit-Befunde (2026-07-07)                                                    | 2026-07-07 | `43bd9001` |     60 |
| `einheitlicher-zugriff-lan-tailscale.md`       | Einheitlicher Zugriff: LAN-Standard (arasul.local) + Remote via Tailscale-Name                   | 2026-07-07 | `08bd27ed` |    227 |
| `frontend-ui-konsistenz-polish.md`             | Frontend UI — Konsistenz & Polish (Foundation-first)                                             | 2026-07-06 | `4c096557` |    178 |
| `ide-workspace-shell.md`                       | IDE-Workspace-Shell — Second Brain + Tab-Arbeitsfläche + LLM-Panel                               | 2026-07-10 | `84330cdc` |    172 |
| `repo-consolidation-cleanup.md`                | Repo-Konsolidierung & Cleanup — saubere Produktionsbasis                                         | 2026-07-06 | `56ed8301` |    163 |
| `settings-audit-consolidation-2026-07-07.md`   | Einstellungen — Audit, Konsolidierung (9→6 Reiter) & Härtung                                     | 2026-07-07 | `924627ad` |    201 |

## Aelter, ueberholt oder abgebrochen

Aus der Zeit vor der Nummerierung, oder von einem spaeteren Plan ueberholt. Nicht danach handeln.

| Plan                                                 | Titel                                                                     | zuletzt    | Commit     | Zeilen |
| ---------------------------------------------------- | ------------------------------------------------------------------------- | ---------- | ---------- | -----: |
| `010-flow-agenten-orchestrierung.html`               | Plan 010 · Flow-Agenten — lokale KI-Orchestrierung                        | 2026-07-21 | `a7814b83` |    886 |
| `2026-03-31_llm-optimization-plan.md`                | LLM Chat Optimization Plan                                                | 2026-05-03 | `fad9c0ad` |    189 |
| `2026-03-31_production-readiness-plan.md`            | Arasul Production Readiness Plan                                          | 2026-05-03 | `fad9c0ad` |    375 |
| `2026-04-09_comprehensive-improvement-plan.md`       | Arasul Platform — Ultimativer Improvement Plan                            | 2026-05-03 | `fad9c0ad` |    952 |
| `2026-04-13_production-readiness-report.md`          | Arasul Platform — Production Readiness Report                             | 2026-05-03 | `fad9c0ad` |    482 |
| `2026-04-15_production-hardening-plan.md`            | Arasul Production Hardening Plan                                          | 2026-05-03 | `fad9c0ad` |    563 |
| `2026-04-17_rag-optimization-plan.md`                | RAG-System Optimierungsplan — Arasul Platform                             | 2026-05-03 | `fad9c0ad` |    527 |
| `2026-04-20_platform-refactoring-plan.md`            | Arasul Platform — Refactoring & Hardening Plan                            | 2026-05-03 | `fad9c0ad` |    271 |
| `2026-05-01_telegram-system-monitor-prd.md`          | PRD — Arasul Store App: Telegram System Monitor                           | 2026-06-03 | `916be4a3` |    755 |
| `2026-05-07_repo-audit-sanierung.md`                 | Repo-Audit + Sanierung                                                    | 2026-06-03 | `e992581f` |    471 |
| `2026-05-08_regressed-features-inventory.md`         | Regressed-Features-Inventar (Phase-0-Output)                              | 2026-06-03 | `e992581f` |    164 |
| `2026-05-13_llm-rag-store-routing-optimization.md`   | LLM + RAG + Model-Store + Multi-Modell-Routing — Optimization Plan        | 2026-06-03 | `e992581f` |    372 |
| `2026-05-14_side-branch-cherry-pick.md`              | Side-Branch Cherry-Pick Master Plan — alle 4 Themen aus den Side-Branches | 2026-07-14 | `1a88c37f` |    227 |
| `2026-05_dx-overhaul.md`                             | DX Overhaul — Developer Experience & Claude Code Setup                    | 2026-05-05 | `b674d795` |   1030 |
| `2026-06-03_full-platform-audit.md`                  | Arasul Platform — Vollständiger Audit & Verbesserungsplan (2026-06-03)    | 2026-07-02 | `3f6434c1` |    695 |
| `2026-07-02_dependabot-hardening.md`                 | Dependabot + Lock-File Hardening                                          | 2026-07-02 | `3f6434c1` |    126 |
| `2026-07-02_external-integrations.md`                | External Integrations Hardening — n8n Workflows + Telegram Bots           | 2026-07-02 | `3f6434c1` |    485 |
| `2026-07-03_full-audit-fresh-install-reliability.md` | Voll-Audit: Fresh-Install-Zuverlässigkeit & Codebase-Härtung              | 2026-07-04 | `22bad347` |    626 |
| `2026-07-05_frontend-llm-grossrefactor.md`           | Frontend & LLM Großrefactor — Optik, Qualität, Kontext                    | 2026-07-07 | `6de485a8` |    207 |
| `2026-07-07_field-1.0.0-master-plan.md`              | FELD-1.0.0 MASTERPLAN — arasul-platform                                   | 2026-07-14 | `1a88c37f` |    315 |
| `2026-07-07_repo-doc-sync.md`                        | Repo Doc-Sync — Doku wieder mit Code in Deckung bringen                   | 2026-07-14 | `1a88c37f` |    107 |
| `repo-deep-audit-2026-05-08.md`                      | Repo-Deep-Audit 2026-05-08 — Bug-Sanierung (20-Agent-Audit)               | 2026-07-02 | `3f6434c1` |    385 |

---

Die Spalte „Zeilen" nennt die Hauptdatei je Plan, zusammen 32 502. Die
Gesamtzahl oben (46074) ist groesser, weil einige Plaene Beiwerk hatten:
Rundgangsseiten, ein Bauskript, zwei Maskottchen-Bilder.
