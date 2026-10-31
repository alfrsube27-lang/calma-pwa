/* ===========================================================
   chat.js — conversar con la app.

   Para que no haya malentendidos sobre qué es y qué no:

   SÍ aprende a entenderte. `aprendiz.js` clasifica lo que escribes y,
   cuando no está seguro, te pregunta cuál era; esa corrección queda
   guardada y la próxima vez acierta. Se entrena con tus frases.

   NO inventa texto. Las respuestas son plantillas rellenadas con TUS
   números reales (lo que debes, lo que te queda, cuánto falta). Eso es
   a propósito: una app de plata no debe improvisar consejos.

   Lo que hace y sirve de verdad:
     · Entiende planes con fecha ("pago entel en marzo") y los guarda,
       calculando cuánto tendrías que juntar al mes para cumplirlos.
     · Entiende deseos ("quiero salir con alguien") y arma un plan
       concreto para que se pueda, en vez de decirte que no.
     · Ofrece anotar el gasto cuando hablas de plata.

   Todo esto corre en el teléfono: sin internet, sin clave de ningún
   servicio y sin que tus datos salgan a ningún lado.
   =========================================================== */

const Chat = (() => {

  const MESES = {
    enero: 0, febrero: 1, marzo: 2, abril: 3, mayo: 4, junio: 5,
    julio: 6, agosto: 7, setiembre: 8, septiembre: 8, octubre: 9,
    noviembre: 10, diciembre: 11
  };

  // ───────── Utilidades de texto ─────────

  /** Minúsculas y sin tildes, para comparar sin sorpresas. */
  function limpiar(t) {
    return String(t || '').toLowerCase()
      .normalize('NFD').replace(/[̀-ͯ]/g, '');
  }

  function contiene(texto, palabras) {
    return palabras.some((p) => texto.includes(p));
  }

  /** Primer número que aparezca en el texto. */
  function montoEn(texto) {
    const m = texto.replace(/,/g, '.').match(/(\d+(?:\.\d+)?)/);
    return m ? parseFloat(m[1]) : null;
  }

  /** Busca "marzo", "marzo 2027", "en 3 meses"… y devuelve una fecha ISO. */
  function fechaEn(texto) {
    const enMeses = texto.match(/en (\d+) mes/);
    if (enMeses) {
      const d = U.deISO(U.hoy());
      d.setMonth(d.getMonth() + Number(enMeses[1]));
      return U.aISO(d);
    }
    for (const nombre of Object.keys(MESES)) {
      if (!texto.includes(nombre)) continue;
      const anio = (texto.match(/20(\d{2})/) || [])[0];
      const hoy = U.deISO(U.hoy());
      let a = anio ? Number(anio) : hoy.getFullYear();
      const mes = MESES[nombre];
      // Si el mes ya pasó y no dijo el año, se refiere al próximo
      if (!anio && mes < hoy.getMonth()) a++;
      return U.aISO(new Date(a, mes, 1));
    }
    return null;
  }

  /** ¿Mencionó alguna de sus deudas por nombre? */
  function deudaEn(texto) {
    const deudas = Almacen.get().deudas.filter((d) => !d.terminada);
    return deudas.find((d) => {
      const nombre = limpiar(d.acreedor);
      return nombre.length >= 3 && texto.includes(nombre.split(' ')[0]);
    }) || null;
  }

  // ───────── El motor de respuestas ─────────

  /**
   * Devuelve { texto, acciones: [{etiqueta, accion, dato}] }
   * Las acciones se pintan como botones debajo de la respuesta.
   */
  /**
   * Primero clasificamos con el motor que aprende de ti; si no está
   * seguro, preguntamos (y esa respuesta tuya lo entrena).
   */
  function responder(entrada) {
    const t = limpiar(entrada);
    const juicio = Aprendiz.clasificar(entrada);

    if (!juicio.seguro) return noEntendi(entrada, juicio);
    // De qué hablas más seguido: con eso se acomodan los ejemplos
    Almacen.marcarUso('chat:' + juicio.intencion);
    return porIntencion(juicio.intencion, entrada, t);
  }

  /** Arma la respuesta de una intención ya decidida. */
  function porIntencion(intencion, entrada, t) {
    t = t || limpiar(entrada);
    const r = Calculo.resumenHoy();
    const p = Plan.resumen();
    const monto = montoEn(t);

    switch (intencion) {
      case 'pagar_plan':
        return planDePago(deudaEn(t), fechaEn(t) || null, t);

      case 'agregar_deuda':
        return sobreDeudaNueva(t);

      case 'registrar_gasto':
        return {
          texto: monto
            ? `¿Anoto ${U.soles(monto)} como gasto de hoy? Así tu número de Hoy queda real.`
            : '¿Cuánto fue? Lo anoto y tu número de Hoy se actualiza.',
          acciones: monto
            ? [{ etiqueta: `Sí, anotar ${U.soles(monto)}`, accion: 'anotar-gasto', dato: monto },
               { etiqueta: 'No, era un ejemplo', accion: 'nada' }]
            : [{ etiqueta: 'Abrir el formulario', accion: 'anotar-gasto', dato: null }]
        };

      case 'registrar_ingreso':
        return {
          texto: monto
            ? `Qué bueno. ¿Lo anoto como ingreso de ${U.soles(monto)}?`
            : '¿Fue tu pago del mes o un extra? Según cuál sea, recalculo distinto.',
          acciones: [
            { etiqueta: 'Fue mi pago', accion: 'me-pagaron' },
            { etiqueta: 'Fue un extra', accion: 'anotar-ingreso', dato: monto }
          ]
        };

      case 'deseo':
        return sobreUnDeseo(t, r, p);

      case 'no_alcanza':
        return sobreQueNoAlcanza(p);

      case 'cuanto_puedo':
        return {
          texto: r.puedo > 0
            ? `Hoy puedes gastar ${U.soles(r.puedo)}. Tu comida (${U.soles(r.comidaHoy.porDia)}) ya está aparte, así que ese monto es de verdad tuyo.`
            : `Hoy el margen está en cero. No es castigo: lo que entra ya tiene dueño (comida, fijos y deudas). Mañana se recalcula.`,
          acciones: [{ etiqueta: 'Ver el plan completo', accion: 'ir-accion' }]
        };

      case 'agregar_pendiente':
        return {
          texto: 'Lo anoto en tu agenda y me acuerdo yo por ti. ¿Lo creo así como me lo dijiste?',
          acciones: [
            { etiqueta: 'Sí, anótalo', accion: 'crear-tarea', dato: entrada.slice(0, 80) },
            { etiqueta: 'Mejor lo escribo yo', accion: 'ir-agenda' }
          ]
        };

      case 'animo':
        return sobreElAnimo();

      case 'ocultar_apartado':
        return sobreLaInterfaz(entrada, false);

      case 'mostrar_apartado':
        return sobreLaInterfaz(entrada, true);

      case 'cambiar_color':
        return sobreElColor(entrada);

      case 'saludo':
      default: {
        const nombre = Almacen.ajustes().nombre;
        return {
          texto: `Hola${nombre ? ' ' + nombre : ''}. Cuéntame qué estás pensando y te digo cómo se acomoda con tu plata.`,
          acciones: sugerencias()
        };
      }
    }
  }

  /**
   * No entendió. En vez de un "no sé", le pregunta al usuario qué
   * quiso decir: cada respuesta se guarda y la próxima vez sí entiende.
   */
  function noEntendi(entrada, juicio) {
    const candidatas = (juicio.ranking || []).slice(0, 3);
    const opciones = (candidatas.length ? candidatas : ['agregar_deuda', 'deseo', 'cuanto_puedo'])
      .map((clave) => ({
        etiqueta: Aprendiz.etiquetaDe(clave),
        accion: 'ensenar',
        dato: { texto: entrada, intencion: clave }
      }));

    opciones.push({ etiqueta: 'Otra cosa…', accion: 'ver-intenciones', dato: entrada });

    return {
      texto: 'No estoy seguro de qué quisiste decir. Dime cuál era y lo aprendo: '
           + 'la próxima vez que lo digas así, ya lo voy a entender.',
      acciones: opciones
    };
  }

  /** "Tengo otra deuda" */
  function sobreDeudaNueva(t) {
    const monto = montoEn(t);
    return {
      texto: monto
        ? `Vamos a anotarla. Tengo el monto (${U.soles(monto)}); me falta a quién le debes y cómo se paga.`
        : 'Vamos a anotarla. Aunque no sepas cuánto es ni cuándo se paga, la anotamos igual: '
          + 'sacarla de tu cabeza ya ayuda.',
      acciones: [
        { etiqueta: 'Anotar la deuda', accion: 'nueva-deuda' },
        { etiqueta: 'No me acuerdo de todas', accion: 'ayuda-recordar' }
      ]
    };
  }

  // ───────── La app se acomoda a ti ─────────

  /**
   * "Quita el calendario" / "quiero que aparezca la agenda".
   *
   * Se aplica de una, sin pedir confirmación: es un cambio visual y se
   * deshace diciendo lo contrario. Pedir permiso para cada cosita es
   * justo el tipo de fricción que esta app no debe tener.
   */
  function sobreLaInterfaz(entrada, visible) {
    const clave = Apariencia.pestaniaEn(entrada);

    if (!clave) {
      return {
        texto: visible
          ? '¿Cuál quieres que te devuelva?'
          : '¿Cuál quito? Dime el nombre y lo saco.',
        acciones: Apariencia.lista()
          .filter((p) => p.visible !== visible)
          .map((p) => ({
            etiqueta: p.nombre, accion: 'interfaz-ver',
            dato: { clave: p.clave, visible }
          }))
      };
    }

    if (clave === 'hoy') {
      return {
        texto: 'Esa no la puedo quitar: es la pantalla donde te digo cuánto '
             + 'puedes gastar, que es para lo que existe la app.\n\n'
             + 'Cualquier otra sí.',
        acciones: []
      };
    }

    const res = Apariencia.verPestania(clave, visible);
    if (!res.ok) return { texto: 'Esa no la ubico. ¿Cuál era?', acciones: [] };

    return {
      texto: visible
        ? `Listo, ${res.nombre} vuelve a estar abajo.`
        : `Listo, quité ${res.nombre}. Si la quieres de vuelta, me lo dices y ya.`,
      acciones: [{
        etiqueta: visible ? 'Mejor quítala' : 'Devuélvemela',
        accion: 'interfaz-ver',
        dato: { clave, visible: !visible }
      }]
    };
  }

  /** "Ponlo más claro", "me gusta el verde". */
  function sobreElColor(entrada) {
    const tema = Apariencia.temaEn(entrada);
    const color = Apariencia.colorEn(entrada);

    if (tema) Apariencia.ponerTema(tema);
    if (color) Apariencia.ponerAcento(color);

    if (tema || color) {
      const partes = [];
      if (tema) partes.push(tema === 'claro' ? 'en claro' : 'en oscuro');
      if (color) partes.push(`con el ${color}`);
      return {
        texto: `Ya está, ${partes.join(' y ')}. Si no te convence, dime otro.`,
        acciones: [
          { etiqueta: tema === 'claro' ? 'Mejor oscuro' : 'Mejor claro',
            accion: 'interfaz-tema', dato: tema === 'claro' ? 'oscuro' : 'claro' },
          { etiqueta: 'Volver a lo de antes', accion: 'interfaz-reset' }
        ]
      };
    }

    // Dijo que quiere cambiar, pero no dijo a qué
    return {
      texto: 'Dime cómo lo quieres y lo cambio al toque.',
      acciones: [
        { etiqueta: 'Más claro', accion: 'interfaz-tema', dato: 'claro' },
        { etiqueta: 'Más oscuro', accion: 'interfaz-tema', dato: 'oscuro' },
        { etiqueta: 'Verde', accion: 'interfaz-color', dato: 'verde' },
        { etiqueta: 'Morado', accion: 'interfaz-color', dato: 'morado' },
        { etiqueta: 'Durazno', accion: 'interfaz-color', dato: 'durazno' }
      ]
    };
  }

  /** Cuando dice que está mal. Aquí la plata pasa a segundo plano. */
  function sobreElAnimo() {
    const a = Almacen.ajustes();
    return {
      texto: `Gracias por decírmelo.\n\n`
        + `Si hoy no puedes con nada, no pasa nada: activa el día difícil y la app se calla. `
        + `Te deja una sola cosa mínima (${a.tareaMinima || 'tomar agua'}) y lo demás pasa a mañana solo, `
        + `sin marcarse como fallido.\n\n`
        + `Las deudas van a seguir ahí mañana y pasado. Hoy no es el día de resolverlas.`,
      acciones: [
        { etiqueta: 'Activar día difícil', accion: 'dia-dificil' },
        { etiqueta: 'Estoy bien, sigamos', accion: 'nada' }
      ]
    };
  }

  /**
   * Los ejemplos que se ofrecen. Se acomodan a ti de dos maneras:
   * usan el nombre de tu deuda más urgente, y ponen primero el tema
   * del que más hablas.
   */
  function sugerencias() {
    const d = Calculo.deudasOrdenadas()[0];
    const ejemplo = d ? d.acreedor : 'la deuda';

    const base = [
      { intencion: 'pagar_plan', etiqueta: `Pagar ${ejemplo} en marzo`, accion: 'ejemplo',
        dato: `Quiero pagar lo de ${ejemplo} en marzo del 2027` },
      { intencion: 'deseo', etiqueta: 'Quiero salir y no tengo plata', accion: 'ejemplo',
        dato: 'Quiero salir con una chica y no tengo plata por mis deudas' },
      { intencion: 'cuanto_puedo', etiqueta: '¿Cuánto puedo gastar?', accion: 'ejemplo',
        dato: '¿Cuánto puedo gastar hoy?' },
      { intencion: 'no_alcanza', etiqueta: 'No me alcanza este mes', accion: 'ejemplo',
        dato: 'No me alcanza este mes, no sé qué hacer' }
    ];

    return Almacen.porMasUsado(base, (x) => 'chat:' + x.intencion).slice(0, 3);
  }

  // ───────── Respuestas largas ─────────

  /** "Pienso pagar X en [mes]": calculamos si se puede y cómo. */
  function planDePago(deuda, fecha, t) {
    if (!deuda) {
      return {
        texto: `Entiendo la fecha (${U.fechaCorta(fecha)} de ${U.deISO(fecha).getFullYear()}), pero no sé de cuál deuda hablas. Dímelo con el nombre tal como está en la app.`,
        acciones: Almacen.get().deudas.filter((d) => !d.terminada).slice(0, 4).map((d) => ({
          etiqueta: d.acreedor,
          accion: 'ejemplo',
          dato: `Quiero pagar lo de ${d.acreedor} el ${U.fechaCorta(fecha)} del ${U.deISO(fecha).getFullYear()}`
        }))
      };
    }

    const meses = Math.max(1, Math.round(U.diasEntre(U.hoy(), fecha) / 30.44));
    const porMes = U.redondear(deuda.saldo / meses);
    const porDia = U.redondear(porMes / 30.44);
    const p = Plan.resumen();
    const alcanza = p.alcanza && p.paraTi >= porMes;

    let texto = `Anotado: ${deuda.acreedor}, ${U.soles(deuda.saldo)}, para ${U.fechaCorta(fecha)} del ${U.deISO(fecha).getFullYear()}.\n\n`
      + `Son ${meses} ${meses === 1 ? 'mes' : 'meses'}. Para llegar necesitas juntar ${U.soles(porMes)} al mes — unos ${U.soles(porDia)} al día.\n\n`;

    if (alcanza) {
      texto += `Con lo que tienes libre ahora (${U.soles(p.paraTi)} al mes) sí da. Si logras guardarlo aparte desde el primer pago, llegas.`;
    } else if (p.alcanza) {
      texto += `Ahora mismo te quedan ${U.soles(p.paraTi)} libres al mes, así que faltarían ${U.soles(porMes - p.paraTi)}. O consigues ese extra, o corres la fecha unos meses.`;
    } else {
      texto += `Te soy honesto: hoy no te sobra nada al mes, así que ese plan depende de que cambie tu ingreso. `
        + `Si en diciembre sube el sueldo, el plan se vuelve real — pero mientras tanto conviene avisarle a ${deuda.acreedor} que vas a pagar en esa fecha. `
        + `Un acuerdo hablado evita que la deuda siga creciendo o se vaya a cobranza.`;
    }

    if (deuda.frecuencia === 'vencida') {
      texto += `\n\nOjo: esta ya está vencida. Mientras más esperes sin avisar, peor se pone. Llamar y decir "voy a pagar en marzo" es gratis y cambia mucho.`;
    }

    return {
      texto,
      acciones: [
        { etiqueta: 'Guardar este plan', accion: 'guardar-plan',
          dato: { deudaId: deuda.id, fecha, porMes } },
        { etiqueta: `Crear tarea: avisar a ${deuda.acreedor}`, accion: 'crear-tarea',
          dato: `Avisar a ${deuda.acreedor} que pagaré en ${U.fechaCorta(fecha)}` }
      ]
    };
  }

  /** "Quiero salir y no tengo plata": salidas concretas, no un no. */
  function sobreUnDeseo(t, r, p) {
    const monto = montoEn(t);
    const objetivo = monto || 50;   // una salida sencilla, si no dijo cuánto
    const libreDia = p.alcanza ? p.paraTiPorDia : 0;

    let texto = '';

    if (libreDia > 0) {
      const dias = Math.max(1, Math.ceil(objetivo / libreDia));
      texto = `Se puede, sin romper nada.\n\n`
        + `Te queda ${U.soles(libreDia)} al día que es tuyo de verdad. `
        + `Si lo guardas ${dias} ${dias === 1 ? 'día' : 'días'}, juntas ${U.soles(objetivo)} sin tocar comida ni deudas.\n\n`
        + `Eso es una salida pagada con plata que te sobra, no con la del mes que viene.`;
    } else {
      texto = `Te entiendo, y no te voy a decir "no gastes".\n\n`
        + `La verdad es que ahora mismo no te sobra nada al mes, así que sacarlo del presupuesto no se puede sin quitárselo a algo. `
        + `Pero que no haya plata no significa que no puedas salir:\n\n`
        + `· Hay planes de S/ 0 a S/ 15: caminar por el centro, un parque, un café compartido, una película en casa.\n`
        + `· Si quieres algo más, la plata tiene que venir de fuera del presupuesto: una changa, vender algo que no uses.\n`
        + `· Lo que NO conviene es sacarlo de la comida o de una cuota. Eso se paga doble después.\n\n`
        + `Y algo que vale más de lo que parece: decir "ando corto este mes" es normal y no te hace menos.`;
    }

    return {
      texto,
      acciones: [
        { etiqueta: 'Ponerme una meta chica', accion: 'meta-deseo', dato: objetivo },
        { etiqueta: 'Ver mi plan del mes', accion: 'ir-accion' }
      ]
    };
  }

  function sobreQueNoAlcanza(p) {
    if (!p.hayDatos) {
      return { texto: 'Primero dime cuánto te pagan y cada cuánto, y te digo dónde estás parado.',
               acciones: [{ etiqueta: 'Ir a Ajustes', accion: 'ir-ajustes' }] };
    }
    if (p.alcanza) {
      return {
        texto: `Respira: sí alcanza. Entran ${U.soles(p.ingreso)} al mes, lo fijo se lleva ${U.soles(p.esenciales.total)} y las cuotas ${U.soles(p.cuotas)}. Te quedan ${U.soles(p.paraTi)}.\n\nSi se siente que no alcanza, suele ser porque el gasto del día a día se come lo libre sin que se note. Anotar dos semanas lo aclara.`,
        acciones: [{ etiqueta: 'Ver mi plan', accion: 'ir-accion' }]
      };
    }
    const salida = p.salidas && p.salidas[1];
    return {
      texto: `No es tu cabeza: de verdad faltan ${U.soles(p.falta)} al mes.\n\n`
        + `Entran ${U.soles(p.ingreso)} y lo que no se negocia (comida y fijos) se lleva ${U.soles(p.esenciales.total)}. `
        + `Con lo que queda no cubres las cuotas.\n\n`
        + `Apretarte más no lo arregla, porque ya no hay de dónde. Lo que sí mueve la aguja:\n`
        + `${salida ? `· ${salida.titulo}: ${salida.detalle}\n` : ''}`
        + `· Conseguir ${U.soles(p.faltaPorDia)} al día de ingreso extra.\n\n`
        + `Una sola llamada pidiendo un convenio puede bajarte la cuota a la mitad.`,
      acciones: [{ etiqueta: 'Ver qué hacer, paso a paso', accion: 'ir-accion' }]
    };
  }

  // ───────── Pintado ─────────

  function pintar(c) {
    const mensajes = Almacen.get().chat || [];

    let html = `
      <div class="encabezado-vista">
        <div class="fecha">sin internet y sin que nada salga del teléfono</div>
        <h1>Conversar</h1>
      </div>`;

    if (!mensajes.length) {
      html += `
        <div class="tarjeta">
          <p>Cuéntame qué estás pensando y te respondo con tus números reales.
          Por ejemplo:</p>
          <div class="lista" style="margin-top:12px">
            ${sugerencias().map((s) => `
              <button class="item" data-ejemplo="${U.esc(s.dato)}">
                <span style="font-size:20px">💬</span>
                <div class="item-cuerpo">
                  <div class="item-titulo">${U.esc(s.etiqueta)}</div>
                </div>
              </button>`).join('')}
          </div>
          <p class="ayuda" style="margin-top:14px">
            Entiendo planes con fecha, deseos y preguntas sobre tu plata.
            No soy una IA: no invento, saco todo de lo que tienes anotado.
          </p>
        </div>`;
    }

    // ── Los mensajes ──
    html += '<div class="lista" style="gap:12px">';
    for (const m of mensajes.slice(-40)) {
      const mio = m.de === 'yo';
      html += `
        <div style="display:flex;justify-content:${mio ? 'flex-end' : 'flex-start'}">
          <div style="max-width:86%;padding:12px 14px;border-radius:16px;
               background:${mio ? 'var(--acento)' : 'var(--superficie)'};
               color:${mio ? '#0e1a22' : 'var(--texto)'};
               border:1px solid ${mio ? 'transparent' : 'var(--borde)'};
               white-space:pre-wrap;line-height:1.5;font-size:15px">
            ${U.esc(m.texto)}
          </div>
        </div>`;

      if (!mio && m.acciones && m.acciones.length && m === mensajes[mensajes.length - 1]) {
        html += `<div class="opciones" style="margin-top:-4px">`;
        m.acciones.forEach((a, i) => {
          html += `<button class="opcion" data-accion-chat="${i}">${U.esc(a.etiqueta)}</button>`;
        });
        html += `</div>`;
      }
    }
    html += '</div>';

    // ── Caja de escribir ──
    html += `
      <div style="position:sticky;bottom:0;padding-top:14px;
           background:linear-gradient(transparent, var(--fondo) 30%)">
        <div class="fila-botones">
          <input id="chat-texto" type="text" placeholder="Escribe lo que estás pensando…"
                 autocomplete="off" data-autofoco="no">
          <button class="boton principal chico" data-enviar style="flex:0 0 84px">Enviar</button>
        </div>
        <div class="fila-botones" style="margin-top:8px">
          <button class="boton tenue chico" data-aprendido>Lo que te enseñé</button>
          ${mensajes.length ? `
            <button class="boton tenue chico" data-limpiar>Borrar conversación</button>` : ''}
        </div>
      </div>`;

    c.innerHTML = html;
    enganchar(c);

    // Siempre abajo, donde está lo último
    requestAnimationFrame(() => window.scrollTo(0, document.body.scrollHeight));
  }

  // ───────── Envío y acciones ─────────

  /**
   * Manda un mensaje. Es asíncrono porque la respuesta puede venir de
   * la API de lenguaje (ver `mente.js`); sin ella responde al instante.
   *
   * Tu mensaje se pinta de una, sin esperar: que la app se quede
   * congelada mientras piensa se siente rota.
   */
  async function enviar(texto) {
    const limpio = String(texto || '').trim();
    if (!limpio) return;

    const e = Almacen.get();
    e.chat = e.chat || [];
    e.chat.push({ id: U.id(), de: 'yo', texto: limpio, fecha: Date.now() });
    Almacen.marcarActivo();
    Almacen.guardar();
    App.pintar();

    const res = await Mente.responder(limpio).catch(() => responder(limpio));

    e.chat.push({
      id: U.id(), de: 'calma', texto: res.texto,
      acciones: res.acciones || [], deApi: !!res.deApi, fecha: Date.now()
    });
    if (e.chat.length > 120) e.chat = e.chat.slice(-120);

    Almacen.guardar();
    App.pintar();
  }

  function ejecutar(accion) {
    if (!accion) return;
    switch (accion.accion) {
      case 'ejemplo':
        enviar(accion.dato);
        break;

      case 'anotar-gasto':
        App.ir('hoy');
        setTimeout(() => {
          Dinero.formularioMovimiento('gasto');
          if (accion.dato) {
            setTimeout(() => {
              const campo = U.$('#mov-monto');
              if (campo) campo.value = accion.dato;
            }, 260);
          }
        }, 150);
        break;

      case 'guardar-plan': {
        const e = Almacen.get();
        e.planes = e.planes || [];
        const d = e.deudas.find((x) => x.id === accion.dato.deudaId);
        e.planes.push({
          id: U.id(),
          deudaId: accion.dato.deudaId,
          acreedor: d ? d.acreedor : '',
          fecha: accion.dato.fecha,
          porMes: accion.dato.porMes,
          creado: U.hoy()
        });
        Almacen.guardar();
        App.brindis('Plan guardado. Te lo recuerdo en tu plan del mes.', 'bien', 3400);
        App.pintar();
        break;
      }

      case 'crear-tarea':
        Almacen.agregarPendiente({
          tipo: 'tarea', titulo: accion.dato, fecha: U.hoy(),
          prioridad: 'alta', notificar: false,
          subtareas: [
            { id: U.id(), titulo: 'Buscar el número', hecha: false },
            { id: U.id(), titulo: 'Llamar y decir la fecha', hecha: false },
            { id: U.id(), titulo: 'Anotar qué me respondieron', hecha: false }
          ]
        });
        App.brindis('Listo, está en tu agenda.', 'bien');
        App.pintar();
        break;

      case 'meta-deseo': {
        const a = Almacen.ajustes();
        a.metaEmergencia = U.numero(accion.dato);
        Almacen.guardar();
        App.brindis(`Meta de ${U.soles(accion.dato)} puesta. La ves en Ti.`, 'bien', 3200);
        break;
      }

      // ── Aquí es donde te hace caso y aprende ──
      case 'ensenar': {
        Aprendiz.aprender(accion.dato.texto, accion.dato.intencion);
        const e2 = Almacen.get();
        const res = porIntencion(accion.dato.intencion, accion.dato.texto);
        e2.chat.push({
          id: U.id(), de: 'calma',
          texto: `Aprendido: cuando digas algo así, lo entiendo como «${Aprendiz.etiquetaDe(accion.dato.intencion)}».\n\n${res.texto}`,
          acciones: res.acciones || [], fecha: Date.now()
        });
        Almacen.guardar();
        App.pintar();
        break;
      }

      case 'ver-intenciones': {
        const e3 = Almacen.get();
        e3.chat.push({
          id: U.id(), de: 'calma',
          texto: '¿Cuál de estas era? Toca la que corresponda y la aprendo.',
          acciones: Aprendiz.listaIntenciones().map((x) => ({
            etiqueta: x.etiqueta, accion: 'ensenar',
            dato: { texto: accion.dato, intencion: x.clave }
          })),
          fecha: Date.now()
        });
        Almacen.guardar();
        App.pintar();
        break;
      }

      case 'nueva-deuda':
        App.ir('deudas');
        setTimeout(() => Deudas.formularioDeuda(), 200);
        break;

      case 'ayuda-recordar':
        App.ir('deudas');
        setTimeout(() => Deudas.ayudaRecordar(), 200);
        break;

      case 'me-pagaron':
        App.ir('hoy');
        setTimeout(() => Hoy.formularioPago(), 200);
        break;

      case 'anotar-ingreso':
        App.ir('hoy');
        setTimeout(() => {
          Dinero.formularioMovimiento('ingreso');
          if (accion.dato) {
            setTimeout(() => {
              const campo = U.$('#mov-monto');
              if (campo) campo.value = accion.dato;
            }, 260);
          }
        }, 150);
        break;

      case 'dia-dificil':
        App.ir('hoy');
        setTimeout(() => Hoy.activarDiaDificil(), 200);
        break;

      // ── La app se acomoda: se aplica y se avisa, sin salir del chat ──
      case 'interfaz-ver': {
        const res = Apariencia.verPestania(accion.dato.clave, accion.dato.visible);
        App.brindis(res.ok
          ? (accion.dato.visible ? `${res.nombre} está de vuelta.` : `Quité ${res.nombre}.`)
          : 'Esa no se puede quitar.', 'bien', 2800);
        App.pintar();
        break;
      }

      case 'interfaz-tema':
        Apariencia.ponerTema(accion.dato);
        App.brindis(accion.dato === 'claro' ? 'Ahí está, más claro.' : 'Listo, oscuro.',
          'bien', 2600);
        App.pintar();
        break;

      case 'interfaz-color':
        Apariencia.ponerAcento(accion.dato);
        App.brindis(`Listo, con el ${accion.dato}.`, 'bien', 2600);
        App.pintar();
        break;

      case 'interfaz-reset':
        Apariencia.ponerTema('oscuro');
        Apariencia.ponerAcento(null);
        App.brindis('Volví a los colores de siempre.', 'bien', 2600);
        App.pintar();
        break;

      case 'ir-agenda': App.ir('agenda'); break;
      case 'ir-accion': App.ir('accion'); break;
      case 'ir-ajustes': App.ir('ajustes'); break;
      case 'nada':
      default:
        App.brindis('Listo.');
        break;
    }
  }

  /** Lo que ya aprendió de ti, y la opción de corregirlo. */
  function panelAprendido() {
    const p = Aprendiz.progreso();
    const mios = (Almacen.get().entrenamiento || []).slice().reverse();

    App.abrirHoja('Lo que te enseñé', `
      <div class="tarjeta sin-borde" style="background:var(--superficie-2)">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
          <div>
            <div class="item-sub">Frases tuyas</div>
            <div style="font-size:22px;font-weight:650">${p.ejemplosTuyos}</div>
          </div>
          <div>
            <div class="item-sub">Temas que cubres</div>
            <div style="font-size:22px;font-weight:650">
              ${p.intencionesCubiertas}/${p.intencionesTotales}</div>
          </div>
        </div>
        <p class="nota-abajo">Vengo con ${p.semillas} ejemplos de fábrica.
        Cada vez que me corriges, me parezco más a tu forma de hablar.</p>
      </div>

      ${mios.length ? `
        <div class="lista" style="margin-top:14px">
          ${mios.slice(0, 30).map((x) => `
            <div class="item">
              <span style="font-size:18px">💬</span>
              <div class="item-cuerpo">
                <div class="item-titulo" style="font-size:15px">«${U.esc(x.texto)}»</div>
                <div class="item-sub">${U.esc(Aprendiz.etiquetaDe(x.intencion))}</div>
              </div>
              <button class="boton tenue chico" data-olvidar="${x.id}"
                      style="width:auto;padding:6px 8px" aria-label="Olvidar">✕</button>
            </div>`).join('')}
        </div>`
      : `<p class="vacio">Todavía no me has enseñado nada.<br>
         Escríbeme como hablas normal y, cuando no entienda, dime cuál era.</p>`}
    `, (cuerpo) => {
      U.al('click', '[data-olvidar]', (e, b) => {
        Aprendiz.olvidar(b.dataset.olvidar);
        App.cerrarHoja();
        App.brindis('Olvidado.');
        setTimeout(panelAprendido, 200);
      }, cuerpo);
    });
  }

  function enganchar(c) {
    const campo = c.querySelector('#chat-texto');
    const mandar = () => {
      const v = campo.value;
      campo.value = '';
      enviar(v);
    };

    c.querySelector('[data-enviar]').onclick = mandar;
    campo.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); mandar(); }
    });

    U.al('click', '[data-ejemplo]', (e, b) => enviar(b.dataset.ejemplo), c);

    U.al('click', '[data-accion-chat]', (e, b) => {
      const mensajes = Almacen.get().chat || [];
      const ultimo = mensajes[mensajes.length - 1];
      if (!ultimo || !ultimo.acciones) return;
      ejecutar(ultimo.acciones[Number(b.dataset.accionChat)]);
    }, c);

    c.querySelector('[data-aprendido]').onclick = panelAprendido;

    const limpiar = c.querySelector('[data-limpiar]');
    if (limpiar) {
      limpiar.onclick = async () => {
        const si = await App.confirmar('Borrar conversación',
          '¿Borro los mensajes? Los planes que guardaste se quedan.', 'Sí, borrar');
        if (!si) return;
        Almacen.get().chat = [];
        Almacen.guardar();
        App.pintar();
      };
    }
  }

  // `responder` y `ejecutar` los usa también la pantalla de entrada,
  // para que puedas escribirle antes de entrar a las pestañas.
  // `porIntencion` lo usa `mente.js` para sacar los botones que
  // acompañan a una respuesta venida de la API.
  return { pintar, responder, porIntencion, enviar, ejecutar };
})();
