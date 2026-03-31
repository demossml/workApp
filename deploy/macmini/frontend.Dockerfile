FROM node:22-bookworm-slim

WORKDIR /app

RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/backend/package.json packages/backend/package.json
COPY packages/frontend/package.json packages/frontend/package.json

RUN pnpm install --filter @work-appt/frontend... --frozen-lockfile

COPY . .

RUN mkdir -p packages/frontend/dist && pnpm -C packages/frontend build

EXPOSE 4173

CMD ["pnpm", "-C", "packages/frontend", "exec", "vite", "preview", "--host", "0.0.0.0", "--port", "4173"]
