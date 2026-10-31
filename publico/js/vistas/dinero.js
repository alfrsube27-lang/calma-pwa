/* ===========================================================
   dinero.js — gastos, ingresos, categorías y gastos fijos.
   Registrar un gasto: + → Gasto → monto → categoría. Tres toques.
   =========================================================== */

const Dinero = (() => {

  function pintar(c) {
    const r = Calculo.resumenHoy();
    const movs = Almacen.get().movimientos.slice(0, 40);

    let html = `
      <div class="encabezado-vista">
        <div class="fecha">${r.hayPeriodo ? `día ${r.diaDelPeriodo} de ${r.diaDelPeriodo + r.diasRestantes - 1}` : ''}</div>
        <h1>Dinero</h1>
      </div>

      <div class="tarjeta">
        <p class="etiqueta-arriba">Tienes en total</p>
        <div class="monto-gigante">${U.solesCorto(r.saldo)}</div>
        <p class="nota-abajo">
          ${r.hayPeriodo
            ? `Hasta el ${U.fechaCorta(r.fechaPago)} · ${r.diasRestantes} día${r.diasRestantes === 1 ? '' : 's'}`
            : 'Configura tu ciclo de pagos en Ajustes'}
        </p>
        ${r.hayPeriodo ? `
          <hr class="sep" style="margin:14px 0 10px">
          <div style="display:flex;gap:10px;text-align:center">
            <div style="flex:1">
              <div class="item-sub">Para hoy</div>
              <div style="font-weight:700;font-size:20px" class="estado-${r.nivel}">
                ${U.soles(Math.max(0, r.puedo))}</div>
            </div>
            <div style="flex:1">
              <div class="item-sub">Libre hasta el pago</div>
              <div style="font-weight:700;font-size:20px"
                   class="${r.disponible < 0 ? 'estado-limite' : ''}">
                ${U.soles(r.disponible)}</div>
            </div>
          </div>` : ''}
        <button class="boton tenue chico" data-ajustar-saldo style="margin-top:14px">
          ¿Cuánto tienes ahora de verdad?
        </button>
      </div>`;

    // ── La bandeja: lo único que te pide algo ahora ──
    html += tarjetaPorClasificar();

    // ── Desglose del cálculo: guardado, pero a un toque ──
    // Que nunca sea una caja negra; que tampoco sea lo primero que ves.
    if (r.hayPeriodo) {
      html += `
        <details class="tarjeta desglose">
          <summary>
            <span>De dónde sale ese número</span>
            <span class="item-sub">ver la cuenta</span>
          </summary>
          <div style="margin-top:12px">
            ${fila('Tienes', r.saldo)}
            ${fila('− Comida apartada', -r.fondoComida)}
            ${fila('− Cuotas que vienen', -r.cuotas)}
            ${fila('− Pagos fijos', -r.fijos)}
            ${r.apartadoPlan > 0 ? fila('− Apartado por tu plan', -r.apartadoPlan) : ''}
            <hr class="sep" style="margin:12px 0">
            ${fila('Libre hasta el pago', r.disponible, true)}
            ${fila(`÷ ${r.diasRestantes} días = por día`, r.limite, true)}
            ${r.disponible < 0 ? `
              <p class="nota-abajo">Lo que debes este periodo es mayor que lo que tienes.
              Por eso hoy sale en cero: no es un castigo, es la cuenta real.
              Abajo están las salidas.</p>`
            : `<p class="nota-abajo">Hoy ya usaste ${U.soles(r.gastado)} de ${U.soles(r.limite)}.</p>`}
          </div>
        </details>`;
    }

    // ── Cómo se divide lo que entra ──
    html += tarjetaReparto();

    // ── Plan del mes (la app lo arma sola) ──
    html += planDelMes();

    // ── Accesos rápidos ──
    html += `
      <div class="accesos">
        <button class="boton" data-nuevo="gasto">💸 Gasto</button>
        <button class="boton" data-nuevo="ingreso">💰 Ingreso</button>
      </div>`;

    // ── Gastos fijos ──
    const fijos = Almacen.get().gastosFijos;
    html += `
      <div class="tarjeta">
        <div class="tarjeta-titulo">
          <h3>Pagos fijos del mes</h3>
          <button class="boton chico" data-nuevo-fijo style="width:auto">+ Agregar</button>
        </div>`;
    if (!fijos.length) {
      html += `<p class="vacio">Alquiler, celular, internet…<br>Agrégalos cuando quieras.</p>`;
    } else {
      const mes = U.hoy().slice(0, 7);
      html += '<div class="lista">';
      for (const f of fijos) {
        const pagado = (f.pagados || []).includes(mes);
        const toca = Almacen.fijoTocaEnMes(f, mes);
        const detalles = [cadaCuanto(f), `día ${f.dia}`];
        if (f.variable) detalles.push('monto aprox.');
        if (pagado) detalles.push('pagado');
        else if (!toca) detalles.push('este mes no toca');

        html += `
          <div class="item ${pagado || !toca ? 'hecho' : ''}">
            <button class="casilla ${pagado ? 'marcada' : ''}" data-pagar-fijo="${f.id}"
                    aria-label="Marcar ${U.esc(f.nombre)} como pagado">${pagado ? '✓' : ''}</button>
            <div class="item-cuerpo">
              <div class="item-titulo">${U.esc(f.nombre)}</div>
              <div class="item-sub">${U.esc(detalles.join(' · '))}</div>
            </div>
            <div class="item-monto">${f.variable ? '~' : ''}${U.soles(f.monto)}</div>
            <button class="boton tenue chico" data-borrar-fijo="${f.id}"
                    style="width:auto;padding:6px 8px" aria-label="Quitar">✕</button>
          </div>`;
      }
      html += '</div>';
      const noMensuales = fijos.filter((f) => U.numero(f.cadaMeses) > 1);
      if (noMensuales.length) {
        html += `<p class="ayuda" style="margin-top:10px">
          Los que no son de todos los meses los guardo de a pocos cada mes,
          para que cuando toquen ya esté el dinero.</p>`;
      }
    }
    html += `</div>`;

    // ── Movimientos ──
    html += `
      <div class="tarjeta">
        <div class="tarjeta-titulo">
          <h3>Últimos movimientos</h3>
          <button class="boton chico" data-categorias style="width:auto">Categorías</button>
        </div>`;

    if (!movs.length) {
      html += `<p class="vacio">Todavía no hay nada anotado.<br>
        Toca el <b>+</b> para registrar algo.</p>`;
    } else {
      const porDia = U.agrupar(movs, (m) => m.fecha);
      for (const fecha of Object.keys(porDia).sort().reverse()) {
        const dia = porDia[fecha];
        const total = U.suma(dia.filter((m) => m.tipo === 'gasto'), (m) => m.monto);
        html += `
          <div style="display:flex;justify-content:space-between;align-items:baseline;
                      margin:16px 0 8px">
            <span class="item-sub capital">${U.cuando(fecha)}</span>
            <span class="item-sub">${total > 0 ? '−' + U.soles(total).replace('S/ ', 'S/ ') : ''}</span>
          </div>
          <div class="lista">`;
        for (const m of dia) {
          const cat = Almacen.categoria(m.categoria);
          const esIngreso = m.tipo === 'ingreso';
          html += `
            <button class="item" data-mov="${m.id}">
              <span style="font-size:20px">${cat.emoji}</span>
              <div class="item-cuerpo">
                <div class="item-titulo">${U.esc(m.nota || cat.nombre)}</div>
                <div class="item-sub">${U.esc(cat.nombre)}${m.hora ? ' · ' + m.hora : ''}</div>
              </div>
              <div class="item-monto ${esIngreso ? 'estado-bien' : ''}">
                ${esIngreso ? '+' : '−'}${U.soles(m.monto).replace('S/ ', '')}
              </div>
            </button>`;
        }
        html += '</div>';
      }
    }
    html += `</div>`;

    c.innerHTML = html;
    enganchar(c);
  }

  // ───────── Gastos por clasificar ─────────

  /**
   * La bandeja de "salió plata y no sé en qué".
   *
   * Es lo más parecido a que la app anote sola: del correo llegan los
   * avisos de Yape, Plin o el banco, y aquí solo queda decir en qué fue.
   * También sirve para anotar de apuro: pones el monto ahora y lo
   * clasificas cuando tengas cabeza.
   */
  function tarjetaPorClasificar(limite = 4) {
    const lista = Almacen.get().porClasificar || [];
    if (!lista.length) return '';
    const total = Almacen.totalPorClasificar();

    return `
      <div class="tarjeta borde-aviso">
        <div class="tarjeta-titulo">
          <h3>¿En qué fue esto?</h3>
          <span class="pastilla aviso">${U.soles(total)}</span>
        </div>
        <p>${lista.length === 1
          ? 'Salió este dinero y falta decir en qué fue.'
          : `Salieron ${lista.length} montos y falta decir en qué fueron.`}
        Un toque en cada uno y listo.</p>
        <div class="lista" style="margin-top:12px">
          ${lista.slice(0, limite).map((p) => `
            <button class="item" data-clasificar="${p.id}">
              <span style="font-size:20px">${emojiOrigen(p.origen)}</span>
              <div class="item-cuerpo">
                <div class="item-titulo">${U.soles(p.monto)}</div>
                <div class="item-sub">${U.esc(p.texto || nombreOrigen(p.origen))}
                  · ${U.cuando(p.fecha)}${p.hora ? ' ' + p.hora : ''}</div>
              </div>
              <span class="item-sub">clasificar ›</span>
            </button>`).join('')}
        </div>
        ${lista.length > limite
          ? `<p class="ayuda" style="margin-top:10px">Y ${lista.length - limite} más.</p>`
          : ''}
      </div>`;
  }

  function emojiOrigen(o) {
    return { yape: '🟣', plin: '🔵', banco: '🏦', manual: '✍️' }[o] || '💸';
  }

  function nombreOrigen(o) {
    return { yape: 'Yape', plin: 'Plin', banco: 'Banco', manual: 'Anotado de apuro' }[o] || 'Salida';
  }

  /** Decir en qué fue un monto de la bandeja. Dos toques y se acabó. */
  function clasificar(id) {
    const p = (Almacen.get().porClasificar || []).find((x) => x.id === id);
    if (!p) return;
    const cats = Almacen.get().categorias.filter((x) => x.tipo === 'gasto');

    App.abrirHoja(`${U.soles(p.monto)} · ¿en qué fue?`, `
      <p class="ayuda" style="text-align:center;margin-bottom:16px">
        ${U.esc(p.texto || nombreOrigen(p.origen))} · ${U.cuando(p.fecha)}${p.hora ? ' ' + p.hora : ''}
      </p>
      <div class="opciones" style="margin-bottom:18px">
        ${cats.map((x) => `
          <button class="opcion" data-cat="${x.id}">${x.emoji} ${U.esc(x.nombre)}</button>
        `).join('')}
      </div>
      <button class="boton tenue" data-no-fue>No fue un gasto mío</button>
    `, (cuerpo) => {
      U.al('click', '[data-cat]', (e, b) => {
        Almacen.clasificarGasto(id, b.dataset.cat);
        App.cerrarHoja();
        U.vibrar();
        App.brindis('Listo. Ya sé en qué fue. 🌱', 'bien');
        App.pintar();
      }, cuerpo);

      cuerpo.querySelector('[data-no-fue]').onclick = () => {
        Almacen.descartarPorClasificar(id);
        App.cerrarHoja();
        App.brindis('Lo saqué de la lista.');
        App.pintar();
      };
    });
  }

  /**
   * Anotar de apuro: solo el monto, sin pensar en la categoría.
   * Para los momentos en que no hay cabeza para decidir nada más.
   */
  function capturaRapida() {
    App.abrirHoja('Salió plata', `
      <p>Pon el monto nomás. En qué fue me lo dices después,
      cuando tengas ganas.</p>
      <input id="pc-monto" class="monto-entrada" type="number" inputmode="decimal"
             step="0.01" min="0" placeholder="0.00" aria-label="Monto">
      <button class="boton principal" data-guardar style="margin-top:18px">Anotar</button>
    `, (cuerpo) => {
      cuerpo.querySelector('[data-guardar]').onclick = () => {
        const monto = U.numero(U.$('#pc-monto').value);
        if (monto <= 0) { App.brindis('Escribe el monto.'); return; }
        Almacen.agregarPorClasificar({ monto, origen: 'manual' });
        App.cerrarHoja();
        U.vibrar();
        App.brindis('Anotado. Te lo recuerdo para clasificarlo. 🌱', 'bien', 3000);
        App.pintar();
      };
    });
  }

  /** Engancha la tarjeta de por clasificar en cualquier vista que la pinte. */
  function engancharPorClasificar(c) {
    U.al('click', '[data-clasificar]', (e, b) => clasificar(b.dataset.clasificar), c);
  }

  // ───────── Reparto del ingreso (50 / 30 / 20) ─────────

  /**
   * Cómo se divide cada sol que entra.
   * Se ve siempre, en modo automático o con tus porcentajes, porque es
   * la pregunta de fondo: "¿en qué se me va la plata?".
   */
  function tarjetaReparto() {
    const rp = Plan.repartoPorcentajes();
    if (!rp.ingreso) return '';

    const barra = (nombre, emoji, pct, monto, tono) => `
      <div style="margin-bottom:12px">
        <div style="display:flex;justify-content:space-between;align-items:baseline;gap:8px">
          <span style="font-weight:600">${emoji} ${U.esc(nombre)}</span>
          <span class="item-monto">${U.soles(monto)}
            <span class="item-sub">· ${pct}%</span></span>
        </div>
        <div class="barra ${tono || ''}" style="margin-top:6px">
          <i style="width:${Math.min(100, pct)}%"></i>
        </div>
      </div>`;

    return `
      <div class="tarjeta">
        <div class="tarjeta-titulo">
          <h3>Cómo se divide lo que entra</h3>
          <span class="pastilla ${rp.activo ? 'acento' : ''}">
            ${rp.activo ? 'tus %' : 'automático'}</span>
        </div>

        ${barra('Obligaciones', '🏠', rp.pctReal, rp.realObligaciones,
                rp.cabe ? '' : 'limite')}
        <p class="item-sub" style="margin:-6px 0 14px">
          Comer, pagos fijos y cuotas. Lo que no se negocia.
        </p>

        ${barra('Para ti', '🎁', rp.pcts.personales, rp.objetivo.personales)}
        ${barra('Ahorro', '🌱', rp.pcts.ahorro, rp.objetivo.ahorro)}

        ${rp.cabe ? `
          <p class="nota-abajo">Tus obligaciones se llevan el ${rp.pctReal}% de lo que
          entra, y apartaste el ${rp.pcts.obligaciones}%. Lo que sobra de esa bolsa
          se va a abonar deuda.</p>
        ` : `
          <p class="nota-abajo">Tus obligaciones se llevan el ${rp.pctReal}% de lo que
          entra, no el ${rp.pcts.obligaciones}% del reparto. Son ${U.soles(rp.desvio)}
          de más al mes. No es por gastar mal: es que las cuotas pesan.</p>
        `}

        <button class="boton tenue chico" data-reparto style="margin-top:12px">
          Cambiar los porcentajes
        </button>
      </div>`;
  }

  /** Editar el reparto. Por defecto 50/30/20, pero manda el usuario. */
  function formularioReparto() {
    const a = Almacen.ajustes();
    const r = a.reparto || { obligaciones: 50, personales: 30, ahorro: 20 };

    App.abrirHoja('Cómo repartir lo que entra', `
      <p>De cada sol que te pagan, cuánto va a cada bolsa.
      Lo clásico es 50 / 30 / 20, pero tú decides.</p>

      <label class="campo">
        <span>🏠 Obligaciones (comer, fijos, cuotas)</span>
        <input id="rp-ob" type="number" inputmode="numeric" min="0" max="100"
               value="${U.numero(r.obligaciones)}">
      </label>
      <label class="campo">
        <span>🎁 Para ti</span>
        <input id="rp-pe" type="number" inputmode="numeric" min="0" max="100"
               value="${U.numero(r.personales)}" data-autofoco="no">
      </label>
      <label class="campo">
        <span>🌱 Ahorro</span>
        <input id="rp-ah" type="number" inputmode="numeric" min="0" max="100"
               value="${U.numero(r.ahorro)}" data-autofoco="no">
      </label>
      <p class="ayuda" id="rp-suma" style="text-align:center;margin-bottom:16px"></p>

      <label class="campo">
        <span>¿Quién decide el reparto?</span>
        <div class="opciones" id="rp-modo">
          <button class="opcion ${a.modoReparto !== 'porcentajes' ? 'elegida' : ''}"
                  data-modo="auto">La app, con mis números</button>
          <button class="opcion ${a.modoReparto === 'porcentajes' ? 'elegida' : ''}"
                  data-modo="porcentajes">Mis porcentajes</button>
        </div>
      </label>

      <button class="boton principal" data-guardar>Guardar</button>
      <button class="boton tenue" data-reset style="margin-top:10px">
        Volver a 50 / 30 / 20
      </button>
    `, (cuerpo) => {
      let modo = a.modoReparto === 'porcentajes' ? 'porcentajes' : 'auto';

      const refrescarSuma = () => {
        const s = U.numero(U.$('#rp-ob').value) + U.numero(U.$('#rp-pe').value)
                + U.numero(U.$('#rp-ah').value);
        const nodo = U.$('#rp-suma');
        nodo.textContent = s === 100
          ? 'Suma 100%. Perfecto.'
          : `Suman ${s}%. No pasa nada, pero lo normal es que sumen 100.`;
      };
      ['#rp-ob', '#rp-pe', '#rp-ah'].forEach((sel) => {
        U.$(sel).addEventListener('input', refrescarSuma);
      });
      refrescarSuma();

      U.al('click', '[data-modo]', (e, b) => {
        modo = b.dataset.modo;
        U.$$('#rp-modo .opcion', cuerpo).forEach((o) => o.classList.remove('elegida'));
        b.classList.add('elegida');
        U.vibrar(8);
      }, cuerpo);

      cuerpo.querySelector('[data-guardar]').onclick = () => {
        a.reparto = {
          obligaciones: Math.max(0, U.numero(U.$('#rp-ob').value)),
          personales: Math.max(0, U.numero(U.$('#rp-pe').value)),
          ahorro: Math.max(0, U.numero(U.$('#rp-ah').value))
        };
        a.modoReparto = modo;
        Almacen.guardar();
        App.cerrarHoja();
        App.brindis(modo === 'porcentajes'
          ? 'Listo, reparto con tus porcentajes.'
          : 'Listo, yo me encargo del reparto.', 'bien');
        App.pintar();
      };

      cuerpo.querySelector('[data-reset]').onclick = () => {
        U.$('#rp-ob').value = 50;
        U.$('#rp-pe').value = 30;
        U.$('#rp-ah').value = 20;
        refrescarSuma();
      };
    });
  }

  // ───────── Plan del mes ─────────

  /**
   * El presupuesto mensual, calculado solo a partir de lo que ya sabe
   * la app. Si no alcanza, en vez de un presupuesto imposible muestra
   * las salidas concretas.
   */
  function planDelMes() {
    const p = Plan.resumen();
    if (!p.hayDatos) return '';

    const { fijas, filas } = Plan.presupuestoCategorias();

    let html = `
      <div class="tarjeta ${p.alcanza ? '' : 'borde-aviso'}">
        <div class="tarjeta-titulo">
          <h3>📋 Tu plan del mes</h3>
          <span class="pastilla acento">automático</span>
        </div>
        ${fila('Entra al mes', p.ingreso, true)}
        ${fila('− Comida', -p.esenciales.comida)}
        ${fila('− Pagos fijos', -p.esenciales.fijos)}
        ${fila('− Cuotas de deuda', -p.cuotas)}`;

    if (!p.alcanza) {
      // ── No alcanza: lo decimos claro y damos salidas ──
      html += `
        <hr class="sep" style="margin:12px 0">
        <p style="font-weight:650;color:var(--aviso)">
          Faltan ${U.soles(p.falta)} al mes
        </p>
        <p>Con lo que entra y lo que debes cada mes, las cuentas todavía no cierran.
        No es por algo que estés haciendo mal: simplemente no alcanza. Estas son las
        salidas reales:</p>
        <div class="lista" style="margin-top:12px">
          ${p.salidas.map((s, i) => `
            <div class="item" style="flex-direction:column;align-items:stretch;gap:4px">
              <div style="display:flex;gap:12px;align-items:center">
                <span class="pastilla">${i + 1}</span>
                <div class="item-cuerpo"><div class="item-titulo">${U.esc(s.titulo)}</div></div>
              </div>
              <div class="item-sub" style="padding-left:40px">${U.esc(s.detalle)}</div>
            </div>`).join('')}
        </div>
        <p class="nota-abajo">Mientras tanto sigo apartando tu comida primero.
        Eso no se toca.</p>
      </div>`;
      return html;
    }

    // ── Alcanza: mostramos el reparto ──
    html += `
        ${p.colchon > 0 ? fila('− Al colchón', -p.colchon) : ''}
        ${p.extraDeudas > 0 ? fila('− Extra a deudas', -p.extraDeudas) : ''}
        <hr class="sep" style="margin:12px 0">
        ${fila('Para ti este mes', p.paraTi, true)}
        ${fila('= por día', p.paraTiPorDia, true)}
      </div>`;

    // ── Dónde va cada sol ──
    html += `
      <div class="tarjeta">
        <div class="tarjeta-titulo">
          <h3>Cuánto gastar en cada cosa</h3>
        </div>
        <p class="ayuda">Lo repartí según lo que ya gastas. Toca una para fijarla tú.</p>
        <div class="lista">`;

    for (const f of fijas.concat(filas)) {
      if (f.asignado <= 0 && f.gastado <= 0) continue;
      html += `
          <div class="item" style="flex-direction:column;align-items:stretch;gap:6px"
               ${f.intocable ? '' : `data-presupuesto="${f.id}"`}>
            <div style="display:flex;align-items:center;gap:12px">
              <span style="font-size:20px">${f.emoji}</span>
              <div class="item-cuerpo">
                <div class="item-titulo">${U.esc(f.nombre)}
                  ${f.fijada ? '<span class="pastilla" style="margin-left:6px">fijo</span>' : ''}
                  ${f.intocable ? '<span class="pastilla" style="margin-left:6px">aparte</span>' : ''}
                </div>
                <div class="item-sub">${U.soles(f.gastado)} de ${U.soles(f.asignado)}</div>
              </div>
              <div class="item-monto estado-${f.nivel}">
                ${U.soles(Math.max(0, f.asignado - f.gastado))}
              </div>
            </div>
            <div class="barra ${f.nivel === 'bien' ? '' : f.nivel}" style="margin:0">
              <i style="width:${Math.min(100, f.porcentaje)}%"></i>
            </div>
          </div>`;
    }

    html += `</div></div>`;
    return html;
  }

  /** Fijar a mano cuánto quiero gastar en una categoría. */
  function fijarPresupuesto(id) {
    const a = Almacen.ajustes();
    const cat = Almacen.categoria(id);
    const actual = U.numero((a.presupuesto || {})[id]);

    App.abrirHoja(`Presupuesto de ${cat.nombre}`, `
      <p>Si prefieres decidirlo tú, pon el monto del mes.
      El resto se reparte solo con lo que quede.</p>
      <input id="pr-monto" class="monto-entrada" type="number" inputmode="decimal"
             step="0.01" min="0" value="${actual || ''}" placeholder="0.00"
             aria-label="Monto del mes">
      <button class="boton principal" data-guardar style="margin-top:18px">Fijar</button>
      ${actual ? `<button class="boton tenue" data-quitar style="margin-top:10px">
        Que la app lo decida</button>` : ''}
    `, (cuerpo) => {
      cuerpo.querySelector('[data-guardar]').onclick = () => {
        const monto = U.numero(U.$('#pr-monto').value);
        a.presupuesto = a.presupuesto || {};
        if (monto > 0) a.presupuesto[id] = U.redondear(monto);
        else delete a.presupuesto[id];
        Almacen.guardar();
        App.cerrarHoja();
        App.brindis('Listo, reparto el resto.', 'bien');
        App.pintar();
      };
      const quitar = cuerpo.querySelector('[data-quitar]');
      if (quitar) quitar.onclick = () => {
        a.presupuesto = a.presupuesto || {};
        delete a.presupuesto[id];
        Almacen.guardar();
        App.cerrarHoja();
        App.brindis('Vuelvo a repartirlo yo.', 'bien');
        App.pintar();
      };
    });
  }

  /**
   * Una línea del desglose.
   * Las líneas de resta ("− Comida") ya llevan el signo en la etiqueta,
   * así que mostramos el monto en positivo. Las líneas fuertes (totales)
   * muestran el signo real: si el resultado es negativo hay que verlo.
   */
  function fila(etiqueta, monto, fuerte = false) {
    const valor = fuerte ? U.soles(monto) : U.soles(Math.abs(monto));
    const color = fuerte ? (monto < 0 ? 'estado-limite' : 'estado-bien') : '';
    return `
      <div style="display:flex;justify-content:space-between;gap:10px;padding:5px 0">
        <span class="${fuerte ? '' : 'item-sub'}" style="${fuerte ? 'font-weight:600' : ''}">
          ${U.esc(etiqueta)}</span>
        <span class="item-monto ${color}" style="${fuerte ? '' : 'font-weight:500;color:var(--texto-suave)'}">
          ${valor}</span>
      </div>`;
  }

  // ───────── Formulario de gasto / ingreso ─────────

  /**
   * @param {'gasto'|'ingreso'} tipo
   * @param {string} categoriaPre categoría ya elegida (opcional)
   */
  function formularioMovimiento(tipo = 'gasto', categoriaPre = '') {
    const cats = Almacen.get().categorias.filter((x) =>
      tipo === 'ingreso' ? x.tipo === 'ingreso' : x.tipo === 'gasto');
    let elegida = categoriaPre || (cats[0] ? cats[0].id : 'otros');
    const r = Calculo.resumenHoy();

    App.abrirHoja(tipo === 'gasto' ? 'Un gasto' : 'Un ingreso', `
      <input id="mov-monto" class="monto-entrada" type="number" inputmode="decimal"
             step="0.01" min="0" placeholder="0.00" aria-label="Monto">

      ${tipo === 'gasto' && r.hayPeriodo ? `
        <p class="ayuda" style="text-align:center;margin:8px 0 18px">
          Te queda ${U.soles(Math.max(0, r.puedo))} para hoy
        </p>` : '<div style="height:14px"></div>'}

      <label class="campo">
        <span>¿En qué?</span>
        <div class="opciones" id="mov-cats">
          ${cats.map((x) => `
            <button class="opcion ${x.id === elegida ? 'elegida' : ''}" data-cat="${x.id}">
              ${x.emoji} ${U.esc(x.nombre)}
            </button>`).join('')}
        </div>
      </label>

      <label class="campo">
        <span>Nota (opcional)</span>
        <input id="mov-nota" type="text" placeholder="Ej. almuerzo con Ana" data-autofoco="no">
      </label>

      <label class="campo">
        <span>Fecha</span>
        <input id="mov-fecha" type="date" value="${U.hoy()}" data-autofoco="no">
      </label>

      <button class="boton principal" data-guardar>Guardar</button>
    `, (cuerpo) => {
      U.al('click', '[data-cat]', (e, b) => {
        elegida = b.dataset.cat;
        U.$$('.opcion', cuerpo).forEach((o) => o.classList.remove('elegida'));
        b.classList.add('elegida');
        U.vibrar(8);
      }, cuerpo);

      cuerpo.querySelector('[data-guardar]').onclick = () => guardar(tipo, () => elegida);
    });
  }

  async function guardar(tipo, dameCategoria) {
    const monto = U.numero(U.$('#mov-monto').value);
    if (monto <= 0) { App.brindis('Escribe el monto para guardarlo.'); return; }
    const categoria = dameCategoria();
    const nota = U.$('#mov-nota').value.trim();
    const fecha = U.$('#mov-fecha').value || U.hoy();

    // Aviso especial antes de un gusto que se come el dinero de mañana
    if (tipo === 'gasto' && categoria === 'gustos' && fecha === U.hoy()) {
      const puedo = Calculo.puedoGastarHoy();
      if (monto > puedo) {
        const sigue = await App.confirmar(
          '¿Seguro?',
          'Esto toma de tu dinero de mañana. Puedes hacerlo, solo quiero que lo sepas.',
          'Sí, lo registro',
          'Mejor no'
        );
        if (!sigue) return;
      }
    }

    const antes = Calculo.porcentajeUsado();
    Almacen.agregarMovimiento({ tipo, monto, categoria, nota, fecha });
    App.cerrarHoja();
    U.vibrar();

    if (tipo === 'ingreso') {
      App.brindis('Anotado. Qué bien que entró algo. 🌱', 'bien');
    } else {
      App.brindis(U.azar([
        'Anotado. Gracias por contarme.',
        'Listo, ya lo tengo.',
        'Registrado. Saber en qué va ya es avance.'
      ]), '', 2200);
      revisarAvisos(antes);
    }
    App.pintar();
  }

  /** Avisos al 80% y al 100% del límite diario. Solo una vez por día. */
  function revisarAvisos(porcentajeAntes) {
    const ahora = Calculo.porcentajeUsado();
    const hoy = U.hoy();
    const e = Almacen.get();
    e.avisosDados[hoy] = e.avisosDados[hoy] || {};
    const dados = e.avisosDados[hoy];

    if (ahora > 100 && !dados.cien) {
      dados.cien = true;
      Almacen.guardar();
      setTimeout(() => {
        App.brindis('Pasaste tu límite de hoy. Mañana se ajusta solo, sin drama.', 'limite', 4200);
        Notis.avisoLocal('Límite de hoy', 'Pasaste el límite diario. Mañana se recalcula solo.');
      }, 2400);
    } else if (ahora >= 80 && ahora <= 100 && !dados.ochenta && porcentajeAntes < 80) {
      dados.ochenta = true;
      Almacen.guardar();
      setTimeout(() => {
        App.brindis('Vas por el 80% de hoy. Te queda poquito.', 'aviso', 4000);
      }, 2400);
    }
  }

  // ───────── Detalle / borrar movimiento ─────────

  function detalleMovimiento(id) {
    const m = Almacen.get().movimientos.find((x) => x.id === id);
    if (!m) return;
    const cat = Almacen.categoria(m.categoria);
    App.abrirHoja(m.nota || cat.nombre, `
      <div class="tarjeta sin-borde" style="background:var(--superficie-2)">
        <p class="etiqueta-arriba">${m.tipo === 'ingreso' ? 'Ingreso' : 'Gasto'}</p>
        <div class="monto-gigante" style="font-size:40px">${U.soles(m.monto)}</div>
        <p class="nota-abajo">${cat.emoji} ${U.esc(cat.nombre)} · ${U.fechaLarga(m.fecha)}
        ${m.hora ? ' · ' + m.hora : ''}</p>
      </div>
      <button class="boton tenue" data-borrar>Quitar este registro</button>
    `, (cuerpo) => {
      cuerpo.querySelector('[data-borrar]').onclick = async () => {
        const si = await App.confirmar('Quitar', '¿Lo borro? Esto no afecta nada más.', 'Sí, quitar');
        if (!si) return;
        Almacen.borrarMovimiento(id);
        App.cerrarHoja();
        App.brindis('Quitado.');
        App.pintar();
      };
    });
  }

  /**
   * "¿Cuánto tienes ahora de verdad?"
   * Es la forma rápida de corregir el saldo cuando hubo gastos sin anotar.
   * La diferencia se guarda como un movimiento de ajuste, para no perder
   * el rastro de por qué cambió el número.
   */
  function ajustarSaldo() {
    const actual = Calculo.saldoActual();
    App.abrirHoja('¿Cuánto tienes ahora?', `
      <p>Cuenta lo que tienes en efectivo y en la cuenta. Si no cuadra con
      ${U.soles(actual)}, lo ajusto sin preguntar nada más.</p>
      <input id="aj-real" class="monto-entrada" type="number" inputmode="decimal"
             step="0.01" min="0" placeholder="0.00" aria-label="Lo que tienes ahora">
      <p class="ayuda" style="text-align:center;margin:8px 0 18px">
        Ahora mismo tengo anotado ${U.soles(actual)}
      </p>
      <button class="boton principal" data-guardar>Ajustar</button>
    `, (cuerpo) => {
      cuerpo.querySelector('[data-guardar]').onclick = () => {
        const real = U.$('#aj-real').value;
        if (real === '') { App.brindis('Escribe cuánto tienes.'); return; }
        const objetivo = U.redondear(U.numero(real));
        const diferencia = U.redondear(objetivo - actual);

        if (Math.abs(diferencia) < 0.01) {
          App.cerrarHoja();
          App.brindis('Ya cuadraba. 🌱', 'bien');
          return;
        }
        Almacen.agregarMovimiento({
          tipo: diferencia > 0 ? 'ingreso' : 'gasto',
          monto: Math.abs(diferencia),
          categoria: diferencia > 0 ? 'extra' : 'otros',
          nota: 'Ajuste de saldo',
          fuente: 'ajuste'
        });
        App.cerrarHoja();
        App.brindis(
          diferencia > 0
            ? `Tenías ${U.soles(diferencia)} más de lo anotado. Ajustado.`
            : `Ajustado. Ya cuadra con lo que tienes.`,
          'bien', 3400
        );
        App.pintar();
      };
    });
  }

  // ───────── Gastos fijos ─────────

  /** "cada 3 meses" / "todos los meses" */
  function cadaCuanto(f) {
    const n = Math.max(1, Math.round(U.numero(f.cadaMeses)) || 1);
    if (n === 1) return 'todos los meses';
    if (n === 2) return 'cada 2 meses';
    if (n === 3) return 'cada 3 meses';
    if (n === 6) return 'cada 6 meses';
    if (n === 12) return 'una vez al año';
    return `cada ${n} meses`;
  }

  function formularioFijo() {
    App.abrirHoja('Pago que se repite', `
      <label class="campo">
        <span>¿Qué es?</span>
        <input id="fijo-nombre" type="text" placeholder="Ej. Alquiler, luz, gas, seguro">
      </label>
      <label class="campo">
        <span>¿Cuánto?</span>
        <input id="fijo-monto" type="number" inputmode="decimal" step="0.01" min="0"
               placeholder="0.00" data-autofoco="no">
      </label>

      <label class="campo">
        <span>¿Siempre cuesta lo mismo?</span>
        <div class="opciones" id="fijo-tipo">
          <button class="opcion elegida" data-var="0">Sí, es fijo</button>
          <button class="opcion" data-var="1">Cambia cada vez</button>
        </div>
      </label>
      <p class="ayuda" id="fijo-ayuda-var" style="margin:-8px 0 16px">
        El alquiler es fijo. La luz, el agua o el gas cambian: ahí pon un
        aproximado y yo lo voy corrigiendo con lo que pagues de verdad.
      </p>

      <label class="campo">
        <span>¿Cada cuánto toca?</span>
        <div class="opciones" id="fijo-cada">
          <button class="opcion elegida" data-cada="1">Cada mes</button>
          <button class="opcion" data-cada="2">Cada 2</button>
          <button class="opcion" data-cada="3">Cada 3</button>
          <button class="opcion" data-cada="6">Cada 6</button>
          <button class="opcion" data-cada="12">Al año</button>
        </div>
      </label>

      <label class="campo">
        <span>¿Qué día del mes se paga?</span>
        <input id="fijo-dia" type="number" inputmode="numeric" min="1" max="31"
               placeholder="Ej. 5" data-autofoco="no">
      </label>

      <label class="campo" id="fijo-campo-ancla" style="display:none">
        <span>¿En qué mes toca la próxima vez?</span>
        <input id="fijo-ancla" type="month" value="${U.hoy().slice(0, 7)}" data-autofoco="no">
      </label>

      <button class="boton principal" data-guardar>Guardar</button>
    `, (cuerpo) => {
      let variable = false;
      let cada = 1;

      U.al('click', '[data-var]', (e, b) => {
        variable = b.dataset.var === '1';
        U.$$('#fijo-tipo .opcion', cuerpo).forEach((o) => o.classList.remove('elegida'));
        b.classList.add('elegida');
        U.vibrar(8);
      }, cuerpo);

      U.al('click', '[data-cada]', (e, b) => {
        cada = Number(b.dataset.cada) || 1;
        U.$$('#fijo-cada .opcion', cuerpo).forEach((o) => o.classList.remove('elegida'));
        b.classList.add('elegida');
        // El mes de referencia solo importa si no es mensual
        U.$('#fijo-campo-ancla').style.display = cada > 1 ? '' : 'none';
        U.vibrar(8);
      }, cuerpo);

      cuerpo.querySelector('[data-guardar]').onclick = () => {
        const nombre = U.$('#fijo-nombre').value.trim();
        const monto = U.numero(U.$('#fijo-monto').value);
        const dia = Math.min(31, Math.max(1, Math.round(U.numero(U.$('#fijo-dia').value)) || 1));
        if (!nombre || monto <= 0) { App.brindis('Falta el nombre o el monto.'); return; }
        const mesAncla = cada > 1
          ? (U.$('#fijo-ancla').value || U.hoy().slice(0, 7))
          : U.hoy().slice(0, 7);
        Almacen.agregarFijo({ nombre, monto, dia, variable, cadaMeses: cada, mesAncla });
        App.cerrarHoja();
        App.brindis(cada > 1
          ? 'Agregado. Lo guardo de a pocos cada mes. 🌱'
          : 'Agregado. Ya lo aparto de tu disponible.', 'bien', 3200);
        App.pintar();
      };
    });
  }

  /** Marcar un gasto fijo como pagado este mes. */
  async function confirmarFijo(id) {
    const f = Almacen.get().gastosFijos.find((x) => x.id === id);
    if (!f) return;
    const mes = U.hoy().slice(0, 7);
    if ((f.pagados || []).includes(mes)) {
      // Desmarcar
      f.pagados = f.pagados.filter((m) => m !== mes);
      Almacen.guardar();
      App.brindis('Lo marqué como no pagado.');
      App.pintar();
      return;
    }
    // Los variables (luz, agua, gas) cambian cada vez: preguntamos cuánto
    // vino de verdad y ese monto pasa a ser el nuevo aproximado.
    if (f.variable) {
      App.abrirHoja(f.nombre, `
        <p>Este cambia cada mes. ¿Cuánto vino esta vez?
        Con eso corrijo el aproximado para el siguiente.</p>
        <input id="fv-monto" class="monto-entrada" type="number" inputmode="decimal"
               step="0.01" min="0" value="${f.monto || ''}" placeholder="0.00"
               aria-label="Monto real">
        <p class="ayuda" style="text-align:center;margin:8px 0 18px">
          Tenía anotado ${U.soles(f.monto)} como aproximado
        </p>
        <button class="boton principal" data-guardar>Ya pagué esto</button>
      `, (cuerpo) => {
        cuerpo.querySelector('[data-guardar]').onclick = () => {
          const monto = U.numero(U.$('#fv-monto').value);
          if (monto <= 0) { App.brindis('Escribe cuánto pagaste.'); return; }
          Almacen.pagarFijo(id, monto);
          App.cerrarHoja();
          App.brindis('Anotado. Ya corregí el aproximado. 🌱', 'bien', 3000);
          App.pintar();
        };
      });
      return;
    }

    const si = await App.confirmar(
      f.nombre,
      `¿Ya pagaste ${U.soles(f.monto)}? Lo anoto como gasto de hoy.`,
      'Sí, ya pagué'
    );
    if (!si) return;
    Almacen.pagarFijo(id);
    App.brindis('Anotado. Una cosa menos. 🌱', 'bien');
    App.pintar();
  }

  // ───────── Categorías ─────────

  function gestionarCategorias() {
    const cats = Almacen.get().categorias;
    App.abrirHoja('Categorías', `
      <div class="lista" id="lista-cats">
        ${cats.map((x) => `
          <div class="item">
            <span style="font-size:20px">${x.emoji}</span>
            <div class="item-cuerpo">
              <div class="item-titulo">${U.esc(x.nombre)}</div>
              <div class="item-sub">${x.tipo === 'ingreso' ? 'ingreso' : 'gasto'}</div>
            </div>
            <button class="boton tenue chico" data-borrar-cat="${x.id}"
                    style="width:auto;padding:6px 8px" aria-label="Quitar">✕</button>
          </div>`).join('')}
      </div>
      <hr class="sep">
      <label class="campo">
        <span>Nueva categoría</span>
        <input id="cat-nombre" type="text" placeholder="Ej. Mascota">
      </label>
      <div class="fila-botones" style="margin-bottom:14px">
        <input id="cat-emoji" type="text" value="🏷️" maxlength="2"
               style="flex:0 0 76px;text-align:center" data-autofoco="no" aria-label="Emoji">
        <select id="cat-tipo" data-autofoco="no">
          <option value="gasto">Gasto</option>
          <option value="ingreso">Ingreso</option>
        </select>
      </div>
      <button class="boton principal" data-agregar-cat>Agregar</button>
    `, (cuerpo) => {
      cuerpo.querySelector('[data-agregar-cat]').onclick = () => {
        const nombre = U.$('#cat-nombre').value.trim();
        if (!nombre) { App.brindis('Ponle un nombre.'); return; }
        Almacen.agregarCategoria(nombre, U.$('#cat-emoji').value.trim(), U.$('#cat-tipo').value);
        App.cerrarHoja();
        App.brindis('Categoría agregada.', 'bien');
        App.pintar();
      };
      U.al('click', '[data-borrar-cat]', (e, b) => {
        Almacen.borrarCategoria(b.dataset.borrarCat);
        App.cerrarHoja();
        App.brindis('Quitada. Los registros viejos no se pierden.');
        App.pintar();
      }, cuerpo);
    });
  }

  // ───────── Eventos de la vista ─────────

  function enganchar(c) {
    engancharPorClasificar(c);
    U.al('click', '[data-presupuesto]', (e, b) => fijarPresupuesto(b.dataset.presupuesto), c);
    U.al('click', '[data-nuevo]', (e, b) => formularioMovimiento(b.dataset.nuevo), c);
    U.al('click', '[data-mov]', (e, b) => detalleMovimiento(b.dataset.mov), c);
    U.al('click', '[data-pagar-fijo]', (e, b) => confirmarFijo(b.dataset.pagarFijo), c);

    U.al('click', '[data-borrar-fijo]', async (e, b) => {
      e.stopPropagation();
      const si = await App.confirmar('Quitar pago fijo', '¿Lo saco de la lista?', 'Sí, quitar');
      if (!si) return;
      Almacen.borrarFijo(b.dataset.borrarFijo);
      App.brindis('Quitado.');
      App.pintar();
    }, c);

    const nf = c.querySelector('[data-nuevo-fijo]');
    if (nf) nf.onclick = formularioFijo;

    const gc = c.querySelector('[data-categorias]');
    if (gc) gc.onclick = gestionarCategorias;

    const as = c.querySelector('[data-ajustar-saldo]');
    if (as) as.onclick = ajustarSaldo;

    const rp = c.querySelector('[data-reparto]');
    if (rp) rp.onclick = formularioReparto;
  }

  return {
    pintar, formularioMovimiento, detalleMovimiento,
    formularioFijo, confirmarFijo, gestionarCategorias, fijarPresupuesto,
    ajustarSaldo, formularioReparto,
    tarjetaPorClasificar, engancharPorClasificar, clasificar, capturaRapida
  };
})();
