# Rinha de Backend 2025 💸

Intermediador de pagamentos desenvolvido para a [Rinha de Backend 2025](https://github.com/zanfranceschi/rinha-de-backend-2025), utilizando Node.js, TypeScript, PostgreSQL e Redis.

## 🚀 Tecnologias Utilizadas

- **Node.js 22** - Runtime JavaScript
- **TypeScript 5.5** - Superset do JavaScript com tipagem estática
- **PostgreSQL** - Banco de dados relacional principal
- **Redis 7** - Cache em memória e broker de mensagens
- **BullMQ 5.56** - Sistema de filas baseado em Redis
- **Nginx** - Load balancer e proxy reverso

## 🏗️ Arquitetura

O projeto segue uma arquitetura com:

- **API Principal**: Duas instâncias para alta disponibilidade
- **Worker**: Processamento assíncrono de pagamentos
- **Load Balancer**: Nginx para distribuição de carga
- **Cache**: Redis para otimização de performance
- **Banco de Dados**: PostgreSQL com migrações automáticas
- **Processadores de Pagamento**: Serviços externos simulando processadores de pagamentos
<img width="965" height="532" alt="image" src="https://github.com/user-attachments/assets/26a468da-141c-46e4-aeaf-8f4d5c5abee2" />

## 🚀 Como Executar o Projeto

### Pré-requisitos

- Docker e Docker Compose instalados
- Portas 9999, 5482 e 6379 disponíveis

### 1. Executar os Processadores de Pagamento

```bash
docker compose -f ./containerization/docker-compose-payment-processors.yml up -d
```

### 2. Executar a API Principal

```bash
docker compose -f ./containerization/docker-compose.yml up -d
```

### 3. Verificar se os Serviços Estão Funcionando

```bash
# Verificar status dos containers
docker compose -f ./containerization/docker-compose.yml ps

# Verificar logs da API
docker compose -f ./containerization/docker-compose.yml logs -f api1

# Verificar logs do worker
docker compose -f ./containerization/docker-compose.yml logs -f worker
```

### 4. Testar a API

```bash
# Health check
curl http://localhost:9999/health

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

# Executar migrações do banco
pnpm db:migrate

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
│   │   ├── db/                   # Configuração do banco de dados
│   │   │   ├── migrations/       # Migrações do Drizzle
│   │   │   ├── repositories/     # Repositórios de dados
│   │   │   └── schema/           # Esquemas do banco
│   │   ├── gateways/             # Integrações externas
│   │   ├── plugins/              # Plugins do Fastify
│   │   ├── queues/               # Sistema de filas
│   │   ├── routes/               # Rotas da API
│   │   ├── services/             # Serviços de domínio
│   │   ├── shared/               # Utilitários compartilhados
│   │   ├── use-cases/            # Casos de uso
│   │   ├── app-builder.ts        # Construtor da aplicação
│   │   ├── worker-builder.ts     # Construtor do worker
│   │   ├── index.ts              # Entrada da API
│   │   └── worker.ts             # Entrada do worker
│   ├── Dockerfile                # Container da aplicação
│   ├── Dockerfile.migration      # Container para migrações
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
- **migration**: Execução automática de migrações

### Infraestrutura

- **database**: PostgreSQL na porta 5482
- **cache**: Redis na porta 6379
- **nginx**: Load balancer na porta 9999

### Processadores de Pagamento

- **payment-processor-default**: Processador principal
- **payment-processor-fallback**: Processador de fallback

## 🔄 Fluxo de Pagamentos

1. **Recebimento**: API recebe solicitação de pagamento
2. **Validação**: Dados são validados com Zod
3. **Persistência**: Pagamento é salvo no PostgreSQL
4. **Enfileiramento**: Pagamento é adicionado à fila Redis
5. **Processamento**: Worker processa o pagamento assincronamente
6. **Integração**: Chamada para processadores externos
7. **Atualização**: Status do pagamento é atualizado

## 🛠️ Comandos Úteis

```bash
# Parar todos os serviços
docker compose -f ./containerization/docker-compose.yml down

# Limpar volumes (dados serão perdidos)
docker compose -f ./containerization/docker-compose.yml down -v

# Reconstruir imagens
docker compose -f ./containerization/docker-compose.yml build --no-cache

# Ver logs de todos os serviços
docker compose -f ./containerization/docker-compose.yml logs -f

# Executar migração manualmente
docker compose -f ./containerization/docker-compose.yml run --rm migration

# Acessar shell do container da API
docker compose -f ./containerization/docker-compose.yml exec api1 sh
```
