# syntax=docker/dockerfile:1

# --- Stage 1: install dependencies ---
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# --- Stage 2: build the Next.js app ---
FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
# Use webpack instead of Turbopack: Turbopack cannot resolve the native
# lightningcss binary when evaluating the PostCSS/Tailwind config at build time.
RUN npx next build --webpack

# --- Stage 3: minimal runtime image ---
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Chromium, for the search layer that opens result pages.
#
# The search falls back to a real browser for questions the API layers cannot answer,
# such as a regulation that lives as a PDF on a government site. That needs a browser
# in the image, and the image has none: Alpine ships no Chromium and Google Chrome is
# not available for musl at all.
#
# Alpine's own chromium is a real Chromium, so Playwright can drive it. It has to be
# named through VMA_CHROMIUM_PATH, because Playwright otherwise looks for its own
# bundled build, which is a glibc binary and would not start here.
#
# The fonts are not optional. A browser with no fonts renders text as blank boxes, so
# a page would load and hand back nothing readable, which looks exactly like a site
# with no content rather than a broken image.
RUN apk add --no-cache chromium font-noto
ENV VMA_CHROMIUM_PATH=/usr/bin/chromium

RUN addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 nextjs

# Config store lives here. Created with the right owner so the unprivileged
# runtime user can write to it when this path is a mounted volume.
RUN mkdir -p /app/data && chown nextjs:nodejs /app/data

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3000

CMD ["node", "server.js"]
