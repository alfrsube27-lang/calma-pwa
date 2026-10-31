/* ===========================================================
   index.js — Worker de Calma (Cloudflare)

   · Todas las rutas piden el token secreto (Authorization: Bearer …).
   · El cron corre cada minuto y envía los recordatorios que vencen.
   · En modo "día difícil" solo salen los urgentes (comida y cuotas).

   Secretos esperados (wrangler secret put …):
     TOKEN_APP          token largo que la app manda en cada petición
     VAPID_PUBLIC_KEY   clave pública VAPID (base64url)
     VAPID_PRIVATE_KEY  clave privada VAPID (base64url)
     VAPID_SUBJECT      "mailto:tucorreo@ejemplo.com"
     ORIGEN             (opcional) origen exacto de la PWA para CORS
   =========================================================== */

import { enviarPush } from './webpush.js';
import { procesarCorreo } from './correo.js';

// ───────── Utilidades de respuesta ─────────

function cabeceras(env, extra = {}) {
  return Object.assign({
    'Content-Type': 'application/json; charset=utf-8',
    // La app es privada: que nadie la indexe ni la guarde en caché.
    'X-Robots-Tag': 'noindex, nofollow',
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': env.ORIGEN || '*',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Max-Age': '86400'
  }, extra);
}

function json(env, datos, estado = 200) {
  return new Response(JSON.stringify(datos), { status: estado, headers: cabeceras(env) });
}

function error(env, mensaje, estado = 400) {
  return json(env, { error: mensaje }, estado);
}

/** Comparación en tiempo constante: no filtra el token por el tiempo de respuesta. */
function igual(a, b) {
  const x = String(a || '');
  const y = String(b || '');
  if (x.length !== y.length) return false;
  let diferencia = 0;
  for (let i = 0; i < x.length; i++) diferencia |= x.charCodeAt(i) ^ y.charCodeAt(i);
  return diferencia === 0;
}

function autorizado(peticion, env) {
  const cabecera = peticion.headers.get('Authorization') || '';
  const token = cabecera.startsWith('Bearer ') ? cabecera.slice(7).trim() : '';
  return !!env.TOKEN_APP && igual(token, env.TOKEN_APP);
}

// ───────── Ayudas de base de datos ─────────

async function leerConfig(env, clave) {
  const fila = await env.DB.prepare('SELECT valor FROM config WHERE clave = ?')
    .bind(clave).first();
  return fila ? fila.valor : null;
}

async function guardarConfig(env, clave, valor) {
  await env.DB.prepare(
    'INSERT INTO config (clave, valor) VALUES (?, ?) ' +
    'ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor'
  ).bind(clave, valor == null ? null : String(valor)).run();
}

async function suscripciones(env) {
  const { results } = await env.DB.prepare(
    'SELECT endpoint, p256dh, auth FROM suscripciones'
  ).all();
  return results || [];
}

function vapidDe(env) {
  if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY) return null;
  return {
    publica: env.VAPID_PUBLIC_KEY,
    privada: env.VAPID_PRIVATE_KEY,
    sujeto: env.VAPID_SUBJECT || 'mailto:calma@example.com'
  };
}

/** Manda una notificación a todos los dispositivos suscritos. */
async function avisar(env, datos) {
  const vapid = vapidDe(env);
  if (!vapid) return { enviados: 0, fallidos: 0, motivo: 'faltan claves VAPID' };

  const lista = await suscripciones(env);
  let enviados = 0, fallidos = 0;

  for (const s of lista) {
    try {
      const res = await enviarPush(s, datos, vapid);
      if (res.ok) enviados++;
      else {
        fallidos++;
        if (res.muerta) {
          await env.DB.prepare('DELETE FROM suscripciones WHERE endpoint = ?')
            .bind(s.endpoint).run();
        } else {
          console.log('Push falló', res.estado, res.detalle);
        }
      }
    } catch (e) {
      fallidos++;
      console.log('Error enviando push:', e.message);
    }
  }
  return { enviados, fallidos };
}

/** Fecha "AAAA-MM-DD" de hoy en la zona horaria del usuario. */
function hoyEn(zona) {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: zona || 'America/Lima',
      year: 'numeric', month: '2-digit', day: '2-digit'
    }).format(new Date());
  } catch (e) {
    return new Date().toISOString().slice(0, 10);
  }
}

/** Minutos transcurridos del día en la zona del usuario (13:30 -> 810). */
function minutosEn(zona) {
  try {
    const partes = new Intl.DateTimeFormat('en-GB', {
      timeZone: zona || 'America/Lima',
      hour: '2-digit', minute: '2-digit', hour12: false
    }).format(new Date()).split(':');
    return Number(partes[0]) * 60 + Number(partes[1]);
  } catch (e) {
    const d = new Date();
    return d.getUTCHours() * 60 + d.getUTCMinutes();
  }
}

/** "20:00" -> 1200 */
function aMinutos(hora) {
  const p = String(hora || '20:00').split(':');
  return Number(p[0]) * 60 + Number(p[1] || 0);
}

// ───────── Rutas ─────────

async function manejar(peticion, env) {
  const url = new URL(peticion.url);
  const ruta = url.pathname.replace(/\/+$/, '') || '/';

  if (peticion.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: cabeceras(env) });
  }

  // Nada público: ni una ruta sin token.
  if (!autorizado(peticion, env)) {
    return error(env, 'No autorizado.', 401);
  }

  // --- Saludo: para probar la conexión desde Ajustes ---
  if (ruta === '/api/saludo') {
    const zona = (await leerConfig(env, 'zona')) || 'America/Lima';
    const total = await env.DB.prepare(
      'SELECT COUNT(*) AS n FROM recordatorios WHERE enviado = 0'
    ).first();
    const subs = await env.DB.prepare('SELECT COUNT(*) AS n FROM suscripciones').first();
    return json(env, {
      ok: true,
      mensaje: `${subs.n} dispositivo(s), ${total.n} recordatorio(s) en cola.`,
      hoy: hoyEn(zona),
      vapid: !!vapidDe(env)
    });
  }

  // --- Clave pública VAPID ---
  if (ruta === '/api/vapid') {
    return json(env, { clave: env.VAPID_PUBLIC_KEY || '' });
  }

  // --- Guardar suscripción del teléfono ---
  if (ruta === '/api/suscribir' && peticion.method === 'POST') {
    const b = await peticion.json().catch(() => ({}));
    if (!b.endpoint || !b.p256dh || !b.auth) return error(env, 'Suscripción incompleta.');
    await env.DB.prepare(
      'INSERT INTO suscripciones (endpoint, p256dh, auth, creado) VALUES (?, ?, ?, ?) ' +
      'ON CONFLICT(endpoint) DO UPDATE SET p256dh = excluded.p256dh, auth = excluded.auth'
    ).bind(b.endpoint, b.p256dh, b.auth, Date.now()).run();
    return json(env, { ok: true });
  }

  if (ruta === '/api/desuscribir' && peticion.method === 'POST') {
    const b = await peticion.json().catch(() => ({}));
    if (b.endpoint) {
      await env.DB.prepare('DELETE FROM suscripciones WHERE endpoint = ?')
        .bind(b.endpoint).run();
    }
    return json(env, { ok: true });
  }

  // --- Reemplazar la lista de recordatorios futuros ---
  if (ruta === '/api/recordatorios' && peticion.method === 'POST') {
    const b = await peticion.json().catch(() => ({}));
    const lista = Array.isArray(b.recordatorios) ? b.recordatorios.slice(0, 500) : [];
    const ahora = Date.now();

    await guardarConfig(env, 'dificil_hasta', b.dificilHasta || '');
    if (b.zona) await guardarConfig(env, 'zona', b.zona);

    // Marca de la última vez que la app habló con el servidor.
    // Sirve para saber cuántos días lleva sin abrirla.
    await guardarConfig(env, 'ultima_sync', String(ahora));

    // Preferencias del aviso diario para acordarse de entrar
    if (b.entrar && typeof b.entrar === 'object') {
      await guardarConfig(env, 'entrar_activo', b.entrar.activo ? '1' : '0');
      await guardarConfig(env, 'entrar_hora', String(b.entrar.hora || '20:00').slice(0, 5));
    }

    const ordenes = [
      // Fuera los pendientes futuros: la app manda la lista completa cada vez.
      env.DB.prepare('DELETE FROM recordatorios WHERE enviado = 0 AND enviar_en > ?').bind(ahora),
      // Limpieza de historia vieja
      env.DB.prepare('DELETE FROM recordatorios WHERE enviar_en < ?')
        .bind(ahora - 7 * 86400000)
    ];

    for (const r of lista) {
      if (!r || !r.id || !r.titulo || !r.enviarEn) continue;
      if (Number(r.enviarEn) <= ahora) continue;
      ordenes.push(env.DB.prepare(
        'INSERT INTO recordatorios (id, titulo, cuerpo, url, enviar_en, urgente, enviado) ' +
        'VALUES (?, ?, ?, ?, ?, ?, 0) ' +
        'ON CONFLICT(id) DO UPDATE SET titulo = excluded.titulo, cuerpo = excluded.cuerpo, ' +
        'url = excluded.url, enviar_en = excluded.enviar_en, urgente = excluded.urgente'
      ).bind(
        String(r.id).slice(0, 120),
        String(r.titulo).slice(0, 120),
        String(r.cuerpo || '').slice(0, 300),
        String(r.url || './').slice(0, 200),
        Math.round(Number(r.enviarEn)),
        r.urgente ? 1 : 0
      ));
    }

    // D1 acepta lotes grandes, pero los partimos para ir seguros.
    for (let i = 0; i < ordenes.length; i += 50) {
      await env.DB.batch(ordenes.slice(i, i + 50));
    }
    return json(env, { ok: true, guardados: lista.length });
  }

  // --- Notificación de prueba ---
  if (ruta === '/api/probar-push' && peticion.method === 'POST') {
    const res = await avisar(env, {
      titulo: '🌙 Calma',
      cuerpo: 'Prueba lista: así te voy a avisar.',
      url: './',
      etiqueta: 'prueba',
      urgente: 1
    });
    return json(env, res);
  }

  // --- Gastos por clasificar (los que llegaron por correo) ---
  if (ruta === '/api/por-clasificar' && peticion.method === 'GET') {
    const { results } = await env.DB.prepare(
      'SELECT id, monto, origen, texto, fecha, hora FROM por_clasificar ' +
      'WHERE leido = 0 ORDER BY creado ASC LIMIT 50'
    ).all();
    return json(env, { lista: results || [] });
  }

  // La app avisa que ya se los llevó, para no volver a mandarlos.
  if (ruta === '/api/por-clasificar/listo' && peticion.method === 'POST') {
    const b = await peticion.json().catch(() => ({}));
    const ids = Array.isArray(b.ids) ? b.ids.slice(0, 100).map(String) : [];
    if (ids.length) {
      const marcas = ids.map(() => '?').join(',');
      await env.DB.prepare(
        `UPDATE por_clasificar SET leido = 1 WHERE id IN (${marcas})`
      ).bind(...ids).run();
    }
    // Limpieza: lo ya entregado hace más de 30 días no hace falta
    await env.DB.prepare('DELETE FROM por_clasificar WHERE leido = 1 AND creado < ?')
      .bind(Date.now() - 30 * 86400000).run();
    return json(env, { ok: true, marcados: ids.length });
  }

  // --- Respaldo en la nube ---
  if (ruta === '/api/respaldo' && peticion.method === 'POST') {
    const b = await peticion.json().catch(() => ({}));
    if (typeof b.json !== 'string' || b.json.length < 2) return error(env, 'Respaldo vacío.');
    if (b.json.length > 4_000_000) return error(env, 'El respaldo es demasiado grande.');
    await env.DB.prepare(
      'INSERT INTO respaldo (id, json, actualizado) VALUES (1, ?, ?) ' +
      'ON CONFLICT(id) DO UPDATE SET json = excluded.json, actualizado = excluded.actualizado'
    ).bind(b.json, Date.now()).run();
    return json(env, { ok: true });
  }

  if (ruta === '/api/respaldo') {
    const fila = await env.DB.prepare('SELECT json, actualizado FROM respaldo WHERE id = 1').first();
    return json(env, fila || { json: null, actualizado: null });
  }

  return error(env, 'Ruta no encontrada.', 404);
}

// ───────── Cron: cada minuto ─────────

/**
 * El aviso diario para acordarse de abrir la app.
 *
 * Lo genera el servidor, no la app. Esa es la gracia: aunque pasen semanas
 * sin abrirla (y se acaben los recordatorios sincronizados), este sigue
 * llegando. Es el hilo que no se corta.
 *
 * Se manda una sola vez al día. Si el cron se saltó el minuto exacto,
 * igual sale después, porque comparamos "ya pasó la hora" y no "es la hora".
 */
async function avisoDiarioDeEntrar(env, zona, esDiaDificil) {
  if ((await leerConfig(env, 'entrar_activo')) !== '1') return;

  const hoy = hoyEn(zona);
  if ((await leerConfig(env, 'entrar_ultimo')) === hoy) return;   // ya salió hoy
  if (minutosEn(zona) < aMinutos(await leerConfig(env, 'entrar_hora'))) return;

  // En día difícil no insistimos: ese día la app pide lo mínimo.
  if (esDiaDificil) {
    await guardarConfig(env, 'entrar_ultimo', hoy);
    return;
  }

  // El texto cambia según cuánto lleva sin aparecer, siempre sin reproches.
  const ultimaSync = Number(await leerConfig(env, 'ultima_sync')) || 0;
  const dias = ultimaSync ? Math.floor((Date.now() - ultimaSync) / 86400000) : 0;

  let titulo = '🌙 Calma';
  let cuerpo;
  if (dias >= 14) {
    cuerpo = 'Aquí sigo cuando quieras volver. Sin reclamos.';
  } else if (dias >= 4) {
    cuerpo = 'Hace unos días que no nos vemos. ¿Anotamos algo rápido?';
  } else if (dias >= 2) {
    cuerpo = '¿Cómo te fue estos días? Anota lo que recuerdes.';
  } else {
    cuerpo = '¿Gastaste algo hoy? Anótalo en 10 segundos.';
  }

  await avisar(env, {
    titulo, cuerpo, url: './', etiqueta: 'entrar', urgente: false
  });
  await guardarConfig(env, 'entrar_ultimo', hoy);
}

async function revisarRecordatorios(env) {
  const ahora = Date.now();
  const zona = (await leerConfig(env, 'zona')) || 'America/Lima';
  const dificilHasta = await leerConfig(env, 'dificil_hasta');
  const esDiaDificil = !!dificilHasta && dificilHasta === hoyEn(zona);

  // El aviso diario va primero y es independiente de la cola de recordatorios
  await avisoDiarioDeEntrar(env, zona, esDiaDificil);

  // Ventana de 2 horas: si el Worker estuvo caído no mandamos avisos antiguos.
  const { results } = await env.DB.prepare(
    'SELECT id, titulo, cuerpo, url, urgente FROM recordatorios ' +
    'WHERE enviado = 0 AND enviar_en <= ? AND enviar_en > ? ' +
    'ORDER BY enviar_en ASC LIMIT 20'
  ).bind(ahora, ahora - 2 * 3600000).all();

  const pendientes = results || [];
  if (!pendientes.length) return;

  const marcados = [];

  for (const r of pendientes) {
    // En día difícil callamos todo lo que no sea urgente, pero lo marcamos
    // como enviado para que no se acumule y salte mañana de golpe.
    if (esDiaDificil && !r.urgente) {
      marcados.push(r.id);
      continue;
    }
    await avisar(env, {
      titulo: r.titulo,
      cuerpo: r.cuerpo,
      url: r.url || './',
      etiqueta: String(r.id).split(':')[0] || 'calma',
      urgente: !!r.urgente
    });
    marcados.push(r.id);
  }

  if (marcados.length) {
    const marcas = marcados.map(() => '?').join(',');
    await env.DB.prepare(
      `UPDATE recordatorios SET enviado = 1 WHERE id IN (${marcas})`
    ).bind(...marcados).run();
  }
}

// ───────── Puntos de entrada del Worker ─────────

export default {
  async fetch(peticion, env) {
    try {
      return await manejar(peticion, env);
    } catch (e) {
      console.log('Error del Worker:', e.stack || e.message);
      return error(env, 'Algo falló en el servidor.', 500);
    }
  },

  async scheduled(evento, env, contexto) {
    contexto.waitUntil(revisarRecordatorios(env).catch((e) => {
      console.log('Error en el cron:', e.stack || e.message);
    }));
  },

  /**
   * Correo entrante (Email Routing de Cloudflare).
   *
   * Aquí llegan los avisos de Yape, Plin o el banco que reenvías a la
   * dirección de la app. Solo se saca el monto; en qué fue lo dices tú
   * desde el teléfono con un toque.
   *
   * Si algo falla, el correo se descarta en silencio: un gasto que no se
   * detectó es un fastidio, pero un Worker que revienta es peor.
   */
  async email(mensaje, env, contexto) {
    try {
      await procesarCorreo(mensaje, env, { leerConfig, hoyEn, avisar });
    } catch (e) {
      console.log('Error leyendo el correo:', e.stack || e.message);
    }
  }
};
