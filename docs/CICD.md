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
/work   (interaktiv, oder lang via scripts/util/autonom-run.sh — Handstart)
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
├─ die Installation finden (Docker-Etikett, scripts/lib/installation.sh)
├─ git reset --hard <sha>  (dort; .env/config/data sind unversioniert und bleiben)
├─ SYSTEM_VERSION/BUILD_HASH in .env stempeln (scripts/lib/fassung.sh)
├─ nur GEÄNDERTE Services ermitteln (git diff)
├─ DB-Dump vor Backend-/Migrations-Änderung  → ~/db-backups/
├─ Images als :rollback taggen
├─ docker compose -p arasul-platform build + up -d  (nur geänderte Services)
├─ Healthcheck (container_name, bis healthy / Timeout)
├─ Migrationsbuch prüfen (keine `success = false`, höchste .sql angewendet)
└─ Fehler? → Auto-Rollback: :rollback→:latest, up -d, git reset --hard PREV
   (Ausnahme Migrationsbuch: rot ohne Rollback, siehe unten)
│
▼  zurück im /work-Lauf
├─ 9 Live-Verify auf dem Jetson (Playwright gegen https://100.121.244.80/, Health, Logs)
└─ 10 Report: Plan-Seite → Ausführungs-Report, active/ → done/, ROADMAP.html aktualisiert
```

## Warum diese Architektur

| Entscheidung                                            | Grund                                                                                                                                                                                                                                                                                                                                                   |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Self-hosted Runner auf dem Jetson**                   | Die Box hängt hinter Heim-NAT — kein eingehender Port. Der Runner baut eine ausgehende Verbindung zu GitHub auf und führt den Deploy lokal aus. Deploy-Logs sichtbar im **Actions**-Tab.                                                                                                                                                                |
| **Deploy dorthin, wo der Stapel wirklich läuft** | `.env`, `config/`, `data/` und alle Bind-Mounts hängen an einem Pfad, und der Runner-`_work`-Checkout ist nicht dieser Pfad — er liefert nur das aktuelle Deploy-**Skript**. Bis zum 29.08.2026 stand der Zielpfad fest im Workflow (`~/arasul/arasul-jet`). Seit der Orin über das Ara-Kit installiert wurde, lief der Stapel aber aus `/home/arasul/arasul-<Fassung>`: der Deploy arbeitete in einem Verzeichnis ohne Geheimnisse und war rot (Lauf 33221221851), ohne dass sich eine Zeile geändert hätte. Gefragt wird deshalb Docker (`com.docker.compose.project.working_dir`, `scripts/lib/installation.sh`); findet sich keine Installation, ist der Deploy **rot** und fasst nichts an. Ein aus dem Artefakt installiertes Gerät hat kein `.git` — der Deploy legt es an und baut beim ersten Mal alle Dienste, weil `PREV..NEW` dort die falsche Frage wäre. Siehe [ops/AUSLIEFERUNG.md](ops/AUSLIEFERUNG.md). |
| **Nur geänderte Services rebuilden**                    | `docker compose build <svc>` statt ganzem Stack — kein unnötiger Downtime, warmer Build-Cache. Andere Stacks (`flow-*`, `livia-*`, `jarvis-*`) bleiben unberührt (`-p arasul-platform`-Scoping).                                                                                                                                                        |
| **CI-Gate „CI Summary"**                                | Aggregiert Backend-Tests + Docker-Build-Smoke. Nur bei grün merged GitHub automatisch. Frontend-Lint/Tests sind bewusst non-blocking (Backlog).                                                                                                                                                                                                         |
| **Auto-Rollback**                                       | Deploy = Rebuild auf der Live-Appliance. Healthcheck + Image-Rücktaggen + `git reset` stellen bei jedem Fehlschlag den Vorzustand her.                                                                                                                                                                                                                  |
| **Migrationsbuch als eigener Schritt**                  | Das Backend fährt seine Migrationen **nach** `server.listen()`. Es ist also gesund, bevor feststeht, ob das Schema steht: am 27.08.2026 meldete der Deploy grün, während Migration 169 mit `success = false` im Buch stand. Geprüft wird deshalb beides, mit Geduld: keine gescheiterte Migration, und die höchste `.sql` auf der Platte steht im Buch. |
| **Migrationsbuch rot, aber ohne Rollback**              | Ein Rollback taggt Images zurück und setzt `git` zurück; am Schema ändert er nichts, denn was vor der gescheiterten Migration lief, ist längst festgeschrieben. Er würde alten Code auf ein neues Schema stellen. Der neue Stand bleibt stehen, der Deploy wird rot.                                                                                    |
| **Jetson = reines Deploy-Ziel**                         | Kein Hand-Editieren mehr auf der Box; jeder Deploy setzt hart auf `origin/main`. Alle Entwicklung läuft über den Mac / Claude Code.                                                                                                                                                                                                                     |

## Komponenten

| Datei / Ort                                     | Rolle                                                                                                                                                                                                        |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `.claude/skills/plan/` + `.claude/skills/work/` | Plan-Seite (Interview → Freigabe) bzw. Ausführung (Branch → PR → Deploy → Live-Verify → Report)                                                                                                              |
| `scripts/util/autonom-run.sh`                   | Handstart, langer Lauf: `/work --autonom` — freigegebene Pläne, ein Merge je Phase, PR-Sweep, Telegram-Bericht. Keine Zeitsteuerung                                                                          |
| `.github/workflows/deploy.yml`                  | Deploy-Trigger (push→main), self-hosted                                                                                                                                                                      |
| `scripts/deploy/deploy-local.sh`                | Deploy-Logik + Healthcheck + Rollback                                                                                                                                                                        |
| `.github/workflows/test.yml`                    | CI (unverändert), liefert den Required-Check                                                                                                                                                                 |
| `.github/workflows/release.yml`                 | Ein Tag `v*` baut das Auslieferungsartefakt (`scripts/deploy/artefakt-bauen.sh`) und hängt es samt Prüfsumme an ein GitHub-Release. `workflow_dispatch` baut dasselbe, ohne eine Nummer zu vergeben. Siehe [ops/AUSLIEFERUNG.md](ops/AUSLIEFERUNG.md) |
| `.github/workflows/doku-summary.yml`            | Gegenstück zu `test.yml`: liefert „CI Summary" für reine Doku-PRs, damit ein Pflicht-Check nicht auf einen übersprungenen Workflow wartet                                                                    |
| `.github/workflows/claude.yml`                  | Antwort auf `@claude` in PR-Kommentaren, Review-Kommentaren und Issues. **Nur auf Zuruf** — es gibt seit dem 27.08.2026 keinen automatischen Review auf jedem PR mehr (`claude-code-review.yml` entfernt)    |
| Runner-Dienst auf dem Jetson                    | `~/actions-runner/`, systemd `actions.runner.*.service`                                                                                                                                                      |
| GitHub Branch-Protection `main`                 | **existiert nicht** (am 24.08.2026 geprüft: kein Ruleset). Auto-Merge wartet auf „CI Summary", aber nichts erzwingt es — bewusste Entscheidung, siehe `docs/plans/active/023-feature-audit/UEBERGABE.md` §2c |

## Betrieb / Runbook

- **Deploy-Status:** GitHub → Repo → **Actions** → „Deploy". Job-Summary zeigt
  gebaute Services bzw. Rollback-Grund.
- **Runner-Status auf der Box:**
  `systemctl status 'actions.runner.*'` · Logs: `journalctl -u 'actions.runner.*' -f`
- **Wo steht das Gerät?** `docker inspect -f '{{index .Config.Labels "com.docker.compose.project.working_dir"}}' $(docker ps -q --filter label=com.docker.compose.project=arasul-platform) | sort -u`
  — genau das fragt der Deploy. Mehr als eine Zeile heißt: ein Container läuft
  noch aus einem alten Verzeichnis.
- **Manueller Deploy (Notfall):** auf der Box, im Deploy-Verzeichnis
  `GITHUB_WORKSPACE=$PWD GITHUB_SHA=$(git rev-parse origin/main) bash scripts/deploy/deploy-local.sh`
  (`DEPLOY_DIR=/pfad` davor, wenn es von Hand gesagt werden soll)
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
- Ein Release entsteht **nur auf einen Tag hin**, nicht bei jedem Merge nach
  `main`. Der Deploy auf den Orin stempelt seine Fassung deshalb aus Git
  (`JJJJMMTT-<sha>`); eine Nummer wie `1.2.0` trägt nur ein Gerät, das aus
  einem getaggten Artefakt installiert wurde.
