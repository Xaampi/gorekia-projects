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

- `js/store.js`: datos (hoy en localStorage; es el único archivo a cambiar para pasar a API/Postgres).
- `js/chart.js`: agrupación por día/semana y gráfica SVG.
- `js/app.js`: pantallas, formularios, recordatorios y agente de voz.
- `js/config.js`: `VOICE_WEBHOOK_URL` del webhook de n8n para el agente de voz.

## Contrato del webhook de voz

POST `{ text, context: { today, projects: [{id, name}] } }` → responde
`{ intent: "create_session" | "create_project" | "create_reminder", data, reply }`.

- `create_session`: `data = { project, title, summary, hours, date? }`
- `create_project`: `data = { name }`
- `create_reminder`: `data = { text, at }` (`at` = `YYYY-MM-DDTHH:mm`)
