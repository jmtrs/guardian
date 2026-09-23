# Guardian Makefile
# Cross-platform: delegates to Node.js scripts for Windows compatibility

.PHONY: help setup dev dev-backend dev-mobile test test-backend test-mobile build lint typecheck db-start db-stop db-migrate db-deploy db-studio db-generate deploy deploy-backend sync status clean sim-prod

help:
	@echo "Guardian - Available Commands"
	@echo "===================================="
	@echo ""
	@echo "  Setup and Development:"
	@echo "    make setup          Initialize project and install dependencies"
	@echo "    make dev            Start backend and mobile in parallel"
	@echo "    make dev-backend    Start backend only"
	@echo "    make dev-mobile     Start mobile only"
	@echo ""
	@echo "  Testing and Quality:"
	@echo "    make test           Run all tests"
	@echo "    make test-backend   Run backend tests"
	@echo "    make test-mobile    Run mobile tests"
	@echo "    make lint           Lint all packages"
	@echo "    make typecheck      Typecheck all packages"
	@echo ""
	@echo "  Build and Deploy:"
	@echo "    make build          Build all packages"
	@echo "    make deploy         Deploy backend to Railway"
	@echo ""
	@echo "  Database:"
	@echo "    make db-start       Start local PostgreSQL via Docker"
	@echo "    make db-stop        Stop local PostgreSQL"
	@echo "    make db-migrate     Run Prisma migrate dev"
	@echo "    make db-deploy      Run Prisma migrate deploy"
	@echo "    make db-studio      Open Prisma Studio"
	@echo "    make db-generate    Generate Prisma client"
	@echo ""
	@echo "  Utilities:"
	@echo "    make status         Show git status and project info"
	@echo "    make clean          Clean build artifacts and node_modules"
	@echo "    make sim-prod       Simulate device events against PROD (KIND=gnss_fix N=3)"

# ============================================
# Setup & Development
# ============================================

setup:
	@pnpm run setup

dev:
	@pnpm run dev

dev-backend:
	@pnpm run dev:backend

dev-mobile:
	@pnpm run dev:mobile

# ============================================
# Testing & Quality
# ============================================

test: test-backend test-mobile

test-backend:
	@pnpm run test:backend

test-mobile:
	@pnpm run test:mobile || true

lint:
	@pnpm run lint

typecheck:
	@pnpm run typecheck || true

# ============================================
# Build & Deploy
# ============================================

build:
	@pnpm run build

deploy: deploy-backend

deploy-backend:
	@echo "Deploying backend to Railway..."
	@cd backend && railway up

# ============================================
# Database
# ============================================

db-start:
	@echo "Starting PostgreSQL..."
	@docker compose up -d
	@echo "Database started on port 5432"

db-stop:
	@echo "Stopping PostgreSQL..."
	@docker compose down

db-migrate:
	@echo "Running Prisma migrate dev..."
	@pnpm --filter backend exec prisma migrate dev

db-deploy:
	@echo "Deploying Prisma migrations..."
	@pnpm --filter backend exec prisma migrate deploy

db-studio:
	@echo "Opening Prisma Studio..."
	@pnpm --filter backend exec prisma studio

db-generate:
	@echo "Generating Prisma client..."
	@pnpm --filter backend exec prisma generate

# ============================================
# Utilities
# ============================================

status:
	@pnpm run status

clean:
	@pnpm run clean

# ============================================
# Simulacion contra PROD (homelab)
# ============================================

# Empuja eventos v2 al backend de prod para probar la app en vivo. El K_root no
# sale del homelab (ver backend/scripts/prod-sim.sh). Ejemplos:
#   make sim-prod                       # 3 gnss_fix moviendose
#   make sim-prod KIND=heartbeat        # un latido
#   make sim-prod KIND=gnss_fix N=6     # 6 fixes
KIND ?= gnss_fix
N ?= 3
sim-prod:
	@bash backend/scripts/prod-sim.sh $(KIND) $(N)