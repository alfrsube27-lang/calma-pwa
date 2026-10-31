/* ===========================================================
   deudas.js — lista de deudas, pagos parciales, estrategia
   (bola de nieve o avalancha) y fecha estimada de libertad.
   =========================================================== */

const Deudas = (() => {

  function pintar(c) {
    const e = Almacen.get();
    const activas = Calculo.deudasOrdenadas();
    const terminadas = e.deudas.filter((d) => d.terminada);
    const total = Calculo.totalDeuda();
    const progreso = Calculo.progresoDeudas();
    const libre = Calculo.libreDeDeudas();
    const estrategia = Almacen.ajustes().estrategia;

    let html = `
      <div class="encabezado-vista">
        <h1>Deudas</h1>
      </div>`;

    if (!e.deudas.length) {
      html += `
        <div class="tarjeta">
          <p class="vacio">No tienes deudas anotadas.<br>
          Si tienes, agrégalas de a una. No hace falta hoy.</p>
          <button class="boton principal" data-nueva>Agregar una deuda</button>
          <button class="boton tenue" data-recordar style="margin-top:10px">
            No me acuerdo de todas
          </button>
        </div>`;
      c.innerHTML = html;
      enganchar(c);
      return;
    }

    // ── Resumen general ──
    html += `
      <div class="tarjeta">
        <p class="etiqueta-arriba">Te falta pagar</p>
        <div class="monto-gigante">${U.solesCorto(total)}</div>
        <div class="barra"><i style="width:${progreso}%"></i></div>
        <p class="nota-abajo">Ya pagaste el ${progreso}% de todo lo que debías.
        ${libre && libre.meses
            ? `<br>Si sigues así, libre en ${libre.meses} mes${libre.meses === 1 ? '' : 'es'}
               (${U.fechaCorta(libre.fecha)} de ${U.deISO(libre.fecha).getFullYear()}).`
            : libre && libre.inalcanzable
              ? '<br>Con las cuotas actuales el interés crece más rápido que el pago. Si puedes, sube una cuota aunque sea poco.'
              : ''}</p>
      </div>`;

    // ── Cuánto pagar al mes para salir ──
    html += planDeSalida();

    // ── Estrategia ──
    html += `
      <div class="tarjeta">
        <div class="tarjeta-titulo"><h3>¿Por cuál empezar?</h3></div>
        <div class="opciones">
          <button class="opcion ${estrategia === 'bola' ? 'elegida' : ''}" data-estrategia="bola">
            ⛄ La más chica
          </button>
          <button class="opcion ${estrategia === 'avalancha' ? 'elegida' : ''}" data-estrategia="avalancha">
            🏔️ La de más interés
          </button>
        </div>
        <p class="nota-abajo">
          ${estrategia === 'bola'
            ? 'Bola de nieve: terminas deudas rápido y eso motiva.'
            : 'Avalancha: pagas menos interés en total.'}
        </p>
      </div>`;

    // ── Lista ordenada ──
    html += `
      <div class="tarjeta">
        <div class="tarjeta-titulo">
          <h3>Tu orden sugerido</h3>
          <button class="boton chico" data-nueva style="width:auto">+ Agregar</button>
        </div>
        <div class="lista">`;

    activas.forEach((d, i) => {
      const pct = d.total > 0 ? Math.round(((d.total - d.saldo) / d.total) * 100) : 0;
      const mes = U.hoy().slice(0, 7);
      const pagadoEsteMes = (d.pagos || []).some((p) => String(p.fecha).slice(0, 7) === mes);
      html += `
          <div class="item" style="flex-direction:column;align-items:stretch;gap:8px">
            <div style="display:flex;align-items:center;gap:12px">
              <span class="pastilla ${i === 0 ? 'acento' : ''}">${i + 1}</span>
              <div class="item-cuerpo">
                <div class="item-titulo">${U.esc(d.acreedor)}</div>
                <div class="item-sub">
                  ${d.frecuencia === 'vencida'
                    ? '⏰ vencida' + (d.vencidaDesde ? ` desde el ${U.fechaCorta(d.vencidaDesde)}` : '')
                    : d.frecuencia === 'nosabe'
                      ? '❓ sin fecha' + (Almacen.cuotaDe(d) ? ` · ${U.soles(Almacen.cuotaDe(d))}` : '')
                      : (d.modoPago === 'total'
                          ? `💰 todo junto: ${U.soles(d.saldo)} · día ${d.diaPago}`
                          : `cuota ${U.soles(d.cuota)} · día ${d.diaPago}`)}
                  ${U.numero(d.interes) ? ` · ${d.interes}% al año` : ''}
                  ${pagadoEsteMes && d.frecuencia === 'mensual' ? ' · pagada este mes' : ''}
                </div>
              </div>
              <div class="item-monto">${U.soles(d.saldo)}</div>
            </div>
            <div class="barra" style="margin:2px 0 0"><i style="width:${pct}%"></i></div>
            <div class="fila-botones">
              <button class="boton chico ${pagadoEsteMes ? '' : 'principal'}"
                      data-pagar="${d.id}">Registrar pago</button>
              <button class="boton chico" data-editar="${d.id}">Editar</button>
            </div>
          </div>`;
    });
    html += `</div>
        <button class="boton tenue chico" data-recordar style="margin-top:12px">
          ¿Me falta alguna? Ayúdame a recordar
        </button>
      </div>`;

    // ── Deudas sin monto: anotadas para sacarlas de la cabeza ──
    const porConfirmar = e.deudas.filter((d) => d.porConfirmar && !d.terminada);
    if (porConfirmar.length) {
      html += `
        <div class="tarjeta">
          <div class="tarjeta-titulo"><h3>❓ Por confirmar</h3></div>
          <p class="ayuda">Anotadas para que no se te olviden. No entran en los
          cálculos hasta que sepas el monto.</p>
          <div class="lista">
            ${porConfirmar.map((d) => `
              <div class="item">
                <span style="font-size:20px">❓</span>
                <div class="item-cuerpo">
                  <div class="item-titulo">${U.esc(d.acreedor)}</div>
                  <div class="item-sub">falta averiguar cuánto es</div>
                </div>
                <button class="boton chico" data-editar="${d.id}"
                        style="width:auto">Ya lo sé</button>
              </div>`).join('')}
          </div>
        </div>`;
    }

    // ── Deudas terminadas: para verlas y recordar que sí se puede ──
    if (terminadas.length) {
      html += `
        <div class="tarjeta borde-bien">
          <div class="tarjeta-titulo"><h3>🎉 Ya pagadas</h3></div>
          <div class="lista">
            ${terminadas.map((d) => `
              <div class="item hecho">
                <span class="casilla marcada">✓</span>
                <div class="item-cuerpo">
                  <div class="item-titulo">${U.esc(d.acreedor)}</div>
                  <div class="item-sub">${U.soles(d.total)} pagados completos</div>
                </div>
                <button class="boton tenue chico" data-borrar-deuda="${d.id}"
                        style="width:auto;padding:6px 8px" aria-label="Quitar">✕</button>
              </div>`).join('')}
          </div>
        </div>`;
    }

    c.innerHTML = html;
    enganchar(c);
  }

  // ───────── Cuánto pagar al mes ─────────

  /**
   * La respuesta a "¿cuánto tengo que pagar al mes para salir de esto?".
   * La app propone un monto sostenible y muestra qué se gana con él.
   */
  function planDeSalida() {
    const p = Plan.resumen();
    if (!p.hayDatos) {
      return `
        <div class="tarjeta">
          <div class="tarjeta-titulo"><h3>🎯 Cuánto pagar al mes</h3></div>
          <p>Dime cuánto te pagan y cada cuánto, y calculo cuánto conviene
          abonar al mes para salir de esto.</p>
          <button class="boton chico" data-ir-ajustes>Completar mis datos</button>
        </div>`;
    }

    // Caso duro: las cuentas no cierran. No pedimos esfuerzos imposibles.
    if (!p.alcanza) {
      return `
        <div class="tarjeta borde-aviso">
          <div class="tarjeta-titulo"><h3>🎯 Cuánto pagar al mes</h3></div>
          <p>Por ahora lo sostenible es <b>${U.soles(p.cuotas)}</b> al mes:
          solo las cuotas mínimas. Pedirte más sería mentirte.</p>
          <p>Este mes faltan ${U.soles(p.falta)} para que las cuentas cierren.
          Lo que de verdad mueve la aguja no es apretarte más, es bajar una cuota
          o conseguir algo de ingreso.</p>
          <button class="boton principal" data-ir-accion>🧭 ¿Y ahora qué hago?</button>
          <button class="boton chico" data-ir-dinero style="margin-top:8px">Ver las salidas</button>
        </div>`;
    }

    const c = Plan.comparativaDeudas();
    const totalMes = U.redondear(p.cuotas + p.extraDeudas);

    let html = `
      <div class="tarjeta borde-bien">
        <div class="tarjeta-titulo">
          <h3>🎯 Cuánto pagar al mes</h3>
          <span class="pastilla acento">${p.ritmo.emoji} ${p.ritmo.nombre}</span>
        </div>
        <p class="etiqueta-arriba">Tu monto sostenible</p>
        <div class="monto-gigante estado-bien">${U.solesCorto(totalMes)}</div>
        <p class="nota-abajo">
          ${U.soles(p.cuotas)} de cuotas
          ${p.extraDeudas > 0 ? `+ ${U.soles(p.extraDeudas)} de abono extra` : ''}.
          Te quedan ${U.soles(p.paraTi)} para ti (${U.soles(p.paraTiPorDia)} al día).
        </p>`;

    // Solo lo mostramos si de verdad gana algo: menos meses o menos intereses.
    if (c && (c.mesesAhorrados > 0 || c.interesAhorrado > 0)) {
      const ganancias = [];
      if (c.mesesAhorrados > 0) {
        ganancias.push(`${c.mesesAhorrados} mes${c.mesesAhorrados === 1 ? '' : 'es'} antes`);
      }
      if (c.interesAhorrado > 0) {
        ganancias.push(`${U.soles(c.interesAhorrado)} menos de intereses`);
      }
      html += `
        <hr class="sep" style="margin:14px 0">
        <p>Pagando solo las cuotas saldrías en <b>${c.sinExtra.meses} meses</b>.
        Con este plan, en <b>${c.conExtra.meses}</b>.</p>
        <p style="color:var(--bien);font-weight:600">${ganancias.join(' · ')}</p>`;
    }

    html += `</div>`;

    // ── Elegir el ritmo viendo el resultado de cada uno ──
    const opciones = Plan.opcionesRitmo();
    if (opciones.length) {
      html += `
        <div class="tarjeta">
          <div class="tarjeta-titulo"><h3>¿A qué ritmo?</h3></div>
          <p class="ayuda">No hay respuesta correcta. Elige la que puedas sostener.</p>
          <div class="lista">`;
      for (const o of opciones) {
        html += `
            <button class="item ${o.elegido ? 'item-alta' : ''}" data-ritmo="${o.clave}">
              <span style="font-size:22px">${o.emoji}</span>
              <div class="item-cuerpo">
                <div class="item-titulo">${o.nombre}
                  ${o.elegido ? '<span class="pastilla acento" style="margin-left:6px">tuyo</span>' : ''}
                </div>
                <div class="item-sub">
                  ${o.extra > 0 ? `+${U.soles(o.extra)} extra · ` : 'solo cuotas · '}
                  ${o.meses ? `libre en ${o.meses} meses` : ''}
                </div>
                <div class="item-sub">Te quedan ${U.soles(o.paraTiPorDia)} al día</div>
              </div>
            </button>`;
      }
      html += `</div></div>`;
    }

    return html;
  }

  // ───────── Agregar / editar deuda ─────────

  function formularioDeuda(id, nombrePrevio) {
    const d = id ? Almacen.get().deudas.find((x) => x.id === id) : null;
    let frecuencia = (d && d.frecuencia) || 'mensual';
    let modoPago = (d && d.modoPago) || 'cuotas';

    App.abrirHoja(d ? 'Editar deuda' : 'Nueva deuda', `
      <label class="campo">
        <span>¿A quién le debes?</span>
        <input id="d-acreedor" type="text"
               value="${d ? U.esc(d.acreedor) : U.esc(nombrePrevio || '')}"
               placeholder="Ej. Banco, mi hermana, tienda">
      </label>
      <label class="campo">
        <span>¿Cuánto era en total? <b>Si no sabes, déjalo vacío</b></span>
        <input id="d-total" type="number" inputmode="decimal" step="0.01" min="0"
               value="${d && d.total ? d.total : ''}" placeholder="No lo sé todavía"
               data-autofoco="no">
      </label>
      <label class="campo">
        <span>¿Cuánto te falta ahora?</span>
        <input id="d-saldo" type="number" inputmode="decimal" step="0.01" min="0"
               value="${d ? d.saldo : ''}" placeholder="0.00" data-autofoco="no">
      </label>
      <label class="campo">
        <span>¿Cómo lo pagas?</span>
        <div class="opciones" id="d-modo">
          <button class="opcion ${modoPago === 'cuotas' ? 'elegida' : ''}"
                  data-modo="cuotas">💳 En cuotas</button>
          <button class="opcion ${modoPago === 'total' ? 'elegida' : ''}"
                  data-modo="total">💰 El monto total</button>
        </div>
      </label>

      <div id="d-caja-cuota" class="${modoPago === 'cuotas' ? '' : 'oculto'}">
        <label class="campo">
          <span>¿Cuánto es la cuota?</span>
          <input id="d-cuota" type="number" inputmode="decimal" step="0.01" min="0"
                 value="${d && d.cuota ? d.cuota : ''}" placeholder="0.00" data-autofoco="no">
        </label>
      </div>

      <div id="d-caja-total" class="${modoPago === 'total' ? '' : 'oculto'}">
        <p class="ayuda">Se paga todo junto, así que uso lo que te falta como
        monto a pagar. No hace falta que pongas una cuota.</p>
      </div>
      <label class="campo">
        <span>¿Cómo se paga?</span>
        <div class="opciones" id="d-frecuencia">
          <button class="opcion ${frecuencia === 'mensual' ? 'elegida' : ''}"
                  data-frec="mensual">📅 Cada mes</button>
          <button class="opcion ${frecuencia === 'vencida' ? 'elegida' : ''}"
                  data-frec="vencida">⏰ Ya está vencida</button>
          <button class="opcion ${frecuencia === 'nosabe' ? 'elegida' : ''}"
                  data-frec="nosabe">❓ No sé cuándo</button>
        </div>
      </label>

      <div id="d-caja-dia" class="${frecuencia === 'mensual' ? '' : 'oculto'}">
        <label class="campo">
          <span>¿Qué día del mes se paga?</span>
          <input id="d-dia" type="number" inputmode="numeric" min="1" max="31"
                 value="${d && d.diaPago ? d.diaPago : ''}" placeholder="Ej. 15"
                 data-autofoco="no">
        </label>
      </div>

      <div id="d-caja-vencida" class="${frecuencia === 'vencida' ? '' : 'oculto'}">
        <label class="campo">
          <span>¿Desde cuándo la debes? Si no sabes, déjalo como está</span>
          <input id="d-vencida" type="date"
                 value="${d && d.vencidaDesde ? d.vencidaDesde : U.hoy()}"
                 data-autofoco="no">
        </label>
        <p class="ayuda">La voy a apartar completa de tu disponible y te la
        muestro en "Esto quedó pendiente", sin insistirte todos los días.</p>
      </div>

      <div id="d-caja-nosabe" class="${frecuencia === 'nosabe' ? '' : 'oculto'}">
        <p class="ayuda">Sin fecha no te mando avisos de cuota, pero la deuda
        queda anotada y te dejo los pasos para averiguarlo.</p>
      </div>
      <label class="campo">
        <span>Interés al año, si lo sabes (opcional)</span>
        <input id="d-interes" type="number" inputmode="decimal" step="0.1" min="0"
               value="${d && d.interes ? d.interes : ''}" placeholder="Ej. 35" data-autofoco="no">
      </label>
      <button class="boton principal" data-guardar>Guardar</button>
      ${d ? '<button class="boton tenue" data-borrar style="margin-top:10px">Quitar esta deuda</button>' : ''}
    `, (cuerpo) => {
      // En cuotas o todo junto
      U.al('click', '[data-modo]', (e, b) => {
        modoPago = b.dataset.modo;
        U.$$('#d-modo .opcion', cuerpo).forEach((o) => o.classList.remove('elegida'));
        b.classList.add('elegida');
        U.$('#d-caja-cuota').classList.toggle('oculto', modoPago !== 'cuotas');
        U.$('#d-caja-total').classList.toggle('oculto', modoPago !== 'total');
      }, cuerpo);

      // Cambiar la frecuencia muestra u oculta los campos que corresponden
      U.al('click', '[data-frec]', (e, b) => {
        frecuencia = b.dataset.frec;
        U.$$('#d-frecuencia .opcion', cuerpo).forEach((o) => o.classList.remove('elegida'));
        b.classList.add('elegida');
        U.$('#d-caja-dia').classList.toggle('oculto', frecuencia !== 'mensual');
        U.$('#d-caja-vencida').classList.toggle('oculto', frecuencia !== 'vencida');
        U.$('#d-caja-nosabe').classList.toggle('oculto', frecuencia !== 'nosabe');
      }, cuerpo);

      cuerpo.querySelector('[data-guardar]').onclick = () => {
        const acreedor = U.$('#d-acreedor').value.trim();
        const total = U.numero(U.$('#d-total').value);
        let saldo = U.$('#d-saldo').value === '' ? total : U.numero(U.$('#d-saldo').value);
        const cuota = modoPago === 'total' ? 0 : U.numero(U.$('#d-cuota').value);
        const dia = Math.min(31, Math.max(1, Math.round(U.numero(U.$('#d-dia').value)) || 1));
        const interes = U.numero(U.$('#d-interes').value);
        const vencidaDesde = frecuencia === 'vencida'
          ? (U.$('#d-vencida').value || U.hoy())
          : null;

        if (!acreedor) { App.brindis('Ponle un nombre para reconocerla.'); return; }

        // Sin monto no hay problema: la anotamos "por confirmar" para que
        // deje de dar vueltas en la cabeza, y no entra en los cálculos.
        const porConfirmar = total <= 0;
        if (saldo > total) saldo = total;

        const datos = {
          acreedor, total, saldo, cuota, diaPago: dia, interes,
          porConfirmar, frecuencia, vencidaDesde, modoPago
        };

        if (d) {
          Object.assign(d, datos);
          d.terminada = !porConfirmar && saldo <= 0.009;
          Almacen.guardar();
        } else {
          const nueva = Almacen.agregarDeuda(datos);
          // Sin monto o sin fecha, dejamos la tarea de averiguarlo en pasos chicos
          if (porConfirmar) tareaParaAveriguar(nueva, 'cuánto');
          else if (frecuencia === 'nosabe') tareaParaAveriguar(nueva, 'cuándo');
        }

        App.cerrarHoja();
        let mensaje;
        if (porConfirmar) mensaje = 'Anotada. Te dejé los pasos para averiguar cuánto es.';
        else if (d) mensaje = 'Actualizada.';
        else if (frecuencia === 'vencida') mensaje = 'Anotada. La aparté de tu disponible.';
        else if (frecuencia === 'nosabe') mensaje = 'Anotada. Te dejé los pasos para averiguar cuándo se paga.';
        else mensaje = 'Agregada. Te aviso 3 días antes de cada cuota.';
        App.brindis(mensaje, 'bien', 3800);
        App.pintar();
      };

      const borrar = cuerpo.querySelector('[data-borrar]');
      if (borrar) {
        borrar.onclick = async () => {
          const si = await App.confirmar('Quitar deuda',
            'Se borra de la lista y de los recordatorios.', 'Sí, quitar');
          if (!si) return;
          Almacen.borrarDeuda(id);
          App.cerrarHoja();
          App.brindis('Quitada.');
          App.pintar();
        };
      }
    });
  }

  // ───────── Deudas que no recuerdas ─────────

  /**
   * Al anotar una deuda sin monto creamos la tarea de averiguarlo,
   * ya partida en pasos chicos. Llamar a cobranzas cuesta mucho cuando
   * uno está mal; con pasos se hace más llevadero.
   */
  function tareaParaAveriguar(deuda, que = 'cuánto') {
    const esMonto = que === 'cuánto';
    Almacen.agregarPendiente({
      tipo: 'tarea',
      titulo: esMonto
        ? `Averiguar cuánto le debo a ${deuda.acreedor}`
        : `Averiguar cuándo se paga lo de ${deuda.acreedor}`,
      fecha: U.hoy(),
      prioridad: 'normal',
      notificar: false,
      subtareas: [
        { id: U.id(), titulo: 'Buscar un recibo, mensaje o correo suyo', hecha: false },
        { id: U.id(), titulo: 'Anotar qué voy a preguntar', hecha: false },
        { id: U.id(), titulo: esMonto ? 'Llamar o escribir y pedir el saldo'
                                      : 'Llamar o escribir y preguntar la fecha', hecha: false },
        { id: U.id(), titulo: esMonto ? 'Poner el monto aquí' : 'Poner la fecha aquí', hecha: false }
      ]
    });
  }

  /** Lista de pistas para recordar deudas olvidadas, sin agobiar. */
  function ayudaRecordar() {
    const pistas = [
      ['🏦', 'Banco o financiera', 'Un préstamo personal'],
      ['💳', 'Tarjeta de crédito', 'Aunque sea poquito'],
      ['👨‍👩‍👧', 'Un familiar o amigo', 'Esas también cuentan'],
      ['🛍️', 'Crédito de tienda', 'Electrodomésticos, ropa'],
      ['📱', 'Celular o internet', 'Si quedaste debiendo meses'],
      ['💡', 'Recibos atrasados', 'Luz, agua, gas'],
      ['🏪', 'Fiado del barrio', 'La bodega, el mercado'],
      ['🤝', 'Junta o pandero', 'Lo que falte aportar'],
      ['💼', 'Alguien del trabajo', 'Un adelanto, un préstamo']
    ];

    App.abrirHoja('¿Qué más puede haber?', `
      <p>Nadie recuerda todo de golpe, y menos cuando uno está cansado.
      Mira la lista sin apuro. Si algo te suena, tócalo y lo anotamos
      aunque no sepas cuánto es.</p>
      <div class="lista" style="margin-top:14px">
        ${pistas.map(([emoji, nombre, detalle]) => `
          <button class="item" data-pista="${U.esc(nombre)}">
            <span style="font-size:22px">${emoji}</span>
            <div class="item-cuerpo">
              <div class="item-titulo">${U.esc(nombre)}</div>
              <div class="item-sub">${U.esc(detalle)}</div>
            </div>
            <span class="item-sub">+</span>
          </button>`).join('')}
      </div>
      <p class="ayuda" style="margin-top:16px">
        Si no te acuerdas de ninguna más, también está bien. Puedes volver cuando quieras.
      </p>
    `, (cuerpo) => {
      U.al('click', '[data-pista]', (e, b) => {
        const nombre = b.dataset.pista;
        App.cerrarHoja();
        setTimeout(() => formularioDeuda(null, nombre), 180);
      }, cuerpo);
    });
  }

  // ───────── Registrar pago (total o parcial) ─────────

  function formularioPago(id) {
    const d = Almacen.get().deudas.find((x) => x.id === id);
    if (!d) return;
    const sugerido = Math.min(Almacen.cuotaDe(d), d.saldo);

    App.abrirHoja(`Pago a ${d.acreedor}`, `
      <input id="p-monto" class="monto-entrada" type="number" inputmode="decimal"
             step="0.01" min="0" value="${sugerido || ''}" placeholder="0.00" aria-label="Monto">
      <p class="ayuda" style="text-align:center;margin:8px 0 18px">
        Te falta ${U.soles(d.saldo)} en total
      </p>
      <div class="opciones" style="margin-bottom:18px">
        ${sugerido ? `<button class="opcion" data-monto="${sugerido}">Cuota completa</button>` : ''}
        ${sugerido ? `<button class="opcion" data-monto="${U.redondear(sugerido / 2)}">Media cuota</button>` : ''}
        <button class="opcion" data-monto="${d.saldo}">Todo lo que falta</button>
      </div>
      <label class="campo">
        <span>Fecha</span>
        <input id="p-fecha" type="date" value="${U.hoy()}" data-autofoco="no">
      </label>
      <button class="boton principal" data-guardar>Registrar pago</button>
      <p class="ayuda" style="margin-top:12px">
        Un pago parcial también cuenta. Lo que puedas hoy.
      </p>
    `, (cuerpo) => {
      U.al('click', '[data-monto]', (e, b) => {
        U.$('#p-monto').value = b.dataset.monto;
        U.$$('.opcion', cuerpo).forEach((o) => o.classList.remove('elegida'));
        b.classList.add('elegida');
      }, cuerpo);

      cuerpo.querySelector('[data-guardar]').onclick = () => {
        const monto = U.numero(U.$('#p-monto').value);
        if (monto <= 0) { App.brindis('Escribe cuánto pagaste.'); return; }
        const fecha = U.$('#p-fecha').value || U.hoy();
        const termino = Almacen.pagarDeuda(id, monto, fecha);
        App.cerrarHoja();
        if (termino) celebrar(d);
        else {
          App.brindis(U.azar([
            'Registrado. Cada pago cuenta. 🌱',
            'Listo. Vas avanzando.',
            'Anotado. Esto ya no lo debes.'
          ]), 'bien', 3000);
        }
        App.pintar();
      };
    });
  }

  /** Celebración cuando una deuda queda en cero. */
  function celebrar(d) {
    App.abrirHoja('🎉 ¡Terminaste!', `
      <div style="text-align:center;padding:10px 0 4px">
        <div style="font-size:58px;margin-bottom:12px">🎉</div>
        <h2 style="margin-bottom:8px">Pagaste todo a ${U.esc(d.acreedor)}</h2>
        <p>${U.soles(d.total)} que ya no le debes a nadie.
        Esto no es poca cosa: tómate un momento.</p>
      </div>
      <button class="boton logro" data-cerrar style="margin-top:16px">Gracias 🌱</button>
    `, (cuerpo) => {
      cuerpo.querySelector('[data-cerrar]').onclick = () => {
        App.cerrarHoja();
        App.pintar();
      };
    });
    U.vibrar([30, 60, 30]);
  }

  /** Desde el botón "+": elegir a qué deuda registrar un pago. */
  function elegirParaPagar() {
    const activas = Calculo.deudasOrdenadas();

    // Sin deudas anotadas no tiene sentido pedir un pago: ofrecemos anotarla.
    if (!activas.length) {
      App.abrirHoja('Todavía no hay deudas', `
        <p>No tienes ninguna deuda anotada, así que no hay a quién pagarle.</p>
        <button class="boton principal" data-anotar>Anotar una deuda</button>
        <button class="boton tenue" data-cerrar style="margin-top:10px">Ahora no</button>
      `, (cuerpo) => {
        cuerpo.querySelector('[data-anotar]').onclick = () => {
          App.cerrarHoja();
          setTimeout(() => formularioDeuda(), 180);
        };
        cuerpo.querySelector('[data-cerrar]').onclick = App.cerrarHoja;
      });
      return;
    }

    if (activas.length === 1) return formularioPago(activas[0].id);

    App.abrirHoja('¿A cuál le pagaste?', `
      <div class="lista">
        ${activas.map((d) => `
          <button class="item" data-elegir="${d.id}">
            <span style="font-size:20px">🧾</span>
            <div class="item-cuerpo">
              <div class="item-titulo">${U.esc(d.acreedor)}</div>
              <div class="item-sub">${d.modoPago === 'total' ? 'todo junto' : 'cuota'}
                ${U.soles(Almacen.cuotaDe(d))} · día ${d.diaPago}</div>
            </div>
            <div class="item-monto">${U.soles(d.saldo)}</div>
          </button>`).join('')}
      </div>
      <button class="boton tenue" data-anotar style="margin-top:14px">
        Ninguna: quiero anotar una deuda nueva
      </button>
    `, (cuerpo) => {
      U.al('click', '[data-elegir]', (e, b) => {
        const id = b.dataset.elegir;
        App.cerrarHoja();
        setTimeout(() => formularioPago(id), 180);
      }, cuerpo);
      cuerpo.querySelector('[data-anotar]').onclick = () => {
        App.cerrarHoja();
        setTimeout(() => formularioDeuda(), 180);
      };
    });
  }

  // ───────── Eventos ─────────

  function enganchar(c) {
    U.$$('[data-nueva]', c).forEach((b) => { b.onclick = () => formularioDeuda(); });
    U.$$('[data-recordar]', c).forEach((b) => { b.onclick = ayudaRecordar; });
    U.al('click', '[data-pagar]', (e, b) => formularioPago(b.dataset.pagar), c);
    U.al('click', '[data-editar]', (e, b) => formularioDeuda(b.dataset.editar), c);

    U.al('click', '[data-estrategia]', (e, b) => {
      Almacen.ajustes().estrategia = b.dataset.estrategia;
      Almacen.guardar();
      App.pintar();
    }, c);

    U.al('click', '[data-ritmo]', (e, b) => {
      Almacen.ajustes().ritmoPlan = b.dataset.ritmo;
      Almacen.guardar();
      U.vibrar();
      App.brindis('Listo, recalculé tu plan.', 'bien');
      App.pintar();
    }, c);

    const irAjustes = c.querySelector('[data-ir-ajustes]');
    if (irAjustes) irAjustes.onclick = () => App.ir('ajustes');
    const irDinero = c.querySelector('[data-ir-dinero]');
    if (irDinero) irDinero.onclick = () => App.ir('dinero');
    const irAccion = c.querySelector('[data-ir-accion]');
    if (irAccion) irAccion.onclick = () => App.ir('accion');

    U.al('click', '[data-borrar-deuda]', async (e, b) => {
      const si = await App.confirmar('Quitar del historial',
        '¿La saco de la lista de pagadas?', 'Sí, quitar');
      if (!si) return;
      Almacen.borrarDeuda(b.dataset.borrarDeuda);
      App.pintar();
    }, c);
  }

  return {
    pintar, formularioDeuda, formularioPago, elegirParaPagar,
    celebrar, ayudaRecordar, planDeSalida
  };
})();
