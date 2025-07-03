# STAGE 1: Builder
FROM node:lts-alpine AS builder

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@latest --activate
RUN apk add --no-cache git openssh-client

# 1. Copy ONLY dependency files FIRST for optimal caching.
COPY package.json pnpm-lock.yaml ./

# 2. Use BuildKit secrets and configure git for private packages.
RUN --mount=type=secret,id=gh_token \
    GH_TOKEN=$(cat /run/secrets/gh_token) && \
    export GITHUB_TOKEN=$GH_TOKEN && \
    git config --global url."https://${GH_TOKEN}:@github.com/".insteadOf "https://github.com/" && \
    git config --global url."https://${GH_TOKEN}:@github.com/".insteadOf "git@github.com:"

# 3. Install all dependencies (including dev for building/generating) in the builder stage.
RUN pnpm install --frozen-lockfile

# 4. Copy the rest of the application code.
COPY . .

# 5. Copy prisma.config.ts explicitly if it's not in the default prisma directory.
COPY prisma.config.ts ./prisma.config.ts
RUN npx prisma generate --config=./prisma.config.ts

# 6. Build TypeScript project using tsup
RUN pnpm build


# STAGE 2: Production
FROM node:lts-alpine AS production

# Build ARG and ENV for environment config
ARG NODE_ENV=production
ENV NODE_ENV=${NODE_ENV}

# Use non-root user for better security
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

WORKDIR /app

 
# Copy only required files from builder
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package.json ./
COPY --from=builder /app/pnpm-lock.yaml ./
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/prisma.config.ts ./

# This assumes pnpm installs directly into node_modules
COPY --from=builder /app/node_modules ./node_modules
 
# Fix permissions
RUN chown -R appuser:appgroup /app

USER appuser

EXPOSE 5008

# Start the server
CMD ["node", "-r", "module-alias/register", "dist/server.js"]
