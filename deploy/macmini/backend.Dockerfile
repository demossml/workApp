FROM node:22-bookworm-slim

WORKDIR /app

RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/backend/package.json packages/backend/package.json

RUN pnpm install --filter @work-appt/backend... --frozen-lockfile

COPY . .

RUN mkdir -p /app/packages/backend/dist

EXPOSE 8787

CMD ["pnpm", "-C", "packages/backend", "exec", "wrangler", "dev", "--local", "--ip", "0.0.0.0", "--port", "8787", "--persist-to", "/app/.wrangler/state"]
