/* ===========================================================
   almacen.js — todos los datos viven en el teléfono.
   Un solo objeto `estado` guardado en localStorage.
   El backend solo se usa para notificaciones y respaldo.
   =========================================================== */

const Almacen = (() => {

  const CLAVE = 'calma.estado.v1';
  const VERSION = 1;

  /* ---------- Estado inicial ----------
     IMPORTANTE: ningún monto viene con valor por defecto.
     Todo lo digita el usuario en el asistente o en Ajustes. */
  function vacio() {
    return {
      version: VERSION,
      configurado: false,

      // PIN de 4 dígitos (se guarda solo el hash + sal)
      pin: { hash: null, sal: null },

      ajustes: {
        nombre: '',

        // Ingresos irregulares (el usuario los define)
        diasMaximos: null,     // días máximos entre pagos (peor caso)
        montoPago: null,       // monto aproximado del pago
        ultimoPago: null,      // "AAAA-MM-DD" del último "Me pagaron"
        saldoArrastrado: 0,    // lo que sobró del periodo anterior

        // Fondo de comida intocable
        comidaPorDia: null,
        recordarComida: true,
        horasComida: ['08:00', '13:30', '19:30'],

        // Notificaciones
        notificaciones: false,
        horaDeudas: '09:00',       // hora de los avisos de cuotas

        // Aviso diario para acordarse de la app.
        // Lo manda el servidor, no la app: así sigue llegando
        // aunque pasen semanas sin abrirla.
        recordarEntrar: true,
        horaEntrar: '20:00',
        ultimaVisita: null,        // último día que abrió la app
        avisoReunionMin: 30,       // minutos antes de una reunión
        resumenDia: 0,             // 0 = domingo
        resumenHora: '19:00',

        // Deudas
        estrategia: 'bola',        // 'bola' (bola de nieve) | 'avalancha'

        // Reparto automático del ingreso.
        //   'auto'        → la app calcula el reparto con tus números reales
        //   'porcentajes' → tú mandas: 50 % obligaciones, 30 % tuyo, 20 % ahorro
        // Los porcentajes son editables; estos son solo el punto de partida.
        modoReparto: 'auto',
        reparto: { obligaciones: 50, personales: 30, ahorro: 20 },

        // Plan mensual automático
        ritmoPlan: 'normal',       // 'suave' | 'normal' | 'intenso'
        presupuesto: {},           // montos fijados a mano por categoría
        atrasadosVistos: null,     // día en que escondió la tarjeta de atrasados

        // Meta de fondo de emergencia
        metaEmergencia: null,
        ahorroEmergencia: 0,

        // El PIN está apagado: la app vive en un solo teléfono, que ya
        // tiene su propio bloqueo. Quien quiera una capa más lo
        // enciende en Ajustes.
        usarPin: false,

        // La app es suya: qué partes se ven y de qué color.
        // Todo esto se cambia hablando con el chat ("quita el calendario",
        // "ponlo más claro") o desde Ajustes, para quien prefiera botones.
        interfaz: {
          // Hoy no está en la lista a propósito: es la pantalla del número
          // y quitarla dejaría la app sin su razón de existir.
          pestanias: {
            dinero: true, deudas: true, agenda: true, chat: true, resumen: true
          },
          tema: 'oscuro',    // 'oscuro' | 'claro'
          acento: null       // color elegido; null = el de fábrica
        },

        // Qué preguntas de la entrada ya se hicieron alguna vez.
        // Si saltaste una, no se vuelve a preguntar sola: aparece como
        // "me falta saber esto" y la contestas cuando quieras.
        preguntado: {},

        // Modo pruebas: entrar SIEMPRE como si fuera la primera vez,
        // con todas las preguntas, para poder revisar ese flujo.
        // Los datos no se pierden: las respuestas vienen rellenadas
        // con lo que ya tienes guardado. Se apaga en Ajustes.
        modoPruebas: false,

        // Modo día difícil
        tareaMinima: '',
        dificilHasta: null,        // "AAAA-MM-DD" en que está activo
        dificilHechoEn: null,      // día en que marcó su tarea mínima

        // Backend (se completa en Ajustes; nunca viene en el código)
        apiUrl: '',
        token: ''
      },

      // Categorías sugeridas, todas editables y borrables
      categorias: [
        { id: 'comida',     nombre: 'Comida',     emoji: '🍚', tipo: 'gasto' },
        { id: 'transporte', nombre: 'Transporte', emoji: '🚌', tipo: 'gasto' },
        { id: 'deudas',     nombre: 'Deudas',     emoji: '🧾', tipo: 'gasto' },
        { id: 'gustos',     nombre: 'Gustos',     emoji: '🎁', tipo: 'gasto' },
        { id: 'otros',      nombre: 'Otros',      emoji: '📦', tipo: 'gasto' },
        { id: 'pago',       nombre: 'Pago',       emoji: '💰', tipo: 'ingreso' },
        { id: 'extra',      nombre: 'Extra',      emoji: '✨', tipo: 'ingreso' }
      ],

      movimientos: [],   // gastos e ingresos
      gastosFijos: [],   // alquiler, celular, etc.

      // Salidas de dinero que la app ya sabe que ocurrieron, pero sin
      // saber en qué fueron. Llegan del correo (Yape, Plin, el banco) o
      // las anotas tú de apuro con solo el monto. Después, en un toque,
      // dices en qué fue y recién ahí se vuelven un gasto normal.
      porClasificar: [],


      deudas: [],
      pendientes: [],
      rutinas: [],

      // Cada "Me pagaron": sirve para aprender cada cuánto le pagan de verdad
      historialPagos: [], // [{ fecha, monto }]

      chat: [],           // conversación con la app
      planes: [],         // planes de pago que dijo en el chat
      entrenamiento: [],  // frases suyas con las que entrenó al chat

      // Cuántas veces usas cada cosa. Con esto la app se acomoda a ti:
      // lo que más tocas sube, lo que nunca tocas deja de estorbar.
      // Son solo contadores, nada de lo que haces sale del teléfono.
      uso: {},

      diasActivos: [],    // días con al menos 1 cosa hecha (racha flexible)
      diasDificiles: [],  // días marcados como difíciles
      avisosDados: {},    // { "AAAA-MM-DD": {ochenta:true, cien:true} }
      logros: []          // celebraciones guardadas
    };
  }

  let estado = vacio();
  const oyentes = [];

  // ───────── Carga y guardado ─────────

  function cargar() {
    try {
      const crudo = localStorage.getItem(CLAVE);
      if (crudo) {
        estado = migrar(JSON.parse(crudo));
      }
    } catch (e) {
      console.warn('No se pudo leer el estado guardado:', e);
    }
    return estado;
  }

  /** Rellena claves nuevas si la app se actualizó. */
  function migrar(guardado) {
    const base = vacio();
    // Object.assign(base, guardado) pisa base.ajustes con el del respaldo,
    // así que hay que apartar los valores por defecto ANTES de mezclar.
    // Si no, ninguna opción nueva llega a quien ya tenía datos guardados.
    const ajustesPorDefecto = base.ajustes;
    const pinPorDefecto = base.pin;

    const fusion = Object.assign(base, guardado);
    fusion.ajustes = Object.assign({}, ajustesPorDefecto, guardado.ajustes || {});
    fusion.pin = Object.assign({}, pinPorDefecto, guardado.pin || {});
    fusion.version = VERSION;
    // Normaliza arreglos que pudieran faltar
    for (const k of ['categorias', 'movimientos', 'gastosFijos', 'deudas',
                     'pendientes', 'rutinas', 'diasActivos', 'diasDificiles',
                     'logros', 'historialPagos', 'chat', 'planes', 'entrenamiento',
                     'porClasificar']) {
      if (!Array.isArray(fusion[k])) fusion[k] = base[k];
    }
    // El reparto es un objeto anidado: Object.assign no lo mezcla solo
    fusion.ajustes.reparto = Object.assign(
      { obligaciones: 50, personales: 30, ahorro: 20 },
      (guardado.ajustes && guardado.ajustes.reparto) || {}
    );
    if (!fusion.ajustes.preguntado || typeof fusion.ajustes.preguntado !== 'object') {
      fusion.ajustes.preguntado = {};
    }
    // La interfaz también va anidada: hay que mezclarla a mano.
    // Ojo: `base.ajustes` ya fue pisado por el respaldo; los valores de
    // fábrica están en `ajustesPorDefecto`, que apartamos antes.
    const iBase = ajustesPorDefecto.interfaz;
    const iGuardada = (guardado.ajustes && guardado.ajustes.interfaz) || {};
    fusion.ajustes.interfaz = Object.assign({}, iBase, iGuardada);
    fusion.ajustes.interfaz.pestanias = Object.assign(
      {}, iBase.pestanias, iGuardada.pestanias || {});
    if (!fusion.avisosDados || typeof fusion.avisosDados !== 'object') fusion.avisosDados = {};
    if (!fusion.uso || typeof fusion.uso !== 'object') fusion.uso = {};
    return fusion;
  }

  function guardar() {
    // Antes de cada guardado nos aseguramos de que los logros sigan siendo ciertos
    revisarLogros();
    try {
      localStorage.setItem(CLAVE, JSON.stringify(estado));
    } catch (e) {
      console.warn('No se pudo guardar:', e);
    }
    oyentes.forEach((fn) => { try { fn(estado); } catch (e) {} });
  }

  /** Se llama tras cualquier cambio. */
  function alCambiar(fn) { oyentes.push(fn); }

  /**
   * Los logros tienen que seguir siendo verdad.
   * Si una deuda vuelve a tener saldo (porque el pago fue un error y se
   * borró), su celebración ya no corresponde y se quita.
   *
   * Si la deuda ya no está en la lista, el logro se queda: lo pagó de
   * verdad y después limpió el historial. Eso sí fue suyo.
   */
  function revisarLogros() {
    const antes = estado.logros.length;
    estado.logros = estado.logros.filter((l) => {
      const m = /^Terminaste de pagar (.+)$/.exec(String(l.texto || ''));
      if (!m) return true;
      const d = estado.deudas.find((x) => x.acreedor === m[1]);
      if (!d) return true;
      return !!d.terminada;
    });
    return antes - estado.logros.length;
  }

  function get() { return estado; }
  function ajustes() { return estado.ajustes; }

  // ───────── Mantenimiento al abrir la app ─────────

  /**
   * Arrastra pendientes no hechos de días pasados a hoy.
   * Nunca se marcan como "fallidos": solo cambian de fecha.
   * Devuelve cuántos se movieron (para avisar con tono amable).
   */
  function arrastrarPendientes() {
    const h = U.hoy();
    let movidos = 0;
    for (const p of estado.pendientes) {
      const repite = p.repetir && p.repetir.tipo !== 'no';
      if (repite || p.hecha) continue;
      if (p.fecha && U.diasEntre(p.fecha, h) > 0) {
        p.fecha = h;
        p.arrastres = (p.arrastres || 0) + 1;
        // Las reuniones con hora pasada no se arrastran: ya ocurrieron.
        if (p.tipo === 'reunion') { p.hecha = true; p.hechaEn = p.fecha; p.arrastres--; }
        else movidos++;
      }
    }
    if (movidos) guardar();
    return movidos;
  }

  /** Limpia el modo día difícil si ya es otro día. */
  function revisarDiaDificil() {
    const a = estado.ajustes;
    if (a.dificilHasta && a.dificilHasta !== U.hoy()) {
      a.dificilHasta = null;
      guardar();
    }
    return !!a.dificilHasta;
  }

  function enDiaDificil() { return estado.ajustes.dificilHasta === U.hoy(); }

  // ───────── Uso: para que la app se acomode a ti ─────────

  /**
   * Cuenta una cosa que hiciste. No guarda cuándo ni con qué datos:
   * solo cuántas veces, para poder poner primero lo que más usas.
   *
   * No guarda inmediatamente: eso sería escribir en disco en cada toque.
   * Se guarda junto con el siguiente cambio de verdad.
   */
  function marcarUso(clave) {
    if (!clave) return;
    estado.uso = estado.uso || {};
    estado.uso[clave] = (estado.uso[clave] || 0) + 1;
  }

  function usoDe(clave) {
    return (estado.uso && estado.uso[clave]) || 0;
  }

  /**
   * Ordena una lista poniendo delante lo que más usas.
   * Empates y cosas nuevas se quedan donde estaban: la app no debe
   * bailar bajo el dedo. `clave` dice cómo sacar el nombre de cada uno.
   */
  function porMasUsado(lista, clave) {
    return lista
      .map((x, i) => ({ x, i, n: usoDe(clave(x)) }))
      .sort((a, b) => (b.n - a.n) || (a.i - b.i))
      .map((y) => y.x);
  }

  /** Cuántas veces abriste la app. Sirve para no adaptar nada demasiado pronto. */
  function aperturas() { return usoDe('abrir'); }

  // ───────── Racha flexible ─────────

  /** Marca el día como "activo" (hizo al menos 1 cosa). */
  function marcarActivo(fecha = U.hoy()) {
    if (!estado.diasActivos.includes(fecha)) {
      estado.diasActivos.push(fecha);
      estado.diasActivos.sort();
      // Guardamos como máximo un año de historia
      if (estado.diasActivos.length > 400) estado.diasActivos = estado.diasActivos.slice(-400);
    }
  }

  // ───────── Movimientos (gastos e ingresos) ─────────

  function agregarMovimiento(mov) {
    const m = Object.assign({
      id: U.id(),
      tipo: 'gasto',
      monto: 0,
      categoria: 'otros',
      nota: '',
      fecha: U.hoy(),
      hora: U.horaAhora(),
      creado: Date.now()
    }, mov);
    m.monto = U.redondear(Math.abs(U.numero(m.monto)));
    estado.movimientos.unshift(m);
    marcarActivo(m.fecha);
    guardar();
    return m;
  }

  /**
   * Borra un movimiento. Si era el pago de una deuda, deshace el pago:
   * le devuelve el saldo y, si había quedado pagada, la reabre.
   * Así un error no deja la deuda en cero para siempre.
   */
  function borrarMovimiento(id) {
    const m = estado.movimientos.find((x) => x.id === id);

    if (m && m.refDeuda) {
      const d = estado.deudas.find((x) => x.id === m.refDeuda);
      if (d) {
        d.pagos = (d.pagos || []).filter((p) => p.id !== m.refPago);
        d.saldo = U.redondear(Math.min(d.total, d.saldo + m.monto));
        if (d.saldo > 0.009) {
          d.terminada = false;
          d.celebrada = false;
        }
      }
    }

    estado.movimientos = estado.movimientos.filter((x) => x.id !== id);
    guardar();   // guardar() revisa los logros y quita el que ya no aplica
  }

  /** Movimientos del periodo actual (desde el último pago). */
  function movimientosDelPeriodo() {
    const desde = estado.ajustes.ultimoPago;
    if (!desde) return estado.movimientos.slice();
    return estado.movimientos.filter((m) => U.diasEntre(desde, m.fecha) >= 0);
  }

  function movimientosDe(fecha) {
    return estado.movimientos.filter((m) => m.fecha === fecha);
  }

  /** Registra un nuevo pago recibido y empieza un periodo nuevo. */
  function registrarPago(monto, fecha = U.hoy()) {
    const a = estado.ajustes;
    // Lo que quedó sin gastar del periodo anterior se arrastra.
    const sobrante = Calculo.saldoActual();
    a.saldoArrastrado = U.redondear(Math.max(0, sobrante));

    // Guardamos el pago para aprender cada cuánto le pagan de verdad.
    // Con dos o más pagos, la app deja de usar el número que él estimó
    // y empieza a usar su ritmo real.
    estado.historialPagos = estado.historialPagos || [];
    if (!estado.historialPagos.some((p) => p.fecha === fecha)) {
      estado.historialPagos.push({ fecha, monto: U.redondear(U.numero(monto)) });
      estado.historialPagos.sort((x, y) => x.fecha.localeCompare(y.fecha));
      if (estado.historialPagos.length > 24) {
        estado.historialPagos = estado.historialPagos.slice(-24);
      }
    }

    a.ultimoPago = fecha;
    a.montoPago = U.redondear(U.numero(monto)) || a.montoPago;
    agregarMovimiento({ tipo: 'ingreso', monto, categoria: 'pago', nota: 'Pago recibido', fecha });
    estado.avisosDados = {}; // avisos del periodo anterior ya no aplican
    guardar();
    return a.saldoArrastrado;
  }

  // ───────── Gastos fijos ─────────

  function agregarFijo(f) {
    const x = Object.assign({
      id: U.id(),
      nombre: '',
      monto: 0,
      dia: 1,
      // Fijo de verdad (alquiler) o variable (luz, agua: cambia cada mes).
      // En los variables el monto es un aproximado y la app lo dice así.
      variable: false,
      // Cada cuántos meses toca. 1 = todos los meses, 2 = bimestral,
      // 3 = trimestral… Sirve para las compras que se repiten pero no
      // son mensuales: el gas, el mantenimiento de la moto, el seguro.
      cadaMeses: 1,
      // Mes de referencia desde el que se cuenta `cadaMeses`
      mesAncla: U.hoy().slice(0, 7),
      pagados: [],
      omitidos: []
    }, f);
    x.monto = U.redondear(U.numero(x.monto));
    x.cadaMeses = Math.max(1, Math.round(U.numero(x.cadaMeses)) || 1);
    estado.gastosFijos.push(x);
    guardar();
    return x;
  }

  /** Meses de diferencia entre dos "AAAA-MM". */
  function mesesEntre(a, b) {
    const x = String(a || '').split('-').map(Number);
    const y = String(b || '').split('-').map(Number);
    if (x.length < 2 || y.length < 2) return 0;
    return (y[0] - x[0]) * 12 + (y[1] - x[1]);
  }

  /** ¿A este pago fijo le toca caer en este mes? */
  function fijoTocaEnMes(f, mes = U.hoy().slice(0, 7)) {
    const cada = Math.max(1, Math.round(U.numero(f.cadaMeses)) || 1);
    if (cada === 1) return true;
    const ancla = f.mesAncla || String(f.creado || U.hoy()).slice(0, 7);
    const d = mesesEntre(ancla, mes);
    if (d < 0) return false;
    return d % cada === 0;
  }

  /**
   * Lo que un pago fijo cuesta POR MES en promedio.
   * El gas cada 3 meses a S/ 60 son S/ 20 al mes: así el presupuesto
   * ya lo tiene guardado cuando llegue, en vez de ser un susto.
   */
  function fijoMensualizado(f) {
    const cada = Math.max(1, Math.round(U.numero(f.cadaMeses)) || 1);
    return U.redondear(U.numero(f.monto) / cada);
  }

  // ───────── Gastos por clasificar ─────────

  /**
   * Entra una salida de dinero sin categoría: del correo o anotada
   * de apuro. No es un gasto todavía; no mueve ningún cálculo hasta
   * que la persona diga en qué fue.
   */
  function agregarPorClasificar(x) {
    const p = Object.assign({
      id: U.id(),
      monto: 0,
      origen: 'manual',      // 'yape' | 'plin' | 'banco' | 'manual'
      texto: '',             // lo que decía el aviso, para reconocerlo
      fecha: U.hoy(),
      hora: U.horaAhora(),
      creado: Date.now()
    }, x);
    p.monto = U.redondear(Math.abs(U.numero(p.monto)));
    if (p.monto <= 0) return null;
    // Si ya está (llegó dos veces del servidor), no lo duplicamos
    if (p.ref && estado.porClasificar.some((y) => y.ref === p.ref)) return null;
    estado.porClasificar.unshift(p);
    if (estado.porClasificar.length > 100) {
      estado.porClasificar = estado.porClasificar.slice(0, 100);
    }
    guardar();
    return p;
  }

  /** Le pone categoría y lo convierte en un gasto de verdad. */
  function clasificarGasto(id, categoria, nota) {
    const p = estado.porClasificar.find((x) => x.id === id);
    if (!p) return null;
    estado.porClasificar = estado.porClasificar.filter((x) => x.id !== id);
    return agregarMovimiento({
      tipo: 'gasto',
      monto: p.monto,
      categoria: categoria || 'otros',
      nota: nota || p.texto || '',
      fecha: p.fecha,
      hora: p.hora
    });
  }

  /** No era un gasto mío (una transferencia entre mis cuentas, un error). */
  function descartarPorClasificar(id) {
    estado.porClasificar = estado.porClasificar.filter((x) => x.id !== id);
    guardar();
  }

  function totalPorClasificar() {
    return U.redondear(U.suma(estado.porClasificar, (x) => x.monto));
  }

  function borrarFijo(id) {
    estado.gastosFijos = estado.gastosFijos.filter((f) => f.id !== id);
    guardar();
  }

  /** Marca un gasto fijo como pagado en el mes dado ("AAAA-MM"). */
  /**
   * Marca un pago fijo como pagado.
   * `montoReal` sirve para los variables (la luz vino S/ 72, no S/ 60):
   * se anota lo que de verdad salió y, de paso, se guarda como el nuevo
   * aproximado para el mes siguiente.
   */
  function pagarFijo(id, montoReal, mes = U.hoy().slice(0, 7)) {
    const f = estado.gastosFijos.find((x) => x.id === id);
    if (!f) return;
    if (!f.pagados.includes(mes)) f.pagados.push(mes);

    const monto = U.numero(montoReal) > 0 ? U.redondear(U.numero(montoReal)) : U.numero(f.monto);
    if (f.variable && monto > 0) f.monto = monto;   // el aproximado aprende solo

    // `fuente` marca el gasto como "ya apartado": no cuenta contra el límite diario.
    agregarMovimiento({
      tipo: 'gasto', monto, categoria: 'otros',
      nota: f.nombre, fuente: 'fijo'
    });
    return f;
  }

  // ───────── Deudas ─────────

  function agregarDeuda(d) {
    const x = Object.assign({
      id: U.id(),
      acreedor: '',
      total: 0,
      saldo: 0,
      cuota: 0,
      diaPago: 1,
      // Cómo se paga esta deuda:
      //   'mensual' → cada mes el día `diaPago`
      //   'vencida' → ya venció entera, se debe desde `vencidaDesde`
      //   'nosabe'  → no sabe cuándo ni cada cuánto (no genera avisos)
      frecuencia: 'mensual',
      vencidaDesde: null,
      // 'cuotas' → paga de a poco; 'total' → paga todo junto
      modoPago: 'cuotas',
      interes: 0,
      pagos: [],
      terminada: false,
      celebrada: false,
      // Deuda anotada sin saber el monto: no entra en los cálculos
      // hasta que la persona averigüe cuánto es.
      porConfirmar: false,
      // Meses perdonados por un arreglo con el acreedor ("AAAA-MM")
      omitidos: [],
      creada: U.hoy()
    }, d);
    x.total = U.redondear(U.numero(x.total));
    x.saldo = U.redondear(U.numero(x.saldo || x.total));
    x.cuota = U.redondear(U.numero(x.cuota));
    estado.deudas.push(x);
    guardar();
    return x;
  }

  /**
   * Cuánto toca pagar de una deuda.
   * Si se paga todo junto, lo que toca es el saldo completo;
   * así no hay que mantener dos números en sincronía.
   */
  function cuotaDe(deuda) {
    if (!deuda) return 0;
    if (deuda.modoPago === 'total') return U.numero(deuda.saldo);
    return U.numero(deuda.cuota);
  }

  function borrarDeuda(id) {
    estado.deudas = estado.deudas.filter((d) => d.id !== id);
    guardar();
  }

  /** Pago (total o parcial) de una deuda. Devuelve true si quedó pagada. */
  function pagarDeuda(id, monto, fecha = U.hoy()) {
    const d = estado.deudas.find((x) => x.id === id);
    if (!d) return false;
    const m = U.redondear(Math.abs(U.numero(monto)));
    const pago = { id: U.id(), monto: m, fecha };
    d.pagos.push(pago);
    d.saldo = U.redondear(Math.max(0, d.saldo - m));
    // Guardamos a qué deuda y a qué pago corresponde, para poder
    // deshacerlo entero si fue un error.
    agregarMovimiento({
      tipo: 'gasto', monto: m, categoria: 'deudas',
      nota: `Cuota · ${d.acreedor}`, fecha, fuente: 'deuda',
      refDeuda: d.id, refPago: pago.id
    });
    if (d.saldo <= 0.009 && !d.terminada) {
      d.terminada = true;
      estado.logros.push({
        id: U.id(),
        texto: `Terminaste de pagar ${d.acreedor}`,
        fecha
      });
      guardar();
      return true;
    }
    guardar();
    return false;
  }

  /**
   * Perdona la cuota o el pago fijo de un mes, porque la persona hizo
   * un arreglo con el acreedor. No es un pago: es dejar de contarlo.
   */
  function omitirMes(clase, id, mes = U.hoy().slice(0, 7)) {
    const lista = clase === 'deuda' ? estado.deudas : estado.gastosFijos;
    const x = lista.find((y) => y.id === id);
    if (!x) return null;
    x.omitidos = x.omitidos || [];
    if (!x.omitidos.includes(mes)) x.omitidos.push(mes);
    guardar();
    return x;
  }

  // ───────── Pendientes ─────────

  function agregarPendiente(p) {
    const x = Object.assign({
      id: U.id(),
      tipo: 'tarea',
      titulo: '',
      fecha: U.hoy(),
      hora: '',
      duracion: 60,
      lugar: '',
      prioridad: 'normal',
      notificar: true,
      avisoMin: estado.ajustes.avisoReunionMin,
      repetir: { tipo: 'no', dias: [] },
      subtareas: [],
      hechas: [],      // para los que se repiten
      hecha: false,    // para los de una sola vez
      hechaEn: null,
      arrastres: 0,
      creado: Date.now()
    }, p);
    estado.pendientes.push(x);
    guardar();
    return x;
  }

  function borrarPendiente(id) {
    estado.pendientes = estado.pendientes.filter((p) => p.id !== id);
    guardar();
  }

  /** ¿Este pendiente aplica en la fecha dada? */
  function aplicaEn(p, fecha) {
    const r = p.repetir || { tipo: 'no' };
    if (r.tipo === 'no') return p.fecha === fecha;
    if (U.diasEntre(p.fecha, fecha) < 0) return false;   // antes de empezar
    const d = U.deISO(fecha);
    switch (r.tipo) {
      case 'diaria':  return true;
      case 'dias':    return (r.dias || []).includes(d.getDay());
      case 'semanal': return d.getDay() === U.deISO(p.fecha).getDay();
      case 'mensual': return d.getDate() === U.deISO(p.fecha).getDate();
      default:        return false;
    }
  }

  function estaHecho(p, fecha = U.hoy()) {
    const repite = p.repetir && p.repetir.tipo !== 'no';
    return repite ? (p.hechas || []).includes(fecha) : !!p.hecha;
  }

  /** Alterna hecho/no hecho. Devuelve true si quedó hecho. */
  function alternarPendiente(id, fecha = U.hoy()) {
    const p = estado.pendientes.find((x) => x.id === id);
    if (!p) return false;
    const repite = p.repetir && p.repetir.tipo !== 'no';
    let quedoHecho;
    if (repite) {
      p.hechas = p.hechas || [];
      const i = p.hechas.indexOf(fecha);
      if (i >= 0) { p.hechas.splice(i, 1); quedoHecho = false; }
      else { p.hechas.push(fecha); quedoHecho = true; }
    } else {
      p.hecha = !p.hecha;
      p.hechaEn = p.hecha ? fecha : null;
      quedoHecho = p.hecha;
    }
    if (quedoHecho) marcarActivo(fecha);
    guardar();
    return quedoHecho;
  }

  function alternarSubtarea(idPendiente, idSub) {
    const p = estado.pendientes.find((x) => x.id === idPendiente);
    if (!p) return;
    const s = (p.subtareas || []).find((x) => x.id === idSub);
    if (!s) return;
    s.hecha = !s.hecha;
    if (s.hecha) marcarActivo();
    guardar();
    return s.hecha;
  }

  /** Pendientes de una fecha, ordenados: alta primero, luego por hora. */
  function pendientesDe(fecha = U.hoy()) {
    return estado.pendientes
      .filter((p) => aplicaEn(p, fecha))
      .map((p) => Object.assign({}, p, { hechoHoy: estaHecho(p, fecha) }))
      .sort((a, b) => {
        if (a.hechoHoy !== b.hechoHoy) return a.hechoHoy ? 1 : -1;
        if (a.prioridad !== b.prioridad) return a.prioridad === 'alta' ? -1 : 1;
        if (!!a.hora !== !!b.hora) return a.hora ? -1 : 1;
        return String(a.hora).localeCompare(String(b.hora));
      });
  }

  // ───────── Rutinas diarias ─────────

  function agregarRutina(titulo) {
    const r = { id: U.id(), titulo: String(titulo || '').trim(), activa: true, hechas: [] };
    if (!r.titulo) return null;
    estado.rutinas.push(r);
    guardar();
    return r;
  }

  function borrarRutina(id) {
    estado.rutinas = estado.rutinas.filter((r) => r.id !== id);
    guardar();
  }

  function alternarRutina(id, fecha = U.hoy()) {
    const r = estado.rutinas.find((x) => x.id === id);
    if (!r) return false;
    r.hechas = r.hechas || [];
    const i = r.hechas.indexOf(fecha);
    if (i >= 0) { r.hechas.splice(i, 1); guardar(); return false; }
    r.hechas.push(fecha);
    if (r.hechas.length > 400) r.hechas = r.hechas.slice(-400);
    marcarActivo(fecha);
    guardar();
    return true;
  }

  function rutinaHecha(r, fecha = U.hoy()) {
    return (r.hechas || []).includes(fecha);
  }

  // ───────── Categorías ─────────

  function categoria(id) {
    return estado.categorias.find((c) => c.id === id)
        || { id, nombre: id, emoji: '📦', tipo: 'gasto' };
  }

  function agregarCategoria(nombre, emoji, tipo = 'gasto') {
    const n = String(nombre || '').trim();
    if (!n) return null;
    const c = {
      id: U.id(),
      nombre: n,
      emoji: emoji || '🏷️',
      tipo
    };
    estado.categorias.push(c);
    guardar();
    return c;
  }

  function borrarCategoria(id) {
    estado.categorias = estado.categorias.filter((c) => c.id !== id);
    guardar();
  }

  // ───────── Respaldo ─────────

  /** JSON legible con todo (sin el token del backend, por seguridad). */
  function exportar() {
    const copia = JSON.parse(JSON.stringify(estado));
    copia.ajustes.token = '';
    copia.exportado = new Date().toISOString();
    return JSON.stringify(copia, null, 2);
  }

  /** Reemplaza todo el estado con un respaldo. Conserva PIN y token actuales. */
  function importar(texto) {
    const datos = JSON.parse(texto);
    if (!datos || typeof datos !== 'object' || !Array.isArray(datos.movimientos)) {
      throw new Error('El archivo no parece un respaldo de Calma.');
    }
    const pinActual = estado.pin;
    const tokenActual = estado.ajustes.token;
    const apiActual = estado.ajustes.apiUrl;
    estado = migrar(datos);
    // Si el respaldo no trae PIN, dejamos el que ya estaba configurado.
    if (!estado.pin || !estado.pin.hash) estado.pin = pinActual;
    if (!estado.ajustes.token) estado.ajustes.token = tokenActual;
    if (!estado.ajustes.apiUrl) estado.ajustes.apiUrl = apiActual;
    guardar();
    return estado;
  }

  function borrarTodo() {
    estado = vacio();
    localStorage.removeItem(CLAVE);
    guardar();
  }

  return {
    cargar, guardar, get, ajustes, alCambiar, vacio, revisarLogros,
    arrastrarPendientes, revisarDiaDificil, enDiaDificil, marcarActivo,
    marcarUso, usoDe, porMasUsado, aperturas,
    agregarMovimiento, borrarMovimiento, movimientosDelPeriodo, movimientosDe, registrarPago,
    agregarFijo, borrarFijo, pagarFijo, omitirMes,
    fijoTocaEnMes, fijoMensualizado, mesesEntre,
    agregarPorClasificar, clasificarGasto, descartarPorClasificar, totalPorClasificar,
    agregarDeuda, borrarDeuda, pagarDeuda, cuotaDe,
    agregarPendiente, borrarPendiente, aplicaEn, estaHecho,
    alternarPendiente, alternarSubtarea, pendientesDe,
    agregarRutina, borrarRutina, alternarRutina, rutinaHecha,
    categoria, agregarCategoria, borrarCategoria,
    exportar, importar, borrarTodo
  };
})();
