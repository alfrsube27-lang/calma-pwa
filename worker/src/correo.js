/* ===========================================================
   correo.js — leer los avisos de Yape, Plin y el banco.

   La idea es que no tengas que anotar cada microgasto. Reenvías a
   este Worker los correos de aviso de tus operaciones; él saca el
   monto, lo guarda como "salió plata" y te manda una notificación
   para que solo digas EN QUÉ fue. Un toque en vez de un formulario.

   Lo que NUNCA hace:
     · guardar el correo entero (solo el monto y una línea de referencia)
     · aceptar correo de cualquiera (ver CORREOS_PERMITIDOS)
     · anotar ingresos solo (los avisos de dinero que ENTRA se ignoran:
       ese dinero lo confirmas tú con "Me pagaron")

   Secreto necesario:
     CORREOS_PERMITIDOS   remitentes separados por coma. Puede ser el
                          correo exacto (avisos@yape.com.pe) o solo el
                          dominio (yape.com.pe). Sin esto, todo correo
                          se rechaza: si no, cualquiera que sepa la
                          dirección podría inventarte gastos.
   =========================================================== */

/** Como máximo leemos esto del correo. Un aviso de banco es mucho menor. */
const LIMITE_BYTES = 512 * 1024;

/** Frases que indican que el dinero SALIÓ. */
const SALIDA = new RegExp([
  'yapeaste', 'yapeo', 'yapeó', 'plineaste',
  'enviaste', 'env[ií]o exitoso', 'transferencia enviada',
  'pagaste', 'pago exitoso', 'realizaste un pago', 'pago realizado',
  'compra', 'consumo', 'cargo', 'retiro', 'd[ée]bito'
].join('|'), 'i');

/** Frases que indican que el dinero ENTRÓ (esos avisos se ignoran). */
const ENTRADA = new RegExp([
  'te yapearon', 'te plinearon', 'te envi', 'recibiste',
  'abono', 'dep[óo]sito', 'transferencia recibida', 'ingreso de dinero'
].join('|'), 'i');

/**
 * Publicidad. Yape y los bancos mandan ofertas desde la misma dirección
 * que los avisos de verdad, y un "hasta S/ 100 de descuento en tu próxima
 * compra" tiene monto y tiene la palabra "compra". Si suena a promoción,
 * no se anota.
 */
const PUBLICIDAD = new RegExp([
  'descuento', 'promoci[óo]n', 'oferta', 'cup[óo]n', 'sorteo',
  'aprovecha', 'hasta\\s*S\\s*/', 'te regalamos', 'gana\\s',
  'suscr[ií]b', 'newsletter', 'bolet[ií]n'
].join('|'), 'i');

/** S/ 25.00 · S/. 1,250.50 · PEN 80 */
const MONTO = /(?:S\s*\/\s*\.?|PEN)\s*([0-9]{1,3}(?:[,\s][0-9]{3})*(?:\.[0-9]{1,2})?|[0-9]+(?:\.[0-9]{1,2})?)/i;

// ───────── Decodificar el correo ─────────

/** Lee el correo crudo sin pasarnos de LIMITE_BYTES. */
async function crudoDe(mensaje) {
  const lector = mensaje.raw.getReader();
  const trozos = [];
  let total = 0;
  while (total < LIMITE_BYTES) {
    const { done, value } = await lector.read();
    if (done) break;
    trozos.push(value);
    total += value.length;
  }
  try { await lector.cancel(); } catch (e) {}

  const todo = new Uint8Array(total);
  let i = 0;
  for (const t of trozos) { todo.set(t, i); i += t.length; }
  return new TextDecoder('utf-8', { fatal: false }).decode(todo);
}

/**
 * Después de deshacer el quoted-printable quedan bytes sueltos donde
 * había tildes. Esto los vuelve a juntar como UTF-8.
 */
function arreglarTildes(s) {
  try {
    const bytes = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) {
      const c = s.charCodeAt(i);
      if (c > 255) return s;          // ya era texto normal
      bytes[i] = c;
    }
    return new TextDecoder('utf-8', { fatal: false }).decode(bytes);
  } catch (e) {
    return s;
  }
}

function desdeQuotedPrintable(s) {
  return arreglarTildes(
    String(s)
      .replace(/=\r?\n/g, '')         // saltos de línea blandos
      .replace(/=([0-9A-Fa-f]{2})/g, (m, h) => String.fromCharCode(parseInt(h, 16)))
  );
}

function desdeBase64(s) {
  try {
    const limpio = String(s).replace(/[^A-Za-z0-9+/=]/g, '');
    if (!limpio) return '';
    const bin = atob(limpio);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder('utf-8', { fatal: false }).decode(bytes);
  } catch (e) {
    return '';
  }
}

/** Quita etiquetas HTML y deja una sola línea de texto legible. */
function aTextoPlano(html) {
  return String(html || '')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<\/(p|div|tr|td|li|h[1-6])>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&#(\d+);/g, (m, n) => String.fromCharCode(Number(n)))
    .replace(/&[a-z]+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Saca el cuerpo legible del correo.
 * Prefiere la parte de texto plano; si solo hay HTML, lo limpia.
 */
function cuerpoDe(crudo) {
  const limite = /boundary="?([^";\r\n]+)"?/i.exec(crudo);
  const partes = limite ? crudo.split('--' + limite[1]) : [crudo];

  let mejor = '';
  for (const parte of partes) {
    let corte = parte.indexOf('\r\n\r\n');
    let salto = 4;
    if (corte < 0) { corte = parte.indexOf('\n\n'); salto = 2; }
    if (corte < 0) continue;

    const cabeceras = parte.slice(0, corte).toLowerCase();
    let cuerpo = parte.slice(corte + salto);

    if (cabeceras.includes('base64')) cuerpo = desdeBase64(cuerpo);
    else if (cabeceras.includes('quoted-printable')) cuerpo = desdeQuotedPrintable(cuerpo);

    const texto = aTextoPlano(cuerpo);
    // El texto plano es el más confiable; si lo hay, nos quedamos con él
    if (cabeceras.includes('text/plain') && texto.length > 20) return texto;
    if (texto.length > mejor.length) mejor = texto;
  }
  return mejor;
}

/** El asunto, ya decodificado si venía en =?utf-8?...?= */
function asuntoDe(mensaje) {
  const crudo = (mensaje.headers && mensaje.headers.get('subject')) || '';
  return String(crudo).replace(/=\?[^?]+\?([BbQq])\?([^?]*)\?=/g, (m, tipo, dato) => {
    if (tipo.toLowerCase() === 'b') return desdeBase64(dato);
    return desdeQuotedPrintable(dato.replace(/_/g, ' '));
  }).trim();
}

// ───────── Entender el aviso ─────────

function origenDe(texto) {
  const t = texto.toLowerCase();
  if (t.includes('yape')) return 'yape';
  if (t.includes('plin')) return 'plin';
  return 'banco';
}

/**
 * Devuelve { monto, origen, texto } si el correo es un aviso de que
 * salió dinero. Si no lo es (o es un ingreso), devuelve null.
 */
export function analizar(asunto, cuerpo) {
  const todo = `${asunto} ${cuerpo}`;

  // Publicidad fuera: tiene montos y palabras de compra, pero no gastaste nada
  if (PUBLICIDAD.test(todo)) return null;

  // Un aviso de dinero que entra no se anota como gasto
  if (ENTRADA.test(todo) && !SALIDA.test(todo)) return null;
  if (!SALIDA.test(todo)) return null;

  const m = MONTO.exec(todo);
  if (!m) return null;

  const monto = Number(String(m[1]).replace(/[,\s]/g, ''));
  if (!isFinite(monto) || monto <= 0 || monto > 1000000) return null;

  // Una línea corta para reconocerlo en la app. Nada más del correo.
  const referencia = (asunto || cuerpo).slice(0, 80).trim();

  return { monto: Math.round(monto * 100) / 100, origen: origenDe(todo), texto: referencia };
}

/** Identificador estable del aviso: si llega dos veces, no se duplica. */
async function huella(partes) {
  const datos = new TextEncoder().encode(partes.join('|'));
  const resumen = await crypto.subtle.digest('SHA-256', datos);
  return [...new Uint8Array(resumen)].slice(0, 12)
    .map((b) => b.toString(16).padStart(2, '0')).join('');
}

// ───────── Punto de entrada ─────────

/**
 * Procesa un correo recibido por Email Routing.
 * `ayudas` trae lo que vive en index.js: { leerConfig, hoyEn, avisar }.
 */
export async function procesarCorreo(mensaje, env, ayudas) {
  // 1) ¿Viene de un remitente que yo autoricé?
  const permitidos = String(env.CORREOS_PERMITIDOS || '')
    .split(',').map((x) => x.trim().toLowerCase()).filter(Boolean);

  if (!permitidos.length) {
    console.log('CORREOS_PERMITIDOS no está configurado: correo rechazado.');
    return { ok: false, motivo: 'sin-lista' };
  }

  const de = String(mensaje.from || '').toLowerCase().trim();
  const permitido = permitidos.some((p) =>
    p.includes('@') ? de === p : de.endsWith('@' + p) || de === p
  );
  if (!permitido) {
    console.log('Remitente no autorizado:', de);
    return { ok: false, motivo: 'remitente' };
  }

  // 2) Leer y entender
  const crudo = await crudoDe(mensaje);
  const asunto = asuntoDe(mensaje);
  const cuerpo = cuerpoDe(crudo);
  const dato = analizar(asunto, cuerpo);

  if (!dato) {
    console.log('Correo sin monto de salida, ignorado.');
    return { ok: false, motivo: 'sin-monto' };
  }

  // 3) Guardar
  const zona = (await ayudas.leerConfig(env, 'zona')) || 'America/Lima';
  const fecha = ayudas.hoyEn(zona);
  const id = await huella([de, asunto, String(dato.monto), fecha]);

  const existe = await env.DB.prepare('SELECT id FROM por_clasificar WHERE id = ?')
    .bind(id).first();
  if (existe) return { ok: true, repetido: true };

  const hora = new Intl.DateTimeFormat('en-GB', {
    timeZone: zona, hour: '2-digit', minute: '2-digit', hour12: false
  }).format(new Date());

  await env.DB.prepare(
    'INSERT INTO por_clasificar (id, monto, origen, texto, fecha, hora, creado, leido) ' +
    'VALUES (?, ?, ?, ?, ?, ?, ?, 0)'
  ).bind(id, dato.monto, dato.origen, dato.texto, fecha, hora, Date.now()).run();

  // 4) Avisar, para que solo diga en qué fue
  const dificilHasta = await ayudas.leerConfig(env, 'dificil_hasta');
  const esDiaDificil = !!dificilHasta && dificilHasta === fecha;

  // En día difícil se guarda igual, pero no se le pregunta nada.
  if (!esDiaDificil) {
    await ayudas.avisar(env, {
      titulo: `Salieron S/ ${dato.monto.toFixed(2)}`,
      cuerpo: '¿En qué fue? Un toque y queda anotado.',
      url: './',
      etiqueta: 'clasificar',
      urgente: false
    });
  }

  return { ok: true, monto: dato.monto, origen: dato.origen };
}
