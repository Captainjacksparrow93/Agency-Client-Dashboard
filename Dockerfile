# ─── Stage 1: Install dependencies ───────────────────────────────────────────
FROM node:20-alpine AS deps
WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci

# ─── Stage 2: Build the Next.js app ───────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app

# Provide a dummy DATABASE_URL so Prisma client can be generated during build
# (actual DB path is set at runtime via docker-compose env_file)
ARG DATABASE_URL=file:/tmp/build.db
ENV DATABASE_URL=$DATABASE_URL

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Ensure no stale build cache is present
RUN rm -rf .next

# Generate Prisma client (uses schema.prisma)
RUN npx prisma generate

# Build Next.js with standalone output
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build 2>&1

# ─── Stage 3: Production runner ───────────────────────────────────────────────
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production

# Install only runtime deps needed by Prisma CLI + bcryptjs
RUN apk add --no-cache libc6-compat

# Copy standalone server output
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

# Copy Prisma schema and generated client
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma

# Copy production seed and entrypoint
COPY --from=builder /app/prisma/seed.prod.js ./prisma/seed.prod.js
COPY --from=builder /app/node_modules/bcryptjs ./node_modules/bcryptjs
COPY entrypoint.sh ./entrypoint.sh
RUN chmod +x entrypoint.sh

# Ensure data directory exists (SQLite lives here via volume)
RUN mkdir -p /app/data

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME=0.0.0.0

ENTRYPOINT ["./entrypoint.sh"]
