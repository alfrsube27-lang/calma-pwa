/* ===========================================================
   ajustes.js — todo lo configurable.
   Cada monto lo digita el usuario; nada viene puesto por defecto.
   =========================================================== */

const Ajustes = (() => {

  function pintar(c) {
    const a = Almacen.ajustes();
    const r = Calculo.resumenHoy();
    const permiso = Notis.permiso();
    const instalada = Notis.instalada();

    c.innerHTML = `
      <div class="encabezado-vista">
        <h1>Ajustes</h1>
      </div>

      <!-- ── Tu nombre ── -->
      <div class="tarjeta">
        <div class="tarjeta-titulo"><h3>🙂 Tú</h3></div>
        <label class="campo">
          <span>¿Cómo quieres que te llame? Déjalo vacío si prefieres sin nombre</span>
          <input id="a-nombre" type="text" value="${U.esc(a.nombre || '')}"
                 placeholder="Tu nombre" autocomplete="off">
        </label>
        <button class="boton chico" data-guardar-nombre>Guardar</button>
      </div>

      <!-- ── Dinero que entra ── -->
      <div class="tarjeta">
        <div class="tarjeta-titulo"><h3>💰 Tus pagos</h3></div>
        ${(() => {
          const ritmo = Calculo.ritmoDePagos();
          if (!ritmo.aprendido) {
            return `<p class="ayuda">Cuando registres dos pagos o más, aprendo solo
                    cada cuánto te pagan y dejo de usar tu estimación.</p>`;
          }
          const usando = Calculo.diasEntrePagos();
          return `
            <div class="tarjeta sin-borde" style="background:var(--acento-fondo);
                 border:1px solid var(--acento);margin-bottom:14px">
              <div class="item-titulo">📈 Aprendido de tus pagos</div>
              <div class="item-sub" style="margin-top:4px">
                ${ritmo.n === 1
                  ? `Llevo 1 intervalo: ${ritmo.huecos[0]} días. Con uno más empiezo a usarlo.`
                  : `Últimos ${ritmo.n} intervalos: ${ritmo.huecos.join(', ')} días.
                     Promedio ${ritmo.promedio}, el más largo ${ritmo.maximo}.`}
              </div>
              <div class="item-sub" style="margin-top:6px;color:var(--acento)">
                ${ritmo.n >= 2
                  ? `Estoy calculando con ${usando} días, el peor caso que te he visto.`
                  : `Mientras tanto sigo con los ${usando} días que pusiste.`}
              </div>
            </div>`;
        })()}

        <label class="campo">
          <span>Días máximos entre pagos ${Calculo.ritmoDePagos().n >= 2
            ? '(ya no se usa: aprendí el tuyo)' : '(calculo con el peor caso)'}</span>
          <input id="a-dias" type="number" inputmode="numeric" min="1" max="120"
                 value="${a.diasMaximos || ''}" placeholder="Ej. 45">
        </label>
        <label class="campo">
          <span>Monto aproximado del pago</span>
          <input id="a-monto" type="number" inputmode="decimal" step="0.01" min="0"
                 value="${a.montoPago || ''}" placeholder="Ej. 1800">
        </label>
        <label class="campo">
          <span>Fecha del último pago</span>
          <input id="a-ultimo" type="date" value="${a.ultimoPago || ''}">
        </label>
        <label class="campo">
          <span>Ajustar dinero que tienes ahora</span>
          <input id="a-saldo" type="number" inputmode="decimal" step="0.01"
                 value="" placeholder="${U.soles(r.saldo)} — escribe el real si no cuadra">
        </label>
        <p class="ayuda">Si el número de arriba no coincide con tu bolsillo,
        escribe el real y yo ajusto la diferencia.</p>
        <button class="boton chico" data-guardar-pagos>Guardar</button>
      </div>

      <!-- ── Comida ── -->
      <div class="tarjeta">
        <div class="tarjeta-titulo"><h3>🍚 Comida</h3></div>
        <label class="campo">
          <span>Cuánto necesitas al día para comer</span>
          <input id="a-comida" type="number" inputmode="decimal" step="0.01" min="0"
                 value="${a.comidaPorDia || ''}" placeholder="Ej. 18">
        </label>
        <div class="fila-interruptor">
          <div class="texto">Recordarme comer
            <small>Llega incluso en día difícil</small></div>
          <button class="interruptor ${a.recordarComida ? 'encendido' : ''}"
                  id="a-rec-comida" role="switch"
                  aria-checked="${a.recordarComida}"></button>
        </div>
        <label class="campo" style="margin-top:14px">
          <span>Horas de los recordatorios</span>
          <div class="fila-botones">
            ${[0, 1, 2].map((i) => `
              <input class="a-hora-comida" type="time"
                     value="${(a.horasComida || [])[i] || ''}" aria-label="Hora ${i + 1}">`).join('')}
          </div>
        </label>
        <button class="boton chico" data-guardar-comida>Guardar</button>
      </div>

      <!-- ── Notificaciones ── -->
      <div class="tarjeta">
        <div class="tarjeta-titulo">
          <h3>🔔 Avisos con sonido</h3>
          <span class="pastilla ${Notis.activas() ? 'bien' : ''}">
            ${Notis.activas() ? 'activos' : 'apagados'}
          </span>
        </div>

        ${!instalada && /iPhone|iPad/.test(navigator.userAgent) ? `
          <p>Para que suenen en el iPhone, primero toca
          <b>Compartir → Agregar a pantalla de inicio</b> y abre la app desde ahí.</p>
        ` : ''}

        ${Notis.activas() ? `
          <button class="boton chico" data-probar-push>Enviarme una prueba</button>
          <button class="boton tenue chico" data-apagar-push style="margin-top:8px">
            Apagar avisos</button>
        ` : `
          <button class="boton principal" data-activar-push>Activar avisos</button>
          ${permiso === 'denied' ? `<p class="ayuda" style="margin-top:10px">
            El permiso está bloqueado. Ajustes de iOS → Calma → Notificaciones.</p>` : ''}
        `}

        <hr class="sep">

        <div class="fila-interruptor">
          <div class="texto">Recordarme entrar a la app
            <small>Un aviso al día, para que no se te olvide que existo</small></div>
          <button class="interruptor ${a.recordarEntrar ? 'encendido' : ''}"
                  id="a-rec-entrar" role="switch"
                  aria-checked="${a.recordarEntrar}"></button>
        </div>
        <label class="campo" style="margin-top:14px">
          <span>¿A qué hora te viene bien?</span>
          <input id="a-hora-entrar" type="time" value="${a.horaEntrar || '20:00'}">
        </label>
        <p class="ayuda">Este aviso lo manda el servidor, así que sigue llegando
        aunque pases semanas sin abrir la app.</p>

        <hr class="sep">
        <label class="campo">
          <span>Hora de los avisos de cuotas y pagos</span>
          <input id="a-hora-deudas" type="time" value="${a.horaDeudas || '09:00'}">
        </label>
        <label class="campo">
          <span>Avisarme antes de una reunión</span>
          <select id="a-aviso-reunion">
            ${[5, 10, 15, 30, 60].map((m) => `
              <option value="${m}" ${a.avisoReunionMin == m ? 'selected' : ''}>${m} minutos</option>
            `).join('')}
          </select>
        </label>
        <label class="campo">
          <span>Resumen de la semana</span>
          <div class="fila-botones">
            <select id="a-resumen-dia">
              ${U.DIAS_LARGO.map((d, i) => `
                <option value="${i}" ${Number(a.resumenDia) === i ? 'selected' : ''}>${d}</option>
              `).join('')}
            </select>
            <input id="a-resumen-hora" type="time" value="${a.resumenHora || '19:00'}"
                   style="flex:0 0 130px">
          </div>
        </label>
        <button class="boton chico" data-guardar-avisos>Guardar</button>
      </div>

      <!-- ── Día difícil ── -->
      <div class="tarjeta">
        <div class="tarjeta-titulo"><h3>🫂 Día difícil</h3></div>
        <label class="campo">
          <span>Mi tarea mínima para esos días</span>
          <input id="a-minima" type="text" value="${U.esc(a.tareaMinima || '')}"
                 placeholder="Ej. Tomar agua">
        </label>
        <button class="boton chico" data-guardar-minima>Guardar</button>
        ${Almacen.enDiaDificil() ? `
          <button class="boton tenue chico" data-salir-dificil style="margin-top:8px">
            Salir del modo día difícil</button>` : ''}
      </div>

      <!-- ── Seguridad ── -->
      <div class="tarjeta">
        <div class="tarjeta-titulo"><h3>🔒 Seguridad</h3></div>
        <p class="ayuda">La app se bloquea al abrirla y después de 5 minutos cerrada.</p>
        <button class="boton chico" data-cambiar-pin>Cambiar mi PIN</button>
        <button class="boton tenue chico" data-bloquear style="margin-top:8px">
          Bloquear ahora</button>
      </div>

      <!-- ── Servidor ── -->
      <div class="tarjeta">
        <div class="tarjeta-titulo">
          <h3>☁️ Servidor</h3>
          <span class="pastilla ${Api.configurada() ? 'bien' : ''}">
            ${Api.configurada() ? 'configurado' : 'sin configurar'}
          </span>
        </div>
        <p class="ayuda">Solo sirve para las notificaciones y el respaldo.
        La app funciona igual sin esto.</p>
        <label class="campo">
          <span>Dirección del Worker</span>
          <input id="a-api" type="url" value="${U.esc(a.apiUrl || '')}"
                 placeholder="https://algo-raro-123.workers.dev"
                 autocapitalize="off" autocomplete="off" spellcheck="false">
        </label>
        <label class="campo">
          <span>Token secreto</span>
          <input id="a-token" type="password" value="${U.esc(a.token || '')}"
                 placeholder="el que guardaste en Cloudflare"
                 autocapitalize="off" autocomplete="off" spellcheck="false">
        </label>
        <div class="fila-botones">
          <button class="boton chico" data-guardar-api>Guardar</button>
          <button class="boton chico" data-probar-api>Probar</button>
        </div>
      </div>

      ${App.CONSTRUCCION ? `
      <div class="tarjeta borde-aviso">
        <div class="tarjeta-titulo">
          <h3>🚧 Modo construcción</h3>
          <span class="pastilla aviso">encendido</span>
        </div>
        <p>El PIN es <b>${U.esc(App.PIN_CONSTRUCCION)}</b> para todos, y las
        instalaciones nuevas ya vienen con él puesto.</p>
        <p class="ayuda">Esto es para que el equipo pueda entrar a cualquier
        teléfono mientras se construye la app.
        <b>Hay que apagarlo antes de publicarla</b>: en <code>js/app.js</code>,
        poner <code>CONSTRUCCION = false</code>.</p>
      </div>` : ''}

      <!-- ── La mente del chat ── -->
      ${tarjetaMente()}

      <!-- ── Modo pruebas ── -->
      <div class="tarjeta ${a.modoPruebas ? 'borde-aviso' : ''}">
        <div class="tarjeta-titulo">
          <h3>🧪 Modo pruebas</h3>
          <span class="pastilla ${a.modoPruebas ? 'aviso' : ''}">
            ${a.modoPruebas ? 'encendido' : 'apagado'}</span>
        </div>
        <p class="ayuda">Con esto encendido, la app te recibe siempre como si fuera
        la primera vez: te vuelve a hacer todas las preguntas, con tus respuestas
        ya escritas. Sirve para revisar esa pantalla.
        <b>Tus datos no se borran.</b></p>
        <button class="boton chico" data-modo-pruebas style="margin-top:10px">
          ${a.modoPruebas ? 'Apagar y entrar directo a mi día' : 'Encender el modo pruebas'}
        </button>
      </div>

      <!-- ── Respaldo ── -->
      <div class="tarjeta">
        <div class="tarjeta-titulo"><h3>💾 Respaldo</h3></div>
        <p class="ayuda">Tus datos viven en este teléfono. Guarda una copia de vez en cuando.</p>
        <div class="fila-botones" style="margin-bottom:10px">
          <button class="boton chico" data-exportar>Descargar copia</button>
          <button class="boton chico" data-copiar>Copiar</button>
        </div>
        <label class="campo">
          <span>Restaurar desde un archivo</span>
          <input id="a-archivo" type="file" accept="application/json,.json">
        </label>
        <button class="boton tenue chico" data-pegar>Pegar un respaldo</button>
        ${Api.configurada() ? `
          <hr class="sep">
          <div class="fila-botones">
            <button class="boton chico" data-subir>Subir a la nube</button>
            <button class="boton chico" data-bajar>Bajar de la nube</button>
          </div>` : ''}
      </div>

      <!-- ── Cómo instalar ── -->
      <div class="tarjeta">
        <div class="tarjeta-titulo"><h3>📱 Instalar en el iPhone</h3></div>
        <p>1. Abre esta página en Safari.<br>
        2. Toca el botón <b>Compartir</b> (el cuadrito con la flecha).<br>
        3. Elige <b>Agregar a pantalla de inicio</b>.<br>
        4. Abre Calma desde el icono nuevo y activa los avisos.</p>
      </div>

      <!-- ── Borrar todo ── -->
      <button class="boton tenue" data-borrar-todo style="margin-bottom:10px">
        Borrar todos mis datos
      </button>
      <p class="ayuda" style="text-align:center">Calma · versión 1</p>
    `;

    enganchar(c);
  }

  // ───────── La mente del chat ─────────

  /**
   * Las dos capas del chat y qué tan independiente va la de adentro.
   * El porcentaje es lo que de verdad importa: cuánto de lo que dices
   * ya entendería la app sin salir a internet.
   */
  function tarjetaMente() {
    const i = Mente.independencia();
    const modos = [
      { clave: 'local',  titulo: 'Solo yo',       sub: 'Sin internet y gratis. Te pregunta cuando no entiende.' },
      { clave: 'ahorro', titulo: 'Mixto',         sub: 'Respondo yo lo que ya sé; la API solo cuando me pierdo.' },
      { clave: 'api',    titulo: 'Con la API',    sub: 'La API responde siempre y yo aprendo de ella.' }
    ];

    return `
      <div class="tarjeta">
        <div class="tarjeta-titulo">
          <h3>🧠 Cómo piensa el chat</h3>
          ${i.porcentaje != null
            ? `<span class="pastilla ${i.porcentaje >= 80 ? 'bien' : 'acento'}">
                 ${i.porcentaje}% solo</span>`
            : '<span class="pastilla">aprendiendo</span>'}
        </div>

        <div class="opciones" style="margin-bottom:14px">
          ${modos.map((m) => `
            <button class="opcion ${i.modo === m.clave ? 'elegida' : ''}"
                    data-modo-mente="${m.clave}">${U.esc(m.titulo)}</button>`).join('')}
        </div>
        <p class="ayuda" style="margin:-6px 0 14px">
          ${U.esc((modos.find((m) => m.clave === i.modo) || modos[0]).sub)}
        </p>

        ${i.total ? `
          <hr class="sep" style="margin:12px 0">
          <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;text-align:center">
            <div>
              <div style="font-size:20px;font-weight:650">${i.solas}</div>
              <div class="item-sub">entendí solo</div>
            </div>
            <div>
              <div style="font-size:20px;font-weight:650">${i.conApi}</div>
              <div class="item-sub">con la API</div>
            </div>
            <div>
              <div style="font-size:20px;font-weight:650">${i.aprendidas}</div>
              <div class="item-sub">aprendidas</div>
            </div>
          </div>
          ${i.porcentaje != null ? `
            <div class="barra ${i.porcentaje >= 80 ? '' : 'aviso'}" style="margin-top:12px">
              <i style="width:${i.porcentaje}%"></i>
            </div>
            <p class="nota-abajo">De cada 100 cosas que me dices, ${i.porcentaje} ya las
            entiendo sin ayuda. Cuando eso suba mucho, puedes apagar la API y seguir
            igual — salvo que las respuestas vuelven a ser mías, más secas.</p>`
          : `<p class="nota-abajo">Con unos cuantos mensajes más te digo qué parte
             ya entiendo sola.</p>`}
        ` : ''}

        ${i.ultimoError ? `
          <p class="nota-abajo" style="color:var(--aviso)">
            La última vez no pude conectarme (${U.esc(i.ultimoError)}).
            ${i.ultimoError === 'sin-clave'
              ? 'Falta poner la clave en el servidor.'
              : 'Respondí yo solo mientras tanto.'}
          </p>` : ''}

        <button class="boton tenue chico" data-ver-envio style="margin-top:12px">
          Ver qué se envía a la API
        </button>
      </div>`;
  }

  /** Transparencia: el texto exacto que sale del teléfono. */
  function verEnvio() {
    App.abrirHoja('Lo que se envía', `
      <p>Esto es todo lo que viaja cuando la API responde: las instrucciones
      y un resumen de tus números. No van tus movimientos uno por uno, ni tus
      pendientes, ni tu PIN.</p>
      <pre style="white-space:pre-wrap;font-size:12px;line-height:1.45;
           background:var(--superficie-2);padding:12px;border-radius:12px;
           max-height:50vh;overflow:auto">${U.esc(Mente.loQueSeEnvia())}</pre>
      <p class="ayuda" style="margin-top:12px">Si el modo es "Solo yo", no sale nada.</p>
    `);
  }

  // ───────── Guardados ─────────

  function enganchar(c) {
    const a = Almacen.ajustes();

    // Nombre
    c.querySelector('[data-guardar-nombre]').onclick = () => {
      a.nombre = U.$('#a-nombre').value.trim();
      Almacen.guardar();
      App.brindis(a.nombre ? `Listo, ${a.nombre}.` : 'Listo, sin nombre.', 'bien');
      App.pintar();
    };

    // Pagos
    c.querySelector('[data-guardar-pagos]').onclick = () => {
      const dias = U.numero(U.$('#a-dias').value);
      if (dias > 0) a.diasMaximos = Math.round(dias);
      const monto = U.$('#a-monto').value;
      if (monto !== '') a.montoPago = U.redondear(U.numero(monto));
      const ultimo = U.$('#a-ultimo').value;
      if (ultimo) a.ultimoPago = ultimo;

      // Ajuste manual del saldo: anotamos la diferencia como movimiento
      const real = U.$('#a-saldo').value;
      if (real !== '') {
        const objetivo = U.redondear(U.numero(real));
        const actual = Calculo.saldoActual();
        const diferencia = U.redondear(objetivo - actual);
        if (Math.abs(diferencia) >= 0.01) {
          Almacen.agregarMovimiento({
            tipo: diferencia > 0 ? 'ingreso' : 'gasto',
            monto: Math.abs(diferencia),
            categoria: diferencia > 0 ? 'extra' : 'otros',
            nota: 'Ajuste de saldo',
            fuente: 'ajuste'
          });
        }
      }
      Almacen.guardar();
      App.brindis('Guardado.', 'bien');
      App.pintar();
    };

    // Comida
    const interComida = c.querySelector('#a-rec-comida');
    interComida.onclick = () => {
      const on = interComida.classList.toggle('encendido');
      interComida.setAttribute('aria-checked', String(on));
    };
    c.querySelector('[data-guardar-comida]').onclick = () => {
      const v = U.$('#a-comida').value;
      if (v !== '') a.comidaPorDia = U.redondear(U.numero(v));
      a.recordarComida = interComida.classList.contains('encendido');
      a.horasComida = U.$$('.a-hora-comida', c).map((i) => i.value).filter(Boolean);
      Almacen.guardar();
      Notis.sincronizar(true);
      App.brindis('Guardado. Tu comida queda apartada primero.', 'bien', 3200);
      App.pintar();
    };

    // Aviso diario para acordarse de entrar
    const interEntrar = c.querySelector('#a-rec-entrar');
    interEntrar.onclick = () => {
      const on = interEntrar.classList.toggle('encendido');
      interEntrar.setAttribute('aria-checked', String(on));
    };

    // Avisos
    c.querySelector('[data-guardar-avisos]').onclick = () => {
      a.recordarEntrar = interEntrar.classList.contains('encendido');
      a.horaEntrar = U.$('#a-hora-entrar').value || '20:00';
      a.horaDeudas = U.$('#a-hora-deudas').value || '09:00';
      a.avisoReunionMin = U.numero(U.$('#a-aviso-reunion').value) || 30;
      a.resumenDia = Number(U.$('#a-resumen-dia').value) || 0;
      a.resumenHora = U.$('#a-resumen-hora').value || '19:00';
      Almacen.guardar();
      Notis.sincronizar(true);
      App.brindis('Guardado.', 'bien');
    };

    // Tarea mínima
    c.querySelector('[data-guardar-minima]').onclick = () => {
      a.tareaMinima = U.$('#a-minima').value.trim();
      Almacen.guardar();
      App.brindis('Guardado.', 'bien');
    };

    const salir = c.querySelector('[data-salir-dificil]');
    if (salir) salir.onclick = () => {
      a.dificilHasta = null;
      Almacen.guardar();
      App.brindis('Volvimos a lo normal.', 'bien');
      App.ir('hoy');
    };

    // Notificaciones
    const activar = c.querySelector('[data-activar-push]');
    if (activar) activar.onclick = async () => {
      activar.disabled = true;
      activar.textContent = 'Activando…';
      try {
        const res = await Notis.activar();
        App.brindis(res.mensaje, res.ok ? 'bien' : 'aviso', 4200);
      } catch (e) {
        App.brindis(e.message || 'No se pudo activar.', 'aviso', 4200);
      }
      App.pintar();
    };

    const probar = c.querySelector('[data-probar-push]');
    if (probar) probar.onclick = async () => {
      try {
        await Notis.sincronizar(true);
        await Api.probarNotificacion();
        App.brindis('Enviada. Debería llegar en unos segundos.', 'bien', 3600);
      } catch (e) {
        App.brindis(e.message, 'aviso', 4200);
      }
    };

    const apagar = c.querySelector('[data-apagar-push]');
    if (apagar) apagar.onclick = async () => {
      const si = await App.confirmar('Apagar avisos',
        'Dejaré de avisarte. Puedes volver a activarlos cuando quieras.', 'Sí, apagar');
      if (!si) return;
      await Notis.desactivar();
      App.brindis('Avisos apagados.');
      App.pintar();
    };

    // PIN
    c.querySelector('[data-cambiar-pin]').onclick = App.cambiarPin;
    c.querySelector('[data-bloquear]').onclick = App.bloquear;

    // Servidor
    c.querySelector('[data-guardar-api]').onclick = () => {
      a.apiUrl = U.$('#a-api').value.trim().replace(/\/+$/, '');
      a.token = U.$('#a-token').value.trim();
      Almacen.guardar();
      App.brindis('Guardado.', 'bien');
      App.pintar();
    };

    c.querySelector('[data-probar-api]').onclick = async () => {
      a.apiUrl = U.$('#a-api').value.trim().replace(/\/+$/, '');
      a.token = U.$('#a-token').value.trim();
      Almacen.guardar();
      try {
        const res = await Api.probar();
        App.brindis(`Conectado. ${res.mensaje || ''}`.trim(), 'bien', 3600);
      } catch (e) {
        App.brindis(e.message, 'aviso', 4200);
      }
    };

    // La mente del chat
    U.al('click', '[data-modo-mente]', (e, b) => {
      Mente.ajustes().modo = b.dataset.modoMente;
      Almacen.guardar();
      App.brindis({
        local:  'Listo. Solo yo, sin internet.',
        ahorro: 'Listo. Pregunto afuera solo cuando me pierdo.',
        api:    'Listo. La API responde y yo voy aprendiendo de ella.'
      }[b.dataset.modoMente] || 'Listo.', 'bien', 3200);
      App.pintar();
    }, c);

    c.querySelector('[data-ver-envio]').onclick = verEnvio;

    // Modo pruebas
    c.querySelector('[data-modo-pruebas]').onclick = () => {
      const a2 = Almacen.ajustes();
      a2.modoPruebas = !a2.modoPruebas;
      Almacen.guardar();
      if (a2.modoPruebas) {
        App.brindis('Listo. Te recibo como la primera vez. Mira cómo queda.', 'bien', 3600);
        setTimeout(() => Bienvenida.mostrar(), 900);
      } else {
        App.brindis('Apagado. Ahora entras directo a tu día.', 'bien', 3000);
        App.pintar();
      }
    };

    // Respaldo
    c.querySelector('[data-exportar]').onclick = () => {
      const texto = Almacen.exportar();
      const blob = new Blob([texto], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const enlace = document.createElement('a');
      enlace.href = url;
      enlace.download = `calma-respaldo-${U.hoy()}.json`;
      document.body.appendChild(enlace);
      enlace.click();
      enlace.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
      App.brindis('Copia descargada.', 'bien');
    };

    c.querySelector('[data-copiar]').onclick = async () => {
      try {
        await navigator.clipboard.writeText(Almacen.exportar());
        App.brindis('Copiado. Pégalo donde lo quieras guardar.', 'bien', 3400);
      } catch (e) {
        App.brindis('No se pudo copiar. Usa "Descargar copia".', 'aviso');
      }
    };

    c.querySelector('#a-archivo').onchange = (e) => {
      const archivo = e.target.files && e.target.files[0];
      if (!archivo) return;
      const lector = new FileReader();
      lector.onload = async () => {
        const si = await App.confirmar('Restaurar',
          'Esto reemplaza los datos de ahora con los del archivo. ¿Sigo?', 'Sí, restaurar');
        if (!si) { e.target.value = ''; return; }
        try {
          Almacen.importar(String(lector.result));
          App.brindis('Restaurado. 🌱', 'bien', 3400);
          App.ir('hoy');
        } catch (err) {
          App.brindis(err.message, 'aviso', 4200);
        }
      };
      lector.readAsText(archivo);
    };

    c.querySelector('[data-pegar]').onclick = () => {
      App.abrirHoja('Pegar respaldo', `
        <label class="campo">
          <span>Pega aquí el texto del respaldo</span>
          <textarea id="peg-texto" rows="8" placeholder='{ "version": 1, ... }'></textarea>
        </label>
        <button class="boton principal" data-restaurar>Restaurar</button>
      `, (cuerpo) => {
        cuerpo.querySelector('[data-restaurar]').onclick = () => {
          try {
            Almacen.importar(U.$('#peg-texto').value);
            App.cerrarHoja();
            App.brindis('Restaurado. 🌱', 'bien', 3400);
            App.ir('hoy');
          } catch (err) {
            App.brindis(err.message, 'aviso', 4200);
          }
        };
      });
    };

    const subir = c.querySelector('[data-subir]');
    if (subir) subir.onclick = async () => {
      try {
        await Api.subirRespaldo(Almacen.exportar());
        App.brindis('Respaldo subido.', 'bien');
      } catch (e) { App.brindis(e.message, 'aviso', 4200); }
    };

    const bajar = c.querySelector('[data-bajar]');
    if (bajar) bajar.onclick = async () => {
      try {
        const res = await Api.bajarRespaldo();
        if (!res || !res.json) { App.brindis('No hay respaldo en la nube todavía.'); return; }
        const si = await App.confirmar('Bajar respaldo',
          `Es del ${res.actualizado ? new Date(res.actualizado).toLocaleString('es-PE') : '—'}.
           Reemplaza lo de ahora. ¿Sigo?`, 'Sí, bajar');
        if (!si) return;
        Almacen.importar(res.json);
        App.brindis('Restaurado desde la nube. 🌱', 'bien', 3400);
        App.ir('hoy');
      } catch (e) { App.brindis(e.message, 'aviso', 4200); }
    };

    // Borrar todo
    c.querySelector('[data-borrar-todo]').onclick = async () => {
      const si = await App.confirmar('Borrar todo',
        'Se borra todo de este teléfono y no se puede deshacer. ¿Seguro?',
        'Sí, borrar todo', 'No, mejor no');
      if (!si) return;
      const otra = await App.confirmar('Última vez',
        'Si tienes una copia descargada, puedes volver después.', 'Borrar');
      if (!otra) return;
      Almacen.borrarTodo();
      location.reload();
    };
  }

  return { pintar };
})();
