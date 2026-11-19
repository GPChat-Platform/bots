# Contexte de build : la RACINE du dépôt  →  docker build -f bots/cinema/Dockerfile -t gpchat-cinema .
FROM node:22-slim
WORKDIR /app
COPY packages/sdk ./packages/sdk
COPY bots/cinema/package.json ./bots/cinema/package.json
RUN cd bots/cinema && npm install --omit=dev --no-audit --no-fund
COPY bots/cinema/src ./bots/cinema/src
ENV NODE_ENV=production DATA_DIR=/data
RUN mkdir -p /data && chown node:node /data
VOLUME /data
USER node
WORKDIR /app/bots/cinema
CMD ["node", "src/index.js"]
