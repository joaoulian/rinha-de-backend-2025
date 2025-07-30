# Calhamaco API

A modern Node.js API built with Fastify, TypeScript, and dependency injection using Awilix.

## Features

- 🚀 **Fastify** - Fast and low overhead web framework
- 📝 **TypeScript** - Type safety and better developer experience
- 💉 **Dependency Injection** - Using Awilix for clean architecture
- 🧪 **Jest** - Comprehensive testing setup
- 🔍 **Biome** - Fast linter and formatter
- 📦 **pnpm** - Efficient package manager

## Getting Started

### Prerequisites

- Node.js LTS (18.x or higher)
- pnpm

### Installation

1. Install dependencies:
```bash
pnpm install
```

2. Copy environment variables:
```bash
cp .env.example .env
```

3. Start the development server:
```bash
pnpm dev
```

The API will be available at `http://localhost:3000`

## Available Scripts

- `pnpm dev` - Start development server with hot reload
- `pnpm build` - Build the application
- `pnpm start` - Start production server
- `pnpm test` - Run tests
- `pnpm test:watch` - Run tests in watch mode
- `pnpm test:coverage` - Run tests with coverage report
- `pnpm lint` - Run linter
- `pnpm lint:fix` - Run linter and fix issues
- `pnpm format` - Format code
- `pnpm type-check` - Run TypeScript type checking

## API Endpoints

### Health Check
- `GET /health` - Basic health check
- `GET /health/detailed` - Detailed health check with dependencies

### Users
- `GET /users` - Get all users
- `GET /users/:id` - Get user by ID
- `POST /users` - Create new user
- `PUT /users/:id` - Update user
- `DELETE /users/:id` - Delete user

## Project Structure

```
src/
├── __tests__/          # Integration tests
├── config/             # Configuration files
├── container/          # Dependency injection container
├── routes/             # Route handlers
├── services/           # Business logic services
├── test/               # Test setup and utilities
├── app.ts              # Fastify app setup
└── index.ts            # Application entry point
```

## Architecture

This API follows a clean architecture pattern with:

- **Dependency Injection**: Using Awilix for IoC container
- **Service Layer**: Business logic separated from HTTP concerns
- **Route Handlers**: Thin controllers that delegate to services
- **Type Safety**: Full TypeScript coverage with strict configuration

## Testing

The project includes comprehensive testing setup:

- **Unit Tests**: For individual services and utilities
- **Integration Tests**: For API endpoints and application flow
- **Coverage Reports**: Generated with Jest

Run tests:
```bash
# Run all tests
pnpm test

# Run tests in watch mode
pnpm test:watch

# Generate coverage report
pnpm test:coverage
```

## Linting and Formatting

Using Biome for fast linting and formatting:

```bash
# Check for issues
pnpm lint

# Fix issues automatically
pnpm lint:fix

# Format code
pnpm format
```

## Environment Variables

Copy `.env.example` to `.env` and configure:

- `PORT` - Server port (default: 3000)
- `HOST` - Server host (default: 0.0.0.0)
- `NODE_ENV` - Environment (development/production)
- `LOG_LEVEL` - Logging level (info/debug/error)

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests for new functionality
5. Run linting and tests
6. Submit a pull request

## License

ISC
