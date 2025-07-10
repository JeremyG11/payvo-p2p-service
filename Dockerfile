    FROM node:lts-alpine AS builder

    WORKDIR /app
    
    # Enable pnpm via corepack
    RUN corepack enable && corepack prepare pnpm@latest --activate
    
    # Add necessary tools for private repo cloning
    RUN apk add --no-cache git openssh-client
    
    # Copy package files
    COPY package.json pnpm-lock.yaml ./
    
    RUN --mount=type=secret,id=gh_token \
        GH_TOKEN=$(cat /run/secrets/gh_token) && \
        export GITHUB_TOKEN=$GH_TOKEN && \
        git config --global url."https://${GH_TOKEN}:@github.com/".insteadOf "https://github.com/" && \
        git config --global url."https://${GH_TOKEN}:@github.com/".insteadOf "git@github.com:" && \
        npm_config_ignore_scripts=true pnpm install --frozen-lockfile

    # Copy source code
    COPY . .
    
    COPY prisma.config.ts ./
    RUN npx prisma generate --config=./prisma.config.ts
    
    # Build the app
    RUN pnpm build
    
    RUN npx prisma generate
    
    
    FROM node:lts-alpine AS production
    
    ARG NODE_ENV=production
    ENV NODE_ENV=${NODE_ENV}
    
    # Create non-root user
    RUN addgroup -S appgroup && adduser -S appuser -G appgroup
    
    WORKDIR /app
    
    # Copy production files from builder
    COPY --from=builder /app/dist ./dist
    COPY --from=builder /app/src ./src
    COPY --from=builder /app/package.json ./
    COPY --from=builder /app/pnpm-lock.yaml ./
    COPY --from=builder /app/prisma ./prisma
    COPY --from=builder /app/prisma.config.ts ./
    COPY --from=builder /app/node_modules ./node_modules

    # Change ownership
    RUN chown -R appuser:appgroup /app
    
    USER appuser
    
    EXPOSE 5006
    
    # Start app
    CMD ["node", "-r", "module-alias/register", "dist/server.js"]
    