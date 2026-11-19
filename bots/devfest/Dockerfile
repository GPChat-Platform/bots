# Contexte de build : la RACINE du dépôt  →  docker build -f bots/devfest/Dockerfile -t gpchat-devfest .
FROM node:22-slim
WORKDIR /app
COPY packages/sdk ./packages/sdk
COPY bots/devfest/package.json ./bots/devfest/package.json
RUN cd bots/devfest && npm install --omit=dev --no-audit --no-fund
COPY bots/devfest/src ./bots/devfest/src
COPY bots/devfest/data ./bots/devfest/data
ENV NODE_ENV=production DATA_DIR=/data
RUN mkdir -p /data && chown node:node /data
VOLUME /data
USER node
WORKDIR /app/bots/devfest
CMD ["node", "src/index.js"]
