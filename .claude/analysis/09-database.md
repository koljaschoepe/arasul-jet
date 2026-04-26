# Datenbank (PostgreSQL) — Findings

## Überblick

- PostgreSQL 16-alpine, 78 Migrationen (letzte `077_*.sql` → `version=77`), 85+ Tabellen, 312MB Live
- Grade: **A- (93%)** — sehr gut strukturiert, Foreign Keys + Indizes + Triggers konsistent

## BLOCKERS

Keine echten Blocker auf Schema-Ebene. (Der WAL-Archiving-Bruch ist Runtime — siehe 18-live-runtime.md LIVE-B01.)

## MAJORS

### DB-M01: `docs/DATABASE_SCHEMA.md` VERALTET (letzte Aktualisierung bei Migration 025)

- 53 Migrationen nicht dokumentiert
- Unverhandelbare Regel "Dokumentation aktualisieren" (CLAUDE.md) verletzt
- Fix: Automatisches Doc-Gen aus `schema_migrations` + `information_schema` via Script

### DB-M02: Keine automatischen VACUUM/ANALYZE-Stats im Metrics-Collector

- `pg_stat_user_tables` wird nicht geloggt/exposed
- Auf einer 5J-Appliance kann Bloat schleichend wachsen
- Fix: Metrics-Collector liest `pg_stat_user_tables.n_dead_tup` + published to dashboard

### DB-M03: Keine Schema-Version-Endpoint

- Kein `/api/system/db-version` — Frontend kann bei Migrations-Rollback nicht warnen
- Fix: Backend exposed `SELECT max(version) FROM schema_migrations`

### DB-M04: 4 Migrations-Skripte ohne Down-Migration

- Destructive Schema-Änderungen ohne Rollback-Plan
- Fix: Jede Migration braucht `<N>_down.sql` oder dokumentierten manuellen Rollback

## MINORS

### DB-m01: Connection-Pool nicht tunable

- `pg` default pool, kein `DB_POOL_MIN/MAX` env-var

### DB-m02: Keine Partitionierung für große Tabellen

- `chat_messages`, `app_events`, `self_healing_events` werden irgendwann groß — kein RANGE/HASH-Partitioning vorbereitet

### DB-m03: Keine Foreign-Key-CASCADE-Audit

- Delete-Kaskaden sind teilweise inkonsistent (soft-delete vs hard-cascade)

## OK / SEHR GUT

- Alle Tabellen mit `created_at`, `updated_at` Triggers
- UUID-Primary-Keys konsistent
- JSON/JSONB sinnvoll eingesetzt (nicht überall)
- Foreign Keys mit ON DELETE CASCADE/SET NULL bewusst gewählt
- Indizes auf Foreign-Keys + Query-Patterns
- `schema_migrations` Tabelle transaktional eingehalten
- Keine "legacy" Spalten, kein `data TEXT` mit JSON drin

## Priorität

1. DB-M01 (Schema-Doc regenerieren) — Pflicht laut CLAUDE.md
2. DB-M02 (Bloat-Metriken) — 5J-Autonomie
3. DB-M03 (Schema-Version-Endpoint) — Rollout-Sicherheit
