# Deployment-Checkliste

> Pre-Shipping Checkliste fuer die Auslieferung eines Jetson AGX Orin an den Kunden.
> Automatisierte Pruefung: `./scripts/verify-deployment.sh`

---

## 1. Hardware

- [ ] Jetson AGX Orin mit Netzteil
- [ ] Ethernet-Kabel (LAN-Verbindung)
- [ ] Optional: USB-Stick mit Erstdokumentation
- [ ] Seriennummer notiert

## 2. Betriebssystem

- [ ] JetPack 6.x installiert
- [ ] NVIDIA Container Runtime konfiguriert
- [ ] Docker Compose V2 installiert
- [ ] Hostname gesetzt (`hostnamectl set-hostname arasul-<kunde>`)

## 3. Konfiguration

- [ ] `scripts/preconfigure.sh` ausgefuehrt
- [ ] `.env` generiert mit sicheren Credentials
- [ ] `.env` Berechtigungen: `chmod 600 .env`
- [ ] Admin-Passwort notiert und dem Kunden uebergeben
- [ ] Kein Placeholder/Default-Wert in `.env`
- [ ] `scripts/validate_config.sh` ohne Fehler

## 4. Sicherheit

- [ ] SSH-Hardening: `scripts/harden-ssh.sh` ausgefuehrt
  - [ ] Nur Key-Authentifizierung
  - [ ] Port 2222 (oder custom)
  - [ ] Root-Login deaktiviert
- [ ] Firewall: `scripts/setup-firewall.sh` ausgefuehrt
  - [ ] UFW aktiv
  - [ ] Nur Ports 80, 443, 2222 offen
- [ ] Service-User: `scripts/setup-service-user.sh` ausgefuehrt
- [ ] Auto-Updates deaktiviert: `scripts/disable-auto-updates.sh`
- [ ] TLS-Zertifikat vorhanden in `config/tls/`
- [ ] SSH-Keys in `config/ssh-keys/`
- [ ] Security-Scan: `scripts/security-scan.sh` ohne Critical

## 5. Docker Services

- [ ] Alle 15 Services laufen: `docker compose ps`
- [ ] Alle Health-Checks gruen
- [ ] Kein Service im Restart-Loop
- [ ] Memory-Limits konfiguriert

## 6. AI-Modelle

- [ ] Mindestens ein Ollama-Modell geladen
- [ ] Embedding-Service erreichbar
- [ ] Qdrant Vector-DB laeuft

## 7. Datensicherung

- [ ] Backup-Verzeichnis `data/backups/` vorhanden
- [ ] Backup-Cron konfiguriert: `crontab -e`
  ```
  0 2 * * * /opt/arasul/scripts/backup.sh >> /opt/arasul/logs/backup-cron.log 2>&1
  ```
- [ ] Test-Backup erstellt und verifiziert
- [ ] Restore-Test durchgefuehrt

## 8. Setup-Wizard

- [ ] Setup-Wizard nicht abgeschlossen (zeigt sich beim ersten Login)
- [ ] Wizard-Schritte getestet:
  1. Willkommen
  2. Admin-Passwort aendern
  3. Netzwerk-Check
  4. AI-Modell auswaehlen
  5. Zusammenfassung

## 9. Update-System

- [ ] Update-Verzeichnis `updates/` vorhanden
- [ ] Public Key fuer Update-Signierung in `config/update-keys/`
- [ ] Test-Update-Paket erstellt und eingespielt

## 10. Tests

- [ ] Backend-Tests: `./scripts/run-tests.sh --backend` (alle gruen)
- [ ] Frontend-Tests: `./scripts/run-tests.sh --frontend` (alle gruen)
- [ ] Integration-Tests: `./scripts/integration-test.sh` (alle gruen)
- [ ] Performance-Baseline: `./scripts/measure-performance.sh` (Werte dokumentiert)

## 11. Dokumentation

- [ ] Quick-Start-Guide beigelegt (`docs/QUICK_START.md`)
- [ ] Admin-Handbuch beigelegt (`docs/ADMIN_HANDBUCH.md`)
- [ ] Troubleshooting-Guide beigelegt (`docs/TROUBLESHOOTING.md`)
- [ ] Support-Kontakt-Informationen eingetragen

## 12. Finale Pruefung

- [ ] `./scripts/verify-deployment.sh` ohne Fehler
- [ ] System neugestartet und automatisch hochgefahren
- [ ] Frontend erreichbar nach Neustart
- [ ] Alle Services healthy nach Neustart

---

## Uebergabe an den Kunden

| Was                | Wo                                      |
| ------------------ | --------------------------------------- |
| Admin-Benutzername | `admin` (oder wie in .env konfiguriert) |
| Admin-Passwort     | Dem Kunden persoenlich uebergeben       |
| Web-Oberflaeche    | `http://<jetson-ip>` im Browser         |
| SSH-Zugang         | `ssh -p 2222 arasul@<jetson-ip>`        |
| Quick-Start-Guide  | `docs/QUICK_START.md`                   |
| Support            | Kontaktdaten im Troubleshooting-Guide   |
