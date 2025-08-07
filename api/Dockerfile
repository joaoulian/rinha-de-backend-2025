# builder
FROM node:22-alpine AS builder
WORKDIR /app
RUN npm install -g pnpm
COPY package*.json ./
RUN pnpm install --prod
COPY . .
RUN pnpm run build

# runner
FROM node:22-slim AS production
WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package*.json ./
RUN chown -R www-data:www-data /tmp
USER www-data
ENV NODE_ENV=production
EXPOSE 3000
