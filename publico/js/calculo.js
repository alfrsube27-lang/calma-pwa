/* ===========================================================
   calculo.js — toda la matemática de la app en un solo lugar.

   Regla central ("cuánto puedo gastar hoy"):

     disponible = saldo
                − fondo de comida restante
                − cuotas de deuda pendientes del periodo
                − gastos fijos pendientes del periodo

     límite diario = disponible ÷ días que faltan para el próximo pago

   Siempre se calcula con el PEOR CASO (los "días máximos entre pagos")
   hasta que el usuario toque "Me pagaron".
   =========================================================== */

const Calculo = (() => {

  /** Colchón de días que usamos si el pago ya se retrasó.
      Evita que la app diga "gasta todo hoy" cuando no sabemos
      cuándo llegará el dinero. */
  const COLCHON_RETRASO = 3;

  // ───────── Periodo de pago ─────────

  /** Cuántos pagos recientes mira para aprender el ritmo. */
  const PAGOS_QUE_MIRA = 4;

  /**
   * Aprende cada cuánto le pagan DE VERDAD, a partir del historial.
   * Al principio no hay datos y se usa lo que él estimó; con dos pagos
   * o más, la app deja de adivinar y usa lo que ya vio.
   *
   * Se queda con el intervalo MÁS LARGO de los últimos pagos, no con el
   * promedio: si a veces tardan 50 días, hay que estar listo para 50.
   */
  function ritmoDePagos() {
    const historial = (Almacen.get().historialPagos || [])
      .slice()
      .sort((a, b) => a.fecha.localeCompare(b.fecha));

    const huecos = [];
    for (let i = 1; i < historial.length; i++) {
      const d = U.diasEntre(historial[i - 1].fecha, historial[i].fecha);
      if (d > 0 && d < 200) huecos.push(d);
    }

    const ultimos = huecos.slice(-PAGOS_QUE_MIRA);
    if (!ultimos.length) {
      return { aprendido: false, n: 0, huecos: [], promedio: null, maximo: null, minimo: null };
    }

    const promedio = Math.round(U.suma(ultimos) / ultimos.length);
    const montos = historial.slice(-PAGOS_QUE_MIRA - 1).map((p) => p.monto);
    return {
      aprendido: true,
      n: ultimos.length,
      huecos: ultimos,
      promedio,
      maximo: Math.max(...ultimos),
      minimo: Math.min(...ultimos),
      montoPromedio: montos.length ? U.redondear(U.suma(montos) / montos.length) : null
    };
  }

  /**
   * Los días que la app usa para calcular, ya sean los que él puso
   * o los que aprendió de sus pagos reales.
   */
  function diasEntrePagos() {
    const a = Almacen.ajustes();
    const ritmo = ritmoDePagos();
    // Con un solo intervalo todavía no nos fiamos: puede ser casualidad.
    if (ritmo.aprendido && ritmo.n >= 2) {
      return Math.max(ritmo.maximo, 1);
    }
    return U.numero(a.diasMaximos) || 30;
  }

  /** ¿Ya está configurado el ciclo de ingresos? */
  function hayPeriodo() {
    const a = Almacen.ajustes();
    return !!(a.ultimoPago && diasEntrePagos() > 0);
  }

  /** Fecha en la que, en el peor caso, debería llegar el próximo pago. */
  function fechaPagoEsperado() {
    const a = Almacen.ajustes();
    if (!hayPeriodo()) return null;
    return U.sumarDias(a.ultimoPago, diasEntrePagos());
  }

  /** ¿El pago ya pasó de la fecha máxima esperada? */
  function pagoRetrasado() {
    const f = fechaPagoEsperado();
    return !!f && U.diasEntre(U.hoy(), f) < 0;
  }

  /** Días que faltan para el pago esperado, contando hoy. Mínimo 1. */
  function diasRestantes() {
    const f = fechaPagoEsperado();
    if (!f) return 1;
    const d = U.diasEntre(U.hoy(), f) + 1;  // +1 porque hoy cuenta
    if (d < 1) return COLCHON_RETRASO;       // pago retrasado: seguimos con cautela
    return d;
  }

  /** Día número X del periodo (1 = el día que le pagaron). */
  function diaDelPeriodo() {
    const a = Almacen.ajustes();
    if (!a.ultimoPago) return 1;
    return U.diasEntre(a.ultimoPago, U.hoy()) + 1;
  }

  // ───────── Saldo ─────────

  /** Dinero que queda en total: arrastre + ingresos − gastos del periodo. */
  function saldoActual() {
    const movs = Almacen.movimientosDelPeriodo();
    const ingresos = U.suma(movs.filter((m) => m.tipo === 'ingreso'), (m) => m.monto);
    const gastos   = U.suma(movs.filter((m) => m.tipo === 'gasto'),   (m) => m.monto);
    const arrastre = U.numero(Almacen.ajustes().saldoArrastrado);
    return U.redondear(arrastre + ingresos - gastos);
  }

  // ───────── Fondo de comida (intocable) ─────────

  /** Lo que hay que reservar para comer hasta el próximo pago. */
  function fondoComida() {
    const porDia = U.numero(Almacen.ajustes().comidaPorDia);
    if (!porDia) return 0;
    const reserva = porDia * diasRestantes();
    // Lo que ya comió hoy sale de la reserva de hoy, no se cuenta dos veces.
    const comidaHoy = U.suma(
      Almacen.movimientosDe(U.hoy()).filter((m) => m.tipo === 'gasto' && m.categoria === 'comida'),
      (m) => m.monto
    );
    return U.redondear(Math.max(0, reserva - comidaHoy));
  }

  /** Cuánto queda del fondo de comida de HOY. */
  function comidaDeHoy() {
    const porDia = U.numero(Almacen.ajustes().comidaPorDia);
    const gastado = U.suma(
      Almacen.movimientosDe(U.hoy()).filter((m) => m.tipo === 'gasto' && m.categoria === 'comida'),
      (m) => m.monto
    );
    return { porDia, gastado: U.redondear(gastado), queda: U.redondear(Math.max(0, porDia - gastado)) };
  }

  // ───────── Vencimientos del periodo ─────────

  /**
   * Recorre día por día y arma la lista de cuotas de deuda y gastos fijos
   * que aún no se pagan.
   *
   * Empieza el día 1 del mes en curso, NO hoy: así lo que ya venció y no se
   * pagó sigue contando. Si no, ese dinero "desaparecería" del cálculo y la
   * app te dejaría gastar algo que en realidad ya debes.
   */
  function vencimientos() {
    const inicio = U.hoy().slice(0, 8) + '01';
    const hasta = fechaPagoEsperado() || U.sumarDias(U.hoy(), 30);
    const dias = Math.max(1, U.diasEntre(inicio, hasta) + 1);
    const lista = [];

    // Nunca se debe pedir más de lo que se debe. Si el periodo abarca
    // varios meses, una deuda de pago único aparece una sola vez, y una
    // de cuotas deja de aparecer cuando ya se cubrió el saldo.
    const emitido = {};

    for (let i = 0; i < dias; i++) {
      const fecha = U.sumarDias(inicio, i);
      const d = U.deISO(fecha);
      const numeroDia = d.getDate();
      const mes = fecha.slice(0, 7);
      // Último día del mes: ahí caen los "día 29/30/31" de meses cortos.
      const ultimoDelMes = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();

      // Días de retraso respecto a hoy (0 = aún no vence)
      const atraso = Math.max(0, U.diasEntre(fecha, U.hoy()));

      for (const deuda of Almacen.get().deudas) {
        if (deuda.terminada || deuda.porConfirmar || deuda.saldo <= 0) continue;
        // Sin fecha conocida no hay vencimiento que calcular
        if (deuda.frecuencia === 'nosabe') continue;
        // Las ya vencidas se agregan aparte, abajo
        if (deuda.frecuencia === 'vencida') continue;
        const diaReal = Math.min(deuda.diaPago || 1, ultimoDelMes);
        if (diaReal !== numeroDia) continue;
        const yaPago = (deuda.pagos || []).some((p) => String(p.fecha).slice(0, 7) === mes);
        if (yaPago) continue;
        // Meses perdonados por un arreglo con el acreedor
        if ((deuda.omitidos || []).includes(mes)) continue;

        // Lo que queda por cubrir de esta deuda dentro del periodo
        const yaEmitido = emitido[deuda.id] || 0;
        const porCubrir = U.redondear(deuda.saldo - yaEmitido);
        if (porCubrir <= 0.009) continue;

        const monto = Math.min(Almacen.cuotaDe(deuda), porCubrir);
        emitido[deuda.id] = yaEmitido + monto;

        lista.push({
          clase: 'deuda',
          id: deuda.id,
          nombre: deuda.acreedor,
          monto,
          fecha,
          atraso
        });
      }

      for (const fijo of Almacen.get().gastosFijos) {
        const diaReal = Math.min(fijo.dia || 1, ultimoDelMes);
        if (diaReal !== numeroDia) continue;
        // Los que no son mensuales (el gas cada 3 meses) solo caen en su mes
        if (!Almacen.fijoTocaEnMes(fijo, mes)) continue;
        if ((fijo.pagados || []).includes(mes)) continue;
        if ((fijo.omitidos || []).includes(mes)) continue;
        lista.push({
          clase: 'fijo',
          id: fijo.id,
          nombre: fijo.nombre,
          monto: U.numero(fijo.monto),
          variable: !!fijo.variable,
          fecha,
          atraso
        });
      }
    }
    // Deudas marcadas como "ya vencida": se deben enteras desde su fecha.
    // No dependen del día del mes, así que van una sola vez.
    for (const deuda of Almacen.get().deudas) {
      if (deuda.terminada || deuda.porConfirmar || deuda.saldo <= 0) continue;
      if (deuda.frecuencia !== 'vencida') continue;
      const desde = deuda.vencidaDesde || deuda.creada || U.hoy();
      lista.push({
        clase: 'deuda',
        id: deuda.id,
        nombre: deuda.acreedor,
        monto: deuda.saldo,
        fecha: desde,
        atraso: Math.max(1, U.diasEntre(desde, U.hoy())),
        vencida: true
      });
    }

    return lista.sort((a, b) => a.fecha.localeCompare(b.fecha));
  }

  /** Lo que ya venció y sigue sin pagarse. */
  function atrasados() {
    return vencimientos().filter((v) => v.atraso > 0);
  }

  function totalAtrasado() {
    return U.redondear(U.suma(atrasados(), (v) => v.monto));
  }

  function cuotasPendientes() {
    return U.redondear(U.suma(vencimientos().filter((v) => v.clase === 'deuda'), (v) => v.monto));
  }

  function fijosPendientes() {
    return U.redondear(U.suma(vencimientos().filter((v) => v.clase === 'fijo'), (v) => v.monto));
  }

  /** Vencimientos en los próximos N días (los atrasados tienen su propia tarjeta). */
  function vencimientosProximos(dias = 3) {
    const limite = U.sumarDias(U.hoy(), dias);
    return vencimientos().filter((v) => !v.atraso && U.diasEntre(v.fecha, limite) >= 0);
  }

  // ───────── Límite diario ─────────

  /**
   * Dinero realmente libre hasta el próximo pago.
   * También descuenta lo que el plan del mes aparta para abonar a deudas
   * y para el colchón: si no, te lo gastarías sin darte cuenta.
   */
  function disponibleTotal() {
    const delPlan = (typeof Plan !== 'undefined') ? Plan.apartadoDelPeriodo() : 0;
    return U.redondear(
      saldoActual() - fondoComida() - cuotasPendientes() - fijosPendientes() - delPlan
    );
  }

  function limiteDiario() {
    return U.redondear(Math.max(0, disponibleTotal()) / diasRestantes());
  }

  /**
   * Gasto de HOY que cuenta contra el límite diario.
   * No cuentan: comida (sale del fondo) ni pagos de deudas/gastos fijos
   * (ya estaban apartados en el cálculo).
   */
  function gastadoHoy() {
    return U.redondear(U.suma(
      Almacen.movimientosDe(U.hoy()).filter((m) =>
        m.tipo === 'gasto' && m.categoria !== 'comida' && !m.fuente
      ),
      (m) => m.monto
    ));
  }

  /** El número grande de la pantalla Hoy. */
  function puedoGastarHoy() {
    return U.redondear(limiteDiario() - gastadoHoy());
  }

  /** Porcentaje del límite diario ya usado (0–200+). */
  function porcentajeUsado() {
    const lim = limiteDiario();
    if (lim <= 0) return gastadoHoy() > 0 ? 100 : 0;
    return Math.round((gastadoHoy() / lim) * 100);
  }

  /** 'bien' | 'aviso' (≥80%) | 'limite' (>100%) */
  function nivel() {
    const p = porcentajeUsado();
    if (p > 100) return 'limite';
    if (p >= 80) return 'aviso';
    return 'bien';
  }

  /** Resumen completo para pintar la pantalla Hoy sin recalcular 10 veces. */
  function resumenHoy() {
    return {
      hayPeriodo: hayPeriodo(),
      retrasado: pagoRetrasado(),
      diasRestantes: diasRestantes(),
      diaDelPeriodo: diaDelPeriodo(),
      fechaPago: fechaPagoEsperado(),
      saldo: saldoActual(),
      fondoComida: fondoComida(),
      comidaHoy: comidaDeHoy(),
      cuotas: cuotasPendientes(),
      fijos: fijosPendientes(),
      atrasados: atrasados(),
      totalAtrasado: totalAtrasado(),
      apartadoPlan: (typeof Plan !== 'undefined') ? Plan.apartadoDelPeriodo() : 0,
      disponible: disponibleTotal(),
      limite: limiteDiario(),
      gastado: gastadoHoy(),
      puedo: puedoGastarHoy(),
      porcentaje: porcentajeUsado(),
      nivel: nivel()
    };
  }

  // ───────── Deudas ─────────

  /** Deudas activas ordenadas según la estrategia elegida. */
  function deudasOrdenadas() {
    const estrategia = Almacen.ajustes().estrategia;
    const activas = Almacen.get().deudas.filter((d) =>
      !d.terminada && !d.porConfirmar && d.saldo > 0);
    const copia = activas.slice();
    if (estrategia === 'avalancha') {
      // Primero la de mayor interés (la que más cuesta tener).
      copia.sort((a, b) => (U.numero(b.interes) - U.numero(a.interes)) || (a.saldo - b.saldo));
    } else {
      // Bola de nieve: primero la más chica (victoria rápida, motiva).
      copia.sort((a, b) => (a.saldo - b.saldo) || (U.numero(b.interes) - U.numero(a.interes)));
    }
    return copia;
  }

  function totalDeuda() {
    return U.redondear(U.suma(Almacen.get().deudas.filter((d) => !d.terminada), (d) => d.saldo));
  }

  function totalDeudaOriginal() {
    return U.redondear(U.suma(Almacen.get().deudas, (d) => d.total));
  }

  /** % pagado del total de deudas (para la barra de progreso). */
  function progresoDeudas() {
    const orig = totalDeudaOriginal();
    if (orig <= 0) return 0;
    const pagado = orig - U.redondear(U.suma(Almacen.get().deudas, (d) => d.terminada ? 0 : d.saldo));
    return Math.max(0, Math.min(100, Math.round((pagado / orig) * 100)));
  }

  /**
   * Simula mes a mes para estimar cuándo quedas libre de deudas.
   * El dinero liberado por una deuda terminada se suma a la siguiente
   * de la lista (así funciona de verdad la bola de nieve / avalancha).
   *
   * @param {number} extraMensual abono extra, además de las cuotas
   * @returns {{meses:number, fecha:string, intereses:number}|null}
   */
  function simularDeudas(extraMensual = 0) {
    const activas = deudasOrdenadas().map((d) => ({
      saldo: U.numero(d.saldo),
      cuota: Almacen.cuotaDe(d),
      tasaMes: U.numero(d.interes) / 100 / 12   // el interés se ingresa anual
    }));
    if (!activas.length) return null;
    const presupuesto = U.suma(activas, (d) => d.cuota) + Math.max(0, U.numero(extraMensual));
    if (presupuesto <= 0) return null;

    let meses = 0;
    let intereses = 0;
    const LIMITE = 600; // 50 años: si no alcanza, las cuotas no cubren el interés

    while (activas.some((d) => d.saldo > 0.01) && meses < LIMITE) {
      meses++;
      let bolsa = presupuesto;

      // 1) Interés del mes
      for (const d of activas) {
        if (d.saldo <= 0) continue;
        const interes = d.saldo * d.tasaMes;
        d.saldo += interes;
        intereses += interes;
      }
      // 2) Cuota mínima de cada deuda
      for (const d of activas) {
        if (d.saldo <= 0 || bolsa <= 0) continue;
        const pago = Math.min(d.cuota, d.saldo, bolsa);
        d.saldo -= pago;
        bolsa -= pago;
      }
      // 3) Lo que sobró (incluido el abono extra) va a la primera de la lista
      for (const d of activas) {
        if (bolsa <= 0) break;
        if (d.saldo <= 0) continue;
        const extra = Math.min(bolsa, d.saldo);
        d.saldo -= extra;
        bolsa -= extra;
      }
    }

    if (meses >= LIMITE) {
      return { meses: null, fecha: null, intereses: null, inalcanzable: true };
    }

    const d = U.deISO(U.hoy());
    d.setMonth(d.getMonth() + meses);
    return { meses, fecha: U.aISO(d), intereses: U.redondear(intereses) };
  }

  /** Solo con las cuotas actuales, sin abono extra. */
  function libreDeDeudas() {
    return simularDeudas(0);
  }

  // ───────── Racha flexible ─────────

  /** Días seguidos sin nada que hacen que la racha se corte. */
  const HUECO_PERDONADO = 3;

  /**
   * Cuenta los días con al menos 1 cosa hecha, perdonando las ausencias
   * cortas: olvidarse de entrar NO es un fracaso, y para alguien con TDA
   * es lo más probable que pase. La racha solo se corta después de
   * tres días seguidos sin nada.
   *
   * Los días marcados como "difíciles" cuentan como activos: reconocer
   * que no puedes también es hacer algo.
   */
  function racha() {
    const e = Almacen.get();
    const activos = new Set(e.diasActivos);
    e.diasDificiles.forEach((d) => activos.add(d));

    let dias = 0;
    let huecoSeguido = 0;
    let cursor = U.hoy();

    for (let i = 0; i < 400; i++) {
      if (activos.has(cursor)) {
        dias++;
        huecoSeguido = 0;
      } else if (i > 0) {
        // Hoy todavía no cuenta como hueco: el día no ha terminado.
        huecoSeguido++;
        if (huecoSeguido >= HUECO_PERDONADO) break;
      }
      cursor = U.sumarDias(cursor, -1);
    }
    return dias;
  }

  /** Días activos dentro de los últimos N días. */
  function diasActivosEn(n = 7) {
    const e = Almacen.get();
    const activos = new Set(e.diasActivos.concat(e.diasDificiles));
    let c = 0;
    for (let i = 0; i < n; i++) if (activos.has(U.sumarDias(U.hoy(), -i))) c++;
    return c;
  }

  // ───────── Resumen semanal ─────────

  /** Datos de los últimos 7 días (o de la semana que empieza en `desde`). */
  function resumenSemana(desde) {
    const inicio = desde || U.sumarDias(U.hoy(), -6);
    const fin = desde ? U.sumarDias(desde, 6) : U.hoy();
    const dentro = (f) => U.diasEntre(inicio, f) >= 0 && U.diasEntre(f, fin) >= 0;

    const gastos = Almacen.get().movimientos.filter((m) => m.tipo === 'gasto' && dentro(m.fecha));
    const ingresos = Almacen.get().movimientos.filter((m) => m.tipo === 'ingreso' && dentro(m.fecha));
    const total = U.redondear(U.suma(gastos, (m) => m.monto));

    // Top 3 categorías
    const porCategoria = U.agrupar(gastos, (m) => m.categoria);
    const top = Object.keys(porCategoria)
      .map((id) => ({
        id,
        nombre: Almacen.categoria(id).nombre,
        emoji: Almacen.categoria(id).emoji,
        monto: U.redondear(U.suma(porCategoria[id], (m) => m.monto)),
        porcentaje: total > 0 ? Math.round((U.suma(porCategoria[id], (m) => m.monto) / total) * 100) : 0
      }))
      .sort((a, b) => b.monto - a.monto)
      .slice(0, 3);

    // Tareas y rutinas hechas en el rango
    let tareas = 0;
    for (const p of Almacen.get().pendientes) {
      const repite = p.repetir && p.repetir.tipo !== 'no';
      if (repite) tareas += (p.hechas || []).filter(dentro).length;
      else if (p.hecha && p.hechaEn && dentro(p.hechaEn)) tareas++;
    }
    for (const r of Almacen.get().rutinas) {
      tareas += (r.hechas || []).filter(dentro).length;
    }

    const logros = Almacen.get().logros.filter((l) => dentro(l.fecha));

    return {
      inicio, fin,
      totalGastado: total,
      totalIngresos: U.redondear(U.suma(ingresos, (m) => m.monto)),
      top,
      tareas,
      diasActivos: diasActivosEn(7),
      logros,
      promedioDiario: U.redondear(total / 7)
    };
  }

  /**
   * Consejos cortos basados en los datos reales, en tono amable.
   * Nunca regañan: describen y sugieren un paso chico.
   */
  function consejos() {
    const s = resumenSemana();
    const lista = [];

    const gustos = s.top.find((t) => t.id === 'gustos');
    if (gustos && gustos.porcentaje >= 30) {
      lista.push(`Esta semana ${gustos.porcentaje}% fue en Gustos. No está mal darte algo; si quieres, prueba bajarlo un poco la próxima.`);
    }
    if (s.top[0] && s.top[0].id !== 'gustos' && s.top[0].porcentaje >= 45) {
      lista.push(`${s.top[0].emoji} ${s.top[0].nombre} se llevó ${s.top[0].porcentaje}% de la semana. Saber dónde va el dinero ya es la mitad del camino.`);
    }
    if (s.tareas > 0) {
      lista.push(`Completaste ${s.tareas} cosa${s.tareas === 1 ? '' : 's'} esta semana. Eso cuenta.`);
    }
    const r = resumenHoy();
    if (r.hayPeriodo && r.comidaHoy.porDia > 0 && r.fondoComida > 0) {
      lista.push(`Tu comida de los próximos ${r.diasRestantes} días ya está apartada: ${U.soles(r.fondoComida)}. Eso no se toca.`);
    }
    if (r.retrasado) {
      lista.push('El pago se está demorando. Ya recalculé tu límite con lo que queda; vamos con calma.');
    }
    const libre = libreDeDeudas();
    if (libre && libre.meses) {
      lista.push(`Si sigues con las cuotas actuales, estarías libre de deudas en ${libre.meses} mes${libre.meses === 1 ? '' : 'es'}.`);
    }
    if (!lista.length) {
      lista.push('Vas registrando tus cosas. Con unos días más de datos te muestro tendencias.');
    }
    return lista;
  }

  // ───────── Meta de fondo de emergencia ─────────

  /**
   * La meta de emergencia solo se "activa" cuando no hay cuotas atrasadas:
   * primero lo urgente, después el colchón.
   */
  function hayCuotasAtrasadas() {
    return atrasados().some((v) => v.clase === 'deuda');
  }

  function metaEmergencia() {
    const a = Almacen.ajustes();
    const meta = U.numero(a.metaEmergencia);
    const ahorro = U.numero(a.ahorroEmergencia);
    return {
      activa: meta > 0 && !hayCuotasAtrasadas(),
      bloqueadaPorDeudas: meta > 0 && hayCuotasAtrasadas(),
      meta,
      ahorro,
      falta: U.redondear(Math.max(0, meta - ahorro)),
      porcentaje: meta > 0 ? Math.min(100, Math.round((ahorro / meta) * 100)) : 0
    };
  }

  return {
    ritmoDePagos, diasEntrePagos,
    hayPeriodo, fechaPagoEsperado, pagoRetrasado, diasRestantes, diaDelPeriodo,
    saldoActual, fondoComida, comidaDeHoy,
    vencimientos, vencimientosProximos, atrasados, totalAtrasado,
    cuotasPendientes, fijosPendientes,
    disponibleTotal, limiteDiario, gastadoHoy, puedoGastarHoy,
    porcentajeUsado, nivel, resumenHoy,
    deudasOrdenadas, totalDeuda, totalDeudaOriginal, progresoDeudas,
    simularDeudas, libreDeDeudas,
    racha, diasActivosEn, resumenSemana, consejos,
    hayCuotasAtrasadas, metaEmergencia
  };
})();
