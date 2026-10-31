/* ===========================================================
   bienvenida.js — la entrada. Lo primero, siempre.

   La idea de fondo: partir de lo más simple y que la app se vaya
   construyendo sola, a medida que la persona la usa. Nadie llega
   con ganas de llenar un formulario de quince campos.

   Por eso la entrada son BLOQUES, y cada uno enciende una parte:

     1. nombre  → solo saber cómo llamarte
     2. agenda  → anotar UN pendiente. Lo más fácil que hay.
     3. dinero  → cuatro datos y ya sabe cuánto puedes gastar
     4. gastos  → ¿quieres que además te muestre en qué se te va?
     5. deudas  → ¿las anotamos? (siempre para después)

   Cada bloque se puede saltar y queda ofrecido para otro día. Si
   solo haces el 1 y el 2, la app sirve igual: te acuerda tus cosas.
   Lo de la plata aparece cuando tú quieras que aparezca.

   Después del primer día, aquí entras a ver tus números y a decir
   qué quieres hacer. También puedes escribirle: eso va al chat que
   aprende (`aprendiz.js`).
   =========================================================== */

const Bienvenida = (() => {

  /** Cuánto "piensa" antes de cada frase. Suficiente para notarlo. */
  const PAUSA = 560;

  /** ¿Esta entrada se comporta como un primer uso? */
  let comoPrimeraVez = false;

  /**
   * El modo pruebas se enciende desde Ajustes o con ?primera=1 en la
   * dirección, que es lo cómodo mientras se revisa en la computadora.
   * ?primera=0 lo apaga.
   */
  function forzadoPorDireccion() {
    try {
      const v = new URLSearchParams(location.search).get('primera');
      if (v === null) return null;
      return v !== '0';
    } catch (e) {
      return null;
    }
  }

  // ───────── Los bloques ─────────

  const BLOQUES = [
    {
      clave: 'nombre',
      etiqueta: 'Decirte cómo me llamo',
      listo: (a) => !!a.nombre,
      // Si dijo "mejor sin nombre", es una decisión, no algo que falte
      reofrecer: false,
      correr: bloqueNombre
    },
    {
      clave: 'agenda',
      // `etiqueta` va en el botón (tu voz); `falta`, en lo que dice ella
      etiqueta: 'Armar mi agenda',
      falta: 'armar tu agenda',
      listo: (a, e) => e.pendientes.length > 0,
      correr: bloqueAgenda
    },
    {
      clave: 'dinero',
      etiqueta: 'Saber cuánto puedo gastar',
      falta: 'saber cuánto puedes gastar',
      listo: (a) => !!(U.numero(a.diasMaximos) && U.numero(a.montoPago)
                       && U.numero(a.comidaPorDia)),
      correr: bloqueDinero
    },
    {
      clave: 'gastos',
      etiqueta: 'Ver en qué se me va la plata',
      // Es una pregunta, no un dato: con haberla contestado basta
      listo: (a) => !!(a.preguntado || {}).gastos,
      reofrecer: false,
      correr: bloqueGastos
    },
    {
      clave: 'deudas',
      etiqueta: 'Anotar mis deudas',
      falta: 'anotar tus deudas',
      listo: (a, e) => e.deudas.length > 0,
      correr: bloqueDeudas
    }
  ];

  /**
   * Bloques que todavía no están armados.
   *
   * `incluirSaltados` es para ofrecerlos de nuevo otro día. Ahí solo
   * entran los que de verdad faltan: si dijo "mejor sin nombre" o ya
   * contestó lo de los gastos, eso no es un pendiente, fue su decisión.
   */
  function porArmar({ incluirSaltados = false } = {}) {
    const a = Almacen.ajustes();
    const e = Almacen.get();
    a.preguntado = a.preguntado || {};
    return BLOQUES.filter((b) => {
      if (b.listo(a, e)) return false;
      if (!a.preguntado[b.clave]) return true;
      return incluirSaltados && b.reofrecer !== false;
    });
  }

  // ───────── Entrar ─────────

  /** Se llama en cada apertura, con el PIN ya pasado. */
  async function mostrar() {
    const a = Almacen.ajustes();

    // La dirección manda sobre el ajuste y lo deja guardado: así
    // ?primera=1 una vez y el teléfono ya entra siempre así.
    const forzado = forzadoPorDireccion();
    if (forzado !== null && a.modoPruebas !== forzado) {
      a.modoPruebas = forzado;
      Almacen.guardar();
    }

    comoPrimeraVez = !Almacen.get().configurado || !!a.modoPruebas;

    U.$('#pantalla-pin').classList.add('oculto');
    U.$('#app').classList.add('oculto');

    const pantalla = U.$('#pantalla-bienvenida');
    pantalla.classList.remove('oculto');
    pantalla.scrollTop = 0;
    pantalla.innerHTML = `
      <div class="charla-guiada">
        <div class="charla" id="bv-charla"></div>
        <div id="bv-respuesta" style="margin-top:20px"></div>
      </div>`;

    await App.intro({ largo: comoPrimeraVez });

    if (comoPrimeraVez) await primerDia();
    else await resumenDelDia();
  }

  /** El primer día: se recorren los bloques que falten, en orden. */
  async function primerDia() {
    // En pruebas se repasa todo; en uso normal, solo lo que falta
    const lista = Almacen.ajustes().modoPruebas
      ? BLOQUES.slice()
      : porArmar();

    for (const b of lista) {
      await b.correr();
      marcarPreguntado(b.clave);
    }
    await cerrarPrimerDia();
  }

  // ───────── Herramientas de conversación ─────────

  function burbuja(texto, mia = false) {
    const nodo = document.createElement('div');
    nodo.className = 'burbuja' + (mia ? ' mia' : '');
    nodo.textContent = texto;
    U.$('#bv-charla').appendChild(nodo);
    abajo();
    return nodo;
  }

  function escribiendo(encendido) {
    const charla = U.$('#bv-charla');
    const viejo = charla.querySelector('.escribiendo');
    if (viejo) viejo.remove();
    if (!encendido) return;
    const nodo = document.createElement('div');
    nodo.className = 'burbuja escribiendo';
    nodo.innerHTML = '<i></i><i></i><i></i>';
    charla.appendChild(nodo);
    abajo();
  }

  /** Dice una frase con su pausa, como si la estuviera escribiendo. */
  async function decir(texto) {
    escribiendo(true);
    await esperar(PAUSA);
    escribiendo(false);
    burbuja(texto);
    await esperar(190);
  }

  /**
   * Un `#bv-respuesta` limpio, sin oyentes de la pregunta anterior.
   * Se reemplaza el nodo y no su HTML: si no, la delegación de eventos
   * de antes sigue viva y un solo toque contesta dos preguntas.
   */
  function nuevaZona() {
    const viejo = U.$('#bv-respuesta');
    const zona = document.createElement('div');
    zona.id = 'bv-respuesta';
    zona.style.marginTop = '20px';
    viejo.replaceWith(zona);
    return zona;
  }

  function abajo() {
    requestAnimationFrame(() => {
      const p = U.$('#pantalla-bienvenida');
      p.scrollTop = p.scrollHeight;
    });
  }

  function esperar(ms) { return new Promise((r) => setTimeout(r, ms)); }

  /**
   * Frases con las que una persona dice "ya, pasemos a otra cosa".
   *
   * Hace falta porque esto es una conversación: si te pregunto "¿hay
   * otra?", lo natural es escribir "seguimos", no buscar un botón. Sin
   * esto, "seguimos" se guardaba como si fuera un pendiente.
   */
  const FRASES_FIN = new Set([
    'no', 'no mas', 'nomas', 'nada', 'nada mas', 'ninguna', 'ninguno',
    'ya', 'ya esta', 'ya estuvo', 'listo', 'eso es todo', 'es todo',
    'seguimos', 'sigue', 'sigamos', 'siguiente', 'continua', 'continuar',
    'continuemos', 'ya no', 'ahora no', 'por ahora no', 'no por ahora',
    'nada por ahora', 'no gracias', 'terminamos', 'fin', 'basta',
    'ninguna mas', 'no se me ocurre nada', 'no se me ocurre'
  ]);

  /**
   * Solo coincidencia exacta del mensaje entero. A propósito: con
   * coincidencia parcial, un pendiente real como "no olvidar pagar la
   * luz" se perdería por empezar con "no".
   */
  function pareceFin(texto) {
    const t = String(texto || '')
      .toLowerCase()
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9ñ\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    return !!t && FRASES_FIN.has(t);
  }

  function marcarPreguntado(clave) {
    const a = Almacen.ajustes();
    a.preguntado = a.preguntado || {};
    a.preguntado[clave] = true;
    Almacen.guardar();
  }

  /**
   * Hace una pregunta y espera. Devuelve { valor, saltado }.
   *
   * `eco` es cómo se ve tu respuesta en tu burbuja; si no se pasa, se
   * muestra tal cual la escribiste.
   */
  function preguntar(opciones) {
    const o = Object.assign({
      tipo: 'texto',          // texto | numero | fecha | opciones
      marcador: '',
      valor: '',
      rapidas: [],
      saltable: true,
      textoSaltar: 'Saltar esta',
      eco: null,
      foco: true
    }, opciones);

    return new Promise((resolver) => {
      const zona = nuevaZona();
      let html = '';

      if (o.rapidas.length) {
        html += `<div class="opciones" style="margin-bottom:${o.tipo === 'opciones' ? '0' : '14px'}">
          ${o.rapidas.map((r, i) => `<button class="opcion" data-rapida="${i}">
            ${U.esc(r.etiqueta)}</button>`).join('')}
        </div>`;
      }

      if (o.tipo !== 'opciones') {
        const tipoCampo = o.tipo === 'numero' ? 'number'
                        : o.tipo === 'fecha' ? 'date' : 'text';
        const extra = o.tipo === 'numero' ? 'inputmode="decimal" step="0.01" min="0"' : '';
        html += `
          <div class="fila-botones">
            <input id="bv-campo" type="${tipoCampo}" ${extra}
                   value="${U.esc(o.valor === '' ? '' : String(o.valor))}"
                   placeholder="${U.esc(o.marcador)}" autocomplete="off">
            <button class="boton principal chico" data-ok style="flex:0 0 92px">Listo</button>
          </div>`;
      }

      if (o.saltable) {
        html += `<button class="boton tenue chico" data-saltar style="margin-top:12px">
          ${U.esc(o.textoSaltar)}</button>`;
      }

      zona.innerHTML = html;

      const terminar = (valor, saltado) => {
        if (!saltado) {
          burbuja(o.eco ? o.eco(valor) : String(valor), true);
          U.vibrar(10);
        } else {
          burbuja(o.textoSaltar === 'Ya está' ? 'Ya está' : 'Eso lo veo después', true);
        }
        nuevaZona();
        resolver({ valor, saltado });
      };

      U.al('click', '[data-rapida]', (e, b) => {
        terminar(o.rapidas[Number(b.dataset.rapida)].valor, false);
      }, zona);

      const ok = zona.querySelector('[data-ok]');
      if (ok) {
        const campo = zona.querySelector('#bv-campo');
        const mandar = () => {
          const v = campo.value;
          if (v === '' || (o.tipo === 'numero' && U.numero(v) <= 0)) {
            App.brindis(o.saltable ? 'Escribe algo, o toca el botón de abajo.' : 'Escribe algo.');
            return;
          }
          terminar(v, false);
        };
        ok.onclick = mandar;
        campo.addEventListener('keydown', (ev) => {
          if (ev.key === 'Enter') { ev.preventDefault(); mandar(); }
        });
        if (o.foco) setTimeout(() => campo.focus(), 260);
      }

      const saltar = zona.querySelector('[data-saltar]');
      if (saltar) saltar.onclick = () => terminar(null, true);

      abajo();
    });
  }

  // ───────── Bloque 1: cómo te llamas ─────────

  async function bloqueNombre() {
    const a = Almacen.ajustes();

    await decir('Hola, soy Calma.');
    await decir('Voy a estar para ayudarte a ordenar tus gastos: te digo si puedes '
      + 'gastar y te hago acordar de tus pendientes.');
    await decir('¿Cómo te llamas?');

    const r = await preguntar({
      tipo: 'texto',
      marcador: 'Tu nombre',
      valor: a.nombre || '',
      rapidas: [{ etiqueta: 'Mejor sin nombre', valor: '' }],
      textoSaltar: 'Prefiero no decirlo',
      eco: (v) => (String(v).trim() || 'Prefiero sin nombre'),
      foco: false
    });

    if (!r.saltado) {
      a.nombre = String(r.valor || '').trim();
      Almacen.guardar();
    }
  }

  // ───────── Bloque 2: la agenda ─────────

  /**
   * Lo primero de verdad: anotar UN pendiente.
   * Es lo más barato que puede hacer la persona y lo que mejor muestra
   * para qué sirve la app. Nada de dinero todavía.
   */
  async function bloqueAgenda() {
    const a = Almacen.ajustes();
    const saludo = a.nombre ? `Bien, ${a.nombre}.` : 'Bien.';

    await decir(`${saludo} Empecemos por lo más fácil: tu agenda.`);
    await decir('Dime una cosa que tengas pendiente. La que sea, aunque sea chica: '
      + 'una llamada, un trámite, algo de la casa.');

    let puestos = 0;

    while (true) {
      const r = await preguntar({
        tipo: 'texto',
        marcador: 'Ej. llamar al banco',
        textoSaltar: puestos ? 'Ya está, seguimos' : 'Ahora no se me ocurre nada'
      });

      if (r.saltado) break;

      // "seguimos", "ya está", "no"… es querer pasar a lo siguiente,
      // no un pendiente que anotar.
      if (pareceFin(r.valor)) break;

      Almacen.agregarPendiente({
        tipo: 'tarea',
        titulo: String(r.valor).slice(0, 120),
        fecha: U.hoy()
      });
      puestos++;

      if (puestos === 1) {
        await decir('Listo. Ya está en tu agenda y me acuerdo yo por ti.');
        await decir('¿Hay otra? Si no, dime "seguimos" y pasamos a lo siguiente.');
      } else {
        await decir('Anotada. ¿Otra, o seguimos?');
      }
    }

    if (puestos) {
      await decir(puestos === 1
        ? 'Perfecto. Eso es todo lo que necesita tu agenda: me lo dices y yo lo guardo.'
        : `Perfecto, ${puestos} pendientes anotados. Se agregan igual desde el botón +.`);
    } else {
      await decir('Sin problema. Cuando se te ocurra algo, me lo dices y lo anoto.');
    }
  }

  // ───────── Bloque 3: cuánto puedo gastar ─────────

  /**
   * Cuatro preguntas, ni una más. Con eso ya sale el número.
   * La fecha del último pago se asume hoy y se dice en voz alta, en vez
   * de gastar una pregunta en algo que se corrige con un botón.
   */
  async function bloqueDinero() {
    const a = Almacen.ajustes();

    await decir('Ahora lo otro que hago: decirte cuánto puedes gastar hoy '
      + 'sin quedarte corto a fin de mes.');
    await decir('Para eso necesito cuatro datos. Nada más, y los puedes cambiar después.');

    // 1) Cada cuánto le pagan (el peor caso)
    await decir('¿Cuántos días pueden pasar, como máximo, entre un pago y otro?');
    let r = await preguntar({
      tipo: 'numero',
      marcador: 'Ej. 45',
      valor: U.numero(a.diasMaximos) || '',
      rapidas: [
        { etiqueta: 'Cada 15', valor: 15 },
        { etiqueta: 'Cada 30', valor: 30 },
        { etiqueta: 'Hasta 45', valor: 45 }
      ],
      eco: (v) => `Hasta ${Math.round(U.numero(v))} días`,
      foco: false
    });
    if (r.saltado) return void await decir('Está bien. Sin eso no puedo calcular el '
      + 'límite diario, pero la agenda te funciona igual. Cuando quieras me lo dices.');
    a.diasMaximos = Math.max(1, Math.round(U.numero(r.valor)));
    Almacen.guardar();

    // 2) Cuánto le pagan
    await decir('¿Cuánto te suelen pagar? Un aproximado está bien.');
    r = await preguntar({
      tipo: 'numero', marcador: '0.00',
      valor: U.numero(a.montoPago) || '',
      eco: (v) => U.soles(U.numero(v))
    });
    if (!r.saltado) { a.montoPago = U.redondear(U.numero(r.valor)); Almacen.guardar(); }

    // 3) Cuánto tiene ahora
    await decir('¿Cuánto tienes ahora mismo, entre efectivo y cuenta?');
    await decir('Sin redondear para arriba. El número real es el que sirve.');
    r = await preguntar({
      tipo: 'numero', marcador: '0.00',
      valor: U.numero(a.saldoArrastrado) || '',
      eco: (v) => U.soles(U.numero(v))
    });
    if (!r.saltado) { a.saldoArrastrado = U.redondear(U.numero(r.valor)); Almacen.guardar(); }

    // 4) La comida, que es lo que de verdad importa
    await decir('Y la importante: ¿cuánto necesitas al día para comer?');
    await decir('Ese dinero lo aparto antes que todo lo demás. No aparece como '
      + 'disponible ni para pagar deudas. Es intocable.');
    r = await preguntar({
      tipo: 'numero', marcador: 'Ej. 13',
      valor: U.numero(a.comidaPorDia) || '',
      eco: (v) => `${U.soles(U.numero(v))} al día`
    });
    if (!r.saltado) { a.comidaPorDia = U.redondear(U.numero(r.valor)); Almacen.guardar(); }

    // La fecha del pago: se asume y se avisa
    if (!a.ultimoPago) {
      a.ultimoPago = U.hoy();
      Almacen.guardar();
      await decir('Voy a asumir que tu último pago fue hoy. Si no fue así, me lo '
        + 'corriges con el botón "Me pagaron" y recalculo todo.');
    }

    // El premio: su número
    const resumen = Calculo.resumenHoy();
    if (resumen.hayPeriodo) {
      await decir(`Con eso ya puedo decírtelo: hoy puedes gastar ${U.soles(Math.max(0, resumen.puedo))}.`);
      if (resumen.puedo > 0) {
        await decir('Tu comida ya está apartada aparte, así que ese monto es tuyo de verdad.');
      } else {
        await decir('Sale cero, y no es por algo que hayas hecho: con lo que tienes, '
          + 'lo que entra ya tiene dueño. Prefiero decírtelo que inventarte un número.');
      }
    }
  }

  // ───────── Bloque 4: ver en qué se va la plata ─────────

  async function bloqueGastos() {
    await decir('¿Quieres que además te vaya mostrando en qué se te va la plata?');

    const r = await preguntar({
      tipo: 'opciones',
      rapidas: [
        { etiqueta: 'Sí, muéstrame', valor: 'si' },
        { etiqueta: 'Mejor no por ahora', valor: 'no' }
      ],
      saltable: false,
      eco: (v) => (v === 'si' ? 'Sí, muéstrame' : 'Mejor no por ahora')
    });

    if (r.valor === 'si') {
      await decir('Perfecto. Cada vez que gastes algo, tócame el + y ponlo. '
        + 'Son dos toques.');
      await decir('Y si no tienes cabeza para elegir categoría, usa "Salió plata": '
        + 'pones solo el monto y me dices después en qué fue.');
    } else {
      await decir('Está bien. El número de cuánto puedes gastar te va a funcionar igual. '
        + 'Si algún día quieres el detalle, está en la pestaña Dinero.');
    }
  }

  // ───────── Bloque 5: las deudas ─────────

  async function bloqueDeudas() {
    await decir('Última cosa y te dejo tranquilo: ¿tienes deudas?');

    const r = await preguntar({
      tipo: 'opciones',
      rapidas: [
        { etiqueta: 'Sí, varias', valor: 'varias' },
        { etiqueta: 'Sí, una o dos', valor: 'pocas' },
        { etiqueta: 'No', valor: 'no' },
        { etiqueta: 'No estoy seguro', valor: 'nose' }
      ],
      saltable: false,
      eco: (v) => ({ varias: 'Sí, varias', pocas: 'Sí, una o dos',
                     no: 'No', nose: 'No estoy seguro' }[v] || String(v))
    });

    if (r.valor === 'no') {
      await decir('Qué bueno. Entonces lo tuyo es no empezar a tenerlas.');
      return;
    }

    if (r.valor === 'nose') {
      await decir('Pasa mucho, y no tiene nada de malo. En la pestaña Deudas hay una '
        + 'lista de sitios donde suelen aparecer las que uno olvida.');
    } else {
      await decir('Entonces lo que hago es decirte en qué orden conviene pagarlas y '
        + 'cuándo saldrías de todas.');
    }
    await decir('No hace falta anotarlas hoy. Cuando quieras, me las cuentas.');
  }

  // ───────── Cierre del primer día ─────────

  async function cerrarPrimerDia() {
    const e = Almacen.get();
    const a = Almacen.ajustes();
    // En construcción el PIN ya viene puesto y no se le pide a nadie
    if (App.CONSTRUCCION) await App.asegurarPinDeConstruccion();
    const hayPin = !!e.pin.hash;

    const faltan = porArmar({ incluirSaltados: true });
    if (faltan.length) {
      await decir(`Dejamos para después ${faltan.length === 1 ? 'una cosa' : faltan.length + ' cosas'}. `
        + 'Te las ofrezco de nuevo cuando entres, sin insistir.');
    }

    if (!hayPin) {
      await decir('Falta una sola cosa: un PIN de 4 dígitos, para que esto sea solo tuyo.');
    }

    const zona = nuevaZona();
    zona.innerHTML = `
      <button class="boton principal" data-terminar>
        ${hayPin ? 'Entrar' : 'Crear mi PIN y entrar'}</button>
      ${a.modoPruebas ? `
        <button class="boton tenue chico" data-fin-pruebas style="margin-top:12px">
          Apagar el modo pruebas</button>
        <p class="ayuda" style="text-align:center;margin-top:10px">
          Estás en modo pruebas: entras siempre como la primera vez.
          Tus datos no se pierden.</p>` : ''}`;

    zona.querySelector('[data-terminar]').onclick = terminar;

    const fin = zona.querySelector('[data-fin-pruebas]');
    if (fin) fin.onclick = () => {
      a.modoPruebas = false;
      Almacen.guardar();
      terminar();
      App.brindis('Modo pruebas apagado. Ya entras directo a tu día.', 'bien', 3600);
    };
    abajo();
  }

  function terminar() {
    const e = Almacen.get();
    e.configurado = true;
    Almacen.marcarUso('bienvenida');
    Almacen.guardar();
    U.$('#pantalla-bienvenida').classList.add('oculto');

    const despues = () => {
      App.entrarApp({ conIntro: false });
      App.brindis('Todo listo. Vamos con calma.', 'bien', 3200);
    };

    if (!e.pin.hash) App.mostrarPin('crear', despues);
    else despues();
  }

  // ───────── Los días siguientes: tus números ─────────

  /**
   * Lo primero y lo más importante: cuánto puedes gastar y en qué se
   * divide tu plata. Sin rodeos y sin que tengas que buscarlo.
   */
  async function resumenDelDia() {
    const e = Almacen.get();
    const a = Almacen.ajustes();
    nuevaZona();

    const r = Calculo.resumenHoy();

    // ── Día difícil: no se le pide nada ──
    if (Almacen.enDiaDificil()) {
      await decir(`Bienvenido${a.nombre ? ' ' + a.nombre : ''}.`);
      await decir(`Hoy marcaste día difícil, así que no te pido nada.\n\n`
        + `Lo único de hoy: ${a.tareaMinima || 'tomar agua'}.`);
      return opcionesFinales([
        { clave: 'app', etiqueta: 'Ver mi día', accion: 'app' },
        { clave: 'salir', etiqueta: 'Ya estoy mejor', accion: 'salir-dificil' }
      ]);
    }

    // ── Lo primero y sin rodeos: cuánto para gastar y cuánto guardar ──
    // Es la frase por la que se abre la app. Va completa en una sola
    // burbuja, antes que cualquier otra cosa.
    if (!r.hayPeriodo) {
      await decir(`Bienvenido${a.nombre ? ' ' + a.nombre : ''}.`);
      await decir('Todavía no sé cuánto te pagan ni cada cuánto, así que no puedo '
        + 'decirte cuánto gastar. Cuando me lo cuentes, aparece solo.');
    } else {
      const guardar = U.redondear(
        U.redondear(r.cuotas + r.fijos) / Math.max(1, r.diasRestantes));

      await decir(
        `Bienvenido${a.nombre ? ' ' + a.nombre : ''}. `
        + `Hoy tienes ${U.soles(Math.max(0, r.puedo))} para gastar`
        + (guardar > 0 ? ` y debes guardar ${U.soles(guardar)}.` : '.')
      );

      // El porqué, en una línea. Nunca antes del número.
      if (r.puedo > 0) {
        await decir(`Tu comida de hoy (${U.soles(r.comidaHoy.porDia)}) ya está aparte, `
          + 'así que ese monto es tuyo de verdad.');
      } else {
        await decir('Hoy sale cero y no es por algo que hayas hecho: lo que entra ya '
          + `tiene dueño. Tu comida (${U.soles(r.comidaHoy.porDia)}) sigue apartada.`);
      }

      const p = Plan.resumen();
      if (p.hayDatos && !p.alcanza) {
        await decir(`Y te lo digo claro: al mes faltan ${U.soles(p.falta)} para cubrir `
          + 'todo. No es que gastes mal, es que las cuotas pesan más que el sueldo.');
      } else if (p.alcanza && p.paraTi > 0) {
        await decir(`Este mes te quedan ${U.soles(p.paraTi)} para ti `
          + `(${U.soles(p.paraTiPorDia)} al día), ya descontado todo.`);
      }
    }

    // ── Lo urgente, si lo hay ──
    const sinClasificar = (e.porClasificar || []).length;
    if (sinClasificar) {
      await decir(sinClasificar === 1
        ? 'Salió un monto que no sé en qué fue. Un toque y queda anotado.'
        : `Salieron ${sinClasificar} montos que no sé en qué fueron.`);
    }

    const atrasados = Calculo.atrasados();
    if (atrasados.length && a.atrasadosVistos !== U.hoy()) {
      await decir(`Hay ${U.soles(Calculo.totalAtrasado())} que ya venció y sigue sin pagarse. `
        + 'Lo tengo apartado para que no te lo gastes sin querer.');
    }

    // ── Lo que la app todavía no tiene armado ──
    const faltan = porArmar({ incluirSaltados: true });
    if (faltan.length) {
      await decir(`Por cierto, todavía falta una parte: ${faltan[0].falta || faltan[0].etiqueta.toLowerCase()}. `
        + 'Cuando quieras lo armamos, es rápido.');
    }

    await decir('¿Qué quieres hacer?');
    opcionesFinales(botonesDeInicio(faltan));
  }

  /** Los botones del final, ordenados por lo que más usas. */
  function botonesDeInicio(faltan) {
    const base = [
      { clave: 'app',     etiqueta: 'Ver mi día',         accion: 'app' },
      { clave: 'gasto',   etiqueta: 'Anotar un gasto',    accion: 'gasto' },
      { clave: 'rapido',  etiqueta: 'Salió plata',        accion: 'rapido' },
      { clave: 'accion',  etiqueta: '¿Y ahora qué hago?', accion: 'accion' },
      { clave: 'pagaron', etiqueta: 'Me pagaron',         accion: 'pagaron' }
    ];

    // "Ver mi día" se queda siempre primero: es la salida de emergencia
    const resto = Almacen.aperturas() >= 5
      ? Almacen.porMasUsado(base.slice(1), (x) => 'inicio:' + x.clave)
      : base.slice(1);

    const lista = [base[0]].concat(resto);
    if (faltan && faltan.length) {
      lista.push({ clave: 'armar', etiqueta: faltan[0].etiqueta,
                   accion: 'armar', dato: faltan[0] });
    }
    return lista;
  }

  /** Pinta los botones y la caja para escribir. */
  function opcionesFinales(opciones) {
    const zona = nuevaZona();
    zona.innerHTML = `
      <div class="opciones" style="margin-bottom:14px">
        ${opciones.map((o, i) => `<button class="opcion" data-op="${i}">
          ${U.esc(o.etiqueta)}</button>`).join('')}
      </div>
      <div class="fila-botones">
        <input id="bv-campo" type="text" autocomplete="off"
               placeholder="O escríbeme lo que estás pensando…">
        <button class="boton principal chico" data-enviar style="flex:0 0 84px">Enviar</button>
      </div>`;

    U.al('click', '[data-op]', (e, b) => {
      const o = opciones[Number(b.dataset.op)];
      Almacen.marcarUso('inicio:' + (o.clave || o.accion));
      hacer(o.accion, o.dato);
    }, zona);

    engancharEscribir(zona);
    abajo();
  }

  function engancharEscribir(zona) {
    const campo = zona.querySelector('#bv-campo');
    if (!campo) return;
    const mandar = () => {
      const v = campo.value.trim();
      if (!v) return;
      campo.value = '';
      conversar(v);
    };
    zona.querySelector('[data-enviar]').onclick = mandar;
    campo.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter') { ev.preventDefault(); mandar(); }
    });
  }

  /**
   * Lo que escribes libremente sí va al chat que aprende.
   * Se responde aquí mismo, sin sacarte de la pantalla.
   */
  async function conversar(texto) {
    burbuja(texto, true);
    nuevaZona();

    // Queda guardado en la conversación de la pestaña Hablar
    const e = Almacen.get();
    e.chat = e.chat || [];
    e.chat.push({ id: U.id(), de: 'yo', texto, fecha: Date.now() });

    // Puede salir a internet (mente.js); mientras, los puntitos
    escribiendo(true);
    const res = await Mente.responder(texto).catch(() => Chat.responder(texto));
    escribiendo(false);

    e.chat.push({
      id: U.id(), de: 'calma', texto: res.texto,
      acciones: res.acciones || [], deApi: !!res.deApi, fecha: Date.now()
    });
    if (e.chat.length > 120) e.chat = e.chat.slice(-120);
    Almacen.marcarActivo();
    Almacen.guardar();

    await decir(res.texto);

    // Las acciones del chat necesitan la app abierta: se entra y luego
    // se ejecutan, para no dejarlo tocando un botón que no hace nada.
    const acciones = (res.acciones || []).map((x) => ({
      etiqueta: x.etiqueta, accion: 'chat', dato: x
    }));
    acciones.push({ clave: 'app', etiqueta: 'Ver mi día', accion: 'app' });

    const zona = nuevaZona();
    zona.innerHTML = `
      <div class="opciones" style="margin-bottom:14px">
        ${acciones.map((o, i) => `<button class="opcion" data-op="${i}">
          ${U.esc(o.etiqueta)}</button>`).join('')}
      </div>
      <div class="fila-botones">
        <input id="bv-campo" type="text" autocomplete="off"
               placeholder="Sigue contándome…">
        <button class="boton principal chico" data-enviar style="flex:0 0 84px">Enviar</button>
      </div>`;

    U.al('click', '[data-op]', (ev, b) => {
      const o = acciones[Number(b.dataset.op)];
      hacer(o.accion, o.dato);
    }, zona);

    engancharEscribir(zona);
    abajo();
  }

  /** Sale de la entrada y hace lo que pidió. */
  async function hacer(accion, dato) {
    // Armar una parte que faltaba: se queda aquí, conversando
    if (accion === 'armar' && dato) {
      nuevaZona();
      await dato.correr();
      marcarPreguntado(dato.clave);
      await decir('Listo, eso ya está.');
      await decir('¿Algo más?');
      return opcionesFinales(botonesDeInicio(porArmar({ incluirSaltados: true })));
    }

    entrar();

    setTimeout(() => {
      switch (accion) {
        case 'gasto':   Dinero.formularioMovimiento('gasto'); break;
        case 'rapido':  Dinero.capturaRapida(); break;
        case 'pagaron': Hoy.formularioPago(); break;
        case 'accion':  App.ir('accion'); break;
        case 'chat':    Chat.ejecutar(dato); break;
        case 'salir-dificil':
          Almacen.ajustes().dificilHasta = null;
          Almacen.guardar();
          App.brindis('Qué bueno. Aquí seguimos.', 'bien');
          App.pintar();
          break;
        default: break;   // 'app': ya entró
      }
    }, 220);
  }

  /** Esconde la entrada y abre la app, sin repetir la animación. */
  function entrar() {
    U.$('#pantalla-bienvenida').classList.add('oculto');
    App.entrarApp({ conIntro: false });
  }

  return { mostrar, entrar };
})();
