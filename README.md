# Gorekia Projects

PWA en vanilla HTML/CSS/JS para registrar y visualizar las horas dedicadas a cada proyecto.

## Probar en local

    python3 -m http.server 8080

Abre http://localhost:8080. El service worker y la instalación requieren HTTPS o localhost.

## Publicar (Netlify)

Sitio estático, sin build: arrastra la carpeta a Netlify o conecta el repo con "Publish directory" = `.`.

## Instalar en el móvil

- Android (Chrome): menú ⋮ → "Instalar aplicación" / "Añadir a pantalla de inicio".
- iPhone (Safari): Compartir → "Añadir a pantalla de inicio".

## Estructura

- `js/store.js`: datos. Lee y escribe en Postgres a través del webhook de n8n (`API_URL`) y guarda una copia local para abrir rápido y ver lo último sin conexión. El token de acceso lo pide la app la primera vez y se guarda solo en el móvil (nunca en el repo).
- `js/chart.js`: agrupación por día/semana y gráfica SVG.
- `js/app.js`: pantallas, formularios, recordatorios y agente de voz.
- `js/config.js`: `API_URL` (webhook de datos) y `VOICE_WEBHOOK_URL` (agente de voz) de n8n. Contrato de la API: `POST { action, ...datos }` con la cabecera `X-Gorekia-Token`; acciones `list_all`, `add_project`, `delete_project`, `add_session`, `update_session`, `delete_session`, `add_reminder`, `toggle_reminder`, `delete_reminder`.

## Contrato del webhook de voz

POST `{ text, context: { today, projects: [{id, name}] } }` → responde
`{ intent: "create_session" | "create_project" | "create_reminder", data, reply }`.

- `create_session`: `data = { project, title, summary, hours, date? }`
- `create_project`: `data = { name }`
- `create_reminder`: `data = { text, at }` (`at` = `YYYY-MM-DDTHH:mm`)
