Project-specific Copilot instructions for contributors and automated agents

Summary

- This repo is an Express-based microservice (`@payvo/p2p-service`) that exposes
  internal APIs under `/api/v1/p2p`. Main entry points: `src/server.ts` and
  `src/app.ts`.

What to know up-front

- Entrypoint & runtime: `src/server.ts` bootstraps Kafka, Redis and scheduled
  tasks and then starts the HTTP server. Useful health check: `GET
/api/v1/p2p/health`.
- Dev workflow: use `pnpm dev` (see `package.json` scripts). Build with
  `pnpm build` (uses `tsup`) and run `pnpm start` to execute built output.
- Tests: `pnpm test` (Vitest). Coverage: `pnpm test:coverage`.

Important integrations & sidecars

- Kafka: configured in `src/config/kafka.ts`. Topics can be provisioned when
  `PROVISION_KAFKA_TOPICS=1` is set. The Kafka client comes from `@gatwech/kafka`.
- Redis: service must be available (`REDIS_URL` required at bootstrap).
- Prisma: schema files live in `prisma/schema/`. Postinstall runs `prisma generate`.
- Private/internal packages: `@gatwech/redis` and `payvo-auth` are git dependencies
  that must be reachable during `pnpm install`.

Auth & internal service patterns to follow

- Internal routes are protected by `src/middlewares/internalAuth.ts`.
  - Two supported schemes: `Service <token>` (static token via
    `INTERNAL_ACCESS_SECRET`) and `Bearer <jwt>` (verified against a public
    key). The JWT key may be provided via `JWT_PUBLIC_KEY_PEM` or a path via
    `JWT_PUBLIC_KEY_PATH`/`JWT_PUBLIC_KEY_FILE`.
  - Audience for JWT verification: `internal-services`; issuer set by
    `AUTH_ISSUER` / `config.authIssuer`.

Environment variables (commonly used)

- Required for local dev run: `REDIS_URL` (server will throw if missing).
- Useful/important: `NODE_ENV`, `PORT` (default 5006), `SERVICE_NAME`,
  `INTERNAL_ACCESS_SECRET`, `JWT_PUBLIC_KEY_PEM` or `JWT_PUBLIC_KEY_PATH`,
  `KAFKA_BROKERS`, `AUTH_SERVICE_URL`, `COMMISSION_PERCENT`, `FRONTEND_DOMAIN_URL`.
- Kafka provisioning: `PROVISION_KAFKA_TOPICS=1` and optional `KAFKA_TOPIC_RF`.

Code structure & conventions

- Source root alias: `@` -> `src` (configured via `tsconfig.json` and
  `package.json` `_moduleAliases`). Prefer `@/path/to/file` imports.
- Services live under `src/services/*` (business logic). Controllers under
  `src/controllers`. Event producers under `src/events/producers` and
  consumers under `src/events/consumers` (consumer startup happens in
  `src/config/kafka.ts`).
- Seeders: `src/scripts/seeds/` and `src/seeders/` provide data seeds. Example
  scripts: `pnpm run seed:ads` and `pnpm run seed:pricing`.

Testing patterns and mocks

- Vitest config: `vitest.config.ts` uses `__tests__/setup.ts`. Tests are
  included from `__tests__/**/*.test.ts`.
- Tests mock Prisma and external HTTP calls centrally in `__tests__/setup.ts`.
  The mocks expose helpers via `globalThis.__prismaMocks` — reuse these
  mocks when adding unit tests.
- Avoid starting real Kafka/Redis in unit tests; mock at client boundaries.

Examples (how an agent should suggest changes)

- When adding a new internal route, ensure `internalAuth` is applied and any
  required claims are documented. Example: add routes under
  `src/controllers` and wire them into `src/routes/index.ts`.
- When adding a new background task, register it with the scheduler in
  `src/services/rates/cleanup` style and ensure shutdown is handled in
  `src/server.ts` graceful shutdown flow.

Developer commands quick reference

- Install: `pnpm install` (requires network to fetch git deps)
- Dev: `pnpm dev` (nodemon + tsx + `module-alias/register`)
- Build: `pnpm build` (runs `tsup` and test coverage)
- Start built: `pnpm start`
- Tests: `pnpm test`; watch: `pnpm run test:watch`;
- Prisma: `pnpm run prisma` or `pnpm run db:push` / `pnpm run db:deploy`.

When unsure, check these files first

- `src/server.ts`, `src/app.ts`, `src/config/env.ts`, `src/config/kafka.ts`,
  `src/middlewares/internalAuth.ts`, `__tests__/setup.ts`, and `prisma/schema/`.

If anything here is unclear or you'd like additional examples (e.g., how to
mock a specific external client), tell me which area and I'll expand.
