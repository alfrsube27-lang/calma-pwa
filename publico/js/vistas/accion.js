/* ===========================================================
   accion.js — "¿Y ahora qué hago?"

   Las otras pantallas muestran números. Esta dice qué hacer, en
   qué orden y con qué palabras. Tres partes:

     1. Cuando te paguen: el reparto exacto, paso por paso.
     2. Qué hacer con cada deuda: la acción concreta de cada una.
     3. Las reglas del día a día: tres frases, nada más.

   Cuando el dinero no alcanza para todo (que es lo normal al
   empezar), no se inventa un plan bonito: se dice hasta dónde
   llega y qué conviene hacer con lo que no alcanza.
   =========================================================== */

const Accion = (() => {

  // ───────── Reparto del pago ─────────

  /**
   * Reparte el dinero disponible en el orden que de verdad importa:
   * comer, lo que te mantiene funcionando, las deudas, y al final tú.
   * Marca cada paso según alcance completo, a medias o nada.
   */
  function repartoDelPago() {
    const a = Almacen.ajustes();
    const r = Calculo.resumenHoy();
    const dias = Calculo.diasRestantes();

    // Con lo que hay ahora. Si todavía no le pagan, con lo que espera.
    let bolsa = Calculo.saldoActual();
    if (bolsa <= 0) bolsa = U.numero(a.montoPago);
    const bolsaInicial = bolsa;

    const pasos = [];
    const tomar = (pedido) => {
      const dado = Math.max(0, Math.min(bolsa, pedido));
      bolsa = U.redondear(bolsa - dado);
      return U.redondear(dado);
    };

    // 1) Comer, siempre primero
    const comida = U.redondear(U.numero(a.comidaPorDia) * dias);
    if (comida > 0) {
      const dado = tomar(comida);
      pasos.push({
        clave: 'comida',
        emoji: '🍚',
        titulo: 'Aparta tu comida',
        detalle: `${U.soles(a.comidaPorDia)} al día × ${dias} días`,
        pedido: comida,
        dado,
        nota: 'Guárdalo aparte, en otro bolsillo o sobre. Esto no se toca.'
      });
    }

    /**
     * Si el periodo abarca más de un mes, un mismo pago puede vencer dos
     * veces (la moto el 30 de octubre y el 30 de noviembre). En la lista
     * eso se ve como un error, así que lo juntamos en una sola línea.
     */
    const agrupar = (clase) => {
      const mapa = new Map();
      for (const v of Calculo.vencimientos().filter((x) => x.clase === clase)) {
        const previo = mapa.get(v.id);
        if (previo) {
          previo.monto = U.redondear(previo.monto + v.monto);
          previo.veces++;
        } else {
          mapa.set(v.id, Object.assign({}, v, { veces: 1 }));
        }
      }
      return Array.from(mapa.values());
    };

    // 2) Los fijos que vencen antes del próximo pago
    for (const f of agrupar('fijo')) {
      const dado = tomar(f.monto);
      pasos.push({
        clave: 'fijo:' + f.id,
        emoji: '📌',
        titulo: `Paga ${f.nombre}`,
        detalle: (f.veces > 1 ? `${f.veces} veces antes del próximo pago · ` : '')
               + (f.atraso ? `venció hace ${f.atraso} días` : `vence el ${U.fechaCorta(f.fecha)}`),
        pedido: f.monto,
        dado,
        id: f.id,
        tipo: 'fijo'
      });
    }

    // 3) Las deudas con fecha, de menor a mayor:
    //    cerrar una completa libera cabeza y plata todos los meses.
    const cuotas = agrupar('deuda').sort((x, y) => x.monto - y.monto);
    for (const c of cuotas) {
      const dado = tomar(c.monto);
      pasos.push({
        clave: 'deuda:' + c.id,
        emoji: '🧾',
        titulo: `Paga ${c.nombre}`,
        detalle: (c.veces > 1 ? `${c.veces} cuotas antes del próximo pago · ` : '')
               + (c.atraso ? `vencida hace ${c.atraso} días` : `vence el ${U.fechaCorta(c.fecha)}`),
        pedido: c.monto,
        dado,
        id: c.id,
        tipo: 'deuda'
      });
    }

    return {
      bolsaInicial,
      pasos,
      sobra: U.redondear(bolsa),
      sobraPorDia: U.redondear(bolsa / Math.max(1, dias)),
      dias,
      alcanzaTodo: pasos.every((p) => p.dado >= p.pedido - 0.01)
    };
  }

  // ───────── Qué hacer con cada deuda ─────────

  /**
   * Para cada deuda, la acción concreta que toca ahora.
   * Ordenadas por lo que más mueve la aguja, no por monto.
   */
  function accionesPorDeuda() {
    const activas = Almacen.get().deudas.filter((d) => !d.terminada && d.saldo > 0);
    const plan = Plan.resumen();
    // Lo que de verdad podría ofrecer al mes si negocia
    const ofrecible = plan.alcanza
      ? Math.max(20, U.redondear((plan.paraTi + plan.extraDeudas) / Math.max(1, activas.length)))
      : 20;

    const lista = activas.map((d) => {
      const monto = Almacen.cuotaDe(d);

      if (d.porConfirmar) {
        return {
          d, prioridad: 2, emoji: '❓',
          que: 'Averigua cuánto debes',
          porque: 'Sin el monto no puedo meterla en el plan.',
          como: `Busca un recibo o mensaje de ${d.acreedor}, o llama y pide tu saldo.`,
          tarea: `Averiguar cuánto le debo a ${d.acreedor}`
        };
      }

      if (d.frecuencia === 'vencida') {
        return {
          d, prioridad: 1, emoji: '📞',
          que: `Llama y pide un acuerdo de pago`,
          porque: `Son ${U.soles(d.saldo)} que ya vencieron. Pagarlos de golpe no se puede, pero casi siempre aceptan partirlo en cuotas.`,
          como: guion(d, ofrecible),
          tarea: `Llamar a ${d.acreedor} y pedir un acuerdo de pago`,
          guion: true
        };
      }

      if (d.frecuencia === 'nosabe') {
        return {
          d, prioridad: 2, emoji: '📅',
          que: 'Averigua cuándo se paga',
          porque: 'Sin fecha no te puedo avisar antes de que venza.',
          como: `Pregunta a ${d.acreedor} qué día vence y cada cuánto.`,
          tarea: `Averiguar cuándo se paga lo de ${d.acreedor}`
        };
      }

      // La más chica de todas: cerrarla es una victoria real y rápida
      const masChica = activas
        .filter((x) => x.frecuencia !== 'vencida' && !x.porConfirmar)
        .sort((x, y) => x.saldo - y.saldo)[0];
      if (masChica && masChica.id === d.id && d.saldo <= 200) {
        return {
          d, prioridad: 3, emoji: '🎯',
          que: 'Termínala este mes',
          porque: `Son solo ${U.soles(d.saldo)}. Cerrar una completa se siente, y es una cuenta menos que recordar.`,
          como: 'Págala entera apenas tengas el dinero y táchala de la lista.'
        };
      }

      if (U.numero(d.interes) >= 30) {
        return {
          d, prioridad: 2, emoji: '🔥',
          que: 'Esta es la que más te cuesta',
          porque: `${d.interes}% al año: cada mes que pasa crece sola.`,
          como: 'Si te sobra algo, échaselo a esta antes que a las otras.'
        };
      }

      return {
        d, prioridad: 4, emoji: '✅',
        que: 'Sigue pagándola como vas',
        porque: `${U.soles(monto)} ${d.modoPago === 'total' ? 'en total' : 'al mes'}, el día ${d.diaPago}.`,
        como: 'Te aviso 3 días antes y el mismo día.'
      };
    });

    return lista.sort((a, b) => a.prioridad - b.prioridad || b.d.saldo - a.d.saldo);
  }

  /** Qué decir en la llamada. Escrito para poder leerlo tal cual. */
  function guion(d, ofrecible) {
    return `«Buenos días, le escribo por mi deuda de ${U.soles(d.saldo)}. `
         + `Quiero pagarla pero ahora no puedo todo junto. `
         + `¿Me pueden dar un convenio en cuotas? `
         + `Podría pagar unos ${U.soles(ofrecible)} al mes.»`;
  }

  // ───────── Pintado ─────────

  function pintar(c) {
    const a = Almacen.ajustes();
    const plan = Plan.resumen();

    let html = `
      <div class="encabezado-vista">
        <div class="fecha">tu plan de acción</div>
        <h1>¿Y ahora qué hago?</h1>
      </div>`;

    if (!plan.hayDatos) {
      html += `
        <div class="tarjeta">
          <p>Para decirte qué hacer necesito saber cuánto te pagan
          y cada cuánto.</p>
          <button class="boton principal" data-ir-ajustes>Completar mis datos</button>
        </div>`;
      c.innerHTML = html;
      enganchar(c);
      return;
    }

    // ── La foto honesta ──
    const deuda = Calculo.totalDeuda();
    const atrasado = Calculo.totalAtrasado();
    html += `
      <div class="tarjeta ${plan.alcanza ? '' : 'borde-aviso'}">
        <div class="tarjeta-titulo"><h3>Dónde estás parado</h3></div>
        <p>Entran <b>${U.soles(plan.ingreso)}</b> al mes. Lo que no se negocia
        — comida y pagos fijos — se lleva <b>${U.soles(plan.esenciales.total)}</b>.
        Te quedan <b>${U.soles(Math.max(0, plan.ingreso - plan.esenciales.total))}</b>
        para todo lo demás.</p>
        <p>Debes <b>${U.soles(deuda)}</b> en total${atrasado > 0
          ? `, y <b>${U.soles(atrasado)}</b> ya está vencido` : ''}.</p>
        ${!plan.alcanza ? `
          <p style="color:var(--aviso);font-weight:600;margin-bottom:4px">
            Con estos números no alcanza para pagarlo todo.</p>
          <p>Eso no es un fracaso tuyo, es una resta. Lo que sigue es qué hacer
          igual, empezando por lo que más ayuda.</p>` : ''}
      </div>`;

    // ── 1. Cuando te paguen ──
    const rep = repartoDelPago();
    const hechos = pasosHechos();

    html += `
      <div class="tarjeta">
        <div class="tarjeta-titulo">
          <h3>1 · Cuando te paguen</h3>
          <span class="pastilla acento">${U.soles(rep.bolsaInicial)}</span>
        </div>
        <p class="ayuda">El mismo día, en este orden. Ve marcando.</p>
        <div class="lista">`;

    rep.pasos.forEach((p, i) => {
      const hecho = hechos.includes(p.clave);
      const completo = p.dado >= p.pedido - 0.01;
      const nada = p.dado <= 0.01;
      html += `
          <div class="item ${hecho ? 'hecho' : ''}" style="flex-direction:column;
               align-items:stretch;gap:6px">
            <div style="display:flex;align-items:center;gap:12px">
              <button class="casilla ${hecho ? 'marcada' : ''}" data-paso="${p.clave}"
                      aria-label="Marcar ${U.esc(p.titulo)}">${hecho ? '✓' : ''}</button>
              <div class="item-cuerpo">
                <div class="item-titulo">${p.emoji} ${U.esc(p.titulo)}</div>
                <div class="item-sub">${U.esc(p.detalle)}</div>
              </div>
              <div class="item-monto ${nada ? 'estado-limite' : (completo ? '' : 'estado-aviso')}">
                ${U.soles(p.dado)}
              </div>
            </div>
            ${!completo ? `
              <div class="item-sub" style="padding-left:42px;color:var(--aviso)">
                ${nada
                  ? `No alcanza. Falta pagar ${U.soles(p.pedido)} — este es para pedir un acuerdo.`
                  : `Alcanza solo para esto. Faltarían ${U.soles(p.pedido - p.dado)}.`}
              </div>` : ''}
            ${p.nota && completo ? `
              <div class="item-sub" style="padding-left:42px">${U.esc(p.nota)}</div>` : ''}
          </div>`;
    });

    html += `</div>
        <hr class="sep">
        ${rep.sobra > 0 ? `
          <p style="font-weight:600;margin-bottom:2px">
            Te quedan ${U.soles(rep.sobra)} para ti</p>
          <p class="nota-abajo">Son ${U.soles(rep.sobraPorDia)} al día durante
          ${rep.dias} días. De ahí sale el número de la pantalla Hoy.</p>`
        : `<p style="font-weight:600;color:var(--aviso)">
             El pago se va completo en lo de arriba.</p>
           <p class="nota-abajo">Por eso el paso 2 importa más que apretarse el cinturón:
           bajar una cuota libera plata todos los meses.</p>`}
      </div>`;

    // ── 2. Qué hacer con cada deuda ──
    const acciones = accionesPorDeuda();
    if (acciones.length) {
      html += `
        <div class="tarjeta">
          <div class="tarjeta-titulo"><h3>2 · Qué hacer con cada deuda</h3></div>
          <p class="ayuda">En orden de lo que más te ayuda. Una por semana ya es avance.</p>
          <div class="lista">`;

      acciones.forEach((x, i) => {
        html += `
            <div class="item" style="flex-direction:column;align-items:stretch;gap:8px">
              <div style="display:flex;align-items:center;gap:12px">
                <span class="pastilla ${i === 0 ? 'acento' : ''}">${i + 1}</span>
                <div class="item-cuerpo">
                  <div class="item-titulo">${x.emoji} ${U.esc(x.d.acreedor)}</div>
                  <div class="item-sub">${U.esc(x.que)}</div>
                </div>
                <div class="item-monto">${U.soles(x.d.saldo)}</div>
              </div>
              <div class="item-sub" style="padding-left:40px">${U.esc(x.porque)}</div>
              ${x.guion ? `
                <div style="margin-left:40px;padding:12px;border-radius:12px;
                     background:var(--superficie-2);font-size:14px;line-height:1.5">
                  ${U.esc(x.como)}
                </div>` : `
                <div class="item-sub" style="padding-left:40px">${U.esc(x.como)}</div>`}
              ${x.tarea ? `
                <button class="boton chico" data-tarea="${U.esc(x.tarea)}"
                        style="margin-left:40px;width:auto">
                  Ponerlo en mis pendientes
                </button>` : ''}
            </div>`;
      });
      html += `</div></div>`;
    }

    // ── Lo que me dijiste en el chat ──
    const planes = (Almacen.get().planes || []).filter((x) =>
      U.diasEntre(U.hoy(), x.fecha) >= -31);
    if (planes.length) {
      html += `
        <div class="tarjeta">
          <div class="tarjeta-titulo"><h3>💬 Lo que me dijiste</h3></div>
          <div class="lista">
            ${planes.map((x) => {
              const meses = Math.max(1, Math.round(U.diasEntre(U.hoy(), x.fecha) / 30.44));
              return `
              <div class="item" style="flex-direction:column;align-items:stretch;gap:4px">
                <div style="display:flex;align-items:center;gap:12px">
                  <span style="font-size:20px">🎯</span>
                  <div class="item-cuerpo">
                    <div class="item-titulo">Pagar ${U.esc(x.acreedor)}</div>
                    <div class="item-sub">para ${U.fechaCorta(x.fecha)} de
                      ${U.deISO(x.fecha).getFullYear()} · faltan ${meses} meses</div>
                  </div>
                  <div class="item-monto">${U.soles(x.porMes)}<br>
                    <span class="item-sub">al mes</span></div>
                </div>
                <button class="boton tenue chico" data-borrar-plan="${x.id}"
                        style="align-self:flex-start">Ya no va</button>
              </div>`;
            }).join('')}
          </div>
        </div>`;
    }

    // ── 3. Las reglas ──
    html += `
      <div class="tarjeta">
        <div class="tarjeta-titulo"><h3>3 · Las reglas del día a día</h3></div>
        <div class="lista">
          ${regla('🍚', 'La comida se aparta primero',
            'Apenas te paguen, ese dinero sale de la cuenta y no vuelve.')}
          ${regla('📱', 'Mira el número de Hoy antes de gastar',
            'Si dice cero, es cero. No es un castigo: es que ese dinero ya tiene dueño.')}
          ${regla('🧾', 'Un pago parcial también cuenta',
            'Si solo puedes la mitad de una cuota, págala igual y anótala. Sirve.')}
          ${regla('📞', 'Llamar nunca empeora las cosas',
            'La deuda no crece por llamar. Casi siempre te dan facilidades.')}
          ${regla('🌙', 'Los días malos no se recuperan gastando',
            'Si estás mal, usa el modo día difícil. Mañana sigue aquí.')}
        </div>
      </div>`;

    c.innerHTML = html;
    enganchar(c);
  }

  function regla(emoji, titulo, detalle) {
    return `
      <div class="item">
        <span style="font-size:22px">${emoji}</span>
        <div class="item-cuerpo">
          <div class="item-titulo">${U.esc(titulo)}</div>
          <div class="item-sub">${U.esc(detalle)}</div>
        </div>
      </div>`;
  }

  // ───────── Marcado de los pasos ─────────

  /** Los pasos marcados se reinician con cada pago nuevo. */
  function pasosHechos() {
    const a = Almacen.ajustes();
    const p = a.pasosPago || {};
    if (p.periodo !== a.ultimoPago) return [];
    return p.hechos || [];
  }

  function alternarPaso(clave) {
    const a = Almacen.ajustes();
    if (!a.pasosPago || a.pasosPago.periodo !== a.ultimoPago) {
      a.pasosPago = { periodo: a.ultimoPago, hechos: [] };
    }
    const i = a.pasosPago.hechos.indexOf(clave);
    if (i >= 0) a.pasosPago.hechos.splice(i, 1);
    else {
      a.pasosPago.hechos.push(clave);
      Almacen.marcarActivo();
    }
    Almacen.guardar();
    return i < 0;
  }

  // ───────── Eventos ─────────

  function enganchar(c) {
    U.al('click', '[data-paso]', (e, b) => {
      const hecho = alternarPaso(b.dataset.paso);
      U.vibrar();
      if (hecho) App.brindis(U.azar(['Hecho. 🌱', 'Uno menos.', 'Vas bien.']), 'bien', 1600);
      App.pintar();
    }, c);

    U.al('click', '[data-tarea]', (e, b) => {
      const titulo = b.dataset.tarea;
      Almacen.agregarPendiente({
        tipo: 'tarea',
        titulo,
        fecha: U.hoy(),
        prioridad: 'alta',
        notificar: false,
        subtareas: [
          { id: U.id(), titulo: 'Buscar el número o el correo', hecha: false },
          { id: U.id(), titulo: 'Leer el guión una vez', hecha: false },
          { id: U.id(), titulo: 'Llamar', hecha: false },
          { id: U.id(), titulo: 'Anotar lo que me dijeron', hecha: false }
        ]
      });
      App.brindis('Listo, está en tu agenda con sus pasos.', 'bien', 3200);
      App.pintar();
    }, c);

    U.al('click', '[data-borrar-plan]', (e, b) => {
      const est = Almacen.get();
      est.planes = (est.planes || []).filter((x) => x.id !== b.dataset.borrarPlan);
      Almacen.guardar();
      App.brindis('Quitado. Los planes cambian, no pasa nada.');
      App.pintar();
    }, c);

    const irAjustes = c.querySelector('[data-ir-ajustes]');
    if (irAjustes) irAjustes.onclick = () => App.ir('ajustes');
  }

  return { pintar, repartoDelPago, accionesPorDeuda };
})();
