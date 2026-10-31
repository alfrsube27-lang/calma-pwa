/* ===========================================================
   apariencia.js — la app es suya.

   Qué partes se ven y de qué color. Todo esto se cambia hablando
   ("quita el calendario", "ponlo más claro", "me gusta el verde")
   o desde Ajustes, para quien prefiera botones.

   Dos reglas que no se tocan:
     · La pestaña Hoy no se puede esconder. Es la del número, que es
       la razón por la que existe la app.
     · Ningún color de alarma. Se puede elegir el acento, pero los
       estados (bien / aviso / límite) los pone la app, porque son
       información, no decoración.
   =========================================================== */

const Apariencia = (() => {

  /** Las pestañas que se pueden esconder, y cómo las llama la gente. */
  const PESTANIAS = {
    dinero:  { nombre: 'Dinero',  alias: ['dinero', 'gastos', 'plata', 'billetera', 'movimientos'] },
    deudas:  { nombre: 'Deudas',  alias: ['deudas', 'deuda', 'prestamos', 'creditos'] },
    agenda:  { nombre: 'Agenda',  alias: ['agenda', 'calendario', 'pendientes', 'tareas', 'recordatorios'] },
    chat:    { nombre: 'Hablar',  alias: ['chat', 'hablar', 'conversar', 'conversacion', 'mensajes'] },
    resumen: { nombre: 'Ti',      alias: ['ti', 'resumen', 'progreso', 'logros', 'racha'] }
  };

  /** Colores con nombre, para poder pedirlos hablando. */
  const COLORES = {
    azul:     '#8ab4d8',
    verde:    '#74c69d',
    menta:    '#8fd4c1',
    ambar:    '#e9c46a',
    naranja:  '#e8955c',
    morado:   '#b0a0d8',
    lila:     '#c3b3e6',
    rosa:     '#e0a8bd',
    durazno:  '#efb48f',
    gris:     '#a8b8c0',
    celeste:  '#9fd0e8'
  };

  function ajustes() {
    const a = Almacen.ajustes();
    a.interfaz = Object.assign({
      pestanias: { dinero: true, deudas: true, agenda: true, chat: true, resumen: true },
      tema: 'oscuro',
      acento: null
    }, a.interfaz || {});
    return a.interfaz;
  }

  // ───────── Aplicar ─────────

  /** Deja la pantalla como la persona la dejó. Se llama al abrir y al cambiar. */
  function aplicar() {
    const i = ajustes();

    document.documentElement.setAttribute('data-tema', i.tema || 'oscuro');

    // El acento elegido pisa al de fábrica, en los dos temas
    const raiz = document.documentElement;
    if (i.acento) {
      raiz.style.setProperty('--acento', i.acento);
      raiz.style.setProperty('--acento-fondo', conAlfa(i.acento, 0.16));
    } else {
      raiz.style.removeProperty('--acento');
      raiz.style.removeProperty('--acento-fondo');
    }

    // La barra de estado del iPhone, a juego con el fondo
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) {
      meta.setAttribute('content', i.tema === 'claro' ? '#f4f7f8' : '#121a1f');
    }

    aplicarPestanias();
  }

  function aplicarPestanias() {
    const i = ajustes();
    U.$$('.pestania').forEach((boton) => {
      const vista = boton.dataset.vista;
      if (vista === 'hoy') return;                   // esa no se esconde
      const visible = i.pestanias[vista] !== false;
      boton.classList.toggle('oculto', !visible);
    });
  }

  /** Un color con transparencia, para los fondos suaves. */
  function conAlfa(hex, alfa) {
    const m = /^#?([0-9a-f]{6})$/i.exec(String(hex).trim());
    if (!m) return 'transparent';
    const n = parseInt(m[1], 16);
    return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alfa})`;
  }

  // ───────── Cambiar ─────────

  /**
   * Esconde o muestra una parte. Devuelve { ok, nombre, motivo }.
   * Si estás en la pestaña que acabas de esconder, te saca a Hoy: si no,
   * te quedarías mirando una pantalla a la que ya no puedes volver.
   */
  function verPestania(clave, visible) {
    if (clave === 'hoy') {
      return { ok: false, motivo: 'hoy', nombre: 'Hoy' };
    }
    if (!PESTANIAS[clave]) {
      return { ok: false, motivo: 'no-existe' };
    }

    const i = ajustes();
    i.pestanias[clave] = !!visible;
    Almacen.guardar();
    aplicarPestanias();

    if (!visible && App.vistaActual === clave) App.ir('hoy');

    return { ok: true, nombre: PESTANIAS[clave].nombre };
  }

  function ponerTema(tema) {
    const i = ajustes();
    i.tema = tema === 'claro' ? 'claro' : 'oscuro';
    Almacen.guardar();
    aplicar();
    return i.tema;
  }

  /** `color` puede ser un nombre ("verde") o un hex. null vuelve al de fábrica. */
  function ponerAcento(color) {
    const i = ajustes();
    if (!color) {
      i.acento = null;
    } else {
      const hex = COLORES[normalizar(color)] || (/^#?[0-9a-f]{6}$/i.test(color)
        ? (color[0] === '#' ? color : '#' + color) : null);
      if (!hex) return null;
      i.acento = hex;
    }
    Almacen.guardar();
    aplicar();
    return i.acento;
  }

  // ───────── Entender lo que te piden ─────────

  function normalizar(t) {
    return String(t || '').toLowerCase()
      .normalize('NFD').replace(/[̀-ͯ]/g, '');
  }

  /** ¿De qué pestaña está hablando? Devuelve la clave o null. */
  function pestaniaEn(texto) {
    const t = normalizar(texto);
    for (const clave of Object.keys(PESTANIAS)) {
      if (PESTANIAS[clave].alias.some((a) => t.includes(a))) return clave;
    }
    if (/\bhoy\b/.test(t)) return 'hoy';
    return null;
  }

  /** ¿Pidió un color concreto? Devuelve su nombre o null. */
  function colorEn(texto) {
    const t = normalizar(texto);
    for (const nombre of Object.keys(COLORES)) {
      if (t.includes(nombre)) return nombre;
    }
    return null;
  }

  /** ¿Pidió claro u oscuro? */
  function temaEn(texto) {
    const t = normalizar(texto);
    if (/\b(claro|clarito|blanco|dia|brillante|iluminad)/.test(t)) return 'claro';
    if (/\b(oscuro|oscurito|negro|noche|apagad)/.test(t)) return 'oscuro';
    return null;
  }

  /** Para pintar la lista en Ajustes. */
  function lista() {
    const i = ajustes();
    return Object.keys(PESTANIAS).map((clave) => ({
      clave,
      nombre: PESTANIAS[clave].nombre,
      visible: i.pestanias[clave] !== false
    }));
  }

  function nombreDe(clave) {
    return PESTANIAS[clave] ? PESTANIAS[clave].nombre : clave;
  }

  return {
    PESTANIAS, COLORES,
    aplicar, ajustes, lista, nombreDe,
    verPestania, ponerTema, ponerAcento,
    pestaniaEn, colorEn, temaEn
  };
})();
