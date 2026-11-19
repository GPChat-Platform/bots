# Contexte de build : la RACINE du dépôt  →  docker build -f bots/football/Dockerfile -t gpchat-football .
FROM node:22-slim
WORKDIR /app
COPY packages/sdk ./packages/sdk
COPY packages/ops ./packages/ops
COPY bots/football/package.json ./bots/football/package.json
RUN cd bots/football && npm install --omit=dev --no-audit --no-fund
COPY bots/football/src ./bots/football/src
ENV OPS_HOST=0.0.0.0 NODE_ENV=production DATA_DIR=/data
RUN mkdir -p /data && chown node:node /data
VOLUME /data
USER node
WORKDIR /app/bots/football
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s CMD node -e "fetch('http://127.0.0.1:'+(process.env.OPS_PORT||9100)+'/readyz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "src/index.js"]
