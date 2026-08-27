/**
 * Werksreset, Plan 023 B5: welche Tabelle wann geleert wird.
 *
 * Phase B4 (26.08.2026) hat 30 Tabellen mit Migration 163 entfernt; sie
 * stehen hier nicht mehr, der Waechter werksreset-tabellen.py liest die
 * DROP-Zeilen mit.
 *
 * Diese Datei ist bewusst nur Daten. Sie ist die eine Stelle, an der steht, was
 * ein Werksreset anfasst, und sie ist so geschrieben, dass ein Mensch sie in
 * einem Zug lesen und gegenprüfen kann.
 *
 * Die Einteilung hat vier Töpfe:
 *
 *   INHALTE      leert schon Stufe 1 (Inhalte zurücksetzen) und damit auch Stufe 2.
 *   AUSLIEFERUNG leert nur Stufe 2 (Auslieferungszustand).
 *   MODELLE      leert nur, wenn zusätzlich die Modelle mitgelöscht werden.
 *   BLEIBT       wird nie geleert, jede Zeile mit Begründung.
 *
 * `system_settings` steht in BLEIBT und wird trotzdem angefasst: die Zeile wird
 * nicht gelöscht, sondern auf Werkswerte zurückgesetzt. Ein Löschen würde die
 * Singleton-Zeile mit `id = 1` entfernen, an der ein Dutzend Abfragen hängen.
 *
 * Vollständigkeit ist keine Fleißfrage, sondern eine Prüfung: `unbekannteTabellen()`
 * in `werksreset.js` vergleicht diese vier Listen mit dem, was wirklich in der
 * Datenbank steht. Bleibt dort etwas übrig, verweigert der Werksreset den Dienst.
 * Eine neue Migration mit einer neuen Tabelle bricht den Reset also sichtbar,
 * statt sie still stehen zu lassen.
 */

/** Nutzerinhalte. Weg bei Stufe 1 und Stufe 2. */
const INHALTE = [
  ['public.llm_jobs', 'Aufträge an die Sprachmodelle'],
  ['arasul.flow_run_steps', 'Einzelschritte der Flow-Läufe'],
  ['arasul.flow_runs', 'Flow-Läufe'],
];

/** Einrichtung des Geräts. Weg nur bei Stufe 2. */
const AUSLIEFERUNG = [
  ['public.active_sessions', 'Angemeldete Sitzungen'],
  ['public.admin_users', 'Zugangsdaten, danach läuft die Ersteinrichtung wieder'],
  ['public.alert_history', 'Verlauf der ausgelösten Warnungen'],
  ['public.alert_last_fired', 'Zeitpunkt der letzten Warnung je Regel'],
  ['public.api_audit_logs', 'Zugriffsprotokoll der Schnittstelle'],
  ['public.api_key_usage', 'Nutzung der Schlüssel'],
  ['public.api_keys', 'Schlüssel für die Schnittstelle'],
  ['public.app_members', 'Freigaben: welcher Mitarbeiter sieht welche App'],
  ['public.app_staende', 'Test- und Livestand je App'],
  ['public.apps', 'Die Apps am Gerät'],
  ['public.audit_log_health', 'Selbstprüfung des Prüfprotokolls'],
  ['public.audit_logs', 'Prüfprotokoll'],
  ['public.bot_audit_log', 'Prüfprotokoll der Bots'],
  ['public.component_updates', 'Aktualisierungsstand der Bestandteile'],
  ['public.llm_model_switches', 'Wechsel des aktiven Modells'],
  ['public.login_attempts', 'Anmeldeversuche'],
  ['public.metrics_cpu', 'Messwerte, Prozessor'],
  ['public.metrics_disk', 'Messwerte, Speicherplatz'],
  ['public.metrics_gpu', 'Messwerte, Grafikeinheit'],
  ['public.metrics_infra', 'Messwerte, Infrastruktur'],
  ['public.metrics_ram', 'Messwerte, Arbeitsspeicher'],
  ['public.metrics_swap', 'Messwerte, Auslagerung'],
  ['public.metrics_temperature', 'Messwerte, Temperatur'],
  ['public.model_performance_metrics', 'Gemessenes Tempo der Modelle'],
  ['public.notification_events', 'Benachrichtigungen'],
  ['public.notification_rate_limits', 'Bremse für Benachrichtigungen'],
  ['public.notification_settings', 'Eigene Benachrichtigungswege'],
  ['public.password_history', 'Alte Passwörter zur Wiederverwendungssperre'],
  ['public.reboot_events', 'Neustarts'],
  ['public.recovery_actions', 'Selbstheilung, ergriffene Maßnahmen'],
  ['public.self_healing_events', 'Selbstheilung, Ereignisse'],
  ['public.service_failures', 'Ausfälle von Diensten'],
  ['public.service_restarts', 'Neustarts von Diensten'],
  ['public.service_status_cache', 'Zwischenspeicher des Dienstzustands'],
  ['public.system_boot_events', 'Startvorgänge des Geräts'],
  ['public.system_snapshots', 'Momentaufnahmen des Systemzustands'],
  ['public.token_blacklist', 'Gesperrte Zugangsmerkmale'],
  ['public.update_backups', 'Sicherungen vor Aktualisierungen'],
  ['public.update_events', 'Verlauf der Aktualisierungen'],
  ['public.update_files', 'Dateien aus Aktualisierungen'],
  ['public.update_rollbacks', 'Zurückgenommene Aktualisierungen'],
  ['public.update_state_snapshots', 'Zustand vor einer Aktualisierung'],
  ['arasul.externe_modell_anbieter', 'Zugänge zu externen Modellen, verschlüsselt hinterlegt'],
];

/**
 * Nur weg, wenn die Modelle mitgelöscht werden. Sonst bleibt die Tabelle
 * stehen, weil sie abbildet, was auf der Platte wirklich liegt. Eine leere
 * Tabelle bei vorhandenen Modelldateien wäre eine Lüge.
 */
const MODELLE = [['public.llm_installed_models', 'Installierte Modelle']];

/** Wird nie geleert. Jede Zeile mit Grund. */
const BLEIBT = [
  // Es gibt sie wirklich zweimal, und die maßgebliche ist die im Schema
  // `arasul`. `search_path` ist `"$user", public`, der Datenbanknutzer heißt
  // arasul, also landet das `CREATE TABLE IF NOT EXISTS schema_migrations` aus
  // migrationRunner.js im Schema arasul. Stand 19.08.2026 auf dem Gerät:
  // arasul.schema_migrations 145 Zeilen (passend zu 145 Migrationsdateien),
  // public.schema_migrations 93 Zeilen aus der Zeit vor dem zweiten Schema.
  // Beide stehen hier, weil beide in der Datenbank stehen.
  ['arasul.schema_migrations', 'Schema-Buchführung, ohne sie laufen alle Migrationen erneut'],
  ['public.schema_migrations', 'Altbestand derselben Buchführung, vor dem Schema arasul'],
  ['public.llm_model_catalog', 'Werkskatalog der Modelle, kommt aus den Migrationen'],
  ['public.alert_thresholds', 'Werksschwellen für Warnungen, kommen aus den Migrationen'],
  ['public.alert_settings', 'Werksvorgabe für Warnungen'],
  ['public.alert_quiet_hours', 'Werksvorgabe für Ruhezeiten'],
  ['arasul.geraet', 'Merker über den Werksreset hinweg, er muss ihn gerade überleben'],
  ['public.system_settings', 'Einzelzeile mit id=1, wird zurückgesetzt statt gelöscht'],
];

/** Alle vier Töpfe als flache Namensmenge, für die Vollständigkeitsprüfung. */
function alleBekanntenTabellen() {
  return new Set([...INHALTE, ...AUSLIEFERUNG, ...MODELLE, ...BLEIBT].map(([name]) => name));
}

module.exports = { INHALTE, AUSLIEFERUNG, MODELLE, BLEIBT, alleBekanntenTabellen };
