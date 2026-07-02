# Tres en Raya Online

Juego de Tres en Raya (TicTacToe) **multijugador online** con cuentas de usuario,
emparejamiento por nivel, ranking ELO, progresión (XP/niveles) y logros.

Todo vive en un **monorepo** y se despliega como **un único servicio** (API HTTP +
WebSocket + cliente web estático, servidos por el mismo proceso Node).

## Características

- 🔐 **Registro e inicio de sesión** con contraseñas cifradas (bcrypt) y sesión por JWT en cookie `httpOnly`.
- 🎯 **Matchmaking automático por nivel**: te empareja con rivales de ranking similar (la ventana de búsqueda se amplía con el tiempo de espera).
- 📈 **Ranking ELO** que sube y baja según resultados; **XP y niveles** que solo crecen.
- 🏅 **Logros / medallas** desbloqueables (primera partida, rachas, campeón, etc.).
- 📊 **Clasificación global** e **historial de partidas**.
- ⚡ **Tiempo real** con Socket.IO y lógica de juego **autoritativa en el servidor**.

## Estructura del monorepo

```
.
├── package.json            # Workspaces npm + scripts
├── packages/
│   └── shared/             # @ttt/shared: tablero, ELO, XP/niveles, logros (+ tests)
└── apps/
    ├── server/             # @ttt/server: Express + Socket.IO + SQLite + auth
    └── web/                # @ttt/web: cliente web estático (SPA)
```

## Requisitos

- Node.js >= 20

## Desarrollo

```bash
npm install        # instala todas las dependencias del monorepo
npm run dev        # arranca el servicio único en http://localhost:3000 (con --watch)
```

Abre `http://localhost:3000`, regístrate y pulsa **Buscar partida**. Para probar el
multijugador en local, abre una segunda sesión (ventana de incógnito u otro navegador)
y regístrate con otra cuenta.

### Scripts

| Comando        | Descripción                                        |
| -------------- | -------------------------------------------------- |
| `npm run dev`  | Servidor en modo desarrollo (recarga con `--watch`) |
| `npm start`    | Servidor en modo producción                        |
| `npm test`     | Tests unitarios de la lógica compartida            |

## Variables de entorno

Copia `.env.example` a `.env`. Las más importantes:

- `PORT` (por defecto `3000`)
- `NODE_ENV` (`production` exige `JWT_SECRET` y activa cookies `secure`)
- `JWT_SECRET` (**obligatorio en producción**)
- `DB_FILE` (ruta del archivo SQLite; usa un volumen persistente en producción)

## Despliegue (un único servicio)

La app necesita un **proceso Node persistente** porque usa **WebSockets (Socket.IO)** y
mantiene el emparejamiento/las salas en memoria, además de **SQLite** en disco.

### Opción recomendada: Render (experiencia tipo Vercel)

El repo incluye un `Dockerfile` y un blueprint `render.yaml`. En [Render](https://render.com)
elige **New → Blueprint**, apunta a este repositorio y se creará un web service con
`JWT_SECRET` autogenerado y un disco persistente para la base de datos. Otras plataformas
equivalentes: **Railway**, **Fly.io**, **Google Cloud Run** o cualquier VPS.

```bash
# Local con Docker (igual que en producción):
docker build -t tres-en-raya .
docker run -p 3000:3000 -e JWT_SECRET=$(openssl rand -hex 32) -v ttt-data:/app/data tres-en-raya
```

### Nota sobre Vercel

Vercel es **serverless**: sus funciones son efímeras y sin estado, por lo que **no** pueden
mantener conexiones WebSocket persistentes ni el estado del matchmaking en memoria, y su
sistema de archivos no persiste SQLite. Por eso el servidor de juego **no** funciona en las
funciones serverless de Vercel tal cual. Para conservar "un mismo servicio" usa un host con
proceso Node persistente (Render/Railway/Fly/Cloud Run) como se indica arriba. Si en el
futuro se quisiera usar Vercel, habría que migrar el tiempo real a un servicio externo
(p. ej. Ably/Pusher) y SQLite a una base de datos gestionada.

## Escalabilidad (horizontal)

Por defecto la app corre como **una sola instancia** (SQLite + estado en memoria),
ideal para desarrollo. Para **escalar horizontalmente** a varias instancias detrás
de un balanceador, define dos variables de entorno y el código cambia de modo
automáticamente (sin tocar la lógica):

- `DATABASE_URL` → usa **Postgres** como base de datos **compartida** (usuarios, ranking, logros, historial).
- `REDIS_URL` → activa el **adaptador de Socket.IO** en Redis y mueve la **cola de matchmaking y el estado de las salas** a Redis (con locks distribuidos), de modo que dos jugadores conectados a **instancias distintas** pueden emparejarse y jugar entre sí.

```bash
# Ejemplo local con dos instancias compartiendo Postgres + Redis:
DATABASE_URL=postgres://ttt:ttt@localhost:5432/ttt REDIS_URL=redis://localhost:6379 \
  JWT_SECRET=xxxx INSTANCE_ID=app1 PORT=3001 npm start
DATABASE_URL=postgres://ttt:ttt@localhost:5432/ttt REDIS_URL=redis://localhost:6379 \
  JWT_SECRET=xxxx INSTANCE_ID=app2 PORT=3002 npm start
```

### Topología escalable con Docker Compose

El repo incluye `docker-compose.yml` y `deploy/nginx.conf` con una topología de
referencia: **2 réplicas de la app + Postgres + Redis + nginx** (balanceador con
afinidad de sesión `ip_hash` y soporte WebSocket).

```bash
docker compose up --build   # app en http://localhost:8080
```

Notas de escalado:
- El balanceador usa **sticky sessions** (`ip_hash`) porque el handshake de Socket.IO debe mantenerse en la misma instancia; los mensajes entre instancias viajan por Redis.
- Postgres usa un **advisory lock** al crear el esquema para evitar carreras de migración cuando varias instancias arrancan a la vez.
- Las escrituras de partidas se hacen en **transacción** con bloqueo de fila (`SELECT ... FOR UPDATE`) para evitar actualizaciones perdidas del ranking.

## Seguridad

- Contraseñas con **bcrypt** (12 rondas); nunca se exponen los hashes.
- Sesión con **JWT** en cookie **`httpOnly` + `sameSite`** (`secure` en producción).
- **Validación** de entradas con `zod`.
- **Rate limiting** global y reforzado en autenticación.
- Cabeceras de seguridad con **helmet** (incluye CSP restrictiva).
- Autenticación también en el **handshake de Socket.IO**.
- Consultas SQL **parametrizadas** (better-sqlite3).
- Lógica de juego **autoritativa en el servidor** (el cliente no puede hacer trampas).
```
