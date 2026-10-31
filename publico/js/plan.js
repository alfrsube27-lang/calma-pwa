/* ===========================================================
   plan.js — el cerebro del presupuesto mensual.

   La idea: que el usuario no tenga que decidir nada.
   Con lo que ya sabe la app (cuánto entra, cuánto come, qué debe)
   arma solo un plan del mes y dice tres cosas:

     1. Cuánto entra al mes, de verdad (con el peor caso).
     2. Cuánto puede gastar en cada cosa.
     3. Cuánto conviene pagar de deuda al mes, y qué gana con eso.

   Si las cuentas NO alcanzan, lo dice claro y propone salidas
   concretas, sin echarle la culpa a nadie.
   =========================================================== */

const Plan = (() => {

  /** Días promedio de un mes (365.25 / 12). */
  const DIAS_MES = 30.44;

  /** Cuánto del dinero libre se va a pagar deuda extra, según el ritmo. */
  const RITMOS = {
    suave: {
      nombre: 'Suave',
      emoji: '🌿',
      parte: 0.15,
      texto: 'Un poco más cada mes, sin apretarme.'
    },
    normal: {
      nombre: 'Normal',
      emoji: '🚶',
      parte: 0.30,
      texto: 'Se siente, pero se aguanta.'
    },
    intenso: {
      nombre: 'Intenso',
      emoji: '🔥',
      parte: 0.50,
      texto: 'Salir rápido, aunque el mes sea duro.'
    }
  };

  /** Nunca dejamos menos de esta parte del dinero libre para vivir. */
  const MINIMO_PARA_TI = 0.40;

  // ───────── Lo que entra ─────────

  /**
   * Ingreso mensual estimado con el PEOR CASO: si te pagan S/ 1800
   * cada 45 días como máximo, al mes entran 1800 × 30.44 / 45.
   */
  function ingresoDelPago() {
    const a = Almacen.ajustes();
    const ritmo = Calculo.ritmoDePagos();
    // Si ya aprendió su ritmo real, usa eso en vez de la estimación
    const monto = (ritmo.aprendido && ritmo.montoPromedio)
      ? ritmo.montoPromedio
      : U.numero(a.montoPago);
    const dias = Calculo.diasEntrePagos();
    if (monto <= 0 || dias <= 0) return 0;
    return U.redondear(monto * DIAS_MES / dias);
  }

  /** Promedio mensual de otros ingresos (trabajitos, extras) de los últimos 90 días. */
  function ingresoExtra() {
    const desde = U.sumarDias(U.hoy(), -90);
    const extras = Almacen.get().movimientos.filter((m) =>
      m.tipo === 'ingreso' && m.categoria !== 'pago' &&
      !m.fuente && U.diasEntre(desde, m.fecha) >= 0
    );
    if (!extras.length) return 0;
    return U.redondear(U.suma(extras, (m) => m.monto) * DIAS_MES / 90);
  }

  function ingresoMensual() {
    return U.redondear(ingresoDelPago() + ingresoExtra());
  }

  // ───────── Lo que no se negocia ─────────

  /**
   * Comida del mes + pagos fijos del mes.
   * Los que no son mensuales (el gas cada 3 meses) entran prorrateados:
   * así el dinero ya está guardado cuando toque, y no es un susto.
   */
  function esenciales() {
    const a = Almacen.ajustes();
    const comida = U.redondear(U.numero(a.comidaPorDia) * DIAS_MES);
    const fijos = U.redondear(
      U.suma(Almacen.get().gastosFijos, (f) => Almacen.fijoMensualizado(f))
    );
    return { comida, fijos, total: U.redondear(comida + fijos) };
  }

  /**
   * Suma de las cuotas mínimas mensuales.
   * Las ya vencidas no entran: son un atraso que hay que resolver,
   * no un pago que se repite cada mes.
   */
  function cuotasMensuales() {
    return U.redondear(U.suma(
      Almacen.get().deudas.filter((d) =>
        !d.terminada && !d.porConfirmar && d.saldo > 0 && d.frecuencia !== 'vencida'),
      (d) => Math.min(Almacen.cuotaDe(d), d.saldo)
    ));
  }

  // ───────── Reparto por porcentajes (50 / 30 / 20) ─────────

  /**
   * El reparto clásico: de todo lo que entra, un tanto por ciento para
   * obligaciones (comer, pagos fijos, cuotas), otro para ti y otro para
   * ahorrar. Por defecto 50 / 30 / 20, pero los tres son editables.
   *
   * Esto NO inventa nada: compara el porcentaje que elegiste con lo que
   * de verdad te cuestan tus obligaciones, y te dice si entra o no.
   */
  function repartoPorcentajes() {
    const a = Almacen.ajustes();
    const r = a.reparto || { obligaciones: 50, personales: 30, ahorro: 20 };
    const ingreso = ingresoMensual();
    const es = esenciales();
    const cuotas = cuotasMensuales();
    const realObligaciones = U.redondear(es.total + cuotas);

    const parte = (n) => U.redondear(ingreso * (U.numero(n) / 100));
    const objetivo = {
      obligaciones: parte(r.obligaciones),
      personales: parte(r.personales),
      ahorro: parte(r.ahorro)
    };

    // Positivo = tus obligaciones se pasan del porcentaje que elegiste
    const desvio = U.redondear(realObligaciones - objetivo.obligaciones);

    return {
      ingreso,
      pcts: {
        obligaciones: U.numero(r.obligaciones),
        personales: U.numero(r.personales),
        ahorro: U.numero(r.ahorro)
      },
      suma: U.numero(r.obligaciones) + U.numero(r.personales) + U.numero(r.ahorro),
      objetivo,
      realObligaciones,
      // Qué parte del ingreso se van tus obligaciones de verdad
      pctReal: ingreso > 0 ? Math.round((realObligaciones / ingreso) * 100) : 0,
      desvio,
      cabe: desvio <= 0,
      activo: a.modoReparto === 'porcentajes'
    };
  }

  // ───────── Aprender de lo que ya gasta ─────────

  /**
   * Promedio mensual real por categoría en los últimos N días.
   * No cuenta comida, deudas ni lo que ya estaba apartado:
   * solo el gasto "del día a día" que sí se puede repartir.
   */
  function promedioPorCategoria(dias = 60) {
    const desde = U.sumarDias(U.hoy(), -dias);
    const gastos = Almacen.get().movimientos.filter((m) =>
      m.tipo === 'gasto' && !m.fuente &&
      m.categoria !== 'comida' && m.categoria !== 'deudas' &&
      U.diasEntre(desde, m.fecha) >= 0
    );
    const porCat = U.agrupar(gastos, (m) => m.categoria);
    const salida = {};
    for (const id of Object.keys(porCat)) {
      salida[id] = U.redondear(U.suma(porCat[id], (m) => m.monto) * DIAS_MES / dias);
    }
    return salida;
  }

  // ───────── El plan ─────────

  function ritmo() {
    return RITMOS[Almacen.ajustes().ritmoPlan] || RITMOS.normal;
  }

  /**
   * El plan completo del mes. Todo calculado, nada que configurar.
   * Devuelve también el caso feo: cuando no alcanza.
   */
  function resumen() {
    const a = Almacen.ajustes();
    const ingreso = ingresoMensual();
    const es = esenciales();
    const cuotas = cuotasMensuales();
    const hayDeudas = cuotas > 0 || Calculo.totalDeuda() > 0;

    // Lo que queda después de comer, pagar lo fijo y las cuotas mínimas
    const libre = U.redondear(ingreso - es.total - cuotas);

    // ── Caso difícil: no alcanza ──
    if (libre < 0) {
      return {
        hayDatos: ingreso > 0,
        alcanza: false,
        ingreso, esenciales: es, cuotas,
        libre,
        falta: U.redondear(-libre),
        faltaPorDia: U.redondear(-libre / DIAS_MES),
        colchon: 0,
        extraDeudas: 0,
        paraTi: 0,
        salidas: salidasSiNoAlcanza(-libre),
        ritmo: ritmo()
      };
    }

    // ── Caso normal: sobra algo ──

    // Modo porcentajes: tú decides el reparto y la app lo respeta.
    if (a.modoReparto === 'porcentajes') {
      return conPorcentajes(ingreso, es, cuotas, libre);
    }

    // 1) Colchón de emergencia, solo si no hay cuotas atrasadas
    const meta = Calculo.metaEmergencia();
    const colchon = (meta.activa && meta.falta > 0)
      ? U.redondear(Math.min(libre * 0.10, meta.falta))
      : 0;

    const restante = U.redondear(libre - colchon);

    // 2) Pago extra a deudas, según el ritmo elegido,
    //    pero dejando siempre algo para vivir.
    let extraDeudas = 0;
    if (hayDeudas && restante > 0) {
      extraDeudas = restante * ritmo().parte;
      extraDeudas = Math.min(extraDeudas, restante * (1 - MINIMO_PARA_TI));
      extraDeudas = Math.min(extraDeudas, Calculo.totalDeuda());
      extraDeudas = U.redondear(Math.max(0, extraDeudas));
    }

    const paraTi = U.redondear(restante - extraDeudas);

    return {
      hayDatos: ingreso > 0,
      alcanza: true,
      ingreso, esenciales: es, cuotas,
      libre, colchon, extraDeudas, paraTi,
      paraTiPorDia: U.redondear(paraTi / DIAS_MES),
      ritmo: ritmo()
    };
  }

  /**
   * El plan cuando tú elegiste los porcentajes.
   *
   * Primero se respeta el ahorro, después lo tuyo, y lo que sobre de la
   * bolsa de obligaciones (porque tus pagos reales costaron menos del
   * porcentaje que apartaste) se va a abonar deuda. Nada se pierde.
   */
  function conPorcentajes(ingreso, es, cuotas, libre) {
    const rp = repartoPorcentajes();
    const meta = Calculo.metaEmergencia();

    const hay = Math.max(0, libre);
    const metaTi = rp.objetivo.personales;
    const metaAhorro = rp.objetivo.ahorro;
    const sumaMetas = metaTi + metaAhorro;

    let paraTi, colchon, extraDeudas = 0;

    if (sumaMetas <= 0) {
      paraTi = hay;
      colchon = 0;
    } else if (hay <= sumaMetas) {
      // Tus obligaciones se pasaron del porcentaje: lo que queda no llega
      // para las dos bolsas. Se reparte a prorrata, sin dejar ninguna en
      // cero. Ahorrar todo y quedarte sin nada para ti no se sostiene.
      paraTi = U.redondear(hay * (metaTi / sumaMetas));
      colchon = U.redondear(hay - paraTi);
    } else {
      // Sobró de la bolsa de obligaciones: ese resto acelera las deudas
      paraTi = metaTi;
      colchon = metaAhorro;
      extraDeudas = U.redondear(hay - metaTi - metaAhorro);
    }

    // El colchón nunca pasa de lo que falta para la meta de emergencia
    if (meta.activa) {
      const tope = Math.max(0, meta.falta);
      if (colchon > tope) { paraTi = U.redondear(paraTi + colchon - tope); colchon = tope; }
    }

    extraDeudas = U.redondear(Math.min(extraDeudas, Calculo.totalDeuda()));

    // Si ya no hay deuda que abonar, ese dinero vuelve a ser tuyo
    paraTi = U.redondear(Math.max(0, hay - colchon - extraDeudas));

    return {
      hayDatos: ingreso > 0,
      alcanza: true,
      porPorcentajes: true,
      reparto: rp,
      ingreso, esenciales: es, cuotas,
      libre, colchon, extraDeudas, paraTi,
      paraTiPorDia: U.redondear(paraTi / DIAS_MES),
      ritmo: ritmo()
    };
  }

  /**
   * Cuando las cuentas no cierran, no sirve decir "gasta menos".
   * Estas son las palancas reales, ordenadas por lo que más pesa.
   */
  function salidasSiNoAlcanza(falta) {
    const salidas = [];

    salidas.push({
      tipo: 'ingreso',
      titulo: `Conseguir ${U.soles(falta)} más al mes`,
      detalle: `Son ${U.soles(falta / DIAS_MES)} al día. A veces es un trabajito chico, no un empleo nuevo.`
    });

    // La cuota más pesada: ampliar el plazo baja el pago mensual
    const deudas = Almacen.get().deudas
      .filter((d) => !d.terminada && !d.porConfirmar && d.saldo > 0)
      .sort((x, y) => Almacen.cuotaDe(y) - Almacen.cuotaDe(x));
    if (deudas[0]) {
      salidas.push({
        tipo: 'deuda',
        id: deudas[0].id,
        titulo: `Hablar con ${deudas[0].acreedor}`,
        detalle: `Es tu pago más alto (${U.soles(Almacen.cuotaDe(deudas[0]))}). Pedir más plazo baja el pago mensual. Llamar no empeora nada.`
      });
    }

    // El gasto fijo más grande
    const fijos = Almacen.get().gastosFijos
      .slice().sort((x, y) => U.numero(y.monto) - U.numero(x.monto));
    if (fijos[0]) {
      salidas.push({
        tipo: 'fijo',
        id: fijos[0].id,
        titulo: `Revisar ${fijos[0].nombre}`,
        detalle: `Es tu fijo más grande (${U.soles(fijos[0].monto)}). ¿Hay un plan más barato?`
      });
    }

    return salidas;
  }

  // ───────── Presupuesto por categoría ─────────

  /**
   * Reparte `paraTi` entre las categorías del día a día, usando lo que
   * la persona ya gasta de verdad. Si no hay historial, usa un reparto
   * sencillo. Respeta los montos que el usuario haya fijado a mano.
   */
  function presupuestoCategorias() {
    const a = Almacen.ajustes();
    const p = resumen();
    const fijadas = a.presupuesto || {};

    // Categorías del día a día (ni comida ni deudas: esas tienen su propia bolsa)
    const cats = Almacen.get().categorias.filter((c) =>
      c.tipo === 'gasto' && c.id !== 'comida' && c.id !== 'deudas'
    );

    const promedios = promedioPorCategoria();
    const gastadoMes = gastoDelMesPorCategoria();

    // Primero descontamos lo que el usuario fijó a mano
    let bolsa = p.paraTi;
    const conMontoFijo = cats.filter((c) => U.numero(fijadas[c.id]) > 0);
    const sumaFijas = U.suma(conMontoFijo, (c) => U.numero(fijadas[c.id]));
    bolsa = Math.max(0, bolsa - sumaFijas);

    const libres = cats.filter((c) => !(U.numero(fijadas[c.id]) > 0));
    const sumaPromedios = U.suma(libres, (c) => promedios[c.id] || 0);

    const filas = cats.map((c) => {
      let asignado;
      if (U.numero(fijadas[c.id]) > 0) {
        asignado = U.redondear(fijadas[c.id]);
      } else if (sumaPromedios > 0) {
        // Reparto proporcional a lo que ya gasta
        asignado = U.redondear(bolsa * ((promedios[c.id] || 0) / sumaPromedios));
      } else {
        asignado = U.redondear(bolsa / Math.max(1, libres.length));
      }
      const gastado = U.redondear(gastadoMes[c.id] || 0);
      return {
        id: c.id,
        nombre: c.nombre,
        emoji: c.emoji,
        asignado,
        gastado,
        fijada: U.numero(fijadas[c.id]) > 0,
        porcentaje: asignado > 0 ? Math.round((gastado / asignado) * 100) : (gastado > 0 ? 100 : 0),
        nivel: nivelDe(gastado, asignado)
      };
    });

    // Las bolsas que no se reparten, para que el cuadro sume el 100%
    const es = p.esenciales;
    const fijas = [
      { id: '_comida', nombre: 'Comida', emoji: '🍚', asignado: es.comida,
        gastado: U.redondear(gastadoMes._comida || 0), intocable: true },
      { id: '_fijos', nombre: 'Pagos fijos', emoji: '📌', asignado: es.fijos,
        gastado: U.redondear(gastadoMes._fijos || 0), intocable: true },
      { id: '_deudas', nombre: 'Deudas', emoji: '🧾',
        asignado: U.redondear(p.cuotas + p.extraDeudas),
        gastado: U.redondear(gastadoMes._deudas || 0), intocable: true }
    ].map((f) => Object.assign(f, {
      porcentaje: f.asignado > 0 ? Math.round((f.gastado / f.asignado) * 100) : 0,
      nivel: nivelDe(f.gastado, f.asignado)
    }));

    return { fijas, filas, plan: p };
  }

  function nivelDe(gastado, asignado) {
    if (asignado <= 0) return gastado > 0 ? 'limite' : 'bien';
    const pct = (gastado / asignado) * 100;
    if (pct > 100) return 'limite';
    if (pct >= 80) return 'aviso';
    return 'bien';
  }

  /** Lo gastado en el mes en curso, por categoría y por bolsa. */
  function gastoDelMesPorCategoria() {
    const mes = U.hoy().slice(0, 7);
    const gastos = Almacen.get().movimientos.filter((m) =>
      m.tipo === 'gasto' && String(m.fecha).slice(0, 7) === mes
    );
    const salida = {};
    for (const m of gastos) {
      let clave;
      if (m.categoria === 'comida') clave = '_comida';
      else if (m.fuente === 'fijo') clave = '_fijos';
      else if (m.categoria === 'deudas' || m.fuente === 'deuda') clave = '_deudas';
      else if (m.fuente) continue;                 // ahorro, ajustes: no son gasto del plan
      else clave = m.categoria;
      salida[clave] = (salida[clave] || 0) + m.monto;
    }
    return salida;
  }

  // ───────── Qué gana pagando el extra ─────────

  /**
   * Compara pagar solo las cuotas vs. pagar el extra del plan.
   * Devuelve meses e intereses ahorrados.
   */
  function comparativaDeudas(extra) {
    const adicional = extra == null ? resumen().extraDeudas : U.numero(extra);
    const sinExtra = Calculo.simularDeudas(0);
    if (!sinExtra) return null;
    const conExtra = adicional > 0 ? Calculo.simularDeudas(adicional) : sinExtra;

    return {
      extra: U.redondear(adicional),
      sinExtra,
      conExtra,
      mesesAhorrados: (sinExtra.meses && conExtra.meses)
        ? sinExtra.meses - conExtra.meses : 0,
      interesAhorrado: (sinExtra.intereses != null && conExtra.intereses != null)
        ? U.redondear(sinExtra.intereses - conExtra.intereses) : 0
    };
  }

  /** Las tres opciones de ritmo, ya calculadas, para que elija viendo el resultado. */
  function opcionesRitmo() {
    const p = resumen();
    if (!p.alcanza) return [];
    const restante = U.redondear(p.libre - p.colchon);

    return Object.keys(RITMOS).map((clave) => {
      const r = RITMOS[clave];
      let extra = restante * r.parte;
      extra = Math.min(extra, restante * (1 - MINIMO_PARA_TI));
      extra = U.redondear(Math.max(0, Math.min(extra, Calculo.totalDeuda())));
      const sim = Calculo.simularDeudas(extra);
      return {
        clave,
        nombre: r.nombre,
        emoji: r.emoji,
        texto: r.texto,
        extra,
        paraTi: U.redondear(restante - extra),
        paraTiPorDia: U.redondear((restante - extra) / DIAS_MES),
        meses: sim ? sim.meses : null,
        fecha: sim ? sim.fecha : null,
        elegido: clave === (Almacen.ajustes().ritmoPlan || 'normal')
      };
    });
  }

  // ───────── Enganche con el límite diario ─────────

  /**
   * Lo que el plan aparta este periodo (deuda extra + colchón),
   * proporcional a los días que faltan para el próximo pago.
   * `calculo.js` lo resta del disponible para que el número de Hoy
   * ya respete el plan y no te gastes lo que ibas a abonar.
   */
  function apartadoDelPeriodo() {
    const p = resumen();
    if (!p.alcanza) return 0;
    const porDia = (p.extraDeudas + p.colchon) / DIAS_MES;
    return U.redondear(Math.max(0, porDia * Calculo.diasRestantes()));
  }

  // ───────── Consejo corto para la pantalla Hoy ─────────

  function fraseDelMes() {
    const p = resumen();
    if (!p.hayDatos) return null;
    if (!p.alcanza) {
      return `Este mes faltan ${U.soles(p.falta)}. Mira el plan: hay salidas.`;
    }
    if (p.extraDeudas > 0) {
      const c = comparativaDeudas();
      if (c && c.mesesAhorrados > 0) {
        return `Abonando ${U.soles(p.extraDeudas)} extra al mes sales ${c.mesesAhorrados} meses antes.`;
      }
      return `Tu plan aparta ${U.soles(p.extraDeudas)} extra para deudas este mes.`;
    }
    return `Tienes ${U.soles(p.paraTi)} para ti este mes (${U.soles(p.paraTiPorDia)} al día).`;
  }

  return {
    DIAS_MES, RITMOS,
    ingresoDelPago, ingresoExtra, ingresoMensual,
    esenciales, cuotasMensuales, promedioPorCategoria, repartoPorcentajes,
    ritmo, resumen, presupuestoCategorias, gastoDelMesPorCategoria,
    comparativaDeudas, opcionesRitmo, apartadoDelPeriodo, fraseDelMes
  };
})();
