# Rinha de Backend 2025 💸

[![pt-br](https://img.shields.io/badge/lang-pt--br-green.svg)](https://github.com/joaoulian/rinha-de-backend-2025/blob/main/README.md)
[![en](https://img.shields.io/badge/lang-en-red.svg)](https://github.com/joaoulian/rinha-de-backend-2025/blob/main/README-en.md)

---

Payment intermediary developed for the [Rinha de Backend 2025](https://github.com/zanfranceschi/rinha-de-backend-2025), using Node.js, TypeScript and Redis.

## 🚀 Technologies Used

- **Node.js 22** - JavaScript runtime
- **TypeScript** - JavaScript superset with static typing
- **Redis 7** - In-memory cache and message broker
- **BullMQ** - Redis-based queue system
- **HAProxy** - High-performance load balancer

## 🏗️ Architecture

The project follows an architecture with:

- **Main API**: Two instances for high availability
- **Worker**: Asynchronous batch payment processing (up to 550 per batch)
- **Batch Processor**: Polling system that groups individual payments into batches
- **Load Balancer**: HAProxy for load distribution
- **Cache**: Redis for performance optimization and queues
- **Payment Processors**: External services simulating payment processors
  <img width="965" height="532" alt="image" src="https://github.com/user-attachments/assets/e5e41933-b19f-440c-9492-50eb883ed177" />

## 🚀 How to Run the Project

### Prerequisites

- Docker and Docker Compose installed
- Ports 9999 and 6379 available

### 1. Run Payment Processors

```bash
docker compose -f ./containerization/docker-compose-payment-processors.yml up -d
```

### 2. Run Main API

```bash
docker compose -f ./containerization/docker-compose.dev.yml up -d
```

### 4. Test the API

```bash
# Payment summary
curl http://localhost:9999/payments-summary

# Create a payment
curl -X POST http://localhost:9999/payments \
  -H "Content-Type: application/json" \
  -d '{
    "amount": 1000,
    "correlationId": "123e4567-e89b-12d3-a456-426614174000"
  }'
```

## 🔧 Local Development

### Run API only (without Docker)

```bash
# Navigate to API directory
cd api

# Install dependencies
pnpm install

# Configure environment variables
cp .env.example .env

# Main batch processing configuration variables:
# BATCH_SIZE=550                  # Maximum batch size
# BATCH_INTERVAL_MS=500          # Polling interval in ms

# Start in development mode
pnpm dev

# Run tests
pnpm test

# Run linting
pnpm lint

# Format code
pnpm format
```

## 📁 Project Structure

```
├── api/                          # Node.js application
│   ├── src/
│   │   ├── gateways/             # External integrations
│   │   ├── plugins/              # Fastify plugins
│   │   ├── queues/               # Queue system
│   │   ├── repositories/         # Data repositories
│   │   │   └── implementations/  # Concrete repository implementations
│   │   ├── routes/               # API routes
│   │   ├── services/             # Domain services
│   │   ├── shared/               # Shared utilities
│   │   ├── use-cases/            # Use cases
│   │   ├── app-builder.ts        # Application builder
│   │   ├── worker-builder.ts     # Worker builder
│   │   ├── index.ts              # API entry point
│   │   └── worker.ts             # Worker entry point
│   ├── Dockerfile                # Application container
│   └── package.json              # Project dependencies
├── containerization/             # Docker configuration
│   ├── docker-compose.yml        # Main orchestration
│   ├── docker-compose-payment-processors.yml
│   └── haproxy.cfg              # Load balancer configuration
└── README.md                     # Documentation
```

## 🚦 Services

### API (External Port 9999)

- **api1** and **api2**: Main API instances
- **worker**: Asynchronous payment processing

### Infrastructure

- **cache**: Redis on port 6379
- **haproxy**: Load balancer on port 9999 (stats on 8404)

### Payment Processors

- **payment-processor-default**: Main processor
- **payment-processor-fallback**: Fallback processor

## 🔄 Payment Flow

1. **Reception**: API receives individual payment request
2. **Validation**: Data is validated with Zod
3. **Individual Queuing**: Payment is added to individual Redis queue
4. **Automatic Polling**: Batch Processor checks queue every 500ms
5. **Grouping**: Up to 550 payments are grouped into a batch
6. **Batch Processing**: Worker processes the batch asynchronously
7. **Parallel Integration**: Simultaneous calls to external processors (chunks of 10)
8. **Batch Persistence**: Results are saved using Redis pipeline
9. **Smart Retry**: Failed payments are regrouped with alternative host

## 🔄 Batch Processing and Polling Strategy

The system implements an optimized batch processing architecture with polling to maximize throughput and efficiency:

### Batch Processing Configuration

- **BATCH_SIZE**: 550 payments per batch (configurable via env)
- **BATCH_INTERVAL_MS**: 500ms between batch checks (configurable via env)

### Processor Status Cache (Redis)

- **Cache TTL**: 5 seconds for processor health information
- **Stored Data**:
  - `failing`: Processor failure status
  - `minResponseTime`: Minimum response time
  - `cachedAt`: Cache timestamp

### Smart Processor Selection

1. **Health Check**: Simultaneous query to both processors
2. **Prioritization**: Default processor has priority if healthy
3. **Automatic Fallback**: Uses fallback processor if default fails
4. **Optimized Cache**: Avoids unnecessary queries using Redis

### Detailed System Flow

```
Individual Payments
         ↓
   Individual Queue
         ↓
Batch Processor (500ms polling)
         ↓
   Group into Batches (550)
         ↓
  Parallel Processing
    (chunks of 10)
         ↓
   Batch Failures?
         ↓
Retry with Alternative Host
         ↓
 Pipeline Persistence
```

## 🐳 Docker Hub Images

The project is available on Docker Hub with pre-built images:

- **API**: [`joaoulian/rinha-backend-2025-api`](https://hub.docker.com/r/joaoulian/rinha-backend-2025-api)

### Build and Push Images

```bash
# Using Make (recommended)
make push                    # Build and push to Docker Hub
make build                   # Build local only
make build-local            # Fast build (current platform)
```

### Configure Your Own Images

1. **Edit Makefile**: Change `DOCKER_USERNAME` to your username
2. **Build and Push**: Run `make push`
3. **Update docker-compose.yml**: Replace `joaoulian` with your username

## 🛠️ Useful Commands

### Production (Docker Hub)

```bash
# Start services
make run-prod

# Stop services
make stop

# View logs
make logs

# View status
make status
```

### Development (Local Build)

```bash
# Start complete environment
make dev

# Start API only (no containers)
make dev-api

# View logs
make logs-dev

# View status
make status-dev
```

### Direct Docker Compose

```bash
# Production
docker compose -f ./containerization/docker-compose.yml up -d
docker compose -f ./containerization/docker-compose.yml down

# Development
docker compose -f ./containerization/docker-compose.dev.yml up -d
docker compose -f ./containerization/docker-compose.dev.yml down

# Clean volumes (data will be lost)
docker compose -f ./containerization/docker-compose.yml down -v

# Access API container shell
docker compose -f ./containerization/docker-compose.yml exec api1 sh
```
