.PHONY: help up down restart logs build clean verify shell-server shell-web db-push db-migrate db-studio

# Default target
help:
	@echo "SuiLens Docker Commands"
	@echo "======================="
	@echo ""
	@echo "  make up          - Start all services"
	@echo "  make down        - Stop all services"
	@echo "  make restart     - Restart all services"
	@echo "  make logs        - Show logs from all services"
	@echo "  make build       - Rebuild all containers"
	@echo "  make clean       - Stop and remove all volumes"
	@echo ""
	@echo "  make shell-server - Access backend container shell"
	@echo "  make shell-web    - Access frontend container shell"
	@echo ""
	@echo "  make db-push     - Push Prisma schema to database"
	@echo "  make db-migrate  - Create a new migration"
	@echo "  make db-studio   - Open Prisma Studio"
	@echo ""

# Start all services
up:
	docker compose up

# Start all services in detached mode
up-d:
	docker compose up -d

# Stop all services
down:
	docker compose down

# Restart all services
restart:
	docker compose restart

# Show logs
logs:
	docker compose logs -f

# Rebuild and start
build:
	docker compose up --build

# Clean everything (including volumes)
clean:
	docker compose down -v
	@echo "All containers and volumes removed"

# Access backend shell
shell-server:
	docker compose exec server sh

# Access frontend shell
shell-web:
	docker compose exec web sh

# Push Prisma schema to database
db-push:
	docker compose exec server sh -c "cd apps/server && pnpm prisma db push"

# Create a new migration
db-migrate:
	@read -p "Migration name: " name; \
	docker compose exec server sh -c "cd apps/server && pnpm prisma migrate dev --name $$name"

# Open Prisma Studio
db-studio:
	docker compose exec server sh -c "cd apps/server && pnpm prisma studio"

# Show container status
status:
	docker compose ps

