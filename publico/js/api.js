/* ===========================================================
   api.js — habla con el Worker de Cloudflare.

   Todas las rutas van firmadas con un token secreto que el usuario
   pega una sola vez en Ajustes. El token NUNCA está en el código:
   vive como "secret" en Cloudflare y en el localStorage del teléfono.

   Si no hay backend configurado, la app sigue funcionando completa;
   solo no habrá notificaciones push ni respaldo en la nube.
   =========================================================== */

const Api = (() => {

  function base() {
    const url = String(Almacen.ajustes().apiUrl || '').trim().replace(/\/+$/, '');
    return url;
  }

  function token() {
    return String(Almacen.ajustes().token || '').trim();
  }

  function configurada() {
    return !!(base() && token());
  }

  /** Petición genérica. Lanza error con mensaje en español. */
  async function pedir(ruta, opciones = {}) {
    if (!configurada()) throw new Error('Falta configurar el servidor en Ajustes.');

    const respuesta = await fetch(base() + ruta, Object.assign({
      method: 'GET',
      headers: {
        'Authorization': 'Bearer ' + token(),
        'Content-Type': 'application/json'
      },
      // Nada de cookies ni credenciales del navegador: solo el token.
      credentials: 'omit',
      cache: 'no-store'
    }, opciones));

    if (respuesta.status === 401) throw new Error('El token no es correcto.');
    if (!respuesta.ok) {
      let detalle = '';
      try { detalle = (await respuesta.json()).error || ''; } catch (e) {}
      throw new Error(detalle || `El servidor respondió ${respuesta.status}.`);
    }
    if (respuesta.status === 204) return null;
    return respuesta.json();
  }

  function enviar(ruta, cuerpo) {
    return pedir(ruta, { method: 'POST', body: JSON.stringify(cuerpo) });
  }

  // ───────── Rutas ─────────

  /** Comprueba que la URL y el token funcionen. */
  function probar() { return pedir('/api/saludo'); }

  /** Clave pública VAPID para suscribirse a push. */
  function clavePublica() { return pedir('/api/vapid'); }

  /** Guarda la suscripción push de este iPhone. */
  function guardarSuscripcion(suscripcion) {
    return enviar('/api/suscribir', suscripcion);
  }

  function borrarSuscripcion(endpoint) {
    return enviar('/api/desuscribir', { endpoint });
  }

  /**
   * Reemplaza la lista de recordatorios futuros.
   * El cron del Worker los dispara a su hora.
   */
  function sincronizarRecordatorios(recordatorios, dificilHasta) {
    const a = Almacen.ajustes();
    return enviar('/api/recordatorios', {
      recordatorios,
      dificilHasta: dificilHasta || null,
      zona: Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Lima',
      // El aviso diario lo arma el servidor por su cuenta, para que siga
      // llegando aunque pasen semanas sin abrir la app.
      entrar: {
        activo: !!a.recordarEntrar,
        hora: a.horaEntrar || '20:00'
      }
    });
  }

  /** Envía una notificación de prueba al instante. */
  function probarNotificacion() {
    return enviar('/api/probar-push', {});
  }

  /** Respaldo opcional en la nube (el JSON completo, cifrado solo por HTTPS). */
  function subirRespaldo(json) { return enviar('/api/respaldo', { json }); }
  function bajarRespaldo() { return pedir('/api/respaldo'); }

  /** Gastos detectados en el correo que todavía no bajó este teléfono. */
  function bajarPorClasificar() { return pedir('/api/por-clasificar'); }
  function marcarClasificados(ids) { return enviar('/api/por-clasificar/listo', { ids }); }

  /**
   * Trae los gastos que el servidor detectó en el correo y los mete en
   * la bandeja del teléfono. Si no hay backend, no hace nada y no
   * molesta: la app funciona igual.
   *
   * Devuelve cuántos entraron nuevos.
   */
  async function sincronizarBandeja() {
    if (!configurada()) return 0;
    const res = await bajarPorClasificar();
    const lista = (res && res.lista) || [];
    if (!lista.length) return 0;

    let nuevos = 0;
    for (const x of lista) {
      const guardado = Almacen.agregarPorClasificar({
        ref: x.id,                 // el id del servidor evita duplicados
        monto: x.monto,
        origen: x.origen,
        texto: x.texto,
        fecha: x.fecha,
        hora: x.hora
      });
      if (guardado) nuevos++;
    }
    // Avisamos al servidor para que no nos los mande otra vez
    await marcarClasificados(lista.map((x) => x.id)).catch(() => {});
    return nuevos;
  }

  return {
    configurada, base, probar, clavePublica,
    guardarSuscripcion, borrarSuscripcion,
    sincronizarRecordatorios, probarNotificacion,
    subirRespaldo, bajarRespaldo,
    bajarPorClasificar, marcarClasificados, sincronizarBandeja
  };
})();
