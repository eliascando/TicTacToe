# Servicio único: API HTTP + WebSocket (Socket.IO) + cliente web estático.
# Imagen lista para cualquier host que ejecute un proceso Node persistente
# (Render, Railway, Fly.io, Google Cloud Run, un VPS, etc.).
FROM node:22-bookworm-slim

ENV NODE_ENV=production
WORKDIR /app

# Herramientas para compilar better-sqlite3 si no hay binario precompilado.
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

# Instala dependencias aprovechando la caché de capas (workspaces).
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
RUN npm ci --omit=dev

# Copia el código de la aplicación.
COPY . .

# Datos de SQLite (monta un volumen aquí para persistir entre despliegues).
ENV DB_FILE=/app/data/tictactoe.db
RUN mkdir -p /app/data
VOLUME ["/app/data"]

EXPOSE 3000
CMD ["npm", "start"]
