# Drizzle Plugin

This plugin provides database connectivity using Drizzle ORM with PostgreSQL.

## Features

- **Database Connection Management**: Automatic connection pooling with configurable settings
- **Health Checks**: Built-in database health check endpoint at `/health/database`
- **Graceful Shutdown**: Proper connection cleanup on application shutdown
- **Dependency Injection**: Database instance available through Fastify DI container
- **Error Handling**: Comprehensive error logging and connection retry logic

## Configuration

The plugin uses the following environment variables:

```env
DATABASE_URL=postgresql://docker:docker@localhost:5482/rinha_de_backend_2025
```

## Usage

### In Routes

```typescript
// Access database through DI container
const db = fastify.diContainer.resolve("db");

// Or access directly from fastify instance
const result = await fastify.db.select().from(payments);
```

### In Services

```typescript
export class PaymentService {
  constructor(deps: { db: DrizzleDB; logger: FastifyBaseLogger }) {
    this.db = deps.db;
    this.logger = deps.logger;
  }

  async createPayment(input: CreatePaymentInput) {
    return await this.db.insert(payments).values(input);
  }
}
```

## Database Operations

The plugin provides a fully typed Drizzle database instance with all schema tables available:

```typescript
// Insert
await db.insert(payments).values({
  correlationId: "123",
  amountInCents: 1000,
  requestedAt: new Date(),
});

// Select
const payment = await db
  .select()
  .from(payments)
  .where(eq(payments.correlationId, "123"));

// Update
await db
  .update(payments)
  .set({ processor: "default" })
  .where(eq(payments.correlationId, "123"));

// Delete
await db.delete(payments).where(eq(payments.correlationId, "123"));
```

## Migrations

Use Drizzle Kit for database migrations:

```bash
# Generate migration
pnpm drizzle-kit generate

# Run migrations
pnpm drizzle-kit migrate

# View database
pnpm drizzle-kit studio
```

## Health Check

The plugin automatically registers a health check endpoint:

```
GET /health/database
```

Response:

```json
{
  "status": "healthy",
  "database": "connected"
}
```

## Connection Pool Configuration

The plugin uses the following default pool settings:

- **Min connections**: 2
- **Max connections**: 10
- **Idle timeout**: 30 seconds
- **Connection timeout**: 5 seconds

These can be customized by modifying the `DatabaseManager` class in the plugin.
