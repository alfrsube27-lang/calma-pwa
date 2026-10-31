/* ===========================================================
   hoy.js — la pantalla de inicio.
   Solo lo de hoy: cuánto puedo gastar, 3 pendientes como máximo,
   la cuota que vence pronto y el botón de día difícil.
   =========================================================== */

const Hoy = (() => {

  const SALUDOS_BIEN = [
    'Vas bien.',
    'Todo en orden por hoy.',
    'Tranquilo, hay espacio.'
  ];
  const SALUDOS_AVISO = [
    'Ya usaste buena parte de hoy. Nada grave.',
    'Te queda poquito para hoy.'
  ];
  const SALUDOS_LIMITE = [
    'Pasaste el límite de hoy. Mañana se ajusta solo.',
    'Hoy gastaste más de lo pensado. No pasa nada, seguimos.'
  ];
  /** Cuando el margen es cero y todavía no gastaste nada.
      Decir "hay espacio" encima de un S/ 0 sería mentir. */
  const SALUDOS_CERO = [
    'Hoy no hay margen. No es por algo que hayas hecho: lo que entra ya tiene dueño.',
    'Hoy sale cero. Tu comida sigue apartada, eso no se toca.'
  ];

  function pintar(c) {
    if (Almacen.enDiaDificil()) return pintarDiaDificil(c);

    const a = Almacen.ajustes();
    const r = Calculo.resumenHoy();
    const nombre = a.nombre ? `, ${a.nombre}` : '';

    let html = `
      <div class="encabezado-vista">
        <div class="fecha">${U.fechaLarga(U.hoy())}</div>
        <h1>Hoy${U.esc(nombre)}</h1>
      </div>
    `;

    // ── Falta configurar el ciclo de pagos ──
    if (!r.hayPeriodo) {
      html += `
        <div class="tarjeta">
          <h2>Primero, lo básico</h2>
          <p>Para decirte cuánto puedes gastar necesito saber cada cuánto te pagan
          y cuánto necesitas para comer.</p>
          <button class="boton principal" data-ir-ajustes>Configurar ahora</button>
        </div>`;
    } else {
      // ── El número grande ──
      const clase = 'estado-' + r.nivel;
      const mensaje = r.puedo <= 0 && r.gastado <= 0 ? U.azar(SALUDOS_CERO)
                    : r.nivel === 'bien' ? U.azar(SALUDOS_BIEN)
                    : r.nivel === 'aviso' ? U.azar(SALUDOS_AVISO)
                    : U.azar(SALUDOS_LIMITE);
      const anchoBarra = Math.min(100, r.porcentaje);

      html += `
        <div class="tarjeta borde-${r.nivel}">
          <p class="etiqueta-arriba">Hoy puedes gastar</p>
          <div class="monto-gigante ${clase}">${U.solesCorto(Math.max(0, r.puedo))}</div>
          <div class="barra ${r.nivel === 'bien' ? '' : r.nivel}">
            <i style="width:${anchoBarra}%"></i>
          </div>
          <p class="nota-abajo">${U.esc(mensaje)}
          ${r.gastado > 0 ? ` Llevas ${U.soles(r.gastado)} hoy.` : ''}</p>
        </div>`;

      // ── En qué gastarlo: va pegado al número, no más abajo ──
      // Es lo que de verdad se viene a ver. Todo lo demás puede esperar
      // a que baje el dedo.
      html += tarjetaDirecta(r);

      html += `
        <button class="boton principal" data-ir-accion style="margin-bottom:14px">
          🧭 ¿Y ahora qué hago?
        </button>`;
    }

    // ── Salió plata y falta decir en qué: lo más rápido de resolver ──
    html += Dinero.tarjetaPorClasificar(3);

    // ── Pago retrasado: tono tranquilo ──
    if (r.hayPeriodo && r.retrasado) {
      html += `
        <div class="tarjeta borde-aviso">
          <h3>El pago se está demorando</h3>
          <p>Esperábamos el pago el ${U.fechaCorta(r.fechaPago)}.
          Ya recalculé tu límite con lo que queda (${U.soles(r.saldo)}).</p>
          <button class="boton chico" data-me-pagaron>Ya me pagaron</button>
        </div>`;
    }

    // ── Lo que ya venció y sigue pendiente ──
    html += tarjetaAtrasados(r);

    // ── Comida de hoy ──
    if (r.hayPeriodo && r.comidaHoy.porDia > 0) {
      const c2 = r.comidaHoy;
      html += `
        <div class="tarjeta">
          <div class="tarjeta-titulo">
            <h3>🍚 Comida de hoy</h3>
            <span class="pastilla ${c2.queda > 0 ? 'bien' : 'aviso'}">
              ${c2.queda > 0 ? U.soles(c2.queda) + ' libre' : 'usado'}
            </span>
          </div>
          <div class="barra">
            <i style="width:${Math.min(100, Math.round((c2.gastado / c2.porDia) * 100))}%"></i>
          </div>
          <p class="nota-abajo">Aparté ${U.soles(c2.porDia)} para hoy.
          Esto no se toca para otras cosas.</p>
          <button class="boton chico" data-gasto-comida style="margin-top:10px">
            Anotar comida
          </button>
        </div>`;
    }

    // ── Frase del plan del mes ──
    const frase = Plan.fraseDelMes();
    if (frase) {
      html += `
        <button class="tarjeta" data-ir-dinero
                style="display:block;width:100%;text-align:left">
          <div class="tarjeta-titulo" style="margin-bottom:6px">
            <h3>📋 Tu plan del mes</h3>
            <span class="item-sub">ver</span>
          </div>
          <p style="margin:0">${U.esc(frase)}</p>
        </button>`;
    }

    // ── Cuotas y pagos en los próximos 3 días ──
    const proximos = Calculo.vencimientosProximos(3);
    if (proximos.length) {
      html += `
        <div class="tarjeta">
          <div class="tarjeta-titulo"><h3>Se viene</h3></div>
          <div class="lista">`;
      for (const v of proximos.slice(0, 3)) {
        html += `
            <button class="item" data-venc="${v.clase}:${v.id}">
              <span style="font-size:20px">${v.clase === 'deuda' ? '🧾' : '📌'}</span>
              <div class="item-cuerpo">
                <div class="item-titulo">${U.esc(v.nombre || 'Pago')}</div>
                <div class="item-sub">${U.cuando(v.fecha)}</div>
              </div>
              <div class="item-monto">${U.soles(v.monto)}</div>
            </button>`;
      }
      html += `</div></div>`;
    }

    // ── Máximo 3 pendientes ──
    const pendientes = Almacen.pendientesDe(U.hoy());
    const sinHacer = pendientes.filter((p) => !p.hechoHoy);
    const visibles = sinHacer.slice(0, 3);
    const resto = sinHacer.length - visibles.length;
    const hechosHoy = pendientes.filter((p) => p.hechoHoy).length;

    html += `
      <div class="tarjeta">
        <div class="tarjeta-titulo">
          <h3>Lo de hoy</h3>
          ${hechosHoy ? `<span class="pastilla bien">${hechosHoy} hecho${hechosHoy === 1 ? '' : 's'}</span>` : ''}
        </div>`;

    if (!visibles.length) {
      html += hechosHoy
        ? `<p class="vacio">Ya hiciste todo lo de hoy. En serio. 🌱</p>`
        : `<p class="vacio">No hay nada anotado para hoy.<br>Y está bien.</p>`;
    } else {
      html += '<div class="lista">';
      for (const p of visibles) html += itemPendiente(p);
      html += '</div>';
      if (resto > 0) {
        html += `<button class="boton tenue chico" data-ver-mas style="margin-top:10px">
          Ver ${resto} más</button>`;
      }
    }
    html += `</div>`;

    // ── Rutinas del día (compactas) ──
    const rutinas = Almacen.get().rutinas.filter((r2) => r2.activa);
    if (rutinas.length) {
      const hechas = rutinas.filter((r2) => Almacen.rutinaHecha(r2)).length;
      html += `
        <div class="tarjeta">
          <div class="tarjeta-titulo">
            <h3>Rutinas</h3>
            <span class="pastilla ${hechas === rutinas.length ? 'bien' : ''}">
              ${hechas}/${rutinas.length}</span>
          </div>
          <div class="lista">`;
      for (const r2 of rutinas.slice(0, 4)) {
        const hecha = Almacen.rutinaHecha(r2);
        html += `
            <button class="item ${hecha ? 'hecho' : ''}" data-rutina="${r2.id}">
              <span class="casilla ${hecha ? 'marcada' : ''}">${hecha ? '✓' : ''}</span>
              <div class="item-cuerpo"><div class="item-titulo">${U.esc(r2.titulo)}</div></div>
            </button>`;
      }
      html += `</div>`;
      if (rutinas.length > 4) {
        html += `<button class="boton tenue chico" data-ir-agenda style="margin-top:10px">
          Ver todas</button>`;
      }
      html += `</div>`;
    }

    // ── Día difícil + racha ──
    // El que más usas va primero: con el pulgar en el teléfono, el orden
    // de dos botones sí se nota.
    const racha = Calculo.racha();
    const atajos = Almacen.porMasUsado([
      { clave: 'dificil',    html: '<button class="boton" data-dificil>🫂 Día difícil</button>' },
      { clave: 'me-pagaron', html: '<button class="boton" data-me-pagaron>💰 Me pagaron</button>' }
    ], (x) => 'atajo:' + x.clave);

    html += `<div class="accesos">${atajos.map((x) => x.html).join('')}</div>`;

    if (racha > 0) {
      html += `
        <p class="ayuda" style="text-align:center">
          🌱 ${racha} día${racha === 1 ? '' : 's'} seguidos haciendo algo.
          Los días flojos no cuentan en contra.
        </p>`;
    }

    c.innerHTML = html;
    enganchar(c);
  }

  /**
   * Lo directo, sin rodeos: en qué se divide tu dinero hoy y cuál es
   * la única cosa que conviene hacer. Va arriba porque es lo que se
   * necesita leer a los tres segundos de abrir la app.
   */
  function tarjetaDirecta(r) {
    if (!r.hayPeriodo) return '';
    const p = Plan.resumen();
    const comida = r.comidaHoy;

    // La acción número uno, tomada del plan de acción
    const acciones = (typeof Accion !== 'undefined') ? Accion.accionesPorDeuda() : [];
    const primera = acciones[0];

    // Cuánto habría que guardar al día para cubrir lo que viene
    const porJuntar = U.redondear(r.cuotas + r.fijos);
    const porDia = U.redondear(porJuntar / Math.max(1, r.diasRestantes));

    return `
      <div class="tarjeta">
        <div class="tarjeta-titulo"><h3>💰 En qué se divide tu plata hoy</h3></div>

        ${linea('Comida de hoy', U.soles(comida.porDia), 'apartado, no se toca')}
        ${linea('Para gastar hoy', U.soles(Math.max(0, r.puedo)),
                r.puedo > 0 ? 'esto sí es tuyo' : 'hoy no hay margen')}
        ${p.alcanza && p.extraDeudas > 0
          ? linea('Guardar para deudas', U.soles(U.redondear(p.extraDeudas / 30.44)), 'al día')
          : ''}

        <hr class="sep" style="margin:14px 0">

        <div class="item-sub" style="margin-bottom:4px">Lo que falta pagar antes del próximo pago</div>
        <div style="display:flex;justify-content:space-between;align-items:baseline">
          <span style="font-weight:650;font-size:19px">${U.soles(porJuntar)}</span>
          <span class="item-sub">${U.soles(porDia)} por día durante ${r.diasRestantes}</span>
        </div>

        ${!p.alcanza && p.hayDatos ? `
          <p class="nota-abajo">Con lo que entra al mes faltan ${U.soles(p.falta)}
          para cubrir todo. Por eso tu número de hoy sale tan apretado: no es que
          estés gastando mal.</p>` : ''}

        ${primera ? `
          <hr class="sep" style="margin:14px 0">
          <div class="item-sub" style="margin-bottom:6px">Lo primero que deberías hacer</div>
          <div style="font-weight:650;margin-bottom:4px">
            ${primera.emoji} ${U.esc(primera.que)} — ${U.esc(primera.d.acreedor)}
          </div>
          <div class="item-sub">${U.esc(primera.porque)}</div>
        ` : ''}
      </div>`;
  }

  /** Una fila de "etiqueta … monto · nota". */
  function linea(etiqueta, monto, nota) {
    return `
      <div style="display:flex;justify-content:space-between;align-items:baseline;
                  gap:10px;padding:6px 0">
        <div>
          <div style="font-weight:600">${U.esc(etiqueta)}</div>
          ${nota ? `<div class="item-sub">${U.esc(nota)}</div>` : ''}
        </div>
        <span class="item-monto">${monto}</span>
      </div>`;
  }

  /**
   * Tarjeta de lo vencido y no pagado.
   * Ese dinero se sigue apartando (lo debes, no es tuyo), pero el aviso
   * se puede esconder por hoy: no sirve de nada repetírselo diez veces.
   */
  function tarjetaAtrasados(r) {
    const atrasados = r.atrasados || [];
    if (!atrasados.length) return '';
    if (Almacen.ajustes().atrasadosVistos === U.hoy()) return '';

    const mayor = atrasados.reduce((a, b) => (b.atraso > a.atraso ? b : a), atrasados[0]);

    return `
      <div class="tarjeta borde-aviso">
        <div class="tarjeta-titulo">
          <h3>Esto quedó pendiente</h3>
          <span class="pastilla aviso">${U.soles(r.totalAtrasado)}</span>
        </div>
        <p>Venció hace ${mayor.atraso} día${mayor.atraso === 1 ? '' : 's'} y sigue sin pagarse.
        No pasa nada: lo sigo apartando para que no te lo gastes sin querer.</p>
        <div class="lista" style="margin:12px 0">
          ${atrasados.slice(0, 4).map((v) => `
            <div class="item">
              <span style="font-size:20px">${v.clase === 'deuda' ? '🧾' : '📌'}</span>
              <div class="item-cuerpo">
                <div class="item-titulo">${U.esc(v.nombre || 'Pago')}</div>
                <div class="item-sub">era el ${U.fechaCorta(v.fecha)}</div>
              </div>
              <div class="item-monto">${U.soles(v.monto)}</div>
            </div>`).join('')}
        </div>
        <div class="fila-botones" style="margin-bottom:10px">
          <button class="boton chico principal" data-atraso-pague>Ya lo pagué</button>
          <button class="boton chico" data-atraso-arreglo>Hice un arreglo</button>
        </div>
        <button class="boton tenue chico" data-atraso-luego>Ahora no puedo</button>
      </div>`;
  }

  /** Fila de un pendiente con su casilla grande. */
  function itemPendiente(p) {
    const emoji = { tarea: '📝', reunion: '📅', casa: '🧺', pago: '💵', otro: '🔔' }[p.tipo] || '📝';
    const subs = (p.subtareas || []);
    const hechasSub = subs.filter((s) => s.hecha).length;
    const detalles = [];
    if (p.hora) detalles.push(p.hora);
    if (p.lugar) detalles.push(p.lugar);
    if (subs.length) detalles.push(`${hechasSub}/${subs.length} pasos`);
    if (p.arrastres) detalles.push('viene de antes');

    return `
      <div class="item ${p.hechoHoy ? 'hecho' : ''} ${p.prioridad === 'alta' ? 'item-alta' : ''}">
        <button class="casilla ${p.hechoHoy ? 'marcada' : ''}" data-marcar="${p.id}"
                aria-label="Marcar ${U.esc(p.titulo)}">${p.hechoHoy ? '✓' : ''}</button>
        <button class="item-cuerpo" data-abrir="${p.id}" style="text-align:left">
          <div class="item-titulo">${emoji} ${U.esc(p.titulo)}</div>
          ${detalles.length ? `<div class="item-sub">${U.esc(detalles.join(' · '))}</div>` : ''}
        </button>
      </div>`;
  }

  // ───────── Modo día difícil ─────────

  function pintarDiaDificil(c) {
    const a = Almacen.ajustes();
    const minima = a.tareaMinima || 'Tomar agua';
    const comida = Calculo.comidaDeHoy();
    // Solo cuenta haber marcado la tarea mínima de hoy, no cualquier otra cosa.
    const yaHecha = a.dificilHechoEn === U.hoy();

    // Solo lo urgente: cuotas que vencen HOY
    const hoyVence = Calculo.vencimientos().filter((v) => v.fecha === U.hoy() && v.clase === 'deuda');

    c.innerHTML = `
      <div class="encabezado-vista">
        <div class="fecha">${U.fechaLarga(U.hoy())}</div>
      </div>

      <div class="tarjeta-dificil">
        <div class="luna">🌙</div>
        <p class="mensaje">Hoy es un día difícil y está bien.<br>
        No tienes que hacer nada más que esto:</p>
      </div>

      <div class="tarjeta ${yaHecha ? 'borde-bien' : ''}">
        <div class="lista">
          <button class="item ${yaHecha ? 'hecho' : ''}" data-minima>
            <span class="casilla ${yaHecha ? 'marcada' : ''}">${yaHecha ? '✓' : ''}</span>
            <div class="item-cuerpo">
              <div class="item-titulo">${U.esc(minima)}</div>
              <div class="item-sub">Eso es todo lo de hoy</div>
            </div>
          </button>
        </div>
      </div>

      ${comida.porDia > 0 ? `
      <div class="tarjeta">
        <h3>🍚 Comer</h3>
        <p>Tienes ${U.soles(comida.queda)} de tu comida de hoy.
        Algo sencillo cuenta igual.</p>
        <button class="boton chico" data-gasto-comida>Anoté mi comida</button>
      </div>` : ''}

      ${hoyVence.length ? `
      <div class="tarjeta borde-aviso">
        <h3>🧾 Solo esto es urgente</h3>
        ${hoyVence.map((v) => `<p>${U.esc(v.nombre)}: ${U.soles(v.monto)} vence hoy.</p>`).join('')}
        <button class="boton chico" data-ir-deudas>Ver deudas</button>
      </div>` : ''}

      <p class="ayuda" style="text-align:center;margin-top:20px">
        Pausé los avisos que no son urgentes.<br>
        Lo demás pasa a mañana solo, sin marcarse como fallido.
      </p>

      <button class="boton tenue" data-salir-dificil style="margin-top:10px">
        Ya estoy mejor, volver a lo normal
      </button>
    `;
    enganchar(c);
  }

  // ───────── Eventos ─────────

  function enganchar(c) {
    Dinero.engancharPorClasificar(c);

    // Marcar pendiente
    U.al('click', '[data-marcar]', (e, b) => {
      const hecho = Almacen.alternarPendiente(b.dataset.marcar);
      U.vibrar();
      if (hecho) {
        App.brindis(U.azar([
          '¡Hecho! 🌱', 'Una menos.', 'Eso cuenta.', 'Bien ahí.'
        ]), 'bien', 1800);
      }
      App.pintar();
    }, c);

    // Abrir detalle del pendiente
    U.al('click', '[data-abrir]', (e, b) => {
      Agenda.detallePendiente(b.dataset.abrir);
    }, c);

    // Rutinas
    U.al('click', '[data-rutina]', (e, b) => {
      const hecha = Almacen.alternarRutina(b.dataset.rutina);
      U.vibrar();
      if (hecha) App.brindis('Listo. 🌱', 'bien', 1500);
      App.pintar();
    }, c);

    // Tarea mínima del día difícil
    const minima = c.querySelector('[data-minima]');
    if (minima) {
      minima.onclick = () => {
        const a = Almacen.ajustes();
        a.dificilHechoEn = a.dificilHechoEn === U.hoy() ? null : U.hoy();
        if (a.dificilHechoEn) Almacen.marcarActivo();
        Almacen.guardar();
        U.vibrar();
        if (a.dificilHechoEn) App.brindis('Eso era todo. Descansa. 🌙', 'bien', 3000);
        App.pintar();
      };
    }

    // Activar / salir del día difícil
    const bDificil = c.querySelector('[data-dificil]');
    if (bDificil) bDificil.onclick = () => {
      Almacen.marcarUso('atajo:dificil');
      activarDiaDificil();
    };

    const bSalir = c.querySelector('[data-salir-dificil]');
    if (bSalir) {
      bSalir.onclick = () => {
        Almacen.ajustes().dificilHasta = null;
        Almacen.guardar();
        App.brindis('Qué bueno. Aquí seguimos.', 'bien');
        App.pintar();
      };
    }

    // Atajos
    const irAjustes = c.querySelector('[data-ir-ajustes]');
    if (irAjustes) irAjustes.onclick = () => App.ir('ajustes');

    const irAgenda = c.querySelector('[data-ir-agenda]');
    if (irAgenda) irAgenda.onclick = () => App.ir('agenda');

    const irDeudas = c.querySelector('[data-ir-deudas]');
    if (irDeudas) irDeudas.onclick = () => App.ir('deudas');

    const verMas = c.querySelector('[data-ver-mas]');
    if (verMas) verMas.onclick = () => App.ir('agenda');

    const comida = c.querySelector('[data-gasto-comida]');
    if (comida) comida.onclick = () => Dinero.formularioMovimiento('gasto', 'comida');

    U.$$('[data-me-pagaron]', c).forEach((b) => {
      b.onclick = () => { Almacen.marcarUso('atajo:me-pagaron'); formularioPago(); };
    });

    U.al('click', '[data-venc]', (e, b) => {
      const [clase, id] = b.dataset.venc.split(':');
      if (clase === 'deuda') Deudas.formularioPago(id);
      else Dinero.confirmarFijo(id);
    }, c);

    const irDinero = c.querySelector('[data-ir-dinero]');
    if (irDinero) irDinero.onclick = () => App.ir('dinero');

    const irAccion = c.querySelector('[data-ir-accion]');
    if (irAccion) irAccion.onclick = () => App.ir('accion');

    // ── Atrasados: las tres salidas ──
    const pague = c.querySelector('[data-atraso-pague]');
    if (pague) pague.onclick = () => elegirAtrasado('pago');

    const arreglo = c.querySelector('[data-atraso-arreglo]');
    if (arreglo) arreglo.onclick = () => elegirAtrasado('arreglo');

    const luego = c.querySelector('[data-atraso-luego]');
    if (luego) luego.onclick = () => {
      Almacen.ajustes().atrasadosVistos = U.hoy();
      Almacen.guardar();
      App.brindis('Está bien. Lo dejo apartado y no insisto hoy.', '', 3400);
      App.pintar();
    };
  }

  /**
   * Elegir a cuál de los atrasados se aplica la acción.
   * @param {'pago'|'arreglo'} accion
   */
  function elegirAtrasado(accion) {
    const lista = Calculo.atrasados();
    if (!lista.length) return;

    const aplicar = (v) => {
      if (accion === 'pago') {
        if (v.clase === 'deuda') Deudas.formularioPago(v.id);
        else Dinero.confirmarFijo(v.id);
        return;
      }
      // Arreglo: dejamos de contar ese mes y abrimos la deuda por si
      // cambió la cuota o el día de pago.
      Almacen.omitirMes(v.clase, v.id);
      App.brindis('Listo, lo saqué de este mes.', 'bien', 3000);
      if (v.clase === 'deuda') {
        setTimeout(() => Deudas.formularioDeuda(v.id), 400);
      }
      App.pintar();
    };

    if (lista.length === 1) return aplicar(lista[0]);

    App.abrirHoja(accion === 'pago' ? '¿Cuál pagaste?' : '¿Con cuál arreglaste?', `
      <div class="lista">
        ${lista.map((v, i) => `
          <button class="item" data-atrasado="${i}">
            <span style="font-size:20px">${v.clase === 'deuda' ? '🧾' : '📌'}</span>
            <div class="item-cuerpo">
              <div class="item-titulo">${U.esc(v.nombre || 'Pago')}</div>
              <div class="item-sub">era el ${U.fechaCorta(v.fecha)}</div>
            </div>
            <div class="item-monto">${U.soles(v.monto)}</div>
          </button>`).join('')}
      </div>
    `, (cuerpo) => {
      U.al('click', '[data-atrasado]', (e, b) => {
        const v = lista[Number(b.dataset.atrasado)];
        App.cerrarHoja();
        setTimeout(() => aplicar(v), 180);
      }, cuerpo);
    });
  }

  /** Activar modo día difícil, eligiendo la tarea mínima. */
  function activarDiaDificil() {
    const a = Almacen.ajustes();
    App.abrirHoja('Día difícil', `
      <p>Voy a dejar solo una cosa mínima y pausar los avisos que no son urgentes.</p>
      <label class="campo">
        <span>¿Qué es lo único que harías hoy?</span>
        <input id="dd-minima" type="text" value="${U.esc(a.tareaMinima || '')}"
               placeholder="Ej. Tomar agua">
      </label>
      <div class="opciones" style="margin-bottom:18px">
        <button class="opcion" data-sug="Tomar agua">Tomar agua</button>
        <button class="opcion" data-sug="Comer algo">Comer algo</button>
        <button class="opcion" data-sug="Ducharme">Ducharme</button>
        <button class="opcion" data-sug="Salir 5 minutos">Salir 5 min</button>
      </div>
      <button class="boton principal" data-activar>Activar día difícil</button>
      <button class="boton tenue" data-cancelar style="margin-top:10px">Mejor no</button>
    `, (cuerpo) => {
      U.al('click', '[data-sug]', (e, b) => {
        U.$('#dd-minima').value = b.dataset.sug;
        U.$$('.opcion', cuerpo).forEach((o) => o.classList.remove('elegida'));
        b.classList.add('elegida');
      }, cuerpo);

      cuerpo.querySelector('[data-activar]').onclick = () => {
        const texto = U.$('#dd-minima').value.trim() || 'Tomar agua';
        a.tareaMinima = texto;
        a.dificilHasta = U.hoy();
        if (!Almacen.get().diasDificiles.includes(U.hoy())) {
          Almacen.get().diasDificiles.push(U.hoy());
        }
        Almacen.guardar();
        App.cerrarHoja();
        App.brindis('Listo. Solo una cosa hoy. 🌙', '', 3200);
        App.pintar();
      };
      cuerpo.querySelector('[data-cancelar]').onclick = App.cerrarHoja;
    });
  }

  /** "Me pagaron": cierra el periodo y empieza uno nuevo. */
  function formularioPago() {
    const a = Almacen.ajustes();
    const sobrante = Calculo.saldoActual();
    App.abrirHoja('Me pagaron', `
      <p>Qué bueno. Con esto recalculo todo desde hoy.</p>
      <label class="campo">
        <span>¿Cuánto te pagaron?</span>
        <input id="mp-monto" class="monto-entrada" type="number" inputmode="decimal"
               step="0.01" min="0" value="${a.montoPago || ''}" placeholder="0.00">
      </label>
      <label class="campo">
        <span>¿Qué día te pagaron?</span>
        <input id="mp-fecha" type="date" value="${U.hoy()}" data-autofoco="no">
      </label>
      ${sobrante > 0 ? `<p class="ayuda">Te sobraron ${U.soles(sobrante)} del periodo anterior.
        Los sumo a este.</p>` : ''}
      <button class="boton principal" data-guardar>Guardar</button>
    `, (cuerpo) => {
      cuerpo.querySelector('[data-guardar]').onclick = () => {
        const monto = U.numero(U.$('#mp-monto').value);
        if (monto <= 0) { App.brindis('Pon el monto para poder calcular.'); return; }
        const fecha = U.$('#mp-fecha').value || U.hoy();
        const arrastre = Almacen.registrarPago(monto, fecha);
        App.cerrarHoja();
        App.brindis(
          arrastre > 0
            ? `Periodo nuevo. Sumé ${U.soles(arrastre)} que te sobraron. 🌱`
            : 'Periodo nuevo. Vamos de a pocos.',
          'bien', 3600
        );
        App.pintar();
      };
    });
  }

  return { pintar, activarDiaDificil, formularioPago };
})();

