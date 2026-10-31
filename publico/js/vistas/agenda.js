/* ===========================================================
   agenda.js — pendientes, rutinas diarias y calendario simple.
   Tipos: tarea, reunión, tarea de casa, pago, otro.
   =========================================================== */

const Agenda = (() => {

  const TIPOS = {
    tarea:   { emoji: '📝', nombre: 'Tarea' },
    reunion: { emoji: '📅', nombre: 'Reunión' },
    casa:    { emoji: '🧺', nombre: 'Casa' },
    pago:    { emoji: '💵', nombre: 'Pago' },
    otro:    { emoji: '🔔', nombre: 'Otro' }
  };

  let modo = 'dia';          // 'dia' | 'semana'
  let fechaElegida = U.hoy();

  function pintar(c) {
    let html = `
      <div class="encabezado-vista">
        <div class="fecha">${U.fechaLarga(fechaElegida)}</div>
        <h1>Agenda</h1>
      </div>

      <div class="opciones" style="margin-bottom:14px">
        <button class="opcion ${modo === 'dia' ? 'elegida' : ''}" data-modo="dia">Día</button>
        <button class="opcion ${modo === 'semana' ? 'elegida' : ''}" data-modo="semana">Semana</button>
      </div>
    `;

    html += tiraSemana();

    html += modo === 'dia' ? vistaDia() : vistaSemana();

    html += rutinas();

    html += `<button class="boton principal" data-nuevo style="margin-top:4px">
      + Agregar pendiente</button>`;

    c.innerHTML = html;
    enganchar(c);
  }

  // ───────── Tira de 7 días (calendario simple) ─────────

  function tiraSemana() {
    const lunes = U.lunesDe(fechaElegida);
    let html = `
      <div class="tarjeta">
        <div class="cal-cabecera">
          <button class="cal-flecha" data-semana="-1" aria-label="Semana anterior">‹</button>
          <span class="mes">${U.MESES[U.deISO(lunes).getMonth()]} ${U.deISO(lunes).getFullYear()}</span>
          <button class="cal-flecha" data-semana="1" aria-label="Semana siguiente">›</button>
        </div>
        <div class="cal-rejilla">
          ${['lun', 'mar', 'mié', 'jue', 'vie', 'sáb', 'dom']
            .map((d) => `<div class="cal-dia-nombre">${d}</div>`).join('')}`;

    for (let i = 0; i < 7; i++) {
      const fecha = U.sumarDias(lunes, i);
      const pend = Almacen.pendientesDe(fecha).filter((p) => !p.hechoHoy);
      const vence = Calculo.vencimientos().some((v) => v.fecha === fecha);
      const clases = [
        'cal-dia',
        fecha === U.hoy() ? 'hoy' : '',
        fecha === fechaElegida ? 'elegido' : ''
      ].join(' ');
      html += `
          <button class="${clases}" data-dia="${fecha}">
            ${U.deISO(fecha).getDate()}
            ${(pend.length || vence) ? '<span class="cal-punto"></span>' : ''}
          </button>`;
    }
    return html + `</div></div>`;
  }

  // ───────── Vista de un día ─────────

  function vistaDia() {
    const pend = Almacen.pendientesDe(fechaElegida);
    const sinHacer = pend.filter((p) => !p.hechoHoy);
    const hechos = pend.filter((p) => p.hechoHoy);
    const vencen = Calculo.vencimientos().filter((v) => v.fecha === fechaElegida);

    let html = `
      <div class="tarjeta">
        <div class="tarjeta-titulo">
          <h3 class="capital">${fechaElegida === U.hoy() ? 'Hoy' : U.cuando(fechaElegida)}</h3>
          ${hechos.length ? `<span class="pastilla bien">${hechos.length} hecho${hechos.length === 1 ? '' : 's'}</span>` : ''}
        </div>`;

    if (vencen.length) {
      html += `<div class="lista" style="margin-bottom:10px">
        ${vencen.map((v) => `
          <div class="item item-alta">
            <span style="font-size:20px">${v.clase === 'deuda' ? '🧾' : '📌'}</span>
            <div class="item-cuerpo">
              <div class="item-titulo">${U.esc(v.nombre)}</div>
              <div class="item-sub">${v.clase === 'deuda' ? 'cuota' : 'pago fijo'}</div>
            </div>
            <div class="item-monto">${U.soles(v.monto)}</div>
          </div>`).join('')}
      </div>`;
    }

    if (!pend.length && !vencen.length) {
      html += `<p class="vacio">Nada para este día.<br>Disfrútalo.</p>`;
    } else {
      html += '<div class="lista">';
      for (const p of sinHacer) html += item(p);
      for (const p of hechos) html += item(p);
      html += '</div>';
    }
    return html + '</div>';
  }

  // ───────── Vista de la semana ─────────

  function vistaSemana() {
    const lunes = U.lunesDe(fechaElegida);
    let html = `<div class="tarjeta"><div class="tarjeta-titulo"><h3>Esta semana</h3></div>`;
    let algo = false;

    for (let i = 0; i < 7; i++) {
      const fecha = U.sumarDias(lunes, i);
      const pend = Almacen.pendientesDe(fecha);
      const vencen = Calculo.vencimientos().filter((v) => v.fecha === fecha);
      if (!pend.length && !vencen.length) continue;
      algo = true;
      html += `
        <div style="margin:16px 0 8px">
          <span class="item-sub capital" style="${fecha === U.hoy() ? 'color:var(--acento);font-weight:600' : ''}">
            ${U.DIAS_LARGO[U.deISO(fecha).getDay()]} ${U.deISO(fecha).getDate()}
          </span>
        </div>
        <div class="lista">`;
      for (const p of pend) html += item(p, fecha);
      for (const v of vencen) {
        html += `
          <div class="item">
            <span style="font-size:20px">${v.clase === 'deuda' ? '🧾' : '📌'}</span>
            <div class="item-cuerpo"><div class="item-titulo">${U.esc(v.nombre)}</div></div>
            <div class="item-monto">${U.soles(v.monto)}</div>
          </div>`;
      }
      html += '</div>';
    }

    if (!algo) html += `<p class="vacio">La semana está libre.</p>`;
    return html + '</div>';
  }

  /** Fila de un pendiente. */
  function item(p, fecha = fechaElegida) {
    const t = TIPOS[p.tipo] || TIPOS.otro;
    const hecho = p.hechoHoy !== undefined ? p.hechoHoy : Almacen.estaHecho(p, fecha);
    const subs = p.subtareas || [];
    const detalles = [];
    if (p.hora) detalles.push(p.hora);
    if (p.tipo === 'reunion' && p.duracion) detalles.push(`${p.duracion} min`);
    if (p.lugar) detalles.push(p.lugar);
    if (subs.length) detalles.push(`${subs.filter((s) => s.hecha).length}/${subs.length} pasos`);
    if (p.repetir && p.repetir.tipo !== 'no') detalles.push('se repite');
    if (p.arrastres) detalles.push('viene de antes');

    return `
      <div class="item ${hecho ? 'hecho' : ''} ${p.prioridad === 'alta' ? 'item-alta' : ''}">
        <button class="casilla ${hecho ? 'marcada' : ''}" data-marcar="${p.id}"
                data-fecha="${fecha}" aria-label="Marcar ${U.esc(p.titulo)}">
          ${hecho ? '✓' : ''}
        </button>
        <button class="item-cuerpo" data-abrir="${p.id}" style="text-align:left">
          <div class="item-titulo">${t.emoji} ${U.esc(p.titulo)}</div>
          ${detalles.length ? `<div class="item-sub">${U.esc(detalles.join(' · '))}</div>` : ''}
        </button>
      </div>`;
  }

  // ───────── Rutinas diarias ─────────

  function rutinas() {
    const lista = Almacen.get().rutinas.filter((r) => r.activa);
    let html = `
      <div class="tarjeta">
        <div class="tarjeta-titulo">
          <h3>Rutinas de cada día</h3>
          <button class="boton chico" data-nueva-rutina style="width:auto">+ Agregar</button>
        </div>`;

    if (!lista.length) {
      html += `<p class="vacio">Cosas que se reinician cada día:<br>
        tender la cama, lavar los platos, tomar pastillas…</p>`;
    } else {
      html += '<div class="lista">';
      for (const r of lista) {
        const hecha = Almacen.rutinaHecha(r, fechaElegida);
        html += `
          <div class="item ${hecha ? 'hecho' : ''}">
            <button class="casilla ${hecha ? 'marcada' : ''}" data-rutina="${r.id}"
                    aria-label="Marcar ${U.esc(r.titulo)}">${hecha ? '✓' : ''}</button>
            <div class="item-cuerpo"><div class="item-titulo">${U.esc(r.titulo)}</div></div>
            <button class="boton tenue chico" data-borrar-rutina="${r.id}"
                    style="width:auto;padding:6px 8px" aria-label="Quitar">✕</button>
          </div>`;
      }
      html += '</div>';
    }
    return html + '</div>';
  }

  // ───────── Formulario de pendiente ─────────

  function formularioPendiente(id) {
    const p = id ? Almacen.get().pendientes.find((x) => x.id === id) : null;
    let tipo = p ? p.tipo : 'tarea';
    let prioridad = p ? p.prioridad : 'normal';
    let repetir = p ? JSON.parse(JSON.stringify(p.repetir || { tipo: 'no', dias: [] }))
                    : { tipo: 'no', dias: [] };

    const html = `
      <label class="campo">
        <span>¿Qué es?</span>
        <input id="pe-titulo" type="text" value="${p ? U.esc(p.titulo) : ''}"
               placeholder="Ej. Llamar al banco">
      </label>

      <label class="campo">
        <span>Tipo</span>
        <div class="opciones" id="pe-tipos">
          ${Object.keys(TIPOS).map((k) => `
            <button class="opcion ${k === tipo ? 'elegida' : ''}" data-tipo="${k}">
              ${TIPOS[k].emoji} ${TIPOS[k].nombre}
            </button>`).join('')}
        </div>
      </label>

      <div class="fila-botones" style="margin-bottom:14px">
        <label class="campo" style="flex:1;margin:0">
          <span>Día</span>
          <input id="pe-fecha" type="date" value="${p ? p.fecha : fechaElegida}" data-autofoco="no">
        </label>
        <label class="campo" style="flex:1;margin:0">
          <span>Hora (opcional)</span>
          <input id="pe-hora" type="time" value="${p && p.hora ? p.hora : ''}" data-autofoco="no">
        </label>
      </div>

      <div id="pe-reunion" class="${tipo === 'reunion' ? '' : 'oculto'}">
        <div class="fila-botones" style="margin-bottom:14px">
          <label class="campo" style="flex:1;margin:0">
            <span>Dura (min)</span>
            <input id="pe-duracion" type="number" inputmode="numeric" min="5" step="5"
                   value="${p && p.duracion ? p.duracion : 60}" data-autofoco="no">
          </label>
          <label class="campo" style="flex:1;margin:0">
            <span>Avísame antes</span>
            <select id="pe-aviso" data-autofoco="no">
              ${[5, 10, 15, 30, 60].map((m) => `
                <option value="${m}" ${(p ? p.avisoMin : Almacen.ajustes().avisoReunionMin) == m ? 'selected' : ''}>
                  ${m} min
                </option>`).join('')}
            </select>
          </label>
        </div>
      </div>

      <label class="campo">
        <span>Lugar o enlace (opcional)</span>
        <input id="pe-lugar" type="text" value="${p && p.lugar ? U.esc(p.lugar) : ''}"
               placeholder="Ej. Zoom, consultorio, casa" data-autofoco="no">
      </label>

      <label class="campo">
        <span>¿Se repite?</span>
        <div class="opciones" id="pe-repetir">
          ${[['no', 'No'], ['diaria', 'Cada día'], ['dias', 'Días que elija'],
             ['semanal', 'Cada semana'], ['mensual', 'Cada mes']]
            .map(([k, n]) => `
              <button class="opcion ${repetir.tipo === k ? 'elegida' : ''}" data-rep="${k}">${n}</button>
            `).join('')}
        </div>
      </label>

      <div id="pe-dias" class="${repetir.tipo === 'dias' ? '' : 'oculto'}" style="margin:-6px 0 14px">
        <div class="opciones">
          ${U.DIAS_CORTO.map((d, i) => `
            <button class="opcion ${(repetir.dias || []).includes(i) ? 'elegida' : ''}"
                    data-dia-sem="${i}" style="padding:12px 13px">${d}</button>`).join('')}
        </div>
      </div>

      <label class="campo">
        <span>Prioridad</span>
        <div class="opciones" id="pe-prioridad">
          <button class="opcion ${prioridad === 'normal' ? 'elegida' : ''}" data-pri="normal">Normal</button>
          <button class="opcion ${prioridad === 'alta' ? 'elegida' : ''}" data-pri="alta">Alta</button>
        </div>
      </label>

      <div class="fila-interruptor">
        <div class="texto">
          Avisarme con sonido
          <small>Necesita notificaciones activas</small>
        </div>
        <button class="interruptor ${!p || p.notificar ? 'encendido' : ''}" id="pe-notificar"
                role="switch" aria-checked="${!p || p.notificar}"></button>
      </div>

      <button class="boton principal" data-guardar style="margin-top:18px">Guardar</button>
      ${p ? '<button class="boton tenue" data-borrar style="margin-top:10px">Quitar</button>' : ''}
    `;

    App.abrirHoja(p ? 'Editar pendiente' : 'Nuevo pendiente', html, (cuerpo) => {
      // Tipo
      U.al('click', '[data-tipo]', (e, b) => {
        tipo = b.dataset.tipo;
        U.$$('#pe-tipos .opcion', cuerpo).forEach((o) => o.classList.remove('elegida'));
        b.classList.add('elegida');
        U.$('#pe-reunion').classList.toggle('oculto', tipo !== 'reunion');
      }, cuerpo);

      // Repetición
      U.al('click', '[data-rep]', (e, b) => {
        repetir.tipo = b.dataset.rep;
        U.$$('#pe-repetir .opcion', cuerpo).forEach((o) => o.classList.remove('elegida'));
        b.classList.add('elegida');
        U.$('#pe-dias').classList.toggle('oculto', repetir.tipo !== 'dias');
      }, cuerpo);

      U.al('click', '[data-dia-sem]', (e, b) => {
        const d = Number(b.dataset.diaSem);
        repetir.dias = repetir.dias || [];
        const i = repetir.dias.indexOf(d);
        if (i >= 0) { repetir.dias.splice(i, 1); b.classList.remove('elegida'); }
        else { repetir.dias.push(d); b.classList.add('elegida'); }
      }, cuerpo);

      // Prioridad
      U.al('click', '[data-pri]', (e, b) => {
        prioridad = b.dataset.pri;
        U.$$('#pe-prioridad .opcion', cuerpo).forEach((o) => o.classList.remove('elegida'));
        b.classList.add('elegida');
      }, cuerpo);

      // Interruptor de aviso
      const inter = cuerpo.querySelector('#pe-notificar');
      inter.onclick = () => {
        const on = inter.classList.toggle('encendido');
        inter.setAttribute('aria-checked', String(on));
      };

      cuerpo.querySelector('[data-guardar]').onclick = () => {
        const titulo = U.$('#pe-titulo').value.trim();
        if (!titulo) { App.brindis('Escribe qué es, aunque sea corto.'); return; }

        const datos = {
          tipo,
          titulo,
          fecha: U.$('#pe-fecha').value || U.hoy(),
          hora: U.$('#pe-hora').value || '',
          duracion: tipo === 'reunion' ? Math.max(5, U.numero(U.$('#pe-duracion').value) || 60) : 0,
          avisoMin: tipo === 'reunion' ? U.numero(U.$('#pe-aviso').value) : 0,
          lugar: U.$('#pe-lugar').value.trim(),
          prioridad,
          repetir,
          notificar: inter.classList.contains('encendido')
        };

        if (p) { Object.assign(p, datos); Almacen.guardar(); }
        else Almacen.agregarPendiente(datos);

        App.cerrarHoja();
        App.brindis(p ? 'Actualizado.' : 'Anotado. Yo me acuerdo por ti. 🌱', 'bien');
        App.pintar();
      };

      const borrar = cuerpo.querySelector('[data-borrar]');
      if (borrar) {
        borrar.onclick = async () => {
          const si = await App.confirmar('Quitar pendiente', '¿Lo saco de la lista?', 'Sí, quitar');
          if (!si) return;
          Almacen.borrarPendiente(id);
          App.cerrarHoja();
          App.brindis('Quitado.');
          App.pintar();
        };
      }
    });
  }

  // ───────── Detalle con subtareas ─────────

  function detallePendiente(id) {
    const p = Almacen.get().pendientes.find((x) => x.id === id);
    if (!p) return;
    const t = TIPOS[p.tipo] || TIPOS.otro;
    const subs = p.subtareas || [];
    const hecho = Almacen.estaHecho(p, fechaElegida);

    App.abrirHoja(`${t.emoji} ${p.titulo}`, `
      <p class="ayuda" style="margin-top:-8px">
        ${U.fechaLarga(p.fecha)}${p.hora ? ' · ' + p.hora : ''}
        ${p.lugar ? ' · ' + U.esc(p.lugar) : ''}
        ${p.repetir && p.repetir.tipo !== 'no' ? ' · se repite' : ''}
      </p>

      <button class="boton ${hecho ? '' : 'principal'}" data-marcar-todo>
        ${hecho ? 'Desmarcar' : 'Marcar como hecho'}
      </button>

      <hr class="sep">
      <div class="tarjeta-titulo">
        <h3>Pasos pequeños</h3>
      </div>
      <p class="ayuda">Si la tarea se siente grande, pártela. Un paso ya es avance.</p>
      <div class="lista" id="subs">
        ${subs.map((s) => `
          <div class="item ${s.hecha ? 'hecho' : ''}">
            <button class="casilla ${s.hecha ? 'marcada' : ''}" data-sub="${s.id}"
                    aria-label="Marcar paso">${s.hecha ? '✓' : ''}</button>
            <div class="item-cuerpo"><div class="item-titulo">${U.esc(s.titulo)}</div></div>
            <button class="boton tenue chico" data-borrar-sub="${s.id}"
                    style="width:auto;padding:6px 8px" aria-label="Quitar paso">✕</button>
          </div>`).join('')}
      </div>
      <div class="fila-botones" style="margin-top:12px">
        <input id="sub-nuevo" type="text" placeholder="Agregar un paso" data-autofoco="no">
        <button class="boton chico" data-agregar-sub style="flex:0 0 90px">Agregar</button>
      </div>

      <hr class="sep">
      <div class="fila-botones">
        <button class="boton chico" data-editar>Editar</button>
        <button class="boton chico" data-manana>Pasar a mañana</button>
      </div>
    `, (cuerpo) => {
      cuerpo.querySelector('[data-marcar-todo]').onclick = () => {
        const quedo = Almacen.alternarPendiente(id, fechaElegida);
        App.cerrarHoja();
        if (quedo) App.brindis('¡Hecho! Eso cuenta. 🌱', 'bien');
        App.pintar();
      };

      U.al('click', '[data-sub]', (e, b) => {
        Almacen.alternarSubtarea(id, b.dataset.sub);
        U.vibrar();
        detallePendiente(id);
      }, cuerpo);

      U.al('click', '[data-borrar-sub]', (e, b) => {
        p.subtareas = (p.subtareas || []).filter((s) => s.id !== b.dataset.borrarSub);
        Almacen.guardar();
        detallePendiente(id);
      }, cuerpo);

      cuerpo.querySelector('[data-agregar-sub]').onclick = () => {
        const texto = U.$('#sub-nuevo').value.trim();
        if (!texto) return;
        p.subtareas = p.subtareas || [];
        p.subtareas.push({ id: U.id(), titulo: texto, hecha: false });
        Almacen.guardar();
        detallePendiente(id);
      };

      cuerpo.querySelector('[data-editar]').onclick = () => {
        App.cerrarHoja();
        setTimeout(() => formularioPendiente(id), 180);
      };

      cuerpo.querySelector('[data-manana]').onclick = () => {
        p.fecha = U.sumarDias(U.hoy(), 1);
        p.hecha = false;
        Almacen.guardar();
        App.cerrarHoja();
        App.brindis('Pasa a mañana. Sin culpa.', '', 2600);
        App.pintar();
      };
    });
  }

  // ───────── Rutina nueva ─────────

  function formularioRutina() {
    App.abrirHoja('Rutina diaria', `
      <label class="campo">
        <span>¿Qué quieres hacer cada día?</span>
        <input id="ru-titulo" type="text" placeholder="Ej. Tender la cama">
      </label>
      <div class="opciones" style="margin-bottom:18px" id="ru-sug">
        <button class="opcion" data-sug="Tender la cama">Tender la cama</button>
        <button class="opcion" data-sug="Lavar los platos">Lavar los platos</button>
        <button class="opcion" data-sug="Tomar mis pastillas">Pastillas</button>
        <button class="opcion" data-sug="Salir a caminar">Caminar</button>
      </div>
      <button class="boton principal" data-guardar>Agregar</button>
      <p class="ayuda" style="margin-top:12px">
        Se reinicia cada día. Si un día no la haces, no pasa nada.
      </p>
    `, (cuerpo) => {
      U.al('click', '[data-sug]', (e, b) => { U.$('#ru-titulo').value = b.dataset.sug; }, cuerpo);
      cuerpo.querySelector('[data-guardar]').onclick = () => {
        const t = U.$('#ru-titulo').value.trim();
        if (!t) { App.brindis('Escribe la rutina.'); return; }
        Almacen.agregarRutina(t);
        App.cerrarHoja();
        App.brindis('Agregada. Un paso a la vez. 🌱', 'bien');
        App.pintar();
      };
    });
  }

  // ───────── Eventos ─────────

  function enganchar(c) {
    U.al('click', '[data-modo]', (e, b) => { modo = b.dataset.modo; App.pintar(); }, c);
    U.al('click', '[data-dia]', (e, b) => { fechaElegida = b.dataset.dia; App.pintar(); }, c);
    U.al('click', '[data-semana]', (e, b) => {
      fechaElegida = U.sumarDias(fechaElegida, 7 * Number(b.dataset.semana));
      App.pintar();
    }, c);

    U.al('click', '[data-marcar]', (e, b) => {
      const hecho = Almacen.alternarPendiente(b.dataset.marcar, b.dataset.fecha || fechaElegida);
      U.vibrar();
      if (hecho) App.brindis(U.azar(['¡Hecho! 🌱', 'Una menos.', 'Eso cuenta.']), 'bien', 1800);
      App.pintar();
    }, c);

    U.al('click', '[data-abrir]', (e, b) => detallePendiente(b.dataset.abrir), c);

    U.al('click', '[data-rutina]', (e, b) => {
      const hecha = Almacen.alternarRutina(b.dataset.rutina, fechaElegida);
      U.vibrar();
      if (hecha) App.brindis('Listo. 🌱', 'bien', 1500);
      App.pintar();
    }, c);

    U.al('click', '[data-borrar-rutina]', async (e, b) => {
      const si = await App.confirmar('Quitar rutina', '¿La saco de la lista?', 'Sí, quitar');
      if (!si) return;
      Almacen.borrarRutina(b.dataset.borrarRutina);
      App.pintar();
    }, c);

    const nuevo = c.querySelector('[data-nuevo]');
    if (nuevo) nuevo.onclick = () => formularioPendiente();

    const nr = c.querySelector('[data-nueva-rutina]');
    if (nr) nr.onclick = formularioRutina;
  }

  return { pintar, formularioPendiente, detallePendiente, formularioRutina };
})();

