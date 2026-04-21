# syntax=docker/dockerfile:1.6

# -----------------------------------------------------------------------------
# Builder stage — installs full deps (including dev) and compiles TypeScript.
# -----------------------------------------------------------------------------
FROM node:20-alpine AS builder

WORKDIR /app

# Install only what npm needs to build; bcrypt has a native addon so we bring
# python3 + make + g++ which the node-gyp toolchain needs.
RUN apk add --no-cache python3 make g++

COPY package.json package-lock.json* ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src

RUN npm run build

# -----------------------------------------------------------------------------
# Runner stage — tiny production image with only prod dependencies.
# -----------------------------------------------------------------------------
FROM node:20-alpine AS runner

# GIT_SHA is passed in by the build pipeline, e.g.
#   docker build --build-arg GIT_SHA=$(git rev-parse --short HEAD) .
# It becomes APP_RELEASE inside the container so Sentry can tag every
# captured error with the exact commit that produced this image.
ARG GIT_SHA=dev
ENV NODE_ENV=production
ENV PORT=3000
ENV APP_RELEASE=$GIT_SHA

WORKDIR /app

# bcrypt's native binary is architecture-specific; reinstall prod deps from
# scratch so the copied tree matches the runner's libc.
COPY package.json package-lock.json* ./
RUN apk add --no-cache python3 make g++ \
  && npm ci --omit=dev \
  && apk del python3 make g++

COPY --from=builder /app/dist ./dist

EXPOSE 3000

# Drop privileges — node:20-alpine ships a `node` user already.
USER node

# Healthcheck uses /health (pure liveness). Use node's global fetch rather
# than pulling in curl just for this.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://localhost:' + (process.env.PORT || 3000) + '/health').then(r => { if (r.status !== 200) process.exit(1); }).catch(() => process.exit(1))"

CMD ["node", "dist/server.js"]
