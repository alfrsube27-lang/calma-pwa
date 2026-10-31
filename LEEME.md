# Calma — dinero y pendientes, un día a la vez

PWA personal (un solo usuario) para iPhone 12 Pro / iOS 18, en español, moneda **S/**.
Sin registro, sin cuentas, sin dependencias: HTML, CSS y JavaScript puro + un Worker de Cloudflare
para las notificaciones push.

---

## 1. Qué hace

| Pantalla | Qué muestra |
|---|---|
| **Hoy** | Cuánto puedes gastar hoy (número grande), máximo 3 pendientes, cuotas que vencen en 3 días, botón **Día difícil** y **Me pagaron**. |
| **Dinero** | Gastos e ingresos en 3 toques, desglose del cálculo, **plan del mes automático**, presupuesto por categoría, pagos fijos, categorías editables. |
| **Deudas** | Lista, pagos parciales, bola de nieve o avalancha, **cuánto pagar al mes para salir**, fecha estimada "libre de deudas", deudas sin monto, celebración al terminar una. |
| **Agenda** | Pendientes (tarea, reunión, casa, pago, otro), repeticiones, subtareas, rutinas diarias, calendario día/semana. |
| **Ti** | Racha flexible, resumen semanal, consejos con tus propios datos, logros, fondo de emergencia, Ajustes. |

**La fórmula del límite diario**

```
disponible = dinero que tienes
           − fondo de comida restante      (intocable)
           − cuotas de deuda del periodo
           − pagos fijos del periodo

límite de hoy = disponible ÷ días que faltan para el próximo pago
```

Siempre se calcula con el **peor caso** (tus "días máximos entre pagos") hasta que toques
**Me pagaron**. Si el pago se retrasa, el límite se recalcula solo con lo que queda y la app
lo dice con calma, sin alarmas.

**El plan del mes (automático)**

La app no te pide armar un presupuesto: lo arma sola con lo que ya sabe.

```
entra al mes = monto del pago × 30.44 ÷ días máximos   (más tus ingresos extra)
libre        = entra − comida − pagos fijos − cuotas mínimas
```

- Si **sobra**: reparte lo libre entre colchón, abono extra a deudas (según el ritmo que
  elijas: suave / normal / intenso) y lo que queda para ti. El presupuesto por categoría se
  calcula con lo que ya gastas de verdad en los últimos 60 días, así que no te pide cambiar
  de vida de golpe. Puedes fijar una categoría a mano y el resto se reparte solo.
- Si **no alcanza**: no inventa un presupuesto imposible. Dice cuánto falta al mes y muestra
  las tres palancas reales: conseguir ese ingreso, bajar la cuota más alta (pidiendo más
  plazo) o revisar el gasto fijo más grande.

Lo que el plan aparta para deudas y colchón se descuenta del límite diario, para que no te
lo gastes sin darte cuenta.

**Cuotas vencidas**

Lo que ya venció y no se pagó **sigue contando**: el dinero se mantiene apartado, porque lo
debes. La pantalla Hoy lo muestra una vez con tres salidas — *Ya lo pagué*, *Hice un arreglo*
(deja de contar ese mes) o *Ahora no puedo* (esconde el aviso por hoy, sin dejar de apartarlo).

**Deudas que no recuerdas**

Se pueden anotar **sin monto**. Quedan como "por confirmar", no entran en ningún cálculo, y
la app crea sola la tarea de averiguarlo partida en pasos chicos. El botón *Ayúdame a
recordar* muestra una lista de pistas (banco, tarjeta, familiar, tienda, fiado, junta…).

---

## 2. Estructura de carpetas

```
calma-pwa/
├── publico/                     ← esto se publica (Cloudflare Pages)
│   ├── index.html
│   ├── manifest.webmanifest
│   ├── robots.txt               bloquea a todos los buscadores
│   ├── sw.js                    caché offline + recepción de push
│   ├── css/estilos.css
│   ├── iconos/                  generados por herramientas/generar_iconos.py
│   └── js/
│       ├── util.js              fechas locales, formato S/, DOM, SHA-256
│       ├── almacen.js           el estado completo + localStorage
│       ├── calculo.js           límite diario, vencidos, deudas, racha, resúmenes
│       ├── plan.js              plan mensual automático y presupuesto por categoría
│       ├── api.js               llamadas al Worker con token
│       ├── notificaciones.js    permiso, suscripción, armado de recordatorios
│       ├── app.js               PIN, bloqueo, navegación, hoja inferior
│       └── vistas/              bienvenida, hoy, dinero, deudas, agenda, resumen, ajustes
├── worker/
│   ├── src/index.js             API protegida + cron cada minuto
│   ├── src/webpush.js           VAPID (ES256) + cifrado aes128gcm, sin librerías
│   ├── esquema.sql              tablas de D1
│   └── wrangler.toml
├── herramientas/
│   ├── generar_iconos.py        crea los PNG (solo librería estándar)
│   └── generar_vapid.html       genera claves VAPID y el token, en tu navegador
├── datos-ejemplo.json           datos de prueba para importar
└── LEEME.md
```

---

## 3. Despliegue gratis, paso a paso

Necesitas: una cuenta de Cloudflare (gratis) y Node.js instalado para usar `npx wrangler`.
Si no tienes Node, más abajo está la alternativa por el panel web.

### 3.1 Generar las claves (2 minutos)

1. Abre `herramientas/generar_vapid.html` con doble clic (cualquier navegador).
2. Toca **Generar mis claves**.
3. Copia y guarda en un lugar seguro los tres valores:
   - `VAPID_PUBLIC_KEY`
   - `VAPID_PRIVATE_KEY`
   - `TOKEN_APP` ← este es el token secreto de la app

Las claves se generan en tu computadora; nada se envía a ningún servidor.

*(Alternativa si prefieres consola: `npx web-push generate-vapid-keys` da las mismas dos claves VAPID.)*

### 3.2 Crear la base de datos D1

```bash
cd calma-pwa/worker
npx wrangler login
npx wrangler d1 create calma
```

Copia el `database_id` que imprime y pégalo en `wrangler.toml`, en lugar de
`PON-AQUI-EL-ID-DE-TU-BASE`. Después crea las tablas:

```bash
npx wrangler d1 execute calma --remote --file=esquema.sql
```

### 3.3 Guardar los secretos

```bash
npx wrangler secret put TOKEN_APP
npx wrangler secret put VAPID_PUBLIC_KEY
npx wrangler secret put VAPID_PRIVATE_KEY
npx wrangler secret put VAPID_SUBJECT
```

En `VAPID_SUBJECT` pon `mailto:tucorreo@ejemplo.com`.
Los secretos quedan en Cloudflare: **nunca** están en el código ni en `wrangler.toml`.

### 3.4 Publicar el Worker

```bash
npx wrangler deploy
```

Te dará una dirección tipo `https://calma.tu-cuenta.workers.dev`. Guárdala.
El cron de un minuto queda activo solo.

Pruébalo:

```bash
curl -H "Authorization: Bearer TU_TOKEN_APP" https://calma.tu-cuenta.workers.dev/api/saludo
```

Debe responder un JSON con `"ok": true`. Sin el token responde `401`.

### 3.5 Publicar la app (Cloudflare Pages)

```bash
cd ../publico
npx wrangler pages deploy . --project-name calma-7k3p9
```

**Usa un nombre raro y difícil de adivinar** (`calma-7k3p9`, `c-9fj2x8`…): ese nombre es tu URL
pública. Te quedará algo como `https://calma-7k3p9.pages.dev`.

La app ya trae `robots.txt` con `Disallow: /` y `<meta name="robots" content="noindex, nofollow">`,
así que no aparece en buscadores. Si quieres cerrar también el CORS del Worker, pon tu
dirección exacta en `wrangler.toml`:

```toml
[vars]
ORIGEN = "https://calma-7k3p9.pages.dev"
```

y vuelve a hacer `npx wrangler deploy`.

### Alternativa sin Node (todo por el panel web)

1. **D1**: Cloudflare → *Storage & Databases* → *D1* → *Create database* (`calma`) →
   pestaña *Console* → pega el contenido de `esquema.sql` y ejecútalo.
2. **Worker**: *Compute* → *Workers* → *Create* → *Start from Hello World* → *Deploy* →
   *Edit code*: crea `webpush.js` e `index.js` con el contenido de `worker/src/`.
3. En *Settings → Bindings* agrega el binding D1 con nombre `DB` apuntando a `calma`.
4. En *Settings → Variables and Secrets* agrega los cuatro secretos (tipo **Secret**).
5. En *Settings → Trigger Events* agrega un *Cron Trigger* con `* * * * *`.
6. **Pages**: *Workers & Pages* → *Create* → *Pages* → *Upload assets*, arrastra el
   contenido de `publico/` y ponle un nombre de proyecto difícil de adivinar.

---

## 4. Instalar en el iPhone y activar las notificaciones

1. Abre tu dirección (`https://calma-7k3p9.pages.dev`) **en Safari**. No funciona desde Chrome
   para instalarla.
2. Toca **Compartir** (el cuadrito con la flecha) → **Agregar a pantalla de inicio** → *Agregar*.
3. Abre **Calma** desde el icono nuevo (esto es obligatorio: iOS solo permite push a las apps
   instaladas).
4. Completa el asistente (5 pantallas, se puede saltar) y crea tu **PIN de 4 dígitos**.
5. Ve a **Ti → Ajustes → ☁️ Servidor** y pega:
   - *Dirección del Worker*: `https://calma.tu-cuenta.workers.dev`
   - *Token secreto*: el `TOKEN_APP` que generaste
   - Toca **Guardar** y luego **Probar** (debe decir "Conectado").
6. En **🔔 Avisos con sonido** toca **Activar avisos** y acepta el permiso de iOS.
7. Toca **Enviarme una prueba**: en unos segundos debe llegar una notificación con sonido.

Si no llega:
- Confirma que abriste la app desde el icono de la pantalla de inicio, no desde Safari.
- iOS → *Ajustes* → *Calma* → *Notificaciones*: permitir, con sonido.
- iOS → *Ajustes* → *Notificaciones* → desactiva el *Resumen programado* para Calma.
- Revisa los logs: `npx wrangler tail` mientras tocas *Enviarme una prueba*.

### Qué se notifica

| Aviso | Cuándo | Urgente |
|---|---|---|
| 🌙 Entrar a la app | una vez al día, a tu hora | no (se calla en día difícil) |
| Comida | en las horas que configures | sí (suena incluso en día difícil) |
| Cuota de deuda | 3 días antes y el mismo día, a la hora que elijas | sí |
| Pago fijo | el mismo día | no |
| Pendiente con hora | a la hora, o X minutos antes si es reunión | solo si es prioridad alta |
| Resumen semanal | el día y hora que elijas | no |

En **Día difícil** el Worker silencia todo lo que no sea urgente.

### Si te olvidas de la app

Dos piezas cubren el olvido, que es lo más probable que pase:

1. **El aviso diario lo genera el Worker**, no la app. Los demás recordatorios
   se sincronizan con ~3 semanas de anticipación y se acabarían; este no
   depende de eso, así que sigue llegando siempre. El texto se adapta: a los
   2 días *"¿Cómo te fue estos días?"*, a los 5 *"Hace unos días que no nos
   vemos"*, a las 2 semanas *"Aquí sigo cuando quieras volver. Sin reclamos."*
2. **Al volver tras 2 días o más**, la app abre *Hola de nuevo* con tres
   atajos: decir cuánto dinero tienes (lo más útil, cuadra todo de una),
   anotar un gasto que se pasó, o registrar un pago recibido. Siempre con un
   *"Ahora no, solo quiero entrar"*.

Además, los pendientes no hechos se arrastran solos al día de hoy, las cuotas
impagas del mes siguen contando, el cron **no** dispara la avalancha de avisos
atrasados (solo manda los de las últimas 2 horas) y la racha aguanta hasta
3 días seguidos sin nada antes de cortarse.

---

## 5. Probar con datos de ejemplo

1. Abre la app → **Ti → Ajustes → 💾 Respaldo → Pegar un respaldo**.
2. Pega el contenido de `datos-ejemplo.json` y toca **Restaurar**.

Trae: un periodo de pago en curso, 14 movimientos, 3 pagos fijos, 3 deudas (una ya pagada,
para ver la celebración y los logros), 6 pendientes con subtareas y repeticiones, 3 rutinas,
racha de varios días y una meta de emergencia a medias.

Para probar en la computadora antes de desplegar:

```bash
cd calma-pwa/publico
python -m http.server 8080
```

y abre `http://localhost:8080`. El service worker y el PIN funcionan en `localhost`;
las notificaciones push **no** (eso solo en HTTPS y en el iPhone instalado).

---

## 6. Seguridad y privacidad

- **PIN de 4 dígitos** al abrir y después de 5 minutos en segundo plano. Se guarda solo
  el `SHA-256` del PIN con una sal aleatoria, nunca el PIN.
- **5 intentos fallidos → 1 minuto de espera**, con el teclado bloqueado.
- **Todas las rutas del Worker** piden `Authorization: Bearer <TOKEN_APP>`; la comparación es
  en tiempo constante. Sin token, todo responde `401`.
- Los secretos viven como *secrets* de Cloudflare. El token también se guarda en el
  `localStorage` del iPhone (necesario para que la app llame al Worker) y **no** se incluye
  cuando exportas un respaldo.
- `noindex, nofollow` + `robots.txt` con `Disallow: /` + URL con nombre aleatorio.
- Tus datos viven en el teléfono. El Worker solo guarda: la suscripción push, los
  recordatorios futuros (título y texto) y, si tú lo pides, el respaldo JSON.

---

## 7. Respaldo

- **Ajustes → Respaldo → Descargar copia**: archivo `calma-respaldo-AAAA-MM-DD.json`.
- **Copiar**: el JSON al portapapeles (útil en iPhone, para pegarlo en Notas o en tu correo).
- **Restaurar desde un archivo** o **Pegar un respaldo**.
- Si configuraste el servidor: **Subir a la nube** / **Bajar de la nube** (una sola copia en D1).

Hazlo de vez en cuando: si borras la app de iOS, se borra también su `localStorage`.

---

## 8. Costos

Todo cabe en los planes gratuitos de Cloudflare:

- **Workers**: 100 000 peticiones/día. El cron de cada minuto usa ~43 200 invocaciones al mes.
- **D1**: 5 GB y 5 millones de lecturas de fila al día.
- **Pages**: ilimitado para sitios estáticos.

---

## 9. Cambios que quizá quieras hacer

| Quiero… | Dónde |
|---|---|
| Cambiar los colores | `publico/css/estilos.css`, bloque `:root` |
| Cambiar los mensajes amables | `vistas/hoy.js` (arriba) y los `App.brindis(...)` |
| Cambiar el colchón cuando el pago se retrasa | `calculo.js`, `COLCHON_RETRASO` |
| Cambiar cuánto empuja cada ritmo del plan | `plan.js`, `RITMOS` |
| Cambiar el mínimo que siempre queda para ti | `plan.js`, `MINIMO_PARA_TI` |
| Cambiar cuántos pendientes se ven en Hoy | `vistas/hoy.js`, `sinHacer.slice(0, 3)` |
| Cambiar los minutos de bloqueo | `app.js`, `MINUTOS_BLOQUEO` |
| Mandar más días de recordatorios | `notificaciones.js`, `DIAS_ADELANTE` |
| Regenerar los iconos | `python herramientas/generar_iconos.py` |
