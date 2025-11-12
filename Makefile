# ARASUL PLATFORM - Makefile
# Alternative CLI-Interface für Docker Compose Operationen

.PHONY: help bootstrap start stop restart status logs clean build pull update

# Default target
.DEFAULT_GOAL := help

help: ## Show this help message
	@echo "Arasul Platform - Make Targets"
	@echo ""
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-15s\033[0m %s\n", $$1, $$2}'
	@echo ""

bootstrap: ## Initialize and start the platform (first-time setup)
	./arasul bootstrap

start: ## Start all services
	docker-compose up -d
	@echo "Platform started. Dashboard: http://localhost"

stop: ## Stop all services
	docker-compose down

restart: ## Restart all services
	docker-compose restart

status: ## Show status of all services
	docker-compose ps

logs: ## Show logs from all services (Ctrl+C to exit)
	docker-compose logs -f

build: ## Build all custom Docker images
	docker-compose build

pull: ## Pull latest base images
	docker-compose pull

clean: ## Stop and remove all containers, networks, and volumes
	docker-compose down -v
	@echo "WARNING: All data has been removed!"

update: ## Update to latest version
	./arasul update

# Individual service targets
start-%: ## Start a specific service (e.g., make start-llm-service)
	docker-compose up -d $*

stop-%: ## Stop a specific service (e.g., make stop-llm-service)
	docker-compose stop $*

restart-%: ## Restart a specific service (e.g., make restart-dashboard-backend)
	docker-compose restart $*

logs-%: ## Show logs for a specific service (e.g., make logs-metrics-collector)
	docker-compose logs -f $*

# Maintenance targets
backup-db: ## Backup PostgreSQL database
	@mkdir -p backups
	docker-compose exec -T postgres-db pg_dump -U arasul arasul_db > backups/backup_$$(date +%Y%m%d_%H%M%S).sql
	@echo "Database backup created in backups/"

restore-db: ## Restore PostgreSQL database (specify file with FILE=backup.sql)
	@if [ -z "$(FILE)" ]; then echo "Usage: make restore-db FILE=backup.sql"; exit 1; fi
	cat $(FILE) | docker-compose exec -T postgres-db psql -U arasul arasul_db
	@echo "Database restored from $(FILE)"

cleanup-logs: ## Delete old log files (older than 7 days)
	find logs/ -name "*.log.*" -mtime +7 -delete
	@echo "Old logs cleaned up"

cleanup-docker: ## Clean up Docker system (images, containers, volumes)
	docker system prune -af
	@echo "Docker system cleaned up"

# Development targets
dev-backend: ## Start backend in development mode
	cd services/dashboard-backend && npm install && npm run dev

dev-frontend: ## Start frontend in development mode
	cd services/dashboard-frontend && npm install && npm start

# Testing targets
test: ## Run all smoke tests
	@echo "Testing API health..."
	@curl -f http://localhost/api/health || echo "API health check failed"
	@echo ""
	@echo "Testing services..."
	@curl -f http://localhost/api/services || echo "Services check failed"
	@echo ""
	@echo "Testing metrics..."
	@curl -f http://localhost/api/metrics/live || echo "Metrics check failed"

# Monitoring targets
stats: ## Show Docker stats for all containers
	docker stats --no-stream

top: ## Show running processes in containers
	docker-compose top

inspect-%: ## Inspect a specific service (e.g., make inspect-llm-service)
	docker-compose exec $* sh || docker-compose exec $* bash

# Database targets
db-shell: ## Open PostgreSQL shell
	docker-compose exec postgres-db psql -U arasul -d arasul_db

db-vacuum: ## Run database vacuum
	docker-compose exec postgres-db psql -U arasul -d arasul_db -c "VACUUM ANALYZE;"

db-cleanup: ## Clean up old metrics from database
	docker-compose exec postgres-db psql -U arasul -d arasul_db -c "SELECT cleanup_old_metrics();"

# Info targets
version: ## Show version information
	@echo "Arasul Platform v1.0.0"
	@echo ""
	@docker --version
	@docker-compose version

env: ## Show current environment variables (excluding secrets)
	@grep -v -E "(PASSWORD|SECRET|KEY|HASH)" .env 2>/dev/null || echo ".env file not found"

ps: ## Show all running containers
	docker-compose ps
