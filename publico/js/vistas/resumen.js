/* ===========================================================
   resumen.js — la pestaña "Ti": racha flexible, resumen semanal,
   consejos con sus propios datos, logros y meta de emergencia.
   Todo en tono amable: describe, nunca regaña.
   =========================================================== */

const Resumen = (() => {

  function pintar(c) {
    const s = Calculo.resumenSemana();
    const racha = Calculo.racha();
    const meta = Calculo.metaEmergencia();
    const logros = Almacen.get().logros.slice().reverse().slice(0, 6);
    const nombre = Almacen.ajustes().nombre;

    let html = `
      <div class="encabezado-vista">
        <div class="fecha">${U.fechaCorta(s.inicio)} – ${U.fechaCorta(s.fin)}</div>
        <h1>${nombre ? U.esc(nombre) : 'Tú'}</h1>
      </div>

      <!-- Racha flexible -->
      <div class="tarjeta borde-bien">
        <p class="etiqueta-arriba">Días seguidos haciendo algo</p>
        <div class="monto-gigante estado-bien">${racha}</div>
        <p class="nota-abajo">
          Cuenta cualquier día en que hiciste al menos una cosa.
          Un día malo no reinicia nada.
        </p>
      </div>

      <!-- Semana en números -->
      <div class="tarjeta">
        <div class="tarjeta-titulo"><h3>Tu semana</h3></div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
          ${bloque('Gastaste', U.soles(s.totalGastado))}
          ${bloque('Entró', U.soles(s.totalIngresos))}
          ${bloque('Cosas hechas', String(s.tareas))}
          ${bloque('Días activos', `${s.diasActivos}/7`)}
        </div>
        <p class="nota-abajo">Promedio ${U.soles(s.promedioDiario)} por día.</p>
      </div>`;

    // ── Top 3 categorías ──
    if (s.top.length) {
      html += `
        <div class="tarjeta">
          <div class="tarjeta-titulo"><h3>En qué se fue</h3></div>
          <div class="lista">`;
      for (const t of s.top) {
        html += `
            <div class="item" style="flex-direction:column;align-items:stretch;gap:6px">
              <div style="display:flex;align-items:center;gap:12px">
                <span style="font-size:20px">${t.emoji}</span>
                <div class="item-cuerpo">
                  <div class="item-titulo">${U.esc(t.nombre)}</div>
                  <div class="item-sub">${t.porcentaje}% de la semana</div>
                </div>
                <div class="item-monto">${U.soles(t.monto)}</div>
              </div>
              <div class="barra" style="margin:0"><i style="width:${t.porcentaje}%"></i></div>
            </div>`;
      }
      html += `</div></div>`;
    }

    // ── Consejos basados en sus datos ──
    const consejos = Calculo.consejos();
    html += `
      <div class="tarjeta">
        <div class="tarjeta-titulo"><h3>Lo que veo</h3></div>
        ${consejos.map((x) => `<p>• ${U.esc(x)}</p>`).join('')}
      </div>`;

    // ── Meta de fondo de emergencia ──
    html += `
      <div class="tarjeta ${meta.activa && meta.porcentaje >= 100 ? 'borde-bien' : ''}">
        <div class="tarjeta-titulo">
          <h3>🛟 Fondo de emergencia</h3>
          <button class="boton chico" data-meta style="width:auto">
            ${meta.meta > 0 ? 'Cambiar' : 'Crear'}
          </button>
        </div>`;

    if (!meta.meta) {
      html += `<p>Cuando estés listo, ponte una meta chica para imprevistos.
        No corre prisa: primero las cuotas.</p>`;
    } else if (meta.bloqueadaPorDeudas) {
      html += `
        <p>Tienes una cuota pendiente este mes. Primero esa, después el colchón.
        La meta te espera aquí.</p>
        <div class="barra"><i style="width:${meta.porcentaje}%"></i></div>
        <p class="nota-abajo">${U.soles(meta.ahorro)} de ${U.soles(meta.meta)}</p>`;
    } else {
      html += `
        <div class="barra ${meta.porcentaje >= 100 ? '' : ''}">
          <i style="width:${meta.porcentaje}%"></i>
        </div>
        <p class="nota-abajo">
          ${meta.porcentaje >= 100
            ? '¡Meta cumplida! Ese colchón es tuyo. 🌱'
            : `${U.soles(meta.ahorro)} de ${U.soles(meta.meta)} · falta ${U.soles(meta.falta)}`}
        </p>
        <button class="boton chico" data-aportar style="margin-top:10px">Aporté algo hoy</button>`;
    }
    html += `</div>`;

    // ── Logros ──
    if (logros.length) {
      html += `
        <div class="tarjeta">
          <div class="tarjeta-titulo"><h3>🎉 Logros</h3></div>
          <div class="lista">
            ${logros.map((l) => `
              <div class="item">
                <span style="font-size:20px">🏅</span>
                <div class="item-cuerpo">
                  <div class="item-titulo">${U.esc(l.texto)}</div>
                  <div class="item-sub">${U.fechaCorta(l.fecha)}</div>
                </div>
              </div>`).join('')}
          </div>
        </div>`;
    }

    html += `
      <button class="boton" data-ajustes style="margin-top:4px">⚙️ Ajustes</button>`;

    c.innerHTML = html;
    enganchar(c);
  }

  function bloque(etiqueta, valor) {
    return `
      <div style="background:var(--superficie-2);border-radius:var(--radio-chico);padding:14px">
        <div class="item-sub">${U.esc(etiqueta)}</div>
        <div style="font-size:22px;font-weight:650;margin-top:2px;
                    font-variant-numeric:tabular-nums">${valor}</div>
      </div>`;
  }

  // ───────── Meta de emergencia ─────────

  function formularioMeta() {
    const a = Almacen.ajustes();
    App.abrirHoja('Fondo de emergencia', `
      <p>Un monto chico para cuando algo se rompe o te enfermas.
      Tú decides cuánto; no hay número correcto.</p>
      <label class="campo">
        <span>Mi meta</span>
        <input id="me-meta" class="monto-entrada" type="number" inputmode="decimal"
               step="0.01" min="0" value="${a.metaEmergencia || ''}" placeholder="0.00">
      </label>
      <label class="campo">
        <span>Ya tengo guardado</span>
        <input id="me-ahorro" type="number" inputmode="decimal" step="0.01" min="0"
               value="${a.ahorroEmergencia || ''}" placeholder="0.00" data-autofoco="no">
      </label>
      <button class="boton principal" data-guardar>Guardar</button>
    `, (cuerpo) => {
      cuerpo.querySelector('[data-guardar]').onclick = () => {
        a.metaEmergencia = U.redondear(U.numero(U.$('#me-meta').value));
        a.ahorroEmergencia = U.redondear(U.numero(U.$('#me-ahorro').value));
        Almacen.guardar();
        App.cerrarHoja();
        App.brindis('Guardado. Sin presión. 🌱', 'bien');
        App.pintar();
      };
    });
  }

  function formularioAporte() {
    const a = Almacen.ajustes();
    App.abrirHoja('Aporte al fondo', `
      <input id="ap-monto" class="monto-entrada" type="number" inputmode="decimal"
             step="0.01" min="0" placeholder="0.00" aria-label="Monto">
      <p class="ayuda" style="text-align:center;margin:8px 0 18px">
        Lo que sea. 5 soles también suman.
      </p>
      <button class="boton principal" data-guardar>Guardar</button>
    `, (cuerpo) => {
      cuerpo.querySelector('[data-guardar]').onclick = () => {
        const monto = U.numero(U.$('#ap-monto').value);
        if (monto <= 0) { App.brindis('Escribe el monto.'); return; }
        a.ahorroEmergencia = U.redondear(U.numero(a.ahorroEmergencia) + monto);
        // Sale del disponible: lo anotamos como gasto para que cuadre el saldo
        Almacen.agregarMovimiento({
          tipo: 'gasto', monto, categoria: 'otros',
          nota: 'Al fondo de emergencia', fuente: 'ahorro'
        });
        const meta = Calculo.metaEmergencia();
        App.cerrarHoja();
        if (meta.porcentaje >= 100) {
          Almacen.get().logros.push({
            id: U.id(), texto: 'Completaste tu fondo de emergencia', fecha: U.hoy()
          });
          Almacen.guardar();
          App.brindis('¡Meta completa! Qué grande. 🎉', 'bien', 4000);
        } else {
          App.brindis('Guardado. Tu colchón crece. 🌱', 'bien');
        }
        App.pintar();
      };
    });
  }

  function enganchar(c) {
    const m = c.querySelector('[data-meta]');
    if (m) m.onclick = formularioMeta;
    const ap = c.querySelector('[data-aportar]');
    if (ap) ap.onclick = formularioAporte;
    const aj = c.querySelector('[data-ajustes]');
    if (aj) aj.onclick = () => App.ir('ajustes');
  }

  return { pintar, formularioMeta };
})();
