# Stage 1: build the Vue client
# node:22-alpine, not node:18 like COTD — this client's Vite (^8) requires
# Node >=20.19, COTD's older Vite (^6) doesn't.
FROM node:22-alpine AS build
WORKDIR /build

COPY client/package*.json ./
RUN npm ci

COPY client/ ./
RUN npm run build

# Stage 2: run the Express server
FROM node:22-alpine
WORKDIR /app

COPY server/package*.json ./
RUN npm ci --omit=dev

COPY server/ ./

# Copy the built client into server/public — served as static files by app.js
COPY --from=build /build/dist ./public

EXPOSE 3000
CMD ["node", "server.js"]
