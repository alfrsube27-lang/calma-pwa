/* ===========================================================
   Service Worker de Calma
   1) Guarda la app en caché para que abra sin internet.
   2) Recibe las notificaciones push (con sonido) y las muestra.
   =========================================================== */

const VERSION = 'calma-v10';

// Archivos mínimos para que la app arranque offline.
const ARCHIVOS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/estilos.css',
  './js/util.js',
  './js/almacen.js',
  './js/calculo.js',
  './js/aprendiz.js',
  './js/plan.js',
  './js/mente.js',
  './js/apariencia.js',
  './js/api.js',
  './js/notificaciones.js',
  './js/app.js',
  './js/vistas/bienvenida.js',
  './js/vistas/hoy.js',
  './js/vistas/accion.js',
  './js/vistas/dinero.js',
  './js/vistas/deudas.js',
  './js/vistas/agenda.js',
  './js/vistas/chat.js',
  './js/vistas/resumen.js',
  './js/vistas/ajustes.js',
  './iconos/icono-192.png',
  './iconos/icono-512.png',
  './iconos/apple-touch-icon.png'
];

// ───────── Instalación: precargar la app ─────────
self.addEventListener('install', (evento) => {
  evento.waitUntil(
    caches.open(VERSION)
      // addAll falla entero si un archivo falta; los agregamos uno por uno.
      .then((cache) => Promise.all(
        ARCHIVOS.map((url) => cache.add(url).catch(() => null))
      ))
      .then(() => self.skipWaiting())
  );
});

// ───────── Activación: borrar cachés viejas ─────────
self.addEventListener('activate', (evento) => {
  evento.waitUntil(
    caches.keys()
      .then((claves) => Promise.all(
        claves.filter((c) => c !== VERSION).map((c) => caches.delete(c))
      ))
      .then(() => self.clients.claim())
  );
});

// ───────── Peticiones ─────────
self.addEventListener('fetch', (evento) => {
  const peticion = evento.request;
  if (peticion.method !== 'GET') return;

  const url = new URL(peticion.url);

  // Las llamadas a la API nunca se cachean (datos vivos).
  if (url.pathname.startsWith('/api/')) return;

  // Documentos: red primero, caché de respaldo (para ver cambios al desplegar).
  if (peticion.mode === 'navigate') {
    evento.respondWith(
      fetch(peticion)
        .then((res) => {
          const copia = res.clone();
          caches.open(VERSION).then((c) => c.put('./index.html', copia));
          return res;
        })
        .catch(() => caches.match('./index.html'))
    );
    return;
  }

  // Resto (css, js, iconos): caché primero, rápido y offline.
  evento.respondWith(
    caches.match(peticion).then((guardado) => {
      if (guardado) {
        // Refresco silencioso en segundo plano.
        fetch(peticion)
          .then((res) => caches.open(VERSION).then((c) => c.put(peticion, res)))
          .catch(() => {});
        return guardado;
      }
      return fetch(peticion).then((res) => {
        const copia = res.clone();
        caches.open(VERSION).then((c) => c.put(peticion, copia));
        return res;
      });
    })
  );
});

// ───────── Notificaciones push ─────────
self.addEventListener('push', (evento) => {
  let datos = {
    titulo: 'Calma',
    cuerpo: 'Tienes algo pendiente.',
    url: './',
    etiqueta: 'calma'
  };

  try {
    if (evento.data) Object.assign(datos, evento.data.json());
  } catch (e) {
    if (evento.data) datos.cuerpo = evento.data.text();
  }

  evento.waitUntil(
    self.registration.showNotification(datos.titulo, {
      body: datos.cuerpo,
      icon: './iconos/icono-192.png',
      badge: './iconos/insignia.png',
      // silent:false hace que iOS use el sonido de notificación del sistema.
      silent: false,
      // Vibración (Android; iOS usa su propio patrón).
      vibrate: [120, 60, 120],
      // Una etiqueta por tipo evita apilar 20 avisos iguales.
      tag: datos.etiqueta,
      renotify: true,
      requireInteraction: !!datos.urgente,
      data: { url: datos.url || './' }
    })
  );
});

// ───────── Toque en la notificación ─────────
self.addEventListener('notificationclick', (evento) => {
  evento.notification.close();
  const destino = (evento.notification.data && evento.notification.data.url) || './';

  evento.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then((ventanas) => {
        for (const v of ventanas) {
          if ('focus' in v) {
            v.navigate ? v.navigate(destino).catch(() => {}) : null;
            return v.focus();
          }
        }
        return self.clients.openWindow(destino);
      })
  );
});
