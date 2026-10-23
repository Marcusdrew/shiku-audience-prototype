# Construction depuis la RACINE du dépôt (contexte = .), voir docker-compose.yml.
# pnpm est installé à la version exacte du champ "packageManager" du package.json racine.
FROM node:24-slim AS build
RUN npm install --global pnpm@12.10.1
WORKDIR /repo
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY backend/package.json backend/package.json
RUN pnpm install --frozen-lockfile --filter shiku-backend...
COPY backend/tsconfig.json backend/tsconfig.build.json backend/
COPY backend/src backend/src
RUN pnpm --filter shiku-backend build
# Dépendances de production seules, dans un dossier autonome.
RUN pnpm --filter shiku-backend deploy --prod /out

FROM node:24-slim
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /out/node_modules ./node_modules
COPY --from=build /out/package.json ./package.json
COPY --from=build /repo/backend/dist ./dist
COPY backend/migrations ./migrations
USER node
EXPOSE 3000
CMD ["node", "dist/main.js"]
