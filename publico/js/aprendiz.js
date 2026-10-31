/* ===========================================================
   aprendiz.js — la parte que SÍ aprende de ti.

   Qué es: un clasificador Naive Bayes entrenado con tus propias
   frases. Aprende a reconocer QUÉ quieres decir. Vive en tu
   teléfono, no usa internet ni ninguna API, y mejora cada vez
   que le enseñas.

   Qué NO es: no inventa texto como ChatGPT. Las respuestas salen
   de tus números reales, no de un modelo que las imagina. Eso es
   a propósito: en plata, inventar es peligroso.

   Cómo aprende: cuando no está seguro, te pregunta qué querías
   decir. Tu respuesta se guarda como ejemplo. A las pocas veces
   ya reconoce tu forma de hablar.
   =========================================================== */

const Aprendiz = (() => {

  /** Palabras que no aportan para distinguir una intención de otra. */
  const VACIAS = new Set([
    'que', 'de', 'la', 'el', 'en', 'y', 'a', 'los', 'las', 'un', 'una',
    'por', 'con', 'para', 'mi', 'me', 'se', 'lo', 'le', 'su', 'es', 'al',
    'del', 'yo', 'ya', 'si', 'pero', 'como', 'mas', 'muy', 'este', 'esta',
    'eso', 'esa', 'ese', 'hay', 'he', 'ha', 'soy', 'son', 'era', 'the'
  ]);

  /**
   * Las intenciones que la app sabe atender.
   * `ejemplos` son las semillas: con eso ya funciona el primer día,
   * y lo que tú le enseñes se suma encima.
   */
  const INTENCIONES = {
    pagar_plan: {
      etiqueta: 'Planear el pago de una deuda',
      ejemplos: [
        'quiero pagar lo de entel en marzo',
        'pienso cancelar esa deuda en diciembre',
        'voy a pagar el banco en enero del 2027',
        'planeo saldar la universidad en tres meses',
        'cuando saque mi bachiller pago esa deuda'
      ]
    },
    agregar_deuda: {
      etiqueta: 'Anotar una deuda nueva',
      ejemplos: [
        'tengo otra deuda',
        'me acorde de otra deuda',
        'debo plata a alguien mas',
        'quiero agregar una deuda',
        'tengo una deuda nueva que no anote',
        'me falto poner una deuda'
      ]
    },
    registrar_gasto: {
      etiqueta: 'Anotar un gasto',
      ejemplos: [
        'gaste veinte en el almuerzo',
        'gaste 20 soles en el taxi',
        'gaste plata',
        'compre pan',
        'me compre algo',
        'pague el pasaje',
        'se me fueron treinta soles',
        'anota un gasto de quince',
        'anota este gasto',
        'salio plata'
      ]
    },
    registrar_ingreso: {
      etiqueta: 'Anotar que entró dinero',
      ejemplos: [
        'me pagaron',
        'entro plata',
        'me depositaron el sueldo',
        'gane un extra haciendo una changa',
        'cobre un trabajito'
      ]
    },
    deseo: {
      etiqueta: 'Quiero algo y no sé si puedo',
      ejemplos: [
        'quiero salir con una chica y no tengo plata',
        'me gustaria comprarme unas zapatillas',
        'quiero invitar a alguien a salir',
        'tengo ganas de darme un gusto',
        'quisiera viajar pero estoy con deudas'
      ]
    },
    no_alcanza: {
      etiqueta: 'No me alcanza la plata',
      ejemplos: [
        'no me alcanza',
        'no tengo plata',
        'estoy ahogado con las deudas',
        'no puedo pagar nada este mes',
        'ando corto de dinero'
      ]
    },
    cuanto_puedo: {
      etiqueta: 'Cuánto puedo gastar',
      ejemplos: [
        'cuanto puedo gastar hoy',
        'cuanto me queda',
        'cuanta plata tengo disponible',
        'puedo gastar algo hoy'
      ]
    },
    agregar_pendiente: {
      etiqueta: 'Anotar algo que tengo que hacer',
      ejemplos: [
        'tengo que llamar al banco',
        'recuerdame lavar la ropa',
        'manana tengo reunion',
        'anota que debo ir al medico',
        'tengo un pendiente'
      ]
    },
    animo: {
      etiqueta: 'Me siento mal / sin energía',
      ejemplos: [
        'estoy mal',
        'no tengo ganas de nada',
        'me siento agobiado',
        'hoy no puedo con nada',
        'estoy triste y cansado'
      ]
    },
    ocultar_apartado: {
      etiqueta: 'Esconder una parte de la app',
      ejemplos: [
        'no quiero que me aparezca el boton de calendario',
        'quita el calendario',
        'saca la agenda',
        'esconde las deudas',
        'no quiero ver la pestaña de dinero',
        'quitame el chat de abajo',
        'oculta esa seccion',
        'no me muestres los pendientes'
      ]
    },
    mostrar_apartado: {
      etiqueta: 'Volver a mostrar una parte',
      ejemplos: [
        'quiero que aparezca el calendario',
        'devuelveme la agenda',
        'muestra las deudas otra vez',
        'pon de vuelta la pestaña de dinero',
        'quiero ver los pendientes de nuevo',
        'activa esa seccion'
      ]
    },
    cambiar_color: {
      etiqueta: 'Cambiar los colores',
      ejemplos: [
        'quiero la app mas clara',
        'ponlo mas claro',
        'cambia los colores',
        'me gusta el verde',
        'ponlo en azul',
        'quiero el modo oscuro',
        'cambia el color a morado',
        'esta muy oscuro para mi'
      ]
    },
    saludo: {
      etiqueta: 'Saludar',
      ejemplos: [
        'hola', 'buenas', 'hey que tal', 'buenos dias',
        'hola calma', 'buenas tardes', 'buenas noches',
        'que tal', 'holaa', 'oe'
      ]
    }
  };

  // ───────── Preparar el texto ─────────

  /** Minúsculas, sin tildes, solo letras y números. */
  function normalizar(texto) {
    return String(texto || '')
      .toLowerCase()
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9ñ\s]/g, ' ');
  }

  /**
   * Parte la frase en piezas. Además de las palabras sueltas guardamos
   * los pares seguidos ("otra deuda"), que distinguen mucho mejor.
   */
  function piezas(texto) {
    const palabras = normalizar(texto)
      .split(/\s+/)
      .filter((p) => p.length >= 2 && !VACIAS.has(p));

    const salida = palabras.slice();
    for (let i = 0; i < palabras.length - 1; i++) {
      salida.push(palabras[i] + '_' + palabras[i + 1]);
    }
    return salida;
  }

  // ───────── El modelo ─────────

  /** Todos los ejemplos: las semillas más lo que tú le enseñaste. */
  function ejemplos() {
    const mios = Almacen.get().entrenamiento || [];
    const base = [];
    for (const clave of Object.keys(INTENCIONES)) {
      for (const texto of INTENCIONES[clave].ejemplos) {
        base.push({ texto, intencion: clave, semilla: true });
      }
    }
    return base.concat(mios);
  }

  /**
   * Arma las cuentas del clasificador. Se recalcula cuando cambian
   * los ejemplos; con estos tamaños es instantáneo.
   */
  let cache = null;
  let cacheFirma = '';

  function modelo() {
    const datos = ejemplos();
    const firma = datos.length + ':' + (Almacen.get().entrenamiento || []).length;
    if (cache && cacheFirma === firma) return cache;

    const conteo = {};       // intencion -> { pieza: veces }
    const totalPiezas = {};  // intencion -> total de piezas
    const porIntencion = {}; // intencion -> cuántos ejemplos
    const vocabulario = new Set();

    for (const ej of datos) {
      const i = ej.intencion;
      conteo[i] = conteo[i] || {};
      totalPiezas[i] = totalPiezas[i] || 0;
      porIntencion[i] = (porIntencion[i] || 0) + 1;

      for (const p of piezas(ej.texto)) {
        conteo[i][p] = (conteo[i][p] || 0) + 1;
        totalPiezas[i]++;
        vocabulario.add(p);
      }
    }

    cache = { conteo, totalPiezas, porIntencion, vocabulario, total: datos.length };
    cacheFirma = firma;
    return cache;
  }

  /** Para que el modelo se recalcule tras enseñarle algo. */
  function olvidarCache() { cache = null; cacheFirma = ''; exactas = null; }

  /**
   * Memoria de frases tal cual: texto normalizado -> intención.
   * Lo que tú enseñaste pesa más que las semillas, porque si enseñaste
   * esa frase exacta es que la anterior estaba mal.
   */
  let exactas = null;

  function buscarExacta(texto) {
    const clave = normalizar(texto).replace(/\s+/g, ' ').trim();
    if (!clave) return null;

    if (!exactas) {
      exactas = {};
      for (const ej of ejemplos()) {
        const k = normalizar(ej.texto).replace(/\s+/g, ' ').trim();
        if (!k) continue;
        // Las tuyas sobrescriben a las de fábrica
        if (!ej.semilla || !(k in exactas)) exactas[k] = ej.intencion;
      }
    }
    return exactas[clave] || null;
  }

  // ───────── Clasificar ─────────

  /**
   * ¿De qué está hablando?
   * Devuelve { intencion, confianza (0-1), seguro, ranking }.
   * Si no reconoce ninguna pieza, devuelve intencion null: ahí es
   * donde el chat pregunta y aprende.
   */
  function clasificar(texto) {
    // Primero la memoria exacta: si esta frase ya está entre los
    // ejemplos (porque se la enseñaste o viene de fábrica), no hay
    // nada que calcular. Si no, con frases de una palabra —"hola",
    // "gracias"— las probabilidades quedan tan parejas que la app
    // acabaría preguntando "¿qué quisiste decir?" a un saludo.
    const exacta = buscarExacta(texto);
    if (exacta) {
      return { intencion: exacta, confianza: 1, seguro: true, exacta: true, ranking: [exacta] };
    }

    const m = modelo();
    const trozos = piezas(texto);

    // Si ninguna pieza le suena, no vale la pena adivinar
    const conocidas = trozos.filter((p) => m.vocabulario.has(p));
    if (!trozos.length || !conocidas.length) {
      return { intencion: null, confianza: 0, seguro: false, ranking: [] };
    }

    const V = m.vocabulario.size;
    const puntajes = [];

    for (const i of Object.keys(m.porIntencion)) {
      // log P(intencion)
      let s = Math.log(m.porIntencion[i] / m.total);
      // log P(pieza | intencion), con suavizado de Laplace
      for (const p of trozos) {
        const veces = (m.conteo[i][p] || 0) + 1;
        s += Math.log(veces / (m.totalPiezas[i] + V));
      }
      puntajes.push({ intencion: i, puntaje: s });
    }

    puntajes.sort((a, b) => b.puntaje - a.puntaje);

    // Confianza: qué tan lejos quedó el primero del segundo,
    // normalizado para que sea un número entre 0 y 1.
    const mejor = puntajes[0];
    const segundo = puntajes[1] || { puntaje: mejor.puntaje - 1 };
    const brecha = mejor.puntaje - segundo.puntaje;
    const cobertura = conocidas.length / trozos.length;
    const confianza = Math.max(0, Math.min(1, (1 - Math.exp(-brecha)) * cobertura));

    return {
      intencion: mejor.intencion,
      confianza,
      seguro: confianza >= 0.45,
      ranking: puntajes.slice(0, 3).map((x) => x.intencion)
    };
  }

  // ───────── Aprender ─────────

  /** Guarda una frase tuya como ejemplo de una intención. */
  function aprender(texto, intencion) {
    if (!texto || !INTENCIONES[intencion]) return false;
    const e = Almacen.get();
    e.entrenamiento = e.entrenamiento || [];

    const yaEsta = e.entrenamiento.some((x) =>
      normalizar(x.texto) === normalizar(texto) && x.intencion === intencion);
    if (!yaEsta) {
      e.entrenamiento.push({
        id: U.id(), texto: String(texto).slice(0, 200),
        intencion, fecha: U.hoy()
      });
      if (e.entrenamiento.length > 500) e.entrenamiento = e.entrenamiento.slice(-500);
    }
    olvidarCache();
    Almacen.guardar();
    return true;
  }

  /** Quita un ejemplo que enseñaste mal. */
  function olvidar(id) {
    const e = Almacen.get();
    e.entrenamiento = (e.entrenamiento || []).filter((x) => x.id !== id);
    olvidarCache();
    Almacen.guardar();
  }

  /** Cuánto ha aprendido, para mostrárselo. */
  function progreso() {
    const mios = Almacen.get().entrenamiento || [];
    const porIntencion = {};
    for (const x of mios) {
      porIntencion[x.intencion] = (porIntencion[x.intencion] || 0) + 1;
    }
    return {
      ejemplosTuyos: mios.length,
      semillas: Object.keys(INTENCIONES)
        .reduce((n, k) => n + INTENCIONES[k].ejemplos.length, 0),
      porIntencion,
      intencionesCubiertas: Object.keys(porIntencion).length,
      intencionesTotales: Object.keys(INTENCIONES).length
    };
  }

  /** Lista para pintar botones de "¿qué querías decir?". */
  function listaIntenciones() {
    return Object.keys(INTENCIONES).map((clave) => ({
      clave, etiqueta: INTENCIONES[clave].etiqueta
    }));
  }

  function etiquetaDe(clave) {
    return INTENCIONES[clave] ? INTENCIONES[clave].etiqueta : clave;
  }

  return {
    INTENCIONES, normalizar, piezas,
    clasificar, aprender, olvidar, progreso,
    listaIntenciones, etiquetaDe, olvidarCache
  };
})();
