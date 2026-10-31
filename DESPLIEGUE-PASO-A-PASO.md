# Desplegar Calma en Cloudflare — paso a paso

Sin instalar nada. Todo por el panel web de Cloudflare.
Tiempo: unos 20–25 minutos. Costo: S/ 0.

> **Tus valores están en `MIS-CLAVES-CLOUDFLARE.txt`** (en esta misma carpeta).
> Tenlo abierto al lado. **No lo compartas con nadie** ni lo subas a internet.

---

## ⚠️ Antes de empezar: los dos proyectos que ya tienes

Tienes dos proyectos en Cloudflare que **no se deben tocar**. Nada de lo que
hagas aquí los afecta, por dos razones:

1. Todo se crea con **nombres nuevos y únicos** (llevan el sufijo `508059`).
2. Siempre se usa el botón **Create / Crear**, nunca se abre un proyecto existente.

**Paso 0 — compruébalo tú mismo.** Entra a Cloudflare, ve a
**Compute → Workers & Pages** y anota los nombres que ya existen.
Si alguno se llamara `calma-api-508059` o `calma-508059` (imposible, pero
por si acaso), avísame y cambiamos el sufijo.

---

## Paso 1 — Crear la base de datos

1. En el panel, ve a **Storage & Databases → D1 SQL Database**.
   *(Si no lo ves, usa el buscador de arriba y escribe "D1".)*
2. Botón **Create** / **Create database**.
3. Nombre exacto:

   ```
   calma-db-508059
   ```

4. **Create**.
5. Entra a la base recién creada y abre la pestaña **Console**.
6. Copia **todo** el contenido del archivo `worker/esquema.sql` y pégalo. **Execute**.

   > Si se queja de que hay varias instrucciones juntas, pégalas de una en una:
   > son 4 bloques `CREATE TABLE` y 1 `CREATE INDEX`.

7. Para comprobar, ejecuta en la misma consola:

   ```sql
   SELECT name FROM sqlite_master WHERE type='table';
   ```

   Debe listar: `suscripciones`, `recordatorios`, `config`, `respaldo`.

---

## Paso 2 — Crear el Worker

1. Ve a **Compute → Workers & Pages**.
2. **Create** → pestaña **Workers** → **Start with Hello World!** → **Get started**.
3. Nombre exacto:

   ```
   calma-api-508059
   ```

4. **Deploy** (se publica el "hola mundo"; enseguida lo reemplazamos).
5. Botón **Edit code** (o **Continue to project → Edit code**).
6. Borra **todo** lo que hay en el editor.
7. Abre el archivo `worker/calma-worker-completo.js` de esta carpeta,
   copia **todo** su contenido y pégalo en el editor.
8. **Deploy**.

   > Va a dar error si lo visitas ahora. Es normal: todavía le faltan
   > la base de datos y los secretos.

---

## Paso 3 — Conectar la base de datos al Worker

1. En el Worker `calma-api-508059`, ve a **Settings → Bindings**.
2. **Add binding** → **D1 database**.
3. Rellena:

   | Campo | Valor |
   |---|---|
   | Variable name | `DB` |
   | D1 database | `calma-db-508059` |

   > El nombre de la variable tiene que ser **exactamente `DB`**, en mayúsculas.

4. **Deploy** / **Save**.

---

## Paso 4 — Los secretos

En el mismo Worker: **Settings → Variables and Secrets** → **Add**.

Agrega estos cuatro, uno por uno. En **Type** elige **Secret** (no "Text"),
así quedan ocultos:

| Variable name | Valor | De dónde sale |
|---|---|---|
| `TOKEN_APP` | *(largo, al azar)* | `MIS-CLAVES-CLOUDFLARE.txt` |
| `VAPID_PUBLIC_KEY` | `BOQfHqKpmwrcgwBaWdBccfJRYGT-HsUizpCuHpPHc-xIXdbWMmaCLWBm3kHhr0IJYxh9jv8MaE51FLGhysgFJow` | ya la tienes aquí (no es secreta) |
| `VAPID_PRIVATE_KEY` | *(secreta)* | `MIS-CLAVES-CLOUDFLARE.txt` |
| `VAPID_SUBJECT` | `mailto:tucorreo@ejemplo.com` | **pon tu correo real** |

Cuidado al copiar y pegar: **sin espacios al inicio ni al final**, y sin saltos
de línea. Son cadenas largas; cópialas completas.

Y uno más, solo si vas a usar lo de leer los correos de Yape y del banco
(Paso 12). Si todavía no, déjalo para después:

| Variable name | Valor |
|---|---|
| `CORREOS_PERMITIDOS` | `yape.com.pe, notificaciones.bcp.com.pe` |

Son los remitentes cuyos correos la app va a leer, separados por coma.
Puedes poner el dominio (`yape.com.pe`) o el correo exacto. **Sin este
secreto no se procesa ningún correo**, y así tiene que ser: si no,
cualquiera que averigüe la dirección podría inventarte gastos.

Al terminar, **Deploy**.

---

## Paso 5 — El cron de cada minuto

Es el que dispara los recordatorios aunque no abras la app.

1. **Settings → Trigger Events** (o **Triggers**) → **Add** → **Cron Trigger**.
2. En el cron pon exactamente:

   ```
   * * * * *
   ```

3. **Add** / **Save**. Luego **Deploy**.

---

## Paso 6 — Probar que el Worker responde

En la parte de arriba del Worker está su dirección, algo así:

```
https://calma-api-508059.TU-CUENTA.workers.dev
```

Cópiala. Si la abres en el navegador tal cual, debe responder:

```json
{"error":"No autorizado."}
```

**Eso es correcto y es buena señal**: significa que nadie entra sin el token.

---

## Paso 7 — Publicar la app

1. **Compute → Workers & Pages** → **Create** → pestaña **Pages** →
   **Upload assets**.
2. Nombre del proyecto, exacto:

   ```
   calma-508059
   ```

3. **Create project**.
4. Arrastra el **contenido** de la carpeta `calma-pwa/publico`
   (es decir: `index.html`, `sw.js`, `manifest.webmanifest`, `robots.txt`,
   y las carpetas `css`, `js`, `iconos`).

   > ⚠️ Arrastra lo que está **dentro** de `publico`, no la carpeta `publico`
   > en sí. Si lo haces mal, la app quedaría en `/publico/index.html` y no
   > funcionaría.

5. **Deploy site**.

Tu app queda en:

```
https://calma-508059.pages.dev
```

---

## Paso 8 — Cerrar el CORS (opcional pero recomendado)

Para que solo tu app pueda llamar al Worker:

1. Vuelve al Worker → **Settings → Variables and Secrets** → **Add**.
2. Esta vez el tipo es **Text** (no Secret):

   | Variable name | Valor |
   |---|---|
   | `ORIGEN` | `https://calma-508059.pages.dev` |

3. **Deploy**.

---

## Paso 9 — Instalar en el iPhone

1. Abre `https://calma-508059.pages.dev` **en Safari** (no en Chrome).
2. Botón **Compartir** (el cuadrito con la flecha hacia arriba).
3. **Agregar a pantalla de inicio** → **Agregar**.
4. Cierra Safari y abre **Calma** desde el icono nuevo.

   > Este paso no es opcional: iOS solo permite notificaciones a las apps
   > que están en la pantalla de inicio.

5. Completa el asistente y crea tu **PIN de 4 dígitos**.

---

## Paso 10 — Conectar la app con el servidor

Dentro de la app: **Ti → Ajustes → ☁️ Servidor**

| Campo | Qué pegar |
|---|---|
| Dirección del Worker | `https://calma-api-508059.TU-CUENTA.workers.dev` |
| Token secreto | el `TOKEN_APP` de tu archivo de claves |

**Guardar** → **Probar**.

Debe decir: *"Conectado. 0 dispositivo(s), 0 recordatorio(s) en cola."*

Si dice *"El token no es correcto"*, revisa que no se haya colado un espacio
al copiar.

---

## Paso 11 — Encender las notificaciones

1. En **Ajustes → 🔔 Avisos con sonido** → **Activar avisos**.
2. iOS pregunta si permites notificaciones → **Permitir**.
3. Toca **Enviarme una prueba**.

En unos segundos debe llegar una notificación con sonido, aunque tengas la app
cerrada.

### Enciende el aviso diario

En la misma pantalla, un poco más abajo:

- **Recordarme entrar a la app** → activado
- **¿A qué hora te viene bien?** → elige una hora en la que sueles tener el
  teléfono a mano (por defecto 20:00)
- **Guardar**

Este aviso lo manda el servidor por su cuenta, no la app. Por eso te sigue
llegando aunque pases semanas sin abrirla, y el texto cambia según cuánto
tiempo lleves sin aparecer — nunca con reproches.

> No hace falta configurar nada más en Cloudflare: el cron del Paso 5 ya se
> encarga.

### Si no llega

| Revisa | Dónde |
|---|---|
| Que abriste la app desde el icono, no desde Safari | — |
| Permiso de notificaciones | iOS → Ajustes → Calma → Notificaciones |
| El *Resumen programado* las agrupa y retrasa | iOS → Ajustes → Notificaciones → Resumen programado → quitar Calma |
| Modo concentración activo | Centro de control |
| Errores del servidor | Cloudflare → Worker → pestaña **Logs** (déjala abierta y toca "prueba") |

---

## Paso 12 — Que la app lea tus Yapes (opcional)

Esto es lo que hace que no tengas que anotar cada microgasto: le reenvías a
la app los correos de aviso de Yape, Plin o el banco, y ella saca el monto
sola. Lo único que te pregunta después es **en qué fue**, con un toque.

Necesitas un dominio en Cloudflare (el mismo de la app sirve).

1. En el panel de Cloudflare entra a tu **dominio** → **Email** →
   **Email Routing**. Si nunca lo usaste, dale a **Enable**.
2. **Routing rules** → **Create address**.
3. En *Custom address* pon algo difícil de adivinar, por ejemplo
   `gastos-508059@tudominio.com`.
4. En *Action* elige **Send to a Worker** y selecciona `calma-api-508059`.
5. **Save**.

Ahora, en tu correo (Gmail, el que uses), crea un **filtro**:

- **De:** el remitente de los avisos de Yape (`...@yape.com.pe`) y el de tu
  banco.
- **Acción:** *Reenviar a* `gastos-508059@tudominio.com`.

Gmail te pedirá verificar la dirección de reenvío: te manda un correo de
confirmación a esa dirección. Como va al Worker, no lo vas a poder leer;
para ese paso, cambia la regla a *Send to an email* con tu propio correo,
confirma, y vuelve a ponerla en *Send to a Worker*.

### Qué hace y qué no

- Solo anota el dinero que **sale**. Los avisos de dinero que entra se
  ignoran: eso lo confirmas tú con "Me pagaron".
- La publicidad se descarta (descuentos, promociones, "hasta S/ 100").
- Guarda **solo el monto y una línea de referencia**, nunca el correo.
- En día difícil lo guarda igual, pero no te manda la notificación.
- Si un correo no se detecta, no pasa nada: lo anotas con el botón
  **+ → Salió plata**, que pide solo el monto.

### Si no anota nada

| Revisa | Dónde |
|---|---|
| `CORREOS_PERMITIDOS` existe y trae ese remitente | Worker → Settings → Variables |
| El reenvío de Gmail está activo y verificado | Gmail → Ver todos los ajustes → Reenvío |
| Qué dijo el Worker al recibirlo | Cloudflare → Worker → **Logs** |

En **Logs** vas a ver el motivo: `remitente` (no está en la lista),
`sin-monto` (no reconoció el formato) o `sin-lista` (falta el secreto).
Si sale `sin-monto` seguido, mándame cómo es el texto del aviso y ajusto
el reconocimiento.

---

## Si algo sale mal

- **El Worker da error 500**: falta el binding `DB` (Paso 3) o algún secreto
  (Paso 4). Mira **Logs** en el Worker.
- **La app carga pero sin estilos**: subiste la carpeta `publico` en vez de su
  contenido (Paso 7). Borra el *deployment* y vuelve a subir.
- **"El servidor no tiene la clave VAPID configurada"**: falta
  `VAPID_PUBLIC_KEY` o está mal copiada.
- **Las notificaciones llegan sin sonido**: iOS → Ajustes → Calma →
  Notificaciones → Sonidos activado.

---

## Recordatorio de seguridad

- `MIS-CLAVES-CLOUDFLARE.txt` **no se sube a ningún lado**. No está dentro de
  `publico/`, así que no se publica con la app. Déjalo así.
- Si alguna vez crees que el token se filtró: genera otro, cámbialo en
  Cloudflare (Paso 4) y en la app (Paso 10). Nada más se rompe.
- La app ya trae `noindex` y `robots.txt` bloqueando todo, y la URL lleva un
  sufijo al azar: no va a aparecer en buscadores.
