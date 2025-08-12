# Rinha de Backend 2025 💸

[![pt-br](https://img.shields.io/badge/lang-pt--br-green.svg)](https://github.com/joaoulian/rinha-de-backend-2025/blob/main/README.md)
[![en](https://img.shields.io/badge/lang-en-red.svg)](https://github.com/joaoulian/rinha-de-backend-2025/blob/main/README-en.md)

---

Intermediador de pagamentos desenvolvido para a [Rinha de Backend 2025](https://github.com/zanfranceschi/rinha-de-backend-2025), utilizando Node.js, TypeScript e Redis.

## 🚀 Tecnologias Utilizadas

- **Node.js 22** - Runtime JavaScript
- **TypeScript** - Superset do JavaScript com tipagem estática
- **Redis 7** - Cache em memória e broker de mensagens
- **BullMQ** - Sistema de filas baseado em Redis
- **HAProxy** - Load balancer de alta performance

## 🏗️ Arquitetura

O projeto segue uma arquitetura com:

- **API Principal**: Duas instâncias para alta disponibilidade
- **Worker**: Processamento assíncrono de pagamentos em lote (até 550 por batch)
- **Batch Processor**: Sistema de polling que agrupa pagamentos individuais em lotes
- **Load Balancer**: HAProxy para distribuição de carga
- **Cache**: Redis para otimização de performance e filas
- **Processadores de Pagamento**: Serviços externos simulando processadores de pagamentos
  <img width="965" height="532" alt="image" src="https://github.com/user-attachments/assets/e5e41933-b19f-440c-9492-50eb883ed177" />

## 🚀 Como Executar o Projeto

### Pré-requisitos

- Docker e Docker Compose instalados
- Portas 9999 e 6379 disponíveis

### 1. Executar os Processadores de Pagamento

```bash
docker compose -f ./containerization/docker-compose-payment-processors.yml up -d
```

### 2. Executar a API Principal

```bash
docker compose -f ./containerization/docker-compose.dev.yml up -d
```

### 4. Testar a API

```bash
# Resumo dos pagamentos
curl http://localhost:9999/payments-summary

# Criar um pagamento
curl -X POST http://localhost:9999/payments \
  -H "Content-Type: application/json" \
  -d '{
    "amount": 1000,
    "correlationId": "123e4567-e89b-12d3-a456-426614174000"
  }'
```

## 🔧 Desenvolvimento Local

### Executar apenas a API (sem Docker)

```bash
# Navegar para o diretório da API
cd api

# Instalar dependências
pnpm install

# Configurar variáveis de ambiente
cp .env.example .env

# Principais variáveis de configuração do processamento em lote:
# BATCH_SIZE=550                  # Tamanho máximo do lote
# BATCH_INTERVAL_MS=500          # Intervalo de polling em ms

# Iniciar em modo de desenvolvimento
pnpm dev

# Executar testes
pnpm test

# Executar linting
pnpm lint

# Formatar código
pnpm format
```

## 📁 Estrutura do Projeto

```
├── api/                          # Aplicação Node.js
│   ├── src/
│   │   ├── gateways/             # Integrações externas
│   │   ├── plugins/              # Plugins do Fastify
│   │   ├── queues/               # Sistema de filas
│   │   ├── repositories/         # Repositórios de dados
│   │   │   └── implementations/  # Implementações concretas dos repositórios
│   │   ├── routes/               # Rotas da API
│   │   ├── services/             # Serviços de domínio
│   │   ├── shared/               # Utilitários compartilhados
│   │   ├── use-cases/            # Casos de uso
│   │   ├── app-builder.ts        # Construtor da aplicação
│   │   ├── worker-builder.ts     # Construtor do worker
│   │   ├── index.ts              # Entrada da API
│   │   └── worker.ts             # Entrada do worker
│   ├── Dockerfile                # Container da aplicação
│   └── package.json              # Dependências do projeto
├── containerization/             # Configuração Docker
│   ├── docker-compose.yml        # Orquestração principal
│   ├── docker-compose-payment-processors.yml
│   └── haproxy.cfg              # Configuração do load balancer
└── README.md                     # Documentação
```

## 🚦 Serviços

### API (Porta Externa 9999)

- **api1** e **api2**: Instâncias da API principal
- **worker**: Processamento assíncrono de pagamentos

### Infraestrutura

- **cache**: Redis na porta 6379
- **haproxy**: Load balancer na porta 9999 (stats na 8404)

### Processadores de Pagamento

- **payment-processor-default**: Processador principal
- **payment-processor-fallback**: Processador de fallback

## 🔄 Fluxo de Pagamentos

1. **Recebimento**: API recebe solicitação de pagamento individual
2. **Validação**: Dados são validados com Zod
3. **Enfileiramento Individual**: Pagamento é adicionado à fila individual Redis
4. **Polling Automático**: Batch Processor verifica fila a cada 500ms
5. **Agrupamento**: Até 550 pagamentos são agrupados em um lote
6. **Processamento em Lote**: Worker processa o lote assincronamente
7. **Integração Paralela**: Chamadas simultâneas para processadores externos (chunks de 10)
8. **Persistência em Lote**: Resultados são salvos usando pipeline Redis
9. **Retry Inteligente**: Pagamentos falhados são reagrupados com host alternativo

## 🔄 Estratégia de Processamento em Lote e Polling

O sistema implementa uma arquitetura otimizada de processamento em lote com polling para maximizar throughput e eficiência:

### Configuração do Processamento em Lote

- **BATCH_SIZE**: 550 pagamentos por lote (configurável via env)
- **BATCH_INTERVAL_MS**: 500ms entre verificações de lote (configurável via env)

### Cache de Status dos Processadores (Redis)

- **Cache TTL**: 5 segundos para informações de saúde dos processadores
- **Dados Armazenados**:
  - `failing`: Status de falha do processador
  - `minResponseTime`: Tempo mínimo de resposta
  - `cachedAt`: Timestamp do cache

### Seleção Inteligente de Processador

1. **Verificação de Saúde**: Consulta simultânea aos dois processadores
2. **Priorização**: Processador padrão tem prioridade se estiver saudável
3. **Fallback Automático**: Usa processador de fallback se o padrão falhar
4. **Cache Otimizado**: Evita consultas desnecessárias usando Redis

### Fluxo Detalhado do Sistema

```
Pagamentos Individuais
         ↓
   Fila Individual
         ↓
Batch Processor (500ms polling)
         ↓
   Agrupa em Lotes (550)
         ↓
  Processamento Paralelo
    (chunks de 10)
         ↓
   Falhas no Lote?
         ↓
Retry com Host Alternativo
         ↓
 Persistência em Pipeline
```

## � Imagens Docker Hub

O projeto está disponível no Docker Hub com imagens pré-construídas:

- **API**: [`joaoulian/rinha-backend-2025-api`](https://hub.docker.com/r/joaoulian/rinha-backend-2025-api)

### Build e Push das Imagens

```bash
# Usando Make (recomendado)
make push                    # Build e push para Docker Hub
make build                   # Build apenas local
make build-local            # Build rápido (plataforma atual)
```

### Configurar Suas Próprias Imagens

1. **Editar Makefile**: Altere `DOCKER_USERNAME` para seu usuário
2. **Build e Push**: Execute `make push`
3. **Atualizar docker-compose.yml**: Substitua `joaoulian` pelo seu usuário

## 🛠️ Comandos Úteis

### Produção (Docker Hub)

```bash
# Iniciar serviços
make run-prod

# Parar serviços
make stop

# Ver logs
make logs

# Ver status
make status
```

### Desenvolvimento (Build Local)

```bash
# Iniciar ambiente completo
make dev

# Iniciar apenas API (sem containers)
make dev-api

# Ver logs
make logs-dev

# Ver status
make status-dev
```

### Docker Compose Direto

```bash
# Produção
docker compose -f ./containerization/docker-compose.yml up -d
docker compose -f ./containerization/docker-compose.yml down

# Desenvolvimento
docker compose -f ./containerization/docker-compose.dev.yml up -d
docker compose -f ./containerization/docker-compose.dev.yml down

# Limpar volumes (dados serão perdidos)
docker compose -f ./containerization/docker-compose.yml down -v

# Acessar shell do container da API
docker compose -f ./containerization/docker-compose.yml exec api1 sh
```
