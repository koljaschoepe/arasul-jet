# Technisch-organisatorische Maßnahmen (TOMs) nach Art. 32 DSGVO

> ⚠️ **DRAFT** - Diese Vorlage erfordert anwaltliche Prüfung vor Produktiv-Einsatz.

**Letzte Aktualisierung:** 2026-05-03
**Anlage zu:** [AVV_TEMPLATE.md](./AVV_TEMPLATE.md)
**Geltungsbereich:** Arasul Edge-AI-Appliance, alle Software-Komponenten und Betriebsprozesse.

---

## Präambel

Die nachfolgend beschriebenen technisch-organisatorischen Maßnahmen (TOMs) gewährleisten ein dem Risiko angemessenes Schutzniveau im Sinne von Art. 32 DSGVO unter Berücksichtigung des Stands der Technik, der Implementierungskosten sowie der Art, des Umfangs, der Umstände und der Zwecke der Verarbeitung. Sie konkretisieren die Verpflichtungen des Auftragsverarbeiters aus dem zugrundeliegenden Auftragsverarbeitungs-Vertrag.

---

## 1. Zutrittskontrolle (physisch)

**Ziel:** Verhinderung des physischen Zutritts Unbefugter zur Hardware-Appliance.

Da die Arasul-Box im Rechenzentrum bzw. den Geschäftsräumen des Auftraggebers betrieben wird, liegt die physische Zutrittskontrolle in dessen Verantwortungsbereich. Empfehlungen seitens des Auftragsverarbeiters:

- Aufstellung in einem abschließbaren Raum (Serverraum, abschließbares IT-Gehäuse)
- Zutritt nur für autorisiertes IT-Personal
- Protokollierung von Zutritten
- Schutz vor Diebstahl (Kensington-Lock, Verschraubung)
- Schutz vor Umweltgefahren (Brand, Wasser, Staub)

Die Appliance selbst implementiert zusätzlich:

- TPM-basierte Boot-Verifikation (sofern hardwareseitig verfügbar)
- LUKS-Festplattenverschlüsselung als Schutz bei Diebstahl (siehe Ziffer 9)

---

## 2. Zugangskontrolle (logisch)

**Ziel:** Verhinderung der Nutzung der Systeme durch Unbefugte.

- **Authentifizierung:** Username/Passwort mit Mindest-Komplexität (12 Zeichen, Mixed-Case, Zahlen, Sonderzeichen)
- **Session-Management:** JSON Web Tokens (JWT) mit konfigurierbarer Ablaufzeit
- **Rate-Limiting:** Brute-Force-Schutz auf API-Ebene (per Key-ID), Wildcard-Reject
- **Audit-Log:** Alle Login-Versuche (erfolgreich und fehlgeschlagen) werden revisionssicher protokolliert
- **Rollen-Konzept:** Admin, User, Read-Only (sowie kundenspezifische Rollen)
- **Passwort-Speicherung:** Bcrypt-Hashes mit aktuellem Cost-Factor
- **Optional:** Multi-Faktor-Authentifizierung (TOTP) - empfohlen für Admin-Konten
- **WebSocket-Auth:** JWT-Token-basiert, kein Klartext-Auth über Query-Parameter

---

## 3. Zugriffskontrolle

**Ziel:** Sicherstellung, dass Nutzer nur auf die ihnen zugewiesenen Daten zugreifen können.

- **Multi-User-Isolation:** Strikte Trennung der Daten verschiedener Nutzer (eingeführt mit Phase 1.1 der Plattform-Entwicklung)
- **Knowledge-Space-ACL:** Granulare Zugriffsrechte auf Wissensbasen, Dokumenten-Sammlungen und RAG-Indizes
- **Row-Level Security:** Datenbankseitige Durchsetzung der Mandanten-Isolation
- **Berechtigungs-Audit:** Periodische Überprüfung der Berechtigungs-Matrix
- **Need-to-know-Prinzip:** Default-Deny, Berechtigungen müssen explizit erteilt werden

---

## 4. Weitergabekontrolle

**Ziel:** Sicherstellung, dass Daten bei elektronischer Übertragung oder Speicherung nicht unbefugt gelesen, kopiert, verändert oder entfernt werden können.

- **Lokale Verarbeitung:** Sämtliche Daten verbleiben auf der Appliance des Auftraggebers
- **Kein Cloud-Transfer:** Keine Übermittlung an externe Server, kein Telemetrie-Funk nach außen (außer signierte Update-Checks gegen Arasul-Update-Server)
- **TLS-Verschlüsselung:** Alle Netzwerk-Verbindungen (intern und extern) über TLS 1.3
- **Reverse-Proxy:** Traefik v2.11 als TLS-Terminierungspunkt mit automatischer Zertifikats-Rotation
- **Bot-Token-Verschlüsselung:** Externe Integrations-Tokens (z. B. Telegram) werden mit AES-256-GCM verschlüsselt in der Datenbank abgelegt
- **Keine USB-Auto-Mount:** Externe Datenträger werden nicht automatisch eingebunden

---

## 5. Eingabekontrolle

**Ziel:** Nachträgliche Überprüfbarkeit, ob und von wem personenbezogene Daten eingegeben, verändert oder entfernt wurden.

- **Audit-Log:** Revisionssichere Protokollierung aller schreibenden Datenoperationen
- **Aufbewahrungsfrist:** 7 Jahre (entsprechend handels- und steuerrechtlicher Vorgaben)
- **Inhalt:** Zeitstempel, Benutzer-ID, Aktion, betroffene Ressource, Prompt-Hash (kein Klartext-Prompt)
- **Manipulationsschutz:** Audit-Log wird in separater Datenbank-Tabelle mit eingeschränkten Schreibrechten geführt
- **Export:** Audit-Log kann für externe Prüfungen exportiert werden

---

## 6. Auftragskontrolle

**Ziel:** Sicherstellung, dass Daten im Auftrag verarbeitete Daten nur entsprechend den Weisungen des Auftraggebers verarbeitet werden.

- **AVV:** Schriftlicher Auftragsverarbeitungs-Vertrag gemäß [AVV_TEMPLATE.md](./AVV_TEMPLATE.md)
- **Weisungsdokumentation:** Alle Konfigurations-Änderungen am Vertragsverhältnis werden schriftlich (E-Mail genügt) festgehalten
- **Sub-Auftragsverarbeiter:** Grundsätzlich keine; Ausnahmen nur bei explizitem Remote-Support-Auftrag mit vorheriger Information des Auftraggebers
- **Schulung:** Mitarbeiter des Auftragsverarbeiters werden auf Datenschutz und Berufsgeheimnisse (§ 203 StGB) verpflichtet

---

## 7. Verfügbarkeitskontrolle

**Ziel:** Schutz der Daten gegen zufällige Zerstörung oder Verlust.

- **Self-Healing-Agent:** Automatische Überwachung und Wiederherstellung der Service-Container
- **Health-Checks:** Periodische Prüfung aller Komponenten (Backend, LLM, Datenbank, Vektor-DB)
- **Automatische Backups:**
  - Tägliches inkrementelles Backup der Datenbank
  - Wöchentliches Voll-Backup
  - Monatliche Backup-Konsistenzprüfung
- **Backup-Verschlüsselung:** AES-256-GCM, lokale Speicherung auf separatem Datenträger oder NAS des Auftraggebers
- **Backup-Aufbewahrung:** 30 Tage (Default, konfigurierbar)
- **Disaster-Recovery:** Wiederherstellungs-Anleitung im Lieferumfang, getestet im Setup-Prozess
- **USV:** Empfohlen, nicht im Standard-Lieferumfang
- **Redundanz:** Bei Premium-Tier optional Active/Standby-Konfiguration mit zweiter Box

---

## 8. Trennungskontrolle

**Ziel:** Sicherstellung, dass zu unterschiedlichen Zwecken erhobene Daten getrennt verarbeitet werden können.

- **Mandantenfähigkeit auf Box-Ebene:** Eine Arasul-Box wird ausschließlich von einem Auftraggeber genutzt (kein Multi-Tenant über Box-Grenzen hinweg)
- **Logische Trennung innerhalb der Box:** Mehrere Nutzer/Abteilungen werden über Knowledge-Spaces und ACLs getrennt
- **Datenbank-Schemata:** Getrennte Tabellen-Bereiche für Operativ-Daten, Audit-Logs, System-Konfiguration
- **Test-/Produktiv-Trennung:** Separate Konfigurations-Profile

---

## 9. Pseudonymisierung und Verschlüsselung

**Ziel:** Schutz personenbezogener Daten durch geeignete Verschlüsselung und Pseudonymisierung.

### 9.1 Verschlüsselung im Ruhezustand (Encryption at Rest)

- **LUKS-Festplattenverschlüsselung (Full Disk Encryption):** AES-256-XTS, eingeführt in Phase 2.2 der Plattform-Entwicklung
- **MinIO Server-Side Encryption mit KMS (SSE-KMS):** Eingeführt in Phase 2.1, schützt Object-Storage-Inhalte (Dokumente, Embeddings)
- **Datenbank-Backups:** Verschlüsselt mit AES-256-GCM
- **Bot-Tokens und API-Keys:** AES-256-GCM mit Box-individuellem Master-Key

### 9.2 Verschlüsselung in Transit

- **TLS 1.3** für alle externen Verbindungen
- **TLS / mTLS** für interne Service-zu-Service-Kommunikation (sofern Netzwerk-Topologie dies erfordert)
- **WSS (WebSocket Secure)** für Echtzeit-Verbindungen

### 9.3 Pseudonymisierung

- **Prompt-Logging:** Statt Klartext-Prompts werden in Standard-Audit-Logs lediglich SHA-256-Hashes gespeichert (Phase 5.2)
- **Telemetrie:** Keine, sofern nicht explizit aktiviert
- **DSGVO-Tab:** Auftraggeber kann eigene Daten via `DELETE /api/gdpr/me` löschen

---

## 10. Patch-Management und Software-Integrität

- **Signierte Updates:** Software-Updates werden mit **Cosign** (Sigstore) signiert; Verifikation auf der Appliance vor Installation
- **Rollback-Mechanismus:** Atomare Updates mit Möglichkeit zum Rollback auf vorherige Version
- **Update-Kanäle:** `stable` (Standard), `lts` (Long-Term Support, optional)
- **Sicherheits-Patches:** Kritische Patches innerhalb von 7 Tagen nach Bekanntwerden, sofern technisch möglich
- **CVE-Monitoring:** Kontinuierliches Monitoring der eingesetzten Komponenten (Ollama, PostgreSQL, Node.js, Python-Bibliotheken)
- **Container-Image-Signing:** Docker-Images werden mit Cosign signiert
- **SBOM:** Software Bill of Materials wird mit jedem Release ausgeliefert

---

## 11. Resilienz und Belastbarkeit

- **Container-Isolation:** Docker-Compose mit Resource-Limits (CPU, RAM, GPU-Memory)
- **Circuit-Breaker:** Schutz vor Kaskaden-Ausfällen (z. B. Ollama-Circuit-Breaker, Phase 6 P0)
- **Logger-Rotation:** Automatische Rotation der Anwendungs-Logs (Phase 6)
- **Indexer-Watchdog:** Periodische Wiederherstellung steckengebliebener Verarbeitungs-Jobs (Phase 4.8)

---

## 12. Verfahren zur Überprüfung der Wirksamkeit

- **Penetration-Tests:** Empfohlen vor erstem Produktiv-Einsatz, danach alle 24 Monate
- **Sicherheits-Audits:** Jährliche Überprüfung der TOMs durch internen oder externen Datenschutzbeauftragten
- **Backup-Restore-Tests:** Halbjährlich
- **DSGVO-Self-Audit:** Jährliches Self-Assessment durch den Auftragsverarbeiter

---

**Hinweis zur Aktualisierung:** Diese TOMs werden bei wesentlichen technischen oder organisatorischen Änderungen aktualisiert. Der Auftraggeber wird über Änderungen informiert.
