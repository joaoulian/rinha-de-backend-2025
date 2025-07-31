FROM node:lts-alpine AS base

# Install pnpm
RUN npm install -g pnpm

# deps
FROM base AS deps
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --prod --frozen-lockfile

# runner
FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 api
RUN chown api:nodejs .
COPY --chown=api:nodejs . .
COPY --from=deps /app/node_modules ./node_modules
USER api
EXPOSE 9999
ENV PORT=9999