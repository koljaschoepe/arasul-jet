# Häufig gestellte Fragen (FAQ) — Arasul Platform

> Phase 4.7 · Stand: 2026-05-03 · Sprache: Deutsch

Diese FAQ richtet sich an Endanwender und Administratoren. Tieferes
Troubleshooting steht in [`TROUBLESHOOTING.md`](TROUBLESHOOTING.md), die
Admin-Übersicht in [`ADMIN_HANDBUCH.md`](ADMIN_HANDBUCH.md).

---

## Inbetriebnahme

### Wie lange dauert die Erstinbetriebnahme?

Nach Auspacken der Box und Verbindung mit Strom + LAN dauert der erste
Boot etwa 3 Minuten (DB-Init, Modell-Pre-Load). Anschließend rufen Sie
http://arasul.local im Browser auf und legen Ihren ersten Admin-Account
an.

### Was tun, wenn `arasul.local` nicht erreichbar ist?

Prüfen Sie an der Box die LED-Anzeige (grün = OK). Falls die Box im
Netzwerk nicht erreichbar ist, prüfen Sie:

1. DHCP-Server vergibt IP an die Box (Router-Admin-Konsole).
2. mDNS ist auf Ihrem Client aktiv (Mac/Linux: standardmäßig, Windows:
   "Bonjour for Windows" installieren).
3. Alternativ direkt die IP der Box ansprechen.

### Wie installiere ich neue Mitarbeiter?

`Einstellungen → Benutzer → Neuen Benutzer anlegen`. Vergeben Sie eine
sinnvolle Rolle:

- **Mitarbeiter** (Default): Sieht nur eigene Daten.
- **Lesezugriff**: Wie Mitarbeiter, aber UI deaktiviert Schreibrechte.
- **Admin**: Sieht alle Daten und kann andere Benutzer verwalten.

---

## Datenschutz & Compliance

### Sind meine Daten DSGVO-konform geschützt?

Ja. Alle Daten verbleiben auf der Box, es gibt keine Cloud-Übertragung.
Mitgeliefert sind: AVV-Vorlage, TOMs, DSFA-Vorlage, AI-Act-Selbsterklärung
(`docs/legal/`). Vor produktivem Einsatz lassen Sie diese Vorlagen von
Ihrem Datenschutzbeauftragten prüfen.

### Was ist mit §203 StGB (Berufsgeheimnis)?

Arasul ist explizit für Berufsgeheimnis-Personas (Arzt, Anwalt,
Steuerberater) konzipiert. Telegram-Bots sind defaultmäßig deaktiviert
(Drittland UAE). Alle Mandanten-/Patienten-Daten bleiben auf der Box.

### Können andere Mitarbeiter meine Chats sehen?

Nein. Multi-User-Isolation ist Pflichtfeature: User A sieht keine Chats,
Dokumente oder Spaces von User B. Admins haben Zugriff auf alles —
das ist beabsichtigt für Backup/Recovery-Szenarien.

### Wo werden Audit-Logs aufbewahrt?

7 Jahre lokal in der PostgreSQL-Datenbank
(`audit_logs`-Tabelle). Cleanup-Funktion `cleanup_old_security_audit_logs()`
hat eine fest verdrahtete Untergrenze von 2555 Tagen — niemals weniger.

### Wie kennzeichne ich KI-generierte Antworten?

Default ist eingeschaltet: Unter jeder KI-Antwort steht "Generiert von
KI — bitte verifizieren". Pflicht ab 2. August 2026 (EU-AI-Act Art. 50).
Admins können das in `Einstellungen → Compliance` deaktivieren — der
Schritt wird im Audit-Log protokolliert.

---

## Täglicher Einsatz

### Wie kann ich ein Dokument hochladen?

`Daten → Hochladen` oder per Drag&Drop in den Documents-Bereich. Nach
dem Upload startet die Indexierung automatisch (alle 30 Sekunden Cron).
Status sehen Sie pro Dokument (`pending → indexing → indexed`).

### Wie funktioniert die Suche in meinen Dokumenten?

Im Chat-Tab Frage stellen — die Plattform durchsucht automatisch alle
Wissens-Spaces, auf die Sie Zugriff haben. Quellen werden unter der
Antwort angezeigt.

### Was, wenn die KI keine Antwort findet?

Die Plattform sagt klar "Diese Information ist in den vorliegenden
Dokumenten nicht enthalten" und antwortet **nicht** aus allgemeinem
Wissen. Das ist Anti-Halluzinations-Schutz (Phase 3.1).

### Wie exportiere ich einen Chat-Verlauf für die Akte?

Im Chat oben rechts → Export → wählen Sie Markdown, JSON oder PDF.
PDF enthält Quellenverzeichnis als Fußnoten — geeignet für
Akten-Aufbewahrung.

### Was ist Cmd+K?

Globale Suche über Chats, Dokumente, Spaces und Einstellungen.
Funktioniert auch unter Windows/Linux mit Strg+K.

---

## n8n-Workflows

### Warum sehe ich keine externen API-Calls in n8n?

Ohne Whitelist (Compliance-Settings → n8n-Whitelist) sind alle externen
Domains blockiert. Fügen Sie z. B. `api.telegram.org` hinzu, wenn
Telegram-Workflows externe Calls machen sollen. Jede Anfrage wird
auditiert.

### Wo finde ich vorgefertigte Templates?

`Apps → n8n` öffnet das n8n-Frontend. Über die API:
`GET /api/workflows/templates` listet 6 Standard-Templates inkl.
Email-Summary, Mandanten-Indexierung. 1-Klick-Import per
`POST /api/workflows/templates/<id>/install` (Admin only, n8n-API-Key
erforderlich).

---

## Updates & Wartung

### Wie installiere ich Updates?

`Einstellungen → Updates → Verfügbares Update`. Updates sind digital
signiert (Cosign). Die Box prüft die Signatur vor jedem Pull, validiert
die Health-Checks nach dem Apply und rollt automatisch zurück, wenn
Services nach 5 Minuten nicht alle healthy sind.

### Was passiert bei Stromausfall?

Box bootet automatisch durch. Daten sind in PostgreSQL + MinIO persistent.
Bei längerem Stromausfall (USV empfohlen) startet die Box mit der zuletzt
synchronisierten DB-Position. Verlust-Risiko: maximal die letzten Sekunden
laufender Schreiboperationen (PostgreSQL fsync).

### Wie sichere ich meine Daten?

Backups laufen täglich 02:00 Uhr (PostgreSQL + MinIO + Qdrant + WAL-Archiv).
Retention: 30 Tage täglich, 12 Wochen wöchentlich, 5 Jahre monatlich.
Optional: Verschlüsselung aktivieren via
`./scripts/setup/init-encryption-keys.sh`.

### Was ist im Wartungsvertrag enthalten?

- 8/5-Support (8 Std × 5 Tage)
- 24h Antwort-Bestätigung
- 5 Werktage Lösungsziel
- Software-Updates inklusive
- Ab Jahr 3: 2× jährlich Wartungs-Check (Remote oder vor Ort)

Vollständige Beschreibung in `docs/legal/WARTUNGSVERTRAG.md`.

---

## Notfall

### Wie melde ich einen Sicherheitsvorfall?

`Einstellungen → Support → Diagnose-Paket exportieren` (kein SSH nötig)
liefert ein anonymisiertes Bundle. Senden Sie das per E-Mail an
support@arasul.local mit Beschreibung des Vorfalls.

### Wie reagiere ich auf eine Datenschutz-Auskunft (Art. 15 DSGVO)?

`Einstellungen → Datenschutz → Daten exportieren` exportiert alle
personenbezogenen Daten des angemeldeten Benutzers in einer ZIP-Datei.
Für Auskunft an Mandanten/Patienten: Diese sind keine User der Box,
also außerhalb des Scopes — verwenden Sie die Standard-Auskunfts-Pflicht
Ihrer eigenen Kanzlei/Praxis.

### Was, wenn die Box gestohlen wird?

Wenn LUKS-Volume-Verschlüsselung aktiviert ist (`docs/PHASE2_LUKS_SETUP.md`),
sind die Daten ohne TPM-Chip oder Recovery-Passphrase unzugänglich.
Melden Sie den Vorfall trotzdem binnen 72h an Ihre Aufsichtsbehörde
(Art. 33 DSGVO).

### Wer haftet bei Datenverlust?

Arasul GmbH (in Gründung) übernimmt vertraglich Haftung im Rahmen
der AGB (siehe `docs/legal/AGB_TEMPLATE.md`). Backups sind Pflicht
des Customers — wir liefern die Tools, Sie kontrollieren die
Backup-Disks.
