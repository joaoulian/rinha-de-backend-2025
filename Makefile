# Makefile para Rinha de Backend 2025
# Facilita o build e deploy das imagens Docker

# Configurações
DOCKER_USERNAME ?= joaoulian
VERSION ?= latest
PLATFORMS ?= linux/amd64,linux/arm64

# Cores
BLUE = \033[0;34m
GREEN = \033[0;32m
YELLOW = \033[1;33m
NC = \033[0m

.PHONY: help build push build-push build-local clean test dev

# Target padrão
help: ## Mostra esta ajuda
	@echo "$(BLUE)Rinha de Backend 2025 - Comandos Make$(NC)"
	@echo ""
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "  $(YELLOW)%-15s$(NC) %s\n", $$1, $$2}'
	@echo ""
	@echo "$(BLUE)Variáveis de ambiente:$(NC)"
	@echo "  DOCKER_USERNAME  Username do Docker Hub (atual: $(DOCKER_USERNAME))"
	@echo "  VERSION          Versão da imagem (atual: $(VERSION))"
	@echo "  PLATFORMS        Plataformas para build (atual: $(PLATFORMS))"
	@echo ""
	@echo "$(BLUE)Exemplos:$(NC)"
	@echo "  make build                    # Build local"
	@echo "  make push                     # Build e push"
	@echo "  make build-push VERSION=v1.0.0 # Build e push com versão específica"

build: ## Build das imagens localmente
	@echo "$(BLUE)🏗️  Fazendo build local das imagens...$(NC)"
	./scripts/build-and-push.sh -u $(DOCKER_USERNAME) -v $(VERSION) -p $(PLATFORMS)

push: ## Build e push das imagens para Docker Hub
	@echo "$(BLUE)🚀 Fazendo build e push das imagens...$(NC)"
	./scripts/build-and-push.sh -u $(DOCKER_USERNAME) -v $(VERSION) -p $(PLATFORMS) --push

build-push: push ## Alias para push

build-local: ## Build apenas para plataforma local (mais rápido)
	@echo "$(BLUE)🏗️  Fazendo build local (plataforma atual)...$(NC)"
	./scripts/build-and-push.sh -u $(DOCKER_USERNAME) -v $(VERSION) -p linux/amd64

build-simple: ## Build simples usando o script básico
	@echo "$(BLUE)🏗️  Fazendo build simples...$(NC)"
	./scripts/push-to-dockerhub.sh $(DOCKER_USERNAME) $(VERSION)

push-simple: ## Push simples usando o script básico
	@echo "$(BLUE)🚀 Fazendo push simples...$(NC)"
	./scripts/push-to-dockerhub.sh $(DOCKER_USERNAME) $(VERSION)

clean: ## Remove imagens locais
	@echo "$(YELLOW)🧹 Removendo imagens locais...$(NC)"
	-docker rmi $(DOCKER_USERNAME)/rinha-backend-2025-api:$(VERSION) 2>/dev/null || true
	-docker rmi $(DOCKER_USERNAME)/rinha-backend-2025-api:latest 2>/dev/null || true
	-docker rmi $(DOCKER_USERNAME)/rinha-backend-2025-migration:$(VERSION) 2>/dev/null || true
	-docker rmi $(DOCKER_USERNAME)/rinha-backend-2025-migration:latest 2>/dev/null || true
	@echo "$(GREEN)✅ Limpeza concluída$(NC)"

test: ## Executa os testes da API
	@echo "$(BLUE)🧪 Executando testes...$(NC)"
	cd api && pnpm test

dev: ## Inicia o ambiente de desenvolvimento (build local)
	@echo "$(BLUE)🚀 Iniciando ambiente de desenvolvimento...$(NC)"
	docker compose -f ./containerization/docker-compose-payment-processors.yml up -d
	docker compose -f ./containerization/docker-compose.dev.yml up -d

dev-api: ## Inicia apenas a API em modo desenvolvimento
	@echo "$(BLUE)🚀 Iniciando API em modo desenvolvimento...$(NC)"
	docker compose -f ./containerization/docker-compose-payment-processors.yml up -d
	cd api && pnpm dev

run-prod: ## Executa usando imagens do Docker Hub (produção)
	@echo "$(BLUE)🚀 Iniciando ambiente de produção...$(NC)"
	docker compose -f ./containerization/docker-compose-payment-processors.yml up -d
	docker compose -f ./containerization/docker-compose.yml up -d

stop: ## Para todos os containers
	@echo "$(YELLOW)⏹️  Parando containers...$(NC)"
	docker compose -f ./containerization/docker-compose.yml down
	docker compose -f ./containerization/docker-compose.dev.yml down
	docker compose -f ./containerization/docker-compose-payment-processors.yml down

logs: ## Mostra logs dos containers (produção)
	@echo "$(BLUE)📋 Logs dos containers (produção):$(NC)"
	docker compose -f ./containerization/docker-compose.yml logs -f

logs-dev: ## Mostra logs dos containers (desenvolvimento)
	@echo "$(BLUE)📋 Logs dos containers (desenvolvimento):$(NC)"
	docker compose -f ./containerization/docker-compose.dev.yml logs -f

status: ## Mostra status dos containers (produção)
	@echo "$(BLUE)📊 Status dos containers (produção):$(NC)"
	docker compose -f ./containerization/docker-compose.yml ps

status-dev: ## Mostra status dos containers (desenvolvimento)
	@echo "$(BLUE)📊 Status dos containers (desenvolvimento):$(NC)"
	docker compose -f ./containerization/docker-compose.dev.yml ps
