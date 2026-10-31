/* ===========================================================
   notificaciones.js — permiso, suscripción y recordatorios.

   iOS 16.4+ solo permite push si la app está INSTALADA en la
   pantalla de inicio. El permiso se pide con un botón, nunca al cargar.

   La app arma la lista de recordatorios futuros y la manda al Worker;
   el cron del Worker (cada minuto) es el que envía el push.
   =========================================================== */

const Notis = (() => {

  /** ¿El navegador puede recibir push? */
  function soportado() {
    return 'serviceWorker' in navigator
        && 'PushManager' in window
        && 'Notification' in window;
  }

  /** ¿Estamos abiertos como app instalada? (iOS lo exige para push) */
  function instalada() {
    return window.navigator.standalone === true
        || window.matchMedia('(display-mode: standalone)').matches;
  }

  function permiso() {
    return 'Notification' in window ? Notification.permission : 'default';
  }

  function activas() {
    return permiso() === 'granted' && Almacen.ajustes().notificaciones;
  }

  // ───────── Suscripción ─────────

  function base64aUint8(base64) {
    const relleno = '='.repeat((4 - (base64.length % 4)) % 4);
    const normal = (base64 + relleno).replace(/-/g, '+').replace(/_/g, '/');
    const crudo = atob(normal);
    return Uint8Array.from(crudo, (c) => c.charCodeAt(0));
  }

  function aBase64(buffer) {
    return btoa(String.fromCharCode.apply(null, new Uint8Array(buffer)))
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  /**
   * Flujo completo: pide permiso, se suscribe y avisa al servidor.
   * Devuelve { ok, mensaje }.
   */
  async function activar() {
    if (!soportado()) {
      return { ok: false, mensaje: 'Este navegador no soporta notificaciones.' };
    }
    if (!Api.configurada()) {
      return { ok: false, mensaje: 'Primero configura el servidor en Ajustes.' };
    }
    if (/iPhone|iPad|iPod/.test(navigator.userAgent) && !instalada()) {
      return {
        ok: false,
        mensaje: 'En iPhone primero agrega la app a la pantalla de inicio y ábrela desde ahí.'
      };
    }

    const resultado = await Notification.requestPermission();
    if (resultado !== 'granted') {
      return { ok: false, mensaje: 'Sin permiso no puedo avisarte. Puedes activarlo después.' };
    }

    const registro = await navigator.serviceWorker.ready;
    const { clave } = await Api.clavePublica();
    if (!clave) return { ok: false, mensaje: 'El servidor no tiene la clave VAPID configurada.' };

    // Si ya había una suscripción con otra clave, la reemplazamos.
    let suscripcion = await registro.pushManager.getSubscription();
    if (suscripcion) {
      const mismaClave = suscripcion.options
        && aBase64(suscripcion.options.applicationServerKey || new ArrayBuffer(0)) === clave;
      if (!mismaClave) { await suscripcion.unsubscribe(); suscripcion = null; }
    }
    if (!suscripcion) {
      suscripcion = await registro.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: base64aUint8(clave)
      });
    }

    const datos = suscripcion.toJSON();
    await Api.guardarSuscripcion({
      endpoint: datos.endpoint,
      p256dh: datos.keys.p256dh,
      auth: datos.keys.auth
    });

    Almacen.ajustes().notificaciones = true;
    Almacen.guardar();
    await sincronizar();

    return { ok: true, mensaje: 'Listo, te avisaré con sonido.' };
  }

  async function desactivar() {
    try {
      const registro = await navigator.serviceWorker.ready;
      const s = await registro.pushManager.getSubscription();
      if (s) {
        await Api.borrarSuscripcion(s.endpoint).catch(() => {});
        await s.unsubscribe();
      }
    } catch (e) {}
    Almacen.ajustes().notificaciones = false;
    Almacen.guardar();
  }

  // ───────── Construcción de recordatorios ─────────

  const DIAS_ADELANTE = 21;   // mandamos 3 semanas de recordatorios al servidor
  const MAXIMO = 400;         // tope para no llenar la base

  /**
   * Arma todos los recordatorios futuros a partir del estado actual.
   * Cada uno lleva `urgente`: en modo día difícil el servidor solo
   * envía los urgentes (comida y cuotas de deuda del día).
   */
  function generar() {
    const a = Almacen.ajustes();
    const ahora = Date.now();
    const lista = [];
    const margen = ahora + 30000;   // nada en los próximos 30 segundos

    const agregar = (id, titulo, cuerpo, cuando, urgente, url) => {
      if (cuando <= margen) return;
      lista.push({
        id,
        titulo,
        cuerpo,
        enviarEn: cuando,
        urgente: urgente ? 1 : 0,
        url: url || './'
      });
    };

    // 1) Comida — urgente: nunca se silencia, ni en día difícil
    if (a.recordarComida && U.numero(a.comidaPorDia) >= 0) {
      const mensajes = [
        'Hora de comer algo. Aunque sea poquito.',
        '¿Ya comiste? Tu cuerpo te lo va a agradecer.',
        'Pausa para comer. Te espera el resto después.'
      ];
      for (let d = 0; d < DIAS_ADELANTE; d++) {
        const fecha = U.sumarDias(U.hoy(), d);
        (a.horasComida || []).forEach((hora, i) => {
          agregar(
            `comida:${fecha}:${hora}`,
            '🍚 Comida',
            mensajes[i % mensajes.length],
            U.marca(fecha, hora),
            true
          );
        });
      }
    }

    // 2) Cuotas de deuda — 3 días antes y el mismo día (urgente)
    for (const deuda of Almacen.get().deudas) {
      if (deuda.terminada || deuda.saldo <= 0) continue;
      // Sin fecha no hay nada que recordar; las vencidas ya salen
      // en el aviso de atrasados, no hace falta repetirlas aquí.
      if (deuda.frecuencia === 'nosabe' || deuda.frecuencia === 'vencida') continue;
      if (deuda.porConfirmar) continue;
      for (let m = 0; m < 2; m++) {
        const hoyD = U.deISO(U.hoy());
        const base = new Date(hoyD.getFullYear(), hoyD.getMonth() + m, 1);
        const ultimo = new Date(base.getFullYear(), base.getMonth() + 1, 0).getDate();
        const dia = Math.min(deuda.diaPago || 1, ultimo);
        const fecha = U.aISO(new Date(base.getFullYear(), base.getMonth(), dia));
        const mes = fecha.slice(0, 7);
        if ((deuda.pagos || []).some((p) => String(p.fecha).slice(0, 7) === mes)) continue;

        const monto = U.soles(Math.min(Almacen.cuotaDe(deuda), deuda.saldo));
        agregar(
          `deuda3:${deuda.id}:${fecha}`,
          '🧾 Cuota en 3 días',
          `${deuda.acreedor}: ${monto} el ${U.fechaCorta(fecha)}.`,
          U.marca(U.sumarDias(fecha, -3), a.horaDeudas),
          true,
          './#deudas'
        );
        agregar(
          `deuda0:${deuda.id}:${fecha}`,
          '🧾 Cuota de hoy',
          `${deuda.acreedor}: ${monto}. Cuando puedas, la marcas.`,
          U.marca(fecha, a.horaDeudas),
          true,
          './#deudas'
        );
      }
    }

    // 3) Gastos fijos — el mismo día (no urgente)
    for (const fijo of Almacen.get().gastosFijos) {
      for (let m = 0; m < 2; m++) {
        const hoyD = U.deISO(U.hoy());
        const base = new Date(hoyD.getFullYear(), hoyD.getMonth() + m, 1);
        const ultimo = new Date(base.getFullYear(), base.getMonth() + 1, 0).getDate();
        const dia = Math.min(fijo.dia || 1, ultimo);
        const fecha = U.aISO(new Date(base.getFullYear(), base.getMonth(), dia));
        if ((fijo.pagados || []).includes(fecha.slice(0, 7))) continue;
        agregar(
          `fijo:${fijo.id}:${fecha}`,
          '📌 Pago de hoy',
          `${fijo.nombre}: ${U.soles(fijo.monto)}.`,
          U.marca(fecha, a.horaDeudas),
          false,
          './#dinero'
        );
      }
    }

    // 4) Pendientes con hora — aviso configurable antes
    for (let d = 0; d < DIAS_ADELANTE; d++) {
      const fecha = U.sumarDias(U.hoy(), d);
      for (const p of Almacen.get().pendientes) {
        if (!p.notificar || !p.hora) continue;
        if (!Almacen.aplicaEn(p, fecha)) continue;
        if (Almacen.estaHecho(p, fecha)) continue;

        const minutos = p.tipo === 'reunion'
          ? U.numero(p.avisoMin || a.avisoReunionMin)
          : 0;
        const cuando = U.marca(fecha, p.hora) - minutos * 60000;
        const emoji = { tarea: '📝', reunion: '📅', casa: '🧺', pago: '💵', otro: '🔔' }[p.tipo] || '🔔';
        const detalle = p.lugar
          ? `${p.hora} · ${p.lugar}`
          : (minutos ? `En ${minutos} min (${p.hora})` : p.hora);

        agregar(
          `pend:${p.id}:${fecha}`,
          `${emoji} ${p.titulo}`,
          detalle,
          cuando,
          p.prioridad === 'alta',
          './#agenda'
        );
      }
    }

    // 5) Lo que quedó atrasado — UN solo aviso al día, nunca más.
    //    No es urgente: en día difícil se calla.
    const atrasados = Calculo.atrasados();
    if (atrasados.length) {
      const total = Calculo.totalAtrasado();
      for (let d = 0; d < 3; d++) {
        const fecha = U.sumarDias(U.hoy(), d);
        agregar(
          `atraso:${fecha}`,
          '🧾 Quedó pendiente',
          `${U.soles(total)} de ${atrasados.length === 1 ? 'un pago' : 'unos pagos'} que ya vencieron. Cuando puedas.`,
          U.marca(fecha, a.horaDeudas),
          false,
          './#deudas'
        );
      }
    }

    // 6) Resumen semanal (no urgente)
    for (let s = 0; s < 3; s++) {
      const hoyD = U.deISO(U.hoy());
      const objetivo = Number(a.resumenDia) || 0;
      let delta = (objetivo - hoyD.getDay() + 7) % 7;
      delta += s * 7;
      const fecha = U.sumarDias(U.hoy(), delta);
      agregar(
        `resumen:${fecha}`,
        '🌱 Tu semana',
        'Mira cómo te fue. Sin juzgarte, solo para saber.',
        U.marca(fecha, a.resumenHora),
        false,
        './#resumen'
      );
    }

    return lista
      .sort((x, y) => x.enviarEn - y.enviarEn)
      .slice(0, MAXIMO);
  }

  // ───────── Sincronización con el servidor ─────────

  let ultimaFirma = '';

  /** Manda la lista al Worker. Solo si algo cambió, para no gastar llamadas. */
  async function sincronizar(forzar = false) {
    if (!Api.configurada() || !activas()) return false;
    const lista = generar();
    const firma = lista.length + ':' + lista.map((r) => r.id + r.enviarEn).join('|')
                + ':' + (Almacen.ajustes().dificilHasta || '');
    if (!forzar && firma === ultimaFirma) return false;
    try {
      await Api.sincronizarRecordatorios(lista, Almacen.ajustes().dificilHasta);
      ultimaFirma = firma;
      return true;
    } catch (e) {
      console.warn('No se pudo sincronizar recordatorios:', e.message);
      return false;
    }
  }

  /** Versión con espera, para llamarla en cada cambio sin saturar. */
  const sincronizarPronto = U.esperar(() => sincronizar(), 1500);

  /** Aviso local inmediato (no necesita servidor ni internet). */
  function avisoLocal(titulo, cuerpo) {
    if (permiso() !== 'granted') return;
    navigator.serviceWorker.ready.then((r) => {
      r.showNotification(titulo, {
        body: cuerpo,
        icon: './iconos/icono-192.png',
        badge: './iconos/insignia.png',
        silent: false,
        tag: 'calma-local',
        renotify: true
      });
    }).catch(() => {});
  }

  return {
    soportado, instalada, permiso, activas,
    activar, desactivar, generar, sincronizar, sincronizarPronto, avisoLocal
  };
})();

