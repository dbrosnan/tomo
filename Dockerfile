FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY web ./web
COPY scripts ./scripts
RUN npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY server ./server
COPY migrations ./migrations
COPY scripts ./scripts
COPY --from=build /app/web/public ./web/public
EXPOSE 8080
CMD ["node", "server/index.js"]
