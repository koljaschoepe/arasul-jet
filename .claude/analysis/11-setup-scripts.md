# Setup-Skripte & Bootstrap — Findings

## INVENTAR

| Skript                                 | Größe | Rolle                             |
| -------------------------------------- | ----- | --------------------------------- |
| `arasul` CLI                           | 58KB  | Main-Entry, 11 Subkommandos       |
| `scripts/interactive_setup.sh`         | 25KB  | Interaktive .env-Generierung (DE) |
| `scripts/setup/detect-jetson.sh`       | 27KB  | Hardware-Profil + Config-Layer    |
| `scripts/setup/preconfigure.sh`        | 36KB  | Full-Setup (--full)               |
| `scripts/setup/factory-reset.sh`       | 4KB   | Customer-Reset mit Model-Preserve |
| `scripts/setup/restore-from-backup.sh` | 8KB   | Disaster-Recovery                 |
| `scripts/setup/setup_mdns.sh`          | 7KB   | mDNS arasul.local                 |
| `scripts/setup/setup-tailscale.sh`     | 9KB   | Remote-Access                     |

## BLOCKERS für Multi-Device-Rollout

### SU-B01: interactive_setup.sh NICHT idempotent

- `scripts/interactive_setup.sh:332-348` — fragt bei existierender .env, bei "Nein" silent exit
- Netzwerkfehler nach 90% → .env halbvoll → kein Recovery
- Fix: Atomic-Write (tmpfile + mv), proper error recovery, Backup-Restore

### SU-B02: Kein .env-Template für Non-Interactive

- `./arasul bootstrap --non-interactive` erfordert alle 20+ Env-Vars manuell
- Keine Dokumentation welche required
- Fix: `.env.template` im Repo + `--from .env.template` Flag

### SU-B03: Keine Netzwerk-Validierung vor docker compose pull

- `pull_images()` Line 554-563 ohne Internet-Check, ohne Timeout
- Offline-Install hängt stundenlang
- Fix: Pre-flight ping + `timeout 30 docker compose pull`

### SU-B04: ADMIN_PASSWORD im Plaintext in .env

- `interactive_setup.sh:590-592` — ADMIN_PASSWORD + ADMIN_HASH beide in .env
- `redact_plaintext_password()` läuft erst nach admin_user creation — bei Crash bleibt Plaintext
- Fix: Nur ADMIN_HASH speichern, Plaintext nach Generierung sofort aus Memory löschen

## MAJORS

### SU-M01: detect-jetson.sh GPU-Memory-Calc falsch

- Line 106-110: `total_ram * 80 / 100` für Unified-Memory
- Orin Nano 4GB → 3.2GB (nur 1GB verfügbar)
- Thor 128GB → 102GB (nur ~90GB nutzbar)
- Wird nirgendwo verwendet → entweder nutzen oder löschen

### SU-M02: setup_secrets() ohne Write-Validation

- `arasul` Line 1050+: mkdir + echo > file — kein Check ob geschrieben
- Bei voll-disk / Permissions: silent fail → leere Secrets → kryptische Container-Errors

### SU-M03: Keine automatischen Retries

- Docker-Pull Timeout → Abbruch (kein Retry)
- MinIO-Init-Fehler → Setup läuft trotzdem weiter
- Fix: `pull_images_with_retry()` max 3x mit expo-backoff

### SU-M04: preconfigure.sh zu viel "--skip-X"

- `--skip-pull`, `--skip-build`, `--skip-mdns`, `--skip-git`, `--skip-devenv`
- Keine Validierung dass Mindest-Steps durchgelaufen sind
- Fix: Final-Check "STEPS_COMPLETED >= X sonst log_error"

## MINORS

### SU-m01: Setup-Logs nur in /tmp (ephemeral)

- `/tmp/arasul_bootstrap_errors.json`
- Fix: `logs/bootstrap_YYYY-MM-DD_HH-MM-SS.log` mit `exec 1> >(tee -a ...)`

### SU-m02: bcrypt_hash hat 4 Fallbacks (overkill + Docker-Pull in Setup!)

- interactive_setup.sh:234-288: htpasswd → py3-bcrypt → node-bcryptjs → **Docker+node**
- Docker-Fallback = Netzwerk-Call während Setup
- Fix: 2 Fallbacks reichen (htpasswd, python3), Rest: "GENERATE_ON_FIRST_START"

### SU-m03: mDNS-Setup braucht sudo ohne Vorab-Check

- cmd_mdns() ruft sudo ohne zu prüfen ob verfügbar

### SU-m04: Kein sauberes Uninstall-Skript

- factory-reset macht nur Customer-Data-Reset

### SU-m05: Kein First-Run-Wizard-Doc

- QUICK_START erwähnt "Setup-Assistent" — nicht klar wo

## Jetson-Modell-Support (robust!)

✓ thor_128gb | ✓ agx_orin_64gb | ✓ orin_nx_16gb | ✓ orin_nano_8gb
✓ xavier_agx_32gb | ✓ xavier_nx_8gb | ✓ nano_4gb | ⚠ Generic-Fallback

## Ideal-Flow für Rollout (23min statt 26min bei 99% Zuverlässigkeit)

1. SSH + Clone (3min)
2. `./arasul bootstrap --from .env.template` (18min, parallel pull + retry)
3. Verify (1min)
4. Dashboard-Login (1min)

## Priorität

1. SU-B01 (Idempotenz) — kritisch für Zuverlässigkeit
2. SU-B02 (.env.template) — kritisch für Massen-Rollout
3. SU-B03 (Network-Precheck) — UX
4. SU-B04 (Password-Sicherheit) — Compliance
5. SU-M02 (Secret-Write-Validation) — Debugbarkeit
