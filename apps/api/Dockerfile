# Ugo API image. Build from the repository root:
#   docker build -f apps/api/Dockerfile -t ugo-api .
FROM node:26-bookworm-slim AS build
WORKDIR /repo
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
COPY packages/shared/package*.json packages/shared/
RUN npm --prefix packages/shared ci
COPY packages/shared packages/shared
RUN npm --prefix packages/shared run build
COPY apps/api/package*.json apps/api/
RUN npm --prefix apps/api ci
COPY apps/api apps/api
RUN cd apps/api && npx prisma generate && npx nest build && npm prune --omit=dev

FROM node:26-bookworm-slim
ENV NODE_ENV=production
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=build --chown=node:node /repo/packages/shared/dist /packages/shared/dist
COPY --from=build --chown=node:node /repo/packages/shared/package.json /packages/shared/package.json
COPY --from=build --chown=node:node /repo/apps/api/node_modules ./node_modules
COPY --from=build --chown=node:node /repo/apps/api/dist ./dist
COPY --from=build --chown=node:node /repo/apps/api/prisma ./prisma
COPY --from=build --chown=node:node /repo/apps/api/package.json ./package.json
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s CMD node -e "fetch('http://localhost:3000/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/main.js"]
