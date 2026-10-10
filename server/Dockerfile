# Finanzkompass – Proxy für die Live-Verbindung (Enable Banking), ohne Abhängigkeiten
FROM node:22-alpine
ENV NODE_ENV=production PORT=8787
WORKDIR /app
COPY package.json enablebanking-proxy.js node-server.mjs ./
USER node
EXPOSE 8787
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s CMD wget -qO- http://127.0.0.1:8787/health >/dev/null || exit 1
CMD ["node", "node-server.mjs"]
