FROM node:22-bookworm-slim

WORKDIR /app

COPY deploy/macmini/evotor-proxy/server.mjs /app/server.mjs

EXPOSE 3000

CMD ["node", "/app/server.mjs"]
