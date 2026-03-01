# ARASUL PLATFORM - Makefile
# CLI-Interface für Docker Compose Operationen

.PHONY: help start start-all stop restart logs build test db ps stats

.DEFAULT_GOAL := help

help: ## Diese Hilfe anzeigen
	@echo "Arasul Platform - Make Targets"
	@echo ""
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-15s\033[0m %s\n", $$1, $$2}'
	@echo ""

# === Core ===

start: ## Starte alle Kern-Services
	docker compose up -d
	@echo "Platform gestartet. Dashboard: http://localhost"

start-all: ## Starte alle Services inkl. Monitoring
	docker compose --profile monitoring --profile tunnel up -d

stop: ## Stoppe alle Services
	docker compose down

restart: ## Neustart aller Services
	docker compose restart

logs: ## Zeige Logs (usage: make logs s=backend)
	docker compose logs -f $(s)

build: ## Rebuild (usage: make build s=backend)
	docker compose up -d --build $(s)

ps: ## Zeige alle laufenden Container
	docker compose ps

stats: ## Docker Ressourcen-Statistiken
	docker stats --no-stream

# === Entwicklung ===

dev-backend: ## Backend lokal starten (npm run dev)
	cd apps/dashboard-backend && npm install && npm run dev

dev-frontend: ## Frontend lokal starten (npm start)
	cd apps/dashboard-frontend && npm install && npm start

test: ## Alle Tests ausführen
	./scripts/test/run-tests.sh --all

test-backend: ## Backend-Tests ausführen
	cd apps/dashboard-backend && npx jest --no-coverage

test-frontend: ## Frontend-Tests ausführen
	cd apps/dashboard-frontend && npx react-scripts test --watchAll=false --ci

# === Datenbank ===

db: ## PostgreSQL Shell öffnen
	docker exec -it postgres-db psql -U arasul -d arasul_db

backup-db: ## Datenbank-Backup erstellen
	@mkdir -p backups
	docker compose exec -T postgres-db pg_dump -U arasul arasul_db > backups/backup_$$(date +%Y%m%d_%H%M%S).sql
	@echo "Backup erstellt in backups/"

# === Einzelne Services ===

start-%: ## Einzelnen Service starten (z.B. make start-llm-service)
	docker compose up -d $*

stop-%: ## Einzelnen Service stoppen
	docker compose stop $*

restart-%: ## Einzelnen Service neustarten
	docker compose restart $*

logs-%: ## Logs eines Services (z.B. make logs-backend)
	docker compose logs -f $*
