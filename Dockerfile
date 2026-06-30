FROM node:22-slim
WORKDIR /app
# Copy package manager and lock files
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/backend/package.json ./packages/backend/
COPY packages/frontend/package.json ./packages/frontend/
RUN npm install -g pnpm@9.1.3 && NO_PROXY="duckdb.org,npm.duckdb.org" pnpm install --frozen-lockfile --filter @work-appt/backend
# Copy full source code
COPY . .
EXPOSE 8787
ENV PATH="/app/node_modules/.bin:/app/packages/backend/node_modules/.bin:${PATH}"
CMD ["tsx", "/app/packages/backend/src/server.ts"]
