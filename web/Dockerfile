FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json* ./
COPY server/package.json server/
COPY web/package.json web/
RUN npm ci 2>/dev/null || npm install
COPY web web
COPY server/package.json server/
COPY server/tsconfig.json server/
RUN npm run build -w web

FROM nginx:alpine
COPY --from=build /app/web/dist /usr/share/nginx/html
COPY web/nginx.conf /etc/nginx/templates/default.conf.template
EXPOSE 80
