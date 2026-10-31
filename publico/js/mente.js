/* ===========================================================
   mente.js — el cerebro del chat, en dos capas.

   Capa 1 (siempre): `aprendiz.js`, el clasificador que vive en el
   teléfono. Gratis, instantáneo y sin internet.

   Capa 2 (si la enciendes): una API de lenguaje. Entiende cualquier
   cosa desde el primer día, sin que tengas que enseñarle nada, y
   responde con frases suyas en vez de plantillas.

   La gracia está en cómo se juntan: CADA vez que responde la API,
   también dice de qué trataba el mensaje, y con eso se entrena solo
   el clasificador local. Así la capa 1 va aprendiendo TU forma de
   hablar a partir de la capa 2, hasta que la API deje de hacer falta
   para entenderte.

   Una aclaración honesta, porque importa para decidir:
   el clasificador local puede volverse independiente ENTENDIÉNDOTE,
   no HABLANDO. Las respuestas sin API son plantillas rellenadas con
   tus números reales. Escribir como escribe la API necesita un modelo
   grande, y eso no cabe en un teléfono.

   La clave NUNCA está aquí. Vive en el servidor (en local, en una
   variable de entorno de tu PC; desplegado, como secreto del Worker).
   =========================================================== */

const Mente = (() => {

  /** A dónde se pregunta. Misma ruta en local y en el Worker. */
  const RUTA = '/api/chat';

  /** Cuántos mensajes de ida y vuelta se mandan como contexto. */
  const MEMORIA = 6;

  // ───────── Estado y ajustes ─────────

  function ajustes() {
    const a = Almacen.ajustes();
    a.mente = Object.assign({
      // 'api'    → la API responde y la local aprende de ella (lo que querías)
      // 'ahorro' → la local responde si está segura; la API solo si no entiende
      // 'local'  → nunca se llama a la API
      modo: 'local',
      // Cuántas veces resolvió cada una, para medir la independencia
      vecesApi: 0,
      vecesLocal: 0,
      // Veces que la local YA habría acertado sola (aunque respondió la API)
      habriaAcertado: 0,
      aprendidas: 0,
      ultimoError: null
    }, a.mente || {});
    return a.mente;
  }

  function encendida() {
    return ajustes().modo !== 'local';
  }

  function anotar(campo, cuanto = 1) {
    const m = ajustes();
    m[campo] = (m[campo] || 0) + cuanto;
    Almacen.guardar();
  }

  // ───────── Lo que se le cuenta a la API ─────────

  /**
   * El resumen de tu situación que viaja con cada pregunta.
   *
   * Se manda lo justo para que la respuesta sirva: montos, nombres de
   * acreedores y fechas. No van tus movimientos uno por uno, ni notas,
   * ni pendientes personales. Puedes verlo tal cual en Ajustes.
   */
  function contexto() {
    const a = Almacen.ajustes();
    const r = Calculo.resumenHoy();
    const p = Plan.resumen();

    const deudas = Almacen.get().deudas
      .filter((d) => !d.terminada && d.saldo > 0)
      .map((d) => ({
        quien: d.acreedor,
        saldo: d.saldo,
        cuota: Almacen.cuotaDe(d),
        estado: d.frecuencia === 'vencida' ? 'ya vencida'
              : d.frecuencia === 'nosabe' ? 'sin fecha conocida'
              : `cada mes el ${d.diaPago}`
      }));

    return {
      nombre: a.nombre || null,
      hoy: U.hoy(),
      puedeGastarHoy: r.hayPeriodo ? Math.max(0, r.puedo) : null,
      comidaPorDia: U.numero(a.comidaPorDia) || null,
      diasHastaElPago: r.hayPeriodo ? r.diasRestantes : null,
      tieneEnTotal: r.saldo,
      entraAlMes: p.hayDatos ? p.ingreso : null,
      leFaltaAlMes: p.hayDatos && !p.alcanza ? p.falta : 0,
      leSobraAlMes: p.hayDatos && p.alcanza ? p.paraTi : 0,
      deudas,
      totalDeuda: Calculo.totalDeuda(),
      vencidoSinPagar: Calculo.totalAtrasado(),
      enDiaDificil: Almacen.enDiaDificil()
    };
  }

  /** Las instrucciones. Esto reemplaza al entrenamiento: se escribe una vez. */
  function instrucciones() {
    const intenciones = Aprendiz.listaIntenciones()
      .map((x) => `  ${x.clave}: ${x.etiqueta}`).join('\n');

    return `Eres Calma, una app personal de dinero y pendientes. Hablas con una
sola persona, la dueña de la app, en español peruano, de tú.

Quién es: tiene TDA y depresión, se le va la plata sin darse cuenta y arrastra
deudas. Por eso la app existe.

Cómo hablas:
- Directo y corto. Dos o tres frases. Nada de listas largas ni de discursos.
- NUNCA culpas ni regañas. Si gastó de más, eso no se comenta: se recalcula.
- Nada de "deberías haber", "otra vez", "te lo advertí", ni felicitaciones falsas.
- Si no alcanza, lo dices claro y le das una salida concreta, no un "ahorra más".
- Usas SUS números reales, los que vienen abajo. No inventas ninguno.
- Montos siempre como "S/ 1,234.00".
- Si te habla de ánimo o de que no puede más, la plata pasa a segundo plano.

Qué NO haces:
- No das consejos de inversión ni prometes resultados.
- No inventas deudas, fechas ni montos que no estén en los datos.
- Si te falta un dato para responder, lo dices y le pides ese dato.

Además de responder, clasificas de qué trataba su mensaje con una de estas:
${intenciones}

Si no encaja en ninguna, usa "saludo".

Responde SIEMPRE con un JSON válido y nada más, con esta forma exacta:
{"intencion": "<una de las claves>", "respuesta": "<lo que le dices>"}`;
  }

  // ───────── La llamada ─────────

  async function preguntarApi(texto) {
    const e = Almacen.get();
    const historial = (e.chat || []).slice(-MEMORIA).map((m) => ({
      role: m.de === 'yo' ? 'user' : 'assistant',
      content: String(m.texto || '').slice(0, 1500)
    }));

    const cuerpo = {
      model: 'claude-haiku-5-5',
      max_tokens: 700,
      system: instrucciones() + '\n\nSus datos de hoy:\n'
            + JSON.stringify(contexto(), null, 1),
      messages: historial.concat([{ role: 'user', content: texto }])
    };

    let respuesta, datos;
    try {
      respuesta = await fetch(RUTA, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cuerpo),
        cache: 'no-store'
      });
      datos = await respuesta.json().catch(() => null);
    } catch (err) {
      // Sin internet, servidor caído, DNS… se anota y se sigue con lo local
      ajustes().ultimoError = 'sin-conexion';
      Almacen.guardar();
      return null;
    }

    if (!respuesta.ok || !datos || datos.error) {
      const motivo = (datos && datos.error) || ('http ' + respuesta.status);
      ajustes().ultimoError = motivo;
      Almacen.guardar();
      return null;
    }

    ajustes().ultimoError = null;
    return leerRespuesta(datos);
  }

  /**
   * Saca { intencion, respuesta } de lo que devolvió la API.
   *
   * Se pide JSON en las instrucciones, pero un modelo puede envolverlo
   * en ```json o añadir una frase. Mejor un lector tolerante que un
   * chat que se rompe por una llave de más.
   */
  function leerRespuesta(datos) {
    const bloques = Array.isArray(datos.content) ? datos.content : [];
    const texto = bloques
      .filter((b) => b && b.type === 'text')
      .map((b) => b.text).join('\n').trim();

    if (!texto) return null;

    const crudo = texto.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
    const desde = crudo.indexOf('{');
    const hasta = crudo.lastIndexOf('}');

    if (desde >= 0 && hasta > desde) {
      try {
        const j = JSON.parse(crudo.slice(desde, hasta + 1));
        if (j && j.respuesta) {
          return {
            intencion: Aprendiz.INTENCIONES[j.intencion] ? j.intencion : null,
            respuesta: String(j.respuesta).trim()
          };
        }
      } catch (err) { /* abajo lo tratamos como texto suelto */ }
    }

    // No vino como JSON: usamos el texto tal cual y no aprendemos nada
    return { intencion: null, respuesta: texto };
  }

  // ───────── El cerebro ─────────

  /**
   * Responde una frase. Devuelve { texto, acciones, deApi }.
   * Es asíncrona porque puede tener que salir a internet.
   */
  async function responder(texto) {
    const juicio = Aprendiz.clasificar(texto);
    const modo = ajustes().modo;

    // Sin API: como siempre. Si no entiende, pregunta y aprende de ti.
    if (modo === 'local') {
      anotar('vecesLocal');
      return Chat.responder(texto);
    }

    // Modo ahorro: lo que ya entiende lo resuelve gratis
    if (modo === 'ahorro' && juicio.seguro) {
      anotar('vecesLocal');
      return Chat.responder(texto);
    }

    const res = await preguntarApi(texto).catch(() => null);

    // Si la API no contesta (sin internet, sin clave, error), la app
    // sigue funcionando con lo local. Eso no se negocia.
    if (!res) {
      anotar('vecesLocal');
      const local = Chat.responder(texto);
      if (ajustes().ultimoError && ajustes().ultimoError !== 'sin-clave') {
        local.texto = local.texto
          + '\n\n(Respondí yo solo: no pude conectarme para pensarlo mejor.)';
      }
      return local;
    }

    anotar('vecesApi');

    // ── Aquí es donde tu IA se independiza ──
    if (res.intencion) {
      // ¿Lo habría acertado sola? Eso es la medida de independencia.
      if (juicio.seguro && juicio.intencion === res.intencion) {
        anotar('habriaAcertado');
      } else {
        // No lo sabía o se equivocaba: se lo guardamos como ejemplo tuyo
        Aprendiz.aprender(texto, res.intencion);
        anotar('aprendidas');
      }
    }

    return {
      texto: res.respuesta,
      acciones: res.intencion ? accionesDe(res.intencion) : [],
      deApi: true
    };
  }

  /**
   * Los botones que acompañan la respuesta.
   * Se reutilizan los del chat local: la API da el texto, la app sigue
   * siendo la que sabe abrir formularios y mover datos.
   */
  function accionesDe(intencion) {
    try {
      const local = Chat.porIntencion(intencion, '');
      return (local && local.acciones) || [];
    } catch (e) {
      return [];
    }
  }

  // ───────── Cómo va la independencia ─────────

  /**
   * Qué parte de lo que dices ya entendería sola la app.
   * `resueltas` cuenta lo que respondió sin API más lo que la API
   * confirmó que ya tenía bien.
   */
  function independencia() {
    const m = ajustes();
    const total = (m.vecesLocal || 0) + (m.vecesApi || 0);
    const solas = (m.vecesLocal || 0) + (m.habriaAcertado || 0);
    return {
      modo: m.modo,
      total,
      solas,
      conApi: m.vecesApi || 0,
      aprendidas: m.aprendidas || 0,
      ultimoError: m.ultimoError,
      // Con menos de 10 mensajes el porcentaje no dice nada
      porcentaje: total >= 10 ? Math.round((solas / total) * 100) : null
    };
  }

  /** El texto exacto que viaja a la API, para que puedas revisarlo. */
  function loQueSeEnvia() {
    return instrucciones() + '\n\nSus datos de hoy:\n'
         + JSON.stringify(contexto(), null, 1);
  }

  return {
    responder, encendida, independencia, loQueSeEnvia,
    ajustes, contexto, instrucciones
  };
})();
