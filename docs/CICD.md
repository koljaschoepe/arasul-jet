# CI/CD — Agent-first Pipeline (Plan → PR → Auto-Merge → Deploy)

> **Zwei Einstiege: `/plan` und `/work`.** `/plan` produziert eine
> kommentierbare HTML-Plan-Seite; nach deiner Freigabe führt `/work` (oder der
> Nightly-Run) **alles** automatisch bis auf den Jetson aus — inklusive
> Live-Verifikation auf dem Gerät. Kein `/ship`, kein `/deploy`, kein
> manueller Merge.

## Der Loop

```
/plan "Feature X"
│
├─ 1 Interview (AskUserQuestion, ≥8 Fragen)  ┐
├─ 2 Research (research-agent)               │  Planung
├─ 3 Plan-Seite  docs/plans/active/NNN-<slug>.html
├─ 4 Kommentar-/Revisions-Schleife → Freigabe  ← DEIN EINZIGER MANUELLER GATE
│
/work   (manuell oder nachts via scripts/util/nightly-run.sh)
│
├─ 5 Branch  NNN-<slug>  +  autonome Ausführung
├─ 6 code-reviewer  (Critical-Findings = harter Stop)
├─ 7 Auto-Ship: Lint + Tests + Conventional Commit
├─ 8 Auto-Deliver: push + gh pr create + gh pr merge --auto --squash
│
▼  GitHub
CI (.github/workflows/test.yml)  ──►  Required Check „CI Summary"
│                                       grün? → Auto-Merge (squash) auf main
▼
push auf main  ──►  .github/workflows/deploy.yml  (runs-on: self-hosted, jetson)
│
▼  Jetson (self-hosted Runner, User arasul)
scripts/deploy/deploy-local.sh
├─ git reset --hard <sha>  (im kanonischen ~/arasul/arasul-jet, .env/data intakt)
├─ nur GEÄNDERTE Services ermitteln (git diff)
├─ DB-Dump vor Backend-/Migrations-Änderung  → ~/db-backups/
├─ Images als :rollback taggen
├─ docker compose -p arasul-platform build + up -d  (nur geänderte Services)
├─ Healthcheck (container_name, bis healthy / Timeout)
└─ Fehler? → Auto-Rollback: :rollback→:latest, up -d, git reset --hard PREV
│
▼  zurück im /work-Lauf
├─ 9 Live-Verify auf dem Jetson (Playwright gegen https://100.121.244.80/, Health, Logs)
└─ 10 Report: Plan-Seite → Ausführungs-Report, active/ → done/, ROADMAP.html aktualisiert
```

## Warum diese Architektur

| Entscheidung                                            | Grund                                                                                                                                                                                                                                                    |
| ------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Self-hosted Runner auf dem Jetson**                   | Die Box hängt hinter Heim-NAT — kein eingehender Port. Der Runner baut eine ausgehende Verbindung zu GitHub auf und führt den Deploy lokal aus. Deploy-Logs sichtbar im **Actions**-Tab.                                                                 |
| **Deploy aus `~/arasul/arasul-jet`, nicht aus `_work`** | `.env`, `config/`, `data/` und alle Bind-Mounts hängen an diesem Pfad. Ein Build aus dem Runner-`_work`-Checkout würde auf leere Volumes zeigen. Der Runner-Checkout liefert nur das aktuelle Deploy-**Skript**; gebaut wird im kanonischen Verzeichnis. |
| **Nur geänderte Services rebuilden**                    | `docker compose build <svc>` statt ganzem Stack — kein unnötiger Downtime, warmer Build-Cache. Andere Stacks (`flow-*`, `livia-*`, `jarvis-*`) bleiben unberührt (`-p arasul-platform`-Scoping).                                                         |
| **CI-Gate „CI Summary"**                                | Aggregiert Backend-Tests + Docker-Build-Smoke. Nur bei grün merged GitHub automatisch. Frontend-Lint/Tests sind bewusst non-blocking (Backlog).                                                                                                          |
| **Auto-Rollback**                                       | Deploy = Rebuild auf der Live-Appliance. Healthcheck + Image-Rücktaggen + `git reset` stellen bei jedem Fehlschlag den Vorzustand her.                                                                                                                   |
| **Jetson = reines Deploy-Ziel**                         | Kein Hand-Editieren mehr auf der Box; jeder Deploy setzt hart auf `origin/main`. Alle Entwicklung läuft über den Mac / Claude Code.                                                                                                                      |

## Komponenten

| Datei / Ort                                     | Rolle                                                                                           |
| ----------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `.claude/skills/plan/` + `.claude/skills/work/` | Plan-Seite (Interview → Freigabe) bzw. Ausführung (Branch → PR → Deploy → Live-Verify → Report) |
| `scripts/util/nightly-run.sh`                   | Nightly: `/work --nightly` — bis 3 Pläne + Dependabot/PR-Chores, Telegram-Report                |
| `.github/workflows/deploy.yml`                  | Deploy-Trigger (push→main), self-hosted                                                         |
| `scripts/deploy/deploy-local.sh`                | Deploy-Logik + Healthcheck + Rollback                                                           |
| `.github/workflows/test.yml`                    | CI (unverändert), liefert den Required-Check                                                    |
| Runner-Dienst auf dem Jetson                    | `~/actions-runner/`, systemd `actions.runner.*.service`                                         |
| GitHub Branch-Protection `main`                 | Required Check „CI Summary", Auto-Merge aktiv                                                   |

## Betrieb / Runbook

- **Deploy-Status:** GitHub → Repo → **Actions** → „Deploy". Job-Summary zeigt
  gebaute Services bzw. Rollback-Grund.
- **Runner-Status auf der Box:**
  `systemctl status 'actions.runner.*'` · Logs: `journalctl -u 'actions.runner.*' -f`
- **Manueller Deploy (Notfall):** auf der Box
  `cd ~/arasul/arasul-jet && GITHUB_WORKSPACE=$PWD GITHUB_SHA=$(git rev-parse origin/main) bash scripts/deploy/deploy-local.sh`
- **Rollback war nötig?** Der Deploy-Job ist rot, der Stand wurde automatisch
  auf den vorherigen Commit + Images zurückgesetzt. DB-Dump liegt in
  `~/db-backups/pre-deploy_*.sql`.
- **Auto-Merge hängt:** PR bleibt offen, wenn „CI Summary" rot ist → CI-Log
  ansehen, fixen, neu pushen. Kein stiller Merge ohne grüne CI.

## Grenzen / bewusst offen

- Migrationen laufen beim Backend-Start (`migrationRunner`, idempotent via
  `schema_migrations`). Ein fehlschlagender Migrationslauf löst **noch** keinen
  eigenen Alarm aus (Masterplan P1-3) — der Healthcheck fängt einen daraus
  resultierenden Backend-Crash aber ab und rollt zurück.
- Der Offline-OTA-Kanal (signierte `.araupdate`-USB-Pakete) bleibt davon
  unberührt — das ist der separate Kundenkanal, nicht dieser Dev-Loop.
