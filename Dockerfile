# ─── Stage 1: Install dependencies ───────────────────────────────────────────
FROM node:20-alpine AS deps
# libc6-compat is required for Prisma native binaries and Next.js SWC on Alpine
RUN apk add --no-cache libc6-compat
WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci

# ─── Stage 2: Build the Next.js app ───────────────────────────────────────────
FROM node:20-alpine AS builder
RUN apk add --no-cache libc6-compat
WORKDIR /app

# Provide a dummy DATABASE_URL so Prisma client can be generated during build
ARG DATABASE_URL=file:/tmp/build.db
ENV DATABASE_URL=$DATABASE_URL
ENV NEXT_TELEMETRY_DISABLED=1

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Ensure no stale build cache is present; ensure public dir exists for Next.js
RUN rm -rf .next && mkdir -p public

# Generate Prisma client
RUN npx prisma generate

# Build Next.js with standalone output
RUN npm run build

# ─── Stage 3: Production runner ───────────────────────────────────────────────
FROM node:20-alpine AS runner
RUN apk add --no-cache libc6-compat
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Copy standalone server output
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
# Ensure public dir exists then copy (handles case where repo has no public assets)
RUN mkdir -p ./public
COPY --from=builder /app/public ./public

# Copy Prisma schema and generated client (engine needs libc6-compat above)
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma

# Copy production seed and bcryptjs
COPY --from=builder /app/prisma/seed.prod.js ./prisma/seed.prod.js
COPY --from=builder /app/node_modules/bcryptjs ./node_modules/bcryptjs

# Copy entrypoint
COPY entrypoint.sh ./entrypoint.sh
RUN chmod +x entrypoint.sh

# Ensure data directory exists (SQLite volume mount point)
RUN mkdir -p /app/data

EXPOSE 3000

ENTRYPOINT ["./entrypoint.sh"]
