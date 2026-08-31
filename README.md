# BOT-TRANSCOLECTIVO — Demo comercial "Transportes Nueva Aurora"

Bot de demostración para vender el producto a **líneas de colectivos**
(contacto vía transporte de Joaquín). "Transportes Nueva Aurora" — Línea
999 — es una empresa **100% ficticia e inventada**, no existe, no se debe
presentar como real fuera del contexto de la demo. Se inventó para no
mostrar la demo vacía: un presidente de línea entiende mucho mejor viendo
el bot responder con horarios, tarifas y reclamos concretos que viendo un
bot en blanco.

**Este bot es 100% autónomo — no deriva a un humano en ningún momento.**
No hay marcador de escalada ni "te paso con el equipo": resuelve consultas
y, cuando corresponde, registra el reclamo él mismo. Es justamente el
punto de venta: la línea no necesita gente atendiendo WhatsApp.

## Qué tiene cargado

- Recorrido urbano (**Línea 999**) + servicio interurbano ("Nueva Aurora
  Directo") con horarios y frecuencias inventados pero realistas.
- **Cuadro tarifario** (`/tarifario` en el panel): tabla estructurada de
  precios — no texto suelto en la Knowledge Base — que el bot usa como
  única fuente de verdad para responder precios.
- Políticas de equipaje y mascotas (Knowledge Base).
- **Panel de Reclamos** (`/reclamos`): el punto fuerte de la demo.
  - El bot toma el reclamo del pasajero por WhatsApp y le da un número
    de seguimiento (`L999-000001`, correlativo).
  - Desde el panel, un agente escribe la respuesta real y el botón
    "Enviar y resolver" se la manda al pasajero por WhatsApp (texto
    libre, no requiere plantilla aprobada por Meta) y marca el reclamo
    resuelto. Así el pasajero reclama y recibe respuesta sin salir de
    WhatsApp — y sin que la línea necesite escalarlo a CNRT.

Todo el contenido (Knowledge Base, Tarifario) se siembra solo
automáticamente al arrancar el server por primera vez — no hace falta
cargar nada a mano para la demo.

## Credenciales de esta demo

- **Login admin**: `admin@nuevaaurora999.com.ar` — contraseña generada al
  crear este bot (no está en este README a propósito; la tiene Joaquín).
- **Firebase / Anthropic**: reusa el proyecto compartido `pedidos-lett-2`
  y la cuenta Anthropic de siempre (mismo patrón que TechDI/AR/Gineza) —
  ya está en `server/.env`, andá corriendo sin tocar nada ahí.
- **WhatsApp/Instagram (Meta)**: todavía sin configurar (`META_*` vacío en
  `server/.env`). Sin esto, el bot funciona igual en el Simulador del
  panel, pero no manda/recibe WhatsApp real. Hace falta crear la app y el
  número de prueba en Meta for Developers antes de una demo con celular.

## Cómo usarlo en una reunión

- Más rápido: `Simulator.jsx` en el panel admin — simula una conversación
  de WhatsApp sin necesitar el número real conectado. Ya anda hoy con las
  credenciales cargadas.
- Para algo más real: conectar un número de WhatsApp Business de prueba
  (`server/.env` → `META_*`) y mostrar la conversación desde un celular.

## Antes de vender esto a un cliente real

Este repo es una **demo**, no un cliente. Cuando alguien firme:
1. Duplicar esta carpeta (o mejor, partir de `BOT-BASE`, que no tiene
   ningún dato de ejemplo cargado) con el nombre real del cliente.
2. Reemplazar el prefijo de colección `bot-nuevaaurora_` por el del
   cliente en todo `server/`.
3. Reemplazar toda la info de Transportes Nueva Aurora (recorridos,
   tarifario, políticas) por la real del cliente en Knowledge Base y
   Tarifario.
4. Credenciales (.env) nuevas — nunca reusar el número de WhatsApp ni el
   `ADMIN_PASSWORD` de la demo.

## Stack

- **Frontend**: React + Vite + CSS Modules
- **Backend**: Node.js (ESM) + Express
- **Database**: Firebase Firestore (proyecto compartido `pedidos-lett-2`, colecciones con prefijo `bot-nuevaaurora_`)
- **AI**: Claude API (Anthropic)
- **Mensajería**: Meta Cloud API (WhatsApp Business + Instagram)

## Cómo correr localmente

```bash
# Backend
cd server && npm install && npm run dev   # puerto 3001

# Frontend
cd client && npm install && npm run dev   # puerto 5173
```

`server/.env` y `client/.env` ya están completos para correr local (ver
"Credenciales de esta demo" arriba). Antes de deployar a producción,
revisá `META_*` y `FRONTEND_URL`.
