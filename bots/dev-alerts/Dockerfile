# Contexte de build : la RACINE du dépôt  →  docker build -f bots/dev-alerts/Dockerfile -t gpchat-dev-alerts .
FROM node:22-slim
WORKDIR /app
COPY packages/sdk ./packages/sdk
COPY packages/ops ./packages/ops
COPY bots/dev-alerts/package.json ./bots/dev-alerts/package.json
RUN cd bots/dev-alerts && npm install --omit=dev --no-audit --no-fund
COPY bots/dev-alerts/src ./bots/dev-alerts/src
ENV OPS_HOST=0.0.0.0 NODE_ENV=production DATA_DIR=/data PORT=8080
RUN mkdir -p /data && chown node:node /data
VOLUME /data
EXPOSE 8080
USER node
WORKDIR /app/bots/dev-alerts
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s CMD node -e "fetch('http://127.0.0.1:'+(process.env.OPS_PORT||9100)+'/readyz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "src/index.js"]
