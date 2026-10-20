// API de datos (n8n + Postgres). Espera POST { action, ...datos } con la cabecera X-Gorekia-Token.
// La URL no es secreta; el token NO va aquí: la app lo pide al abrirla y lo guarda en el móvil.
export const API_URL = 'https://n8n.gorekia.com/webhook/proyectos-api';

// URL del webhook de n8n para el agente de voz. Vacío = solo dictado, sin ejecutar acciones.
// Espera POST { text, context } y devuelve { intent, data, reply }.
export const VOICE_WEBHOOK_URL = '';
