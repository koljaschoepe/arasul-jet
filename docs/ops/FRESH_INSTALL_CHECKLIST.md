# Fresh-Install-Checkliste — Neuer Jetson

> Schritt-für-Schritt-Verifikation für die Erstinstallation auf einem fabrikneuen
> NVIDIA Jetson (AGX Orin / Thor). Hake jeden Punkt beim nächsten echten Gerät ab.
> Die mit **⚠️ Regressionsschutz** markierten Punkte prüfen gezielt die im
> Voll-Audit (Juli 2026, Plan `full-audit-fresh-install-reliability`) behobenen
> Stolperstellen — dort ist das Setup früher gescheitert.

## 0. Voraussetzungen (vor dem ersten `./arasul bootstrap`)

- [ ] JetPack 6 geflasht, Gerät bootet, SSH-Zugang steht.
- [ ] `docker` und `docker compose` (V2) installiert: `docker compose version`.
- [ ] NVIDIA Container Runtime aktiv: `docker info | grep -i nvidia` liefert einen Treffer.
- [ ] Mindestens ~64 GB freier Speicher auf der Zielpartition: `df -BG .`.
- [ ] Repo ausgecheckt, im Repo-Root (`./arasul` vorhanden).

## 1. Hardware-Validierung (`./arasul bootstrap`, Schritt 1)

- [ ] ⚠️ **Regressionsschutz — GPU-Erkennung ohne Desktop-`nvidia-smi`.** Auf Jetson
      hat der Host oft kein funktionierendes `nvidia-smi`. Der Bootstrap darf
      **nicht** an „GPU check failed" abbrechen: `check_gpu()` akzeptiert Tegra
      über `/etc/nv_tegra_release` bzw. die NVIDIA-Docker-Runtime.
      → Erwartung: Log „Jetson/Tegra GPU detected via /etc/nv_tegra_release".
- [ ] ⚠️ **Regressionsschutz — RAM-Gate.** Geräte mit 8 GB / 4 GB (Orin NX/Nano) dürfen
      **nicht** fatal an „Insufficient RAM" scheitern. < 16 GB = Warnung, erst < 4 GB = Fehler.
- [ ] ⚠️ **Regressionsschutz — Disk-Check konsistent.** Es gibt nur **einen** Disk-Schwellwert
      (in `validate_hardware`), keinen zweiten widersprüchlichen in `check_requirements`.

## 2. Setup / .env-Erzeugung

- [ ] Interaktives Setup läuft durch (`scripts/interactive_setup.sh`), `.env` entsteht.
- [ ] ⚠️ **Regressionsschutz — Non-Interactive-Modus.** `ADMIN_PASSWORD=… ./scripts/interactive_setup.sh --non-interactive`
      bricht bei **fehlendem** `ADMIN_PASSWORD` mit klarer Fehlermeldung ab — **nicht**
      mit „unbound variable".
- [ ] ⚠️ **Regressionsschutz — Verzeichnisse angelegt.** Nach `create_directories` existieren
      `data/appstore/manifests`, `data/ssh-keys`, `data/sandbox/projects` (Bind-Mount-Quellen;
      sonst legt Docker sie root-owned an und Services können nicht schreiben).

## 3. TLS / Zertifikat

- [ ] ⚠️ **Regressionsschutz — Zertifikat wird immer erzeugt.** `config/traefik/certs/arasul.crt`
      **und** `arasul.key` existieren nach `setup_https` — unabhängig von Internet-Zugang
      (Traefik nutzt ausschließlich self-signed, kein ACME).
- [ ] Kein `arasul.crt` aus dem Git-Repo (device-spezifisch, per `.gitignore` ausgeschlossen).

## 4. Images bauen & pullen

- [ ] ⚠️ **Regressionsschutz — alle Custom-Images gebaut.** `build_images` baut u. a.
      `llm-service` **und** `document-indexer` (früher fehlten beide → versteckter Build
      mitten im Start). `docker compose build` läuft ohne „missing service".
- [ ] `qdrant` wird gepullt (Teil von `pull_images`).

## 5. Service-Start (`start_services`)

- [ ] Layer 1: `postgres-db`, `minio` healthy.
- [ ] ⚠️ **Regressionsschutz — RAG-Stack startet.** `qdrant` (Layer 1b) **und**
      `document-indexer` (Layer 6) laufen — früher wurden beide nie gestartet, RAG war tot.
      → `docker compose ps` zeigt `qdrant` und `document-indexer` als `running`/`healthy`.
- [ ] `llm-service`, `embedding-service` healthy (Modell-Laden kann dauern).
- [ ] `reverse-proxy`, `dashboard-backend`, `dashboard-frontend`, `n8n`, `self-healing-agent` healthy.

## 6. Admin & Sicherheit

- [ ] Admin-User angelegt, Login im Dashboard funktioniert.
- [ ] ⚠️ **Regressionsschutz — Retry nach Abbruch möglich.** Falls Bootstrap **vor** der
      Admin-Anlage abbricht, bleibt `ADMIN_PASSWORD` in `.env` erhalten (nicht vorzeitig
      redigiert) → erneutes `./arasul bootstrap` funktioniert.
- [ ] ⚠️ **Regressionsschutz — docker-proxy isoliert.** `docker-proxy` hängt nur am
      Netz `arasul-docker-proxy` (mit `dashboard-backend` + `self-healing-agent`), **nicht**
      an `arasul-backend`. Prüfen: `docker inspect docker-proxy --format '{{json .NetworkSettings.Networks}}'`
      zeigt nur `arasul-docker-proxy`.

## 7. mDNS / Zugriff

- [ ] ⚠️ **Regressionsschutz — mDNS konfiguriert.** Bei root/passwortlosem sudo richtet
      Bootstrap Avahi ein → `https://arasul.local` erreichbar. Sonst weist die
      Abschluss-Meldung explizit auf `./arasul mdns` hin (kein stiller Bruch der beworbenen URL).
- [ ] Dashboard über `https://<hostname>.local` erreichbar (Self-Signed-Warnung ist erwartet).

## 8. Kernfunktionen im Browser (Smoke)

- [ ] Login → Chat: eine LLM-Antwort kommt zurück.
- [ ] Dokument hochladen → erscheint in der Dokumentenliste, wird indexiert (RAG).
- [ ] Eine RAG-/Wissens-Frage liefert eine Antwort mit Kontext (Qdrant + document-indexer aktiv).
- [ ] Settings/Services-Seite: GPU-Last wird als echter Wert (nicht dauerhaft 0.0) angezeigt.
- [ ] Keine roten Fehler in der Browser-Konsole auf den Kern-Seiten.

## 9. Backup (nach dem ersten geplanten Lauf)

- [ ] `backup-service` läuft; nach dem ersten Zyklus existieren Backups unter
      `data/backups/postgres/`, `data/backups/minio/` **und** `data/backups/qdrant/`
      (⚠️ Qdrant-Vektor-Backup war früher nicht abgedeckt).
- [ ] `data/backups/backup_report.json` zeigt `qdrant_status`.

---

**Bei Abweichung:** Logs des betroffenen Service (`docker compose logs <service>`) und
`./arasul` -Bootstrap-Log prüfen; Stolperstelle hier notieren, damit die Checkliste
mitwächst.
