const db = require("../config/db");
const env = require("../config/env");

const INTERVALO_PUBLICACION_MS = 5 * 1000;
const SEGUNDOS_ENTRE_REINTENTOS = 60;
const MAX_INTENTOS = 10;

let topic = null;

const getTopic = () => {
  if (!topic) {
    const { PubSub } = require("@google-cloud/pubsub");
    topic = new PubSub().topic(env.pubsubProduccion.topicoEventos.trim());
  }
  return topic;
};

// Debe llamarse dentro de la transacción del cambio de inventario: el evento
// solo existe si ese cambio se confirma.
const registrarEvento = (client, tipoEvento, payload) =>
  client.query("INSERT INTO eventos_integracion (tipo_evento, payload) VALUES ($1, $2)", [
    tipoEvento,
    JSON.stringify(payload),
  ]);

const publicarEvento = (evento) =>
  getTopic().publishMessage({
    data: Buffer.from(
      JSON.stringify({
        tipo_evento: evento.tipo_evento,
        origen: "inventario_hipermaxi",
        id_evento: Number(evento.id_evento),
        generado_en: evento.fecha_creacion,
        ...evento.payload,
      }),
      "utf8",
    ),
    attributes: {
      tipo_evento: evento.tipo_evento,
      id_evento: String(evento.id_evento),
    },
  });

// Devuelve false cuando no quedan eventos listos para publicar. SKIP LOCKED
// evita que dos instancias del backend publiquen el mismo evento.
const procesarSiguienteEvento = async () => {
  const client = await db.pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query(
      `SELECT id_evento, tipo_evento, payload, fecha_creacion
       FROM eventos_integracion
       WHERE estado = 'PENDIENTE'
          OR (estado = 'ERROR' AND intentos < $1
              AND fecha_ultimo_intento <= CURRENT_TIMESTAMP - make_interval(secs => $2))
       ORDER BY id_evento
       LIMIT 1
       FOR UPDATE SKIP LOCKED`,
      [MAX_INTENTOS, SEGUNDOS_ENTRE_REINTENTOS],
    );
    const evento = rows[0];
    if (!evento) {
      await client.query("COMMIT");
      return false;
    }

    try {
      const messageId = await publicarEvento(evento);
      await client.query(
        `UPDATE eventos_integracion
         SET estado = 'PUBLICADO', message_id = $2, intentos = intentos + 1, ultimo_error = NULL,
             fecha_ultimo_intento = CURRENT_TIMESTAMP, fecha_publicacion = CURRENT_TIMESTAMP
         WHERE id_evento = $1`,
        [evento.id_evento, messageId],
      );
      console.log(`Pub/Sub: evento ${evento.tipo_evento} ${evento.id_evento} publicado (${messageId})`);
    } catch (error) {
      await client.query(
        `UPDATE eventos_integracion
         SET estado = 'ERROR', intentos = intentos + 1, ultimo_error = $2,
             fecha_ultimo_intento = CURRENT_TIMESTAMP
         WHERE id_evento = $1`,
        [evento.id_evento, error.message],
      );
      console.error(`Pub/Sub: error publicando evento ${evento.id_evento}:`, error.message);
    }

    await client.query("COMMIT");
    return true;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
};

let procesando = false;

const procesarPendientes = async () => {
  if (procesando) return;
  procesando = true;
  try {
    while (await procesarSiguienteEvento());
  } catch (error) {
    console.error("Pub/Sub: error procesando eventos de producción:", error.message);
  } finally {
    procesando = false;
  }
};

const iniciarPublicadorEventos = () => {
  if (!env.pubsubProduccion.topicoEventos.trim()) {
    console.warn("Pub/Sub: PUBSUB_TOPIC_EVENTOS_PRODUCCION no configurado, los eventos quedan pendientes");
    return;
  }
  procesarPendientes();
  setInterval(procesarPendientes, INTERVALO_PUBLICACION_MS).unref();
};

module.exports = { registrarEvento, procesarPendientes, iniciarPublicadorEventos };
