FROM node:lts-alpine AS builder

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@latest --activate
RUN apk add --no-cache git openssh-client

COPY package.json pnpm-lock.yaml ./

RUN --mount=type=secret,id=gh_token \
    GH_TOKEN=$(cat /run/secrets/gh_token) && \
    export GITHUB_TOKEN=$GH_TOKEN && \
    git config --global url."https://${GH_TOKEN}:x-oauth-basic@github.com/".insteadOf "https://github.com/" && \
    git config --global url."https://${GH_TOKEN}:x-oauth-basic@github.com/".insteadOf "git@github.com:" && \
    pnpm install --frozen-lockfile

RUN pnpm install --frozen-lockfile

COPY . .

COPY prisma.config.ts ./prisma.config.ts
RUN npx prisma generate --config=./prisma.config.ts

RUN pnpm build


FROM node:lts-alpine AS production

ARG NODE_ENV=production
ENV NODE_ENV=${NODE_ENV}

RUN addgroup -S appgroup && adduser -S appuser -G appgroup

WORKDIR /app

 
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package.json ./
COPY --from=builder /app/pnpm-lock.yaml ./
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/prisma.config.ts ./

COPY --from=builder /app/node_modules ./node_modules
 
RUN chown -R appuser:appgroup /app

USER appuser

EXPOSE 5008

CMD ["node", "-r", "module-alias/register", "dist/server.js"]
