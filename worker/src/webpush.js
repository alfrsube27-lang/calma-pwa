/* ===========================================================
   webpush.js — Web Push desde cero, con WebCrypto.
   Sin librerías: funciona tal cual en Cloudflare Workers.

   Implementa:
   · VAPID (RFC 8292): un JWT firmado con ES256.
   · Cifrado del mensaje (RFC 8291): aes128gcm.

   Las claves VAPID se pasan en formato "web-push" estándar:
   publica  = 65 bytes sin comprimir, base64url
   privada  = 32 bytes, base64url
   =========================================================== */

// ───────── base64url ─────────

function b64urlADatos(texto) {
  const normal = String(texto).replace(/-/g, '+').replace(/_/g, '/');
  const relleno = normal + '='.repeat((4 - (normal.length % 4)) % 4);
  const crudo = atob(relleno);
  const salida = new Uint8Array(crudo.length);
  for (let i = 0; i < crudo.length; i++) salida[i] = crudo.charCodeAt(i);
  return salida;
}

function datosAB64url(datos) {
  const bytes = datos instanceof Uint8Array ? datos : new Uint8Array(datos);
  let texto = '';
  for (let i = 0; i < bytes.length; i++) texto += String.fromCharCode(bytes[i]);
  return btoa(texto).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function unir(...partes) {
  const total = partes.reduce((n, p) => n + p.length, 0);
  const salida = new Uint8Array(total);
  let i = 0;
  for (const p of partes) { salida.set(p, i); i += p.length; }
  return salida;
}

const texto = (s) => new TextEncoder().encode(s);

// ───────── HMAC-SHA256 (base de HKDF) ─────────

async function hmac(claveBytes, datos) {
  const clave = await crypto.subtle.importKey(
    'raw', claveBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  return new Uint8Array(await crypto.subtle.sign('HMAC', clave, datos));
}

/** HKDF reducido: una sola ronda, que es todo lo que pide RFC 8291. */
async function hkdf(sal, ikm, info, largo) {
  const prk = await hmac(sal, ikm);
  const bloque = await hmac(prk, unir(info, new Uint8Array([1])));
  return bloque.slice(0, largo);
}

// ───────── VAPID: JWT firmado con ES256 ─────────

/** Arma el JWK de la clave privada a partir de las claves base64url. */
function jwkPrivada(publicaB64, privadaB64) {
  const publica = b64urlADatos(publicaB64);
  if (publica.length !== 65 || publica[0] !== 4) {
    throw new Error('La clave pública VAPID debe ser de 65 bytes sin comprimir.');
  }
  return {
    kty: 'EC',
    crv: 'P-256',
    x: datosAB64url(publica.slice(1, 33)),
    y: datosAB64url(publica.slice(33, 65)),
    d: datosAB64url(b64urlADatos(privadaB64)),
    ext: true
  };
}

/**
 * Token VAPID para un endpoint.
 * @param {string} endpoint URL del servicio push
 * @param {object} vapid { publica, privada, sujeto }
 */
async function tokenVapid(endpoint, vapid) {
  const origen = new URL(endpoint).origin;
  const cabecera = { typ: 'JWT', alg: 'ES256' };
  const carga = {
    aud: origen,
    exp: Math.floor(Date.now() / 1000) + 12 * 3600,   // 12 horas
    sub: vapid.sujeto || 'mailto:nadie@example.com'
  };

  const sinFirmar = datosAB64url(texto(JSON.stringify(cabecera)))
                  + '.' + datosAB64url(texto(JSON.stringify(carga)));

  const clave = await crypto.subtle.importKey(
    'jwk', jwkPrivada(vapid.publica, vapid.privada),
    { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']
  );
  const firma = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' }, clave, texto(sinFirmar)
  );

  return sinFirmar + '.' + datosAB64url(firma);
}

// ───────── Cifrado aes128gcm (RFC 8291) ─────────

async function cifrar(mensaje, p256dhB64, authB64) {
  const clavePublicaUA = b64urlADatos(p256dhB64);   // 65 bytes
  const secretoAuth = b64urlADatos(authB64);        // 16 bytes

  // Par de claves efímero del servidor
  const par = await crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']
  );
  const publicaServidor = new Uint8Array(await crypto.subtle.exportKey('raw', par.publicKey));

  // Clave pública del navegador, para el ECDH
  const claveUA = await crypto.subtle.importKey(
    'raw', clavePublicaUA, { name: 'ECDH', namedCurve: 'P-256' }, false, []
  );
  const secretoCompartido = new Uint8Array(await crypto.subtle.deriveBits(
    { name: 'ECDH', public: claveUA }, par.privateKey, 256
  ));

  // IKM: mezcla el secreto ECDH con el "auth" de la suscripción
  const infoClave = unir(texto('WebPush: info\0'), clavePublicaUA, publicaServidor);
  const ikm = await hkdf(secretoAuth, secretoCompartido, infoClave, 32);

  // Claves de contenido
  const sal = crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(sal, ikm, texto('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(sal, ikm, texto('Content-Encoding: nonce\0'), 12);

  // El contenido lleva un delimitador 0x02 al final (último registro)
  const plano = unir(texto(mensaje), new Uint8Array([2]));
  const claveAes = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  const cifrado = new Uint8Array(await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: nonce, tagLength: 128 }, claveAes, plano
  ));

  // Cabecera: sal(16) + tamaño de registro(4) + largo de clave(1) + clave(65)
  const tamanioRegistro = new Uint8Array(4);
  new DataView(tamanioRegistro.buffer).setUint32(0, 4096);

  return unir(sal, tamanioRegistro, new Uint8Array([publicaServidor.length]),
              publicaServidor, cifrado);
}

// ───────── Envío ─────────

/**
 * Envía una notificación push.
 * @param {object} suscripcion { endpoint, p256dh, auth }
 * @param {object} datos       lo que recibirá el service worker
 * @param {object} vapid       { publica, privada, sujeto }
 * @returns {Promise<{ok:boolean, estado:number, muerta:boolean, detalle:string}>}
 */
export async function enviarPush(suscripcion, datos, vapid) {
  const cuerpo = await cifrar(JSON.stringify(datos), suscripcion.p256dh, suscripcion.auth);
  const jwt = await tokenVapid(suscripcion.endpoint, vapid);

  const respuesta = await fetch(suscripcion.endpoint, {
    method: 'POST',
    headers: {
      'Authorization': `vapid t=${jwt}, k=${vapid.publica}`,
      'Content-Encoding': 'aes128gcm',
      'Content-Type': 'application/octet-stream',
      'TTL': '86400',
      // "high" hace que iOS despierte el teléfono y suene.
      'Urgency': datos.urgente ? 'high' : 'normal'
    },
    body: cuerpo
  });

  let detalle = '';
  if (!respuesta.ok) {
    try { detalle = (await respuesta.text()).slice(0, 300); } catch (e) {}
  }

  return {
    ok: respuesta.ok,
    estado: respuesta.status,
    // 404/410: el navegador botó la suscripción, hay que borrarla.
    muerta: respuesta.status === 404 || respuesta.status === 410,
    detalle
  };
}
