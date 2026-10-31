/* ===========================================================
   util.js — herramientas pequeñas que usa toda la app.
   Todo en hora LOCAL del teléfono (nada de UTC) para que
   "hoy" sea realmente hoy en Perú.
   =========================================================== */

const U = (() => {

  // ───────── Fechas ─────────

  const DIA_MS = 86400000;

  /** Fecha de hoy como "AAAA-MM-DD" en hora local. */
  function hoy() { return aISO(new Date()); }

  /** Convierte un Date a "AAAA-MM-DD" local. */
  function aISO(fecha) {
    const d = new Date(fecha);
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const dia = String(d.getDate()).padStart(2, '0');
    return `${d.getFullYear()}-${m}-${dia}`;
  }

  /** Convierte "AAAA-MM-DD" a Date local a las 00:00. */
  function deISO(iso) {
    const [a, m, d] = String(iso).split('-').map(Number);
    return new Date(a, (m || 1) - 1, d || 1, 0, 0, 0, 0);
  }

  /** Suma días a una fecha ISO y devuelve ISO. */
  function sumarDias(iso, dias) {
    const d = deISO(iso);
    d.setDate(d.getDate() + dias);
    return aISO(d);
  }

  /** Días enteros entre dos fechas ISO (b - a). */
  function diasEntre(a, b) {
    return Math.round((deISO(b) - deISO(a)) / DIA_MS);
  }

  /** "AAAA-MM-DD" + "HH:MM" -> marca de tiempo local en ms. */
  function marca(iso, hora) {
    const d = deISO(iso);
    if (hora) {
      const [h, mi] = String(hora).split(':').map(Number);
      d.setHours(h || 0, mi || 0, 0, 0);
    }
    return d.getTime();
  }

  const DIAS_CORTO = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
  const DIAS_LARGO = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
  const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
                 'julio', 'agosto', 'setiembre', 'octubre', 'noviembre', 'diciembre'];

  /** "lunes 27 de octubre" */
  function fechaLarga(iso) {
    const d = deISO(iso);
    return `${DIAS_LARGO[d.getDay()]} ${d.getDate()} de ${MESES[d.getMonth()]}`;
  }

  /** "27 oct" */
  function fechaCorta(iso) {
    const d = deISO(iso);
    return `${d.getDate()} ${MESES[d.getMonth()].slice(0, 3)}`;
  }

  /** Texto amable y relativo: "hoy", "mañana", "en 3 días", "hace 2 días". */
  function cuando(iso) {
    const d = diasEntre(hoy(), iso);
    if (d === 0) return 'hoy';
    if (d === 1) return 'mañana';
    if (d === -1) return 'ayer';
    if (d > 1 && d <= 7) return `en ${d} días`;
    if (d < -1 && d >= -7) return `hace ${-d} días`;
    return fechaCorta(iso);
  }

  /** Hora actual como "HH:MM". */
  function horaAhora() {
    const d = new Date();
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }

  /** Primer día (lunes) de la semana que contiene a iso. */
  function lunesDe(iso) {
    const d = deISO(iso);
    const desfase = (d.getDay() + 6) % 7; // domingo=0 -> 6
    d.setDate(d.getDate() - desfase);
    return aISO(d);
  }

  // ───────── Dinero ─────────

  /** 1234.5 -> "S/ 1,234.50" */
  function soles(n) {
    const v = Number(n) || 0;
    const signo = v < 0 ? '−' : '';
    return signo + 'S/ ' + Math.abs(v).toLocaleString('es-PE', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  }

  /** 1234.5 -> "S/ 1,235" (para el número gigante, menos ruido visual) */
  function solesCorto(n) {
    const v = Number(n) || 0;
    const signo = v < 0 ? '−' : '';
    return signo + 'S/ ' + Math.abs(v).toLocaleString('es-PE', {
      minimumFractionDigits: 0,
      maximumFractionDigits: Math.abs(v) < 100 ? 2 : 0
    });
  }

  /** Lee un número de un input aceptando coma o punto decimal. */
  function numero(texto) {
    const n = parseFloat(String(texto == null ? '' : texto).replace(',', '.').replace(/[^\d.\-]/g, ''));
    return isFinite(n) ? n : 0;
  }

  function redondear(n, decimales = 2) {
    const f = Math.pow(10, decimales);
    return Math.round((Number(n) || 0) * f) / f;
  }

  // ───────── DOM ─────────

  const $  = (sel, raiz = document) => raiz.querySelector(sel);
  const $$ = (sel, raiz = document) => Array.from(raiz.querySelectorAll(sel));

  /** Escapa texto del usuario antes de meterlo en HTML. */
  function esc(t) {
    return String(t == null ? '' : t)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  /** Delegación de eventos: U.al('click', '.item', fn, contenedor) */
  function al(evento, selector, fn, raiz = document) {
    raiz.addEventListener(evento, (e) => {
      const destino = e.target.closest(selector);
      if (destino && raiz.contains(destino)) fn(e, destino);
    });
  }

  /** Vibración corta de confirmación (si el equipo la soporta). */
  function vibrar(ms = 18) {
    try { if (navigator.vibrate) navigator.vibrate(ms); } catch (e) {}
  }

  // ───────── Identificadores y PIN ─────────

  /** Id corto único y ordenable por tiempo. */
  function id() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  /** Hash SHA-256 en hexadecimal (para guardar el PIN sin texto plano). */
  async function hash(texto) {
    const datos = new TextEncoder().encode(texto);
    const buf = await crypto.subtle.digest('SHA-256', datos);
    return Array.from(new Uint8Array(buf))
      .map((b) => b.toString(16).padStart(2, '0')).join('');
  }

  // ───────── Varios ─────────

  /** Agrupa un arreglo por el resultado de fn. */
  function agrupar(lista, fn) {
    const mapa = {};
    for (const x of lista) {
      const k = fn(x);
      (mapa[k] = mapa[k] || []).push(x);
    }
    return mapa;
  }

  function suma(lista, fn = (x) => x) {
    return lista.reduce((t, x) => t + (Number(fn(x)) || 0), 0);
  }

  /** Espera a que pase el tiempo sin nuevas llamadas (para el sync). */
  function esperar(fn, ms = 600) {
    let t;
    return (...args) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...args), ms);
    };
  }

  /** Elige un elemento al azar (mensajes amables variados). */
  function azar(lista) {
    return lista[Math.floor(Math.random() * lista.length)];
  }

  return {
    DIA_MS, DIAS_CORTO, DIAS_LARGO, MESES,
    hoy, aISO, deISO, sumarDias, diasEntre, marca,
    fechaLarga, fechaCorta, cuando, horaAhora, lunesDe,
    soles, solesCorto, numero, redondear,
    $, $$, esc, al, vibrar,
    id, hash, agrupar, suma, esperar, azar
  };
})();
