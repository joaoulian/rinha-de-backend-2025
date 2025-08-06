# Rinha de Backend 2025 💸

Intermediador de pagamentos desenvolvido para a [Rinha de Backend 2025](https://github.com/zanfranceschi/rinha-de-backend-2025), utilizando Node.js, TypeScript e Redis.

## 🚀 Tecnologias Utilizadas

- **Node.js 22** - Runtime JavaScript
- **TypeScript** - Superset do JavaScript com tipagem estática
- **Redis 7** - Cache em memória e broker de mensagens
- **BullMQ** - Sistema de filas baseado em Redis
- **Nginx** - Load balancer e proxy reverso

## 🏗️ Arquitetura

O projeto segue uma arquitetura com:

- **API Principal**: Duas instâncias para alta disponibilidade
- **Worker**: Processamento assíncrono de pagamentos
- **Load Balancer**: Nginx para distribuição de carga
- **Cache**: Redis para otimização de performance
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
│   └── nginx.conf                # Configuração do Nginx
└── README.md                     # Documentação
```

## 🚦 Serviços

### API (Portas 9999)

- **api1** e **api2**: Instâncias da API principal
- **worker**: Processamento assíncrono de pagamentos

### Infraestrutura

- **cache**: Redis na porta 6379
- **nginx**: Load balancer na porta 9999

### Processadores de Pagamento

- **payment-processor-default**: Processador principal
- **payment-processor-fallback**: Processador de fallback

## 🔄 Fluxo de Pagamentos

1. **Recebimento**: API recebe solicitação de pagamento
2. **Validação**: Dados são validados com Zod
3. **Persistência**: Pagamento é salvo no Redis
4. **Enfileiramento**: Pagamento é adicionado à fila Redis
5. **Processamento**: Worker processa o pagamento assincronamente
6. **Integração**: Chamada para processadores externos
7. **Atualização**: Status do pagamento é atualizado

## 🔄 Estratégia de Retry e Failover

O sistema implementa uma estratégia robusta de retry e failover para garantir alta disponibilidade no processamento de pagamentos:

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

### Estratégia de Retry em Múltiplas Camadas

#### Camada 1: BullMQ (Retry Imediato)

- **Tentativas**: Configurável por job
- **Backoff**: Estratégia exponencial
- **Mesmo Host**: Mantém o processador original

#### Camada 2: Troca de Processador (Retry Inteligente)

- **Ativação**: Após esgotar tentativas do BullMQ
- **Troca de Host**: Alterna entre default ↔ fallback
- **Delay Inteligente**: Aguarda `minResponseTime` do novo processador
- **Requeue**: Adiciona novo job na fila com prioridade mantida

### Fluxo de Retry Detalhado

```
Pagamento Falha
       ↓
BullMQ Retry (mesmo host)
       ↓
Tentativas Esgotadas?
       ↓
Consulta Saúde do Outro Host
       ↓
Agenda Retry com Novo Host
       ↓
Delay = minResponseTime
       ↓
Nova Tentativa de Processamento
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
