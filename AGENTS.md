# Tres en Raya Online

Juego de Tres en Raya multijugador online. Monorepo (npm workspaces) desplegable
como un único servicio.

## Cursor Cloud specific instructions

### Arquitectura
- **Monorepo con npm workspaces**: `packages/shared` (`@ttt/shared`), `apps/server` (`@ttt/server`), `apps/web` (`@ttt/web`).
- **Un único servicio**: `@ttt/server` (Express + Socket.IO) sirve la API bajo `/api`, el WebSocket bajo `/socket.io`, y el cliente estático de `apps/web/public`. No hay build del frontend (es HTML/CSS/JS puro).
- **Persistencia**: SQLite vía `better-sqlite3`. El archivo por defecto es `apps/server/data/tictactoe.db` (ignorado por git). Se crea solo al arrancar.
- La lógica de juego, ELO, XP/niveles y logros vive en `@ttt/shared` y la usan tanto el server como los tests.

### Ejecutar / testear (comandos estándar en `package.json`)
- `npm run dev` levanta el servicio en `http://localhost:3000` con `node --watch`. NO uses `npm run build` (no existe build).
- `npm start` = modo producción.
- `npm test` corre los tests unitarios de `@ttt/shared` (`node --test`).

### Gotchas
- **`JWT_SECRET`**: en desarrollo, si no está definido se genera un secreto **efímero** en cada arranque (verás un warning), lo que **invalida las sesiones al reiniciar** el server. Con `--watch`, cualquier cambio en el código del server reinicia el proceso y cierra sesión a los usuarios. Para sesiones estables entre reinicios, exporta un `JWT_SECRET` fijo. En `NODE_ENV=production` el arranque **falla** si falta `JWT_SECRET` (es intencional).
- **Probar multijugador en local**: hace falta **dos contextos de cookies distintos** (una ventana normal + una de incógnito, o dos navegadores). Dos pestañas normales comparten la cookie de sesión y serían el mismo usuario.
- **Socket.IO autentica por cookie** en el handshake; si abres un socket sin sesión válida, se rechaza la conexión.
- **Matchmaking**: cola en memoria; empareja por ranking con una ventana que crece ~100 puntos por segundo de espera. Con reinicios del server se pierde la cola (no las cuentas).
- **Reset de datos**: borra `apps/server/data/` (con el server detenido) para empezar con una base limpia.

### Escalabilidad (modos y fallback)
- **Selección automática por entorno**: sin variables → SQLite + estado en memoria (una instancia). Con `DATABASE_URL` → Postgres (DB compartida). Con `REDIS_URL` → adaptador de Socket.IO + cola/salas en Redis (varias instancias).
- El **data layer** vive en `apps/server/src/db/{sqlite,postgres}.js` y se selecciona en `repository.js`. El **estado compartido** (cola/salas/locks) vive en `apps/server/src/store/{memory,redis}.js` y se selecciona en `store/index.js`. Toda la API del repo y del store es **async**.
- Para escalar de verdad hacen falta **ambos** (Postgres + Redis): solo Redis con SQLite por instancia rompe el login/estado (cada réplica tendría su propia DB).
- El envío en tiempo real usa `io.to(socketId).emit(...)` (cada socket está en una room igual a su id), así el adaptador de Redis lo entrega esté donde esté el socket. No dependas de `socket.data.roomId` entre instancias: usa `store.getRoomIdForSocket`.
- **Probar en local**: hay Postgres y Redis instalados vía apt en este entorno. Arranca Redis con `redis-server --daemonize yes` y Postgres con `sudo pg_ctlcluster 16 main start`. Levanta 2 instancias en puertos distintos con el **mismo `JWT_SECRET`** y `DATABASE_URL`/`REDIS_URL`, conecta un cliente a cada una y verifica el emparejamiento cruzado.
- Detrás de un balanceador se necesitan **sticky sessions** (handshake de Socket.IO) — ver `deploy/nginx.conf` (`ip_hash`).

### Despliegue
- Diseñado para un **proceso Node persistente** (WebSockets + Redis + Postgres). Ver `Dockerfile`, `docker-compose.yml` (topología escalable) y `render.yaml`.
- **No** es compatible con las funciones serverless de Vercel tal cual (sin WebSockets persistentes ni FS persistente). Usar Render/Railway/Fly/Cloud Run. Detalles en `README.md`.
