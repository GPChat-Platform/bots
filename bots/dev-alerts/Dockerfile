# Contexte de build : la RACINE du dépôt  →  docker build -f bots/dev-alerts/Dockerfile -t gpchat-dev-alerts .
FROM node:22-slim
WORKDIR /app
COPY packages/sdk ./packages/sdk
COPY bots/dev-alerts/package.json ./bots/dev-alerts/package.json
RUN cd bots/dev-alerts && npm install --omit=dev --no-audit --no-fund
COPY bots/dev-alerts/src ./bots/dev-alerts/src
ENV NODE_ENV=production DATA_DIR=/data PORT=8080
RUN mkdir -p /data && chown node:node /data
VOLUME /data
EXPOSE 8080
USER node
WORKDIR /app/bots/dev-alerts
CMD ["node", "src/index.js"]
