/* ===========================================================
   app.js — arranque, PIN, navegación y piezas de interfaz
   que comparten todas las vistas (hoja inferior, avisos, confirmar).
   =========================================================== */

const App = (() => {

  const VISTAS = {
    hoy:     () => Hoy,
    accion:  () => Accion,
    dinero:  () => Dinero,
    deudas:  () => Deudas,
    agenda:  () => Agenda,
    chat:    () => Chat,
    resumen: () => Resumen,
    ajustes: () => Ajustes
  };

  let vistaActual = 'hoy';

  /* ───────── MODO CONSTRUCCIÓN ─────────
     Mientras varias personas tocan el código, el PIN es uno solo y
     conocido: 1234. Las instalaciones nuevas lo traen puesto y no se
     pide crear ninguno.

     ⚠️ ESTO HAY QUE APAGARLO ANTES DE PUBLICAR LA APP.
     Poner CONSTRUCCION en false y listo: vuelve el PIN de verdad, y
     quien ya tenga el 1234 puede cambiarlo desde Ajustes.

     Se avisa en pantalla (en el PIN y en Ajustes) justamente para que
     no se quede puesto sin que nadie se dé cuenta. */
  const CONSTRUCCION = true;
  const PIN_CONSTRUCCION = '1234';

  // Bloqueo automático: 5 minutos en segundo plano
  const MINUTOS_BLOQUEO = 5;
  const INTENTOS_MAX = 5;
  const CASTIGO_MS = 60000;   // 1 minuto tras 5 intentos fallidos

  let desbloqueada = false;
  let salioEn = 0;
  /** ¿Ya se abrió la app en sí durante esta sesión? */
  let yaEntro = false;

  // ───────── Navegación ─────────

  function ir(vista) {
    if (!VISTAS[vista]) vista = 'hoy';
    // Lo que más visitas sube de prioridad en los atajos
    if (vista !== vistaActual) Almacen.marcarUso('vista:' + vista);
    vistaActual = vista;
    U.$$('.pestania').forEach((b) => {
      b.classList.toggle('activa', b.dataset.vista === vista);
    });
    // Vistas sin pestaña propia: marcamos la pestaña más cercana
    if (vista === 'ajustes') {
      const t = U.$('.pestania[data-vista="resumen"]');
      if (t) t.classList.add('activa');
    }
    if (vista === 'accion') {
      const t = U.$('.pestania[data-vista="hoy"]');
      if (t) t.classList.add('activa');
    }
    try { history.replaceState(null, '', '#' + vista); } catch (e) {}
    pintar();
    U.$('#contenido').scrollTo({ top: 0, behavior: 'instant' });
    window.scrollTo(0, 0);
  }

  /** Vuelve a dibujar la vista actual (tras cualquier cambio de datos). */
  function pintar() {
    const contenedor = U.$('#contenido');
    const vista = VISTAS[vistaActual]();
    contenedor.innerHTML = '';
    vista.pintar(contenedor);
    document.body.classList.toggle('dificil', Almacen.enDiaDificil());
  }

  // ───────── Hoja inferior (todos los formularios) ─────────

  /**
   * Abre la hoja con un título y HTML. `despues` recibe el nodo del cuerpo
   * para enganchar eventos.
   */
  function abrirHoja(titulo, html, despues) {
    U.$('#hoja-titulo').textContent = titulo;

    // El cuerpo se reemplaza entero, no solo su contenido.
    //
    // Las hojas enganchan eventos con delegación sobre este nodo
    // (U.al(..., cuerpo)). Si reusáramos el mismo div, los oyentes de la
    // hoja anterior seguirían vivos y responderían a los toques de la
    // nueva: tocabas una categoría y se guardaba el monto de la hoja
    // pasada. Un nodo nuevo cada vez se lleva los oyentes viejos.
    const viejo = U.$('#hoja-cuerpo');
    const cuerpo = document.createElement('div');
    cuerpo.id = 'hoja-cuerpo';
    viejo.replaceWith(cuerpo);
    cuerpo.innerHTML = html;
    U.$('#hoja').classList.remove('oculto');
    U.$('#hoja-fondo').classList.remove('oculto');
    document.body.style.overflow = 'hidden';
    if (despues) despues(cuerpo);
    // Enfoca el primer campo para escribir de una
    const primero = cuerpo.querySelector('input:not([type=hidden]), textarea');
    if (primero && primero.dataset.autofoco !== 'no') {
      setTimeout(() => primero.focus(), 220);
    }
    return cuerpo;
  }

  function cerrarHoja() {
    U.$('#hoja').classList.add('oculto');
    U.$('#hoja-fondo').classList.add('oculto');
    U.$('#hoja-cuerpo').innerHTML = '';
    document.body.style.overflow = '';
  }

  // ───────── Animación de bienvenida ─────────

  /** Frases de la intro larga. Ninguna pide nada ni felicita por nada. */
  const FRASES_INTRO = [
    'Vamos de a poco.',
    'Un día a la vez.',
    'Aquí nada se te reclama.',
    'Respira. Ya estás aquí.'
  ];

  /**
   * La animación de entrada: una gota cae, toca el agua, se abre en
   * ondas y de ahí emerge el nombre.
   *
   * Sale SIEMPRE al abrir la app, no solo la primera vez. Dura lo que
   * dura la gota y se puede saltar tocando: nadie debe esperar a una
   * animación para ver cuánto puede gastar.
   *
   * `largo` solo añade la frase del final (primer uso).
   */
  function intro({ largo = false } = {}) {
    const nodo = U.$('#pantalla-intro');
    if (!nodo) return Promise.resolve();

    nodo.innerHTML = `
      <div class="intro-escena">
        <div class="intro-gota"></div>
        <div class="intro-onda"></div>
        <div class="intro-onda dos"></div>
        <div class="intro-nombre">Calma</div>
      </div>
      ${largo ? `<p class="intro-frase">${U.esc(U.azar(FRASES_INTRO))}</p>` : ''}`;

    nodo.classList.remove('oculto', 'yendose');

    return new Promise((resolver) => {
      let cerrado = false;

      const cerrar = () => {
        if (cerrado) return;
        cerrado = true;
        clearTimeout(temporizador);
        nodo.removeEventListener('click', cerrar);
        nodo.classList.add('yendose');
        // Esperamos a que termine el desvanecido antes de esconderlo
        setTimeout(() => {
          nodo.classList.add('oculto');
          nodo.innerHTML = '';
          resolver();
        }, 450);
      };

      // La gota cae en 1 s, las ondas se apagan a los 2.2 y el nombre
      // queda asentado a los 2.5. Un respiro más y se va.
      const temporizador = setTimeout(cerrar, largo ? 3900 : 2900);
      nodo.addEventListener('click', cerrar);
    });
  }

  // ───────── Aviso flotante ─────────

  let temporizadorBrindis;

  /** tono: '' | 'bien' | 'aviso' | 'limite' */
  function brindis(texto, tono = '', ms = 2600) {
    const nodo = U.$('#brindis');
    nodo.className = 'brindis ' + tono;
    nodo.textContent = texto;
    nodo.classList.remove('oculto');
    clearTimeout(temporizadorBrindis);
    temporizadorBrindis = setTimeout(() => nodo.classList.add('oculto'), ms);
  }

  // ───────── Confirmación amable ─────────

  /** Pregunta sí/no sin alarmismo. Devuelve una promesa booleana. */
  function confirmar(titulo, texto, textoSi = 'Sí', textoNo = 'No, mejor no') {
    return new Promise((resolver) => {
      abrirHoja(titulo, `
        <p>${U.esc(texto)}</p>
        <div class="paso-acciones">
          <button class="boton principal" data-si>${U.esc(textoSi)}</button>
          <button class="boton tenue" data-no>${U.esc(textoNo)}</button>
        </div>
      `, (cuerpo) => {
        cuerpo.querySelector('[data-si]').onclick = () => { cerrarHoja(); resolver(true); };
        cuerpo.querySelector('[data-no]').onclick = () => { cerrarHoja(); resolver(false); };
      });
    });
  }

  // ───────── Menú del botón "+" ─────────

  /** Las cosas que se pueden registrar, en su orden de fábrica. */
  const COSAS_MAS = [
    { clave: 'gasto',       emoji: '💸', titulo: 'Un gasto',         sub: 'Algo que gasté' },
    { clave: 'rapido',      emoji: '⚡', titulo: 'Salió plata',      sub: 'Solo el monto, en qué fue me lo dices después' },
    { clave: 'ingreso',     emoji: '💰', titulo: 'Un ingreso',       sub: 'Dinero que entró' },
    { clave: 'pendiente',   emoji: '📝', titulo: 'Un pendiente',     sub: 'Tarea, reunión, cosa de casa…' },
    { clave: 'deuda-nueva', emoji: '🧾', titulo: 'Una deuda',        sub: 'Algo que debo y quiero anotar' },
    { clave: 'deuda-pago',  emoji: '✅', titulo: 'Pagué una cuota',  sub: 'Total o una parte de una deuda' }
  ];

  function menuMas() {
    const dificil = Almacen.enDiaDificil();

    // Lo que más registras sube al primer lugar. Antes de 5 aperturas
    // se queda como viene: adaptarse con dos datos es adivinar.
    const lista = Almacen.aperturas() >= 5
      ? Almacen.porMasUsado(COSAS_MAS, (x) => 'mas:' + x.clave)
      : COSAS_MAS;

    abrirHoja('¿Qué quieres registrar?', `
      <div class="lista">
        ${lista.map((x) => `
          <button class="item" data-accion="${x.clave}">
            <span style="font-size:24px">${x.emoji}</span>
            <div class="item-cuerpo"><div class="item-titulo">${U.esc(x.titulo)}</div>
            <div class="item-sub">${U.esc(x.sub)}</div></div>
          </button>`).join('')}
      </div>
      ${dificil ? '<p class="ayuda" style="margin-top:14px">Estás en día difícil. Registra solo si te nace.</p>' : ''}
    `, (cuerpo) => {
      U.al('click', '[data-accion]', (e, boton) => {
        const accion = boton.dataset.accion;
        Almacen.marcarUso('mas:' + accion);
        cerrarHoja();
        setTimeout(() => {
          if (accion === 'gasto') Dinero.formularioMovimiento('gasto');
          if (accion === 'rapido') Dinero.capturaRapida();
          if (accion === 'ingreso') Dinero.formularioMovimiento('ingreso');
          if (accion === 'pendiente') Agenda.formularioPendiente();
          if (accion === 'deuda-nueva') Deudas.formularioDeuda();
          if (accion === 'deuda-pago') Deudas.elegirParaPagar();
        }, 180);
      }, cuerpo);
    });
  }

  // ───────── PIN ─────────

  let pinModo = 'verificar';   // 'crear' | 'confirmar' | 'verificar'
  let pinBuffer = '';
  let pinPrimero = '';
  let pinIntentos = 0;
  let alDesbloquear = null;

  function puntos() {
    U.$$('#pin-puntos span').forEach((s, i) => {
      s.classList.toggle('lleno', i < pinBuffer.length);
    });
  }

  function textosPin() {
    const nombre = Almacen.ajustes().nombre;
    const titulo = U.$('#pin-titulo');
    const ayuda = U.$('#pin-ayuda');
    if (pinModo === 'crear') {
      titulo.textContent = 'Elige un PIN';
      ayuda.textContent = '4 números que recuerdes fácil';
    } else if (pinModo === 'confirmar') {
      titulo.textContent = 'Otra vez';
      ayuda.textContent = 'Para confirmar';
    } else {
      titulo.textContent = nombre ? `Hola, ${nombre}` : 'Hola';
      // En construcción se dice el PIN en pantalla a propósito: no hay
      // nada que proteger todavía, y así nadie se queda fuera.
      ayuda.textContent = CONSTRUCCION
        ? `En construcción — el PIN es ${PIN_CONSTRUCCION}`
        : 'Ingresa tu PIN';
    }
  }

  /**
   * En construcción, una instalación nueva arranca con el PIN puesto
   * y no se le pide a nadie que elija uno.
   * Devuelve true si acaba de ponerlo (o sea: no hace falta la pantalla).
   */
  async function asegurarPinDeConstruccion() {
    if (!CONSTRUCCION) return false;
    const e = Almacen.get();
    if (e.pin && e.pin.hash) return true;
    const sal = U.id() + U.id();
    e.pin = { hash: await U.hash(sal + PIN_CONSTRUCCION), sal };
    Almacen.guardar();
    return true;
  }

  function bloqueoHasta() {
    return Number(localStorage.getItem('calma.bloqueo') || 0);
  }

  function mostrarPin(modo, cuandoTermine) {
    pinModo = modo;
    pinBuffer = '';
    pinPrimero = '';
    alDesbloquear = cuandoTermine || null;
    textosPin();
    puntos();
    U.$('#pantalla-pin').classList.remove('oculto');
    U.$('#app').classList.add('oculto');
    U.$('#pantalla-bienvenida').classList.add('oculto');
    revisarCastigo();
  }

  function revisarCastigo() {
    const hasta = bloqueoHasta();
    const resta = hasta - Date.now();
    if (resta > 0) {
      const seg = Math.ceil(resta / 1000);
      U.$('#pin-ayuda').textContent = `Espera ${seg} s y vuelve a intentar`;
      U.$$('#teclado-pin .tecla').forEach((t) => { t.disabled = true; });
      setTimeout(revisarCastigo, 1000);
    } else {
      U.$$('#teclado-pin .tecla').forEach((t) => {
        if (!t.classList.contains('tecla-vacia')) t.disabled = false;
      });
      if (hasta) {
        localStorage.removeItem('calma.bloqueo');
        pinIntentos = 0;
        textosPin();
      }
    }
  }

  async function tecla(valor) {
    if (bloqueoHasta() > Date.now()) return;
    U.vibrar(10);

    if (valor === 'borrar') {
      pinBuffer = pinBuffer.slice(0, -1);
      puntos();
      return;
    }
    if (pinBuffer.length >= 4) return;
    pinBuffer += valor;
    puntos();
    if (pinBuffer.length < 4) return;

    // Ya tenemos 4 dígitos: procesamos
    const ingresado = pinBuffer;
    await new Promise((r) => setTimeout(r, 140));   // deja ver el último punto

    if (pinModo === 'crear') {
      pinPrimero = ingresado;
      pinModo = 'confirmar';
      pinBuffer = '';
      puntos();
      textosPin();
      return;
    }

    if (pinModo === 'confirmar') {
      if (ingresado !== pinPrimero) {
        pinModo = 'crear';
        pinBuffer = '';
        pinPrimero = '';
        puntos();
        U.$('#pin-titulo').textContent = 'No coincidió';
        U.$('#pin-ayuda').textContent = 'Sin problema, prueba de nuevo';
        return;
      }
      const sal = U.id() + U.id();
      const e = Almacen.get();
      e.pin = { hash: await U.hash(sal + ingresado), sal };
      Almacen.guardar();
      desbloqueada = true;
      if (alDesbloquear) alDesbloquear();
      return;
    }

    // Verificar
    const pin = Almacen.get().pin;
    const calculado = await U.hash((pin.sal || '') + ingresado);
    // En construcción el 1234 abre siempre, sea cual sea el PIN guardado:
    // así cualquiera del equipo entra a un teléfono que no es suyo.
    const esDeConstruccion = CONSTRUCCION && ingresado === PIN_CONSTRUCCION;
    if (calculado === pin.hash || esDeConstruccion) {
      pinIntentos = 0;
      desbloqueada = true;
      pinBuffer = '';
      puntos();
      U.$('#pantalla-pin').classList.add('oculto');
      if (alDesbloquear) alDesbloquear();
      // Al abrir la app se entra por la pantalla de conversación.
      // Al volver de un bloqueo de 5 minutos, no: ahí quieres seguir
      // donde estabas, no que te saluden otra vez.
      else if (yaEntro) entrarApp({ conIntro: false });
      else Bienvenida.mostrar();
      return;
    }

    pinIntentos++;
    pinBuffer = '';
    puntos();
    U.vibrar(160);
    if (pinIntentos >= INTENTOS_MAX) {
      localStorage.setItem('calma.bloqueo', String(Date.now() + CASTIGO_MS));
      revisarCastigo();
    } else {
      U.$('#pin-ayuda').textContent =
        `Ese no era. Te quedan ${INTENTOS_MAX - pinIntentos} intento${INTENTOS_MAX - pinIntentos === 1 ? '' : 's'}`;
    }
  }

  /** Cambiar el PIN desde Ajustes. */
  function cambiarPin() {
    mostrarPin('crear', () => {
      U.$('#pantalla-pin').classList.add('oculto');
      entrarApp();
      brindis('PIN actualizado.', 'bien');
    });
  }

  function bloquear() {
    if (!Almacen.get().pin.hash) return;
    desbloqueada = false;
    cerrarHoja();
    mostrarPin('verificar');
  }

  // ───────── Arranque ─────────

  /**
   * Abre la app en sí (las pestañas).
   * `conIntro` es false cuando venimos de la pantalla de entrada, que
   * ya puso su animación: repetirla ahí sería un parpadeo tonto.
   */
  function entrarApp({ conIntro = true } = {}) {
    U.$('#pantalla-pin').classList.add('oculto');
    U.$('#pantalla-bienvenida').classList.add('oculto');
    U.$('#app').classList.remove('oculto');

    // La intro corta tapa el momento en que se arma la pantalla.
    // No se espera a que termine: debajo ya se está calculando todo,
    // así que al desvanecerse el número ya está ahí.
    if (conIntro) intro({ largo: false });

    yaEntro = true;
    Almacen.marcarUso('abrir');

    // ¿Cuántos días pasaron sin abrir la app?
    const ajustes = Almacen.ajustes();
    const diasFuera = ajustes.ultimaVisita
      ? U.diasEntre(ajustes.ultimaVisita, U.hoy())
      : 0;
    ajustes.ultimaVisita = U.hoy();
    Almacen.guardar();

    // Mantenimiento del día
    Almacen.revisarDiaDificil();
    const movidos = Almacen.arrastrarPendientes();
    if (movidos > 0) {
      brindis(
        movidos === 1
          ? 'Moví 1 pendiente de ayer a hoy. Nada se perdió.'
          : `Moví ${movidos} pendientes a hoy. Nada se perdió.`,
        '', 3600
      );
    }

    const destino = (location.hash || '').replace('#', '');
    ir(VISTAS[destino] ? destino : 'hoy');
    Notis.sincronizarPronto();

    // Traer lo que el servidor detectó en el correo mientras no estabas.
    // Si falla (sin internet, sin backend), no se dice nada: no es culpa
    // de nadie y la app sirve igual.
    Api.sincronizarBandeja().then((nuevos) => {
      if (!nuevos) return;
      pintar();
      brindis(
        nuevos === 1
          ? 'Llegó 1 gasto del correo. Solo falta decir en qué fue.'
          : `Llegaron ${nuevos} gastos del correo. Falta decir en qué fueron.`,
        '', 4000
      );
    }).catch(() => {});

    // Si estuvo días sin entrar, le ofrecemos ponerse al día.
    // No en modo día difícil: ese día no se le pide nada.
    // Después de la intro, no encima de ella.
    if (diasFuera >= 2 && !Almacen.enDiaDificil()) {
      setTimeout(() => ponerseAlDia(diasFuera), 1900);
    }
  }

  /**
   * Volver después de unos días no es un fracaso. Esta hoja ofrece las
   * tres cosas que suelen quedar pendientes, y siempre se puede saltar.
   */
  function ponerseAlDia(dias) {
    const atrasados = Calculo.atrasados();
    const texto = dias >= 14
      ? 'Pasaron unas semanas. Qué bueno que volviste.'
      : `No nos vimos en ${dias} días. No pasa nada.`;

    abrirHoja('Hola de nuevo', `
      <p>${U.esc(texto)} Si quieres, ponemos al día lo importante.
      Y si no, también está bien.</p>

      ${atrasados.length ? `
        <div class="tarjeta sin-borde" style="background:var(--aviso-fondo);
             border:1px solid var(--aviso);margin:14px 0">
          <p style="margin:0">Mientras tanto quedaron ${U.soles(Calculo.totalAtrasado())}
          sin pagar. Lo tengo apartado, no se perdió.</p>
        </div>` : ''}

      <div class="lista" style="margin-top:14px">
        <button class="item" data-paso="saldo">
          <span style="font-size:24px">💵</span>
          <div class="item-cuerpo">
            <div class="item-titulo">Decirme cuánto tienes</div>
            <div class="item-sub">Lo más útil: cuadra todo de una</div>
          </div>
        </button>
        <button class="item" data-paso="gasto">
          <span style="font-size:24px">💸</span>
          <div class="item-cuerpo">
            <div class="item-titulo">Anotar un gasto que se pasó</div>
            <div class="item-sub">Si recuerdas alguno</div>
          </div>
        </button>
        <button class="item" data-paso="pago">
          <span style="font-size:24px">💰</span>
          <div class="item-cuerpo">
            <div class="item-titulo">Me pagaron</div>
            <div class="item-sub">Si entró dinero estos días</div>
          </div>
        </button>
      </div>

      <button class="boton tenue" data-luego style="margin-top:14px">
        Ahora no, solo quiero entrar
      </button>
    `, (cuerpo) => {
      U.al('click', '[data-paso]', (e, b) => {
        const paso = b.dataset.paso;
        cerrarHoja();
        setTimeout(() => {
          if (paso === 'saldo') Dinero.ajustarSaldo();
          if (paso === 'gasto') Dinero.formularioMovimiento('gasto');
          if (paso === 'pago') Hoy.formularioPago();
        }, 200);
      }, cuerpo);

      cuerpo.querySelector('[data-luego]').onclick = () => {
        cerrarHoja();
        brindis('Tranquilo. Aquí está todo cuando quieras.', '', 3000);
      };
    });
  }

  async function iniciar() {
    Almacen.cargar();

    // La app se pinta como la dejó: tema, acento y pestañas visibles.
    // Antes que nada, para que no haya un parpadeo con los colores viejos.
    Apariencia.aplicar();

    // Service worker (necesario para push y para abrir sin internet)
    if ('serviceWorker' in navigator) {
      try { await navigator.serviceWorker.register('./sw.js'); }
      catch (e) { console.warn('SW no registrado:', e); }
    }

    // Eventos globales
    U.al('click', '.tecla', (e, b) => tecla(b.dataset.tecla));
    U.al('click', '.pestania', (e, b) => ir(b.dataset.vista));
    U.$('#boton-mas').onclick = menuMas;
    U.$('#hoja-fondo').onclick = cerrarHoja;

    // Bloqueo al volver del segundo plano
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        salioEn = Date.now();
      } else if (desbloqueada && salioEn &&
                 Date.now() - salioEn > MINUTOS_BLOQUEO * 60000) {
        bloquear();
      }
    });

    // Cada vez que cambian los datos, re-sincronizamos los recordatorios
    Almacen.alCambiar(() => Notis.sincronizarPronto());

    const e = Almacen.get();

    // Primer uso: no hay PIN todavía, se entra directo a conversar
    if (!e.configurado) {
      Bienvenida.mostrar();
      return;
    }
    if (!e.pin.hash) {
      // Datos importados sin PIN: pedimos uno nuevo
      mostrarPin('crear', () => { desbloqueada = true; Bienvenida.mostrar(); });
      return;
    }
    mostrarPin('verificar');
  }

  return {
    iniciar, ir, pintar, abrirHoja, cerrarHoja, brindis, confirmar, intro,
    menuMas, mostrarPin, cambiarPin, bloquear, entrarApp, ponerseAlDia,
    CONSTRUCCION, PIN_CONSTRUCCION, asegurarPinDeConstruccion,
    get vistaActual() { return vistaActual; }
  };
})();

document.addEventListener('DOMContentLoaded', App.iniciar);
