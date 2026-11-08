FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json* ./
COPY server/package.json server/
COPY web/package.json web/
RUN npm ci --workspace=server --workspace=web --include-workspace-root=false 2>/dev/null || npm install
COPY server server
COPY web web
RUN npm run build -w server && npm run build -w web

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/server/dist server/dist
COPY --from=build /app/server/package.json server/package.json
COPY --from=build /app/node_modules node_modules
COPY --from=build /app/package.json package.json
EXPOSE 4000
CMD ["node", "server/dist/index.js"]
