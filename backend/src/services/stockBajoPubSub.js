const db = require("../config/db");
const env = require("../config/env");

const CANAL_STOCK_BAJO = "stock_bajo";
const INTERVALO_REINTENTO_MS = 60 * 1000;
const MAX_INTENTOS = 10;

let pubSubTopic = null;

const getTopic = () => {
  if (!pubSubTopic) {
    const { PubSub } = require("@google-cloud/pubsub");
    pubSubTopic = new PubSub().topic(env.pubsubTopic.trim());
  }
  return pubSubTopic;
};

const publicarMensaje = (payload, attributes = {}) =>
  getTopic().publishMessage({
    data: Buffer.from(JSON.stringify(payload), "utf8"),
    attributes,
  });

const consultarStockBajo = async ({ idProducto = null, idAlmacen = null } = {}) => {
  const result = await db.query(
    `
    SELECT
      p.id_producto,
      p.codigo AS producto_codigo,
      p.nombre AS producto,
      um.abreviatura AS unidad,
      a.id_almacen,
      a.codigo AS almacen_codigo,
      a.nombre AS almacen,
      s.cantidad AS cantidad_actual,
      COALESCE(s.cantidad_reservada, 0) AS cantidad_reservada,
      s.cantidad - COALESCE(s.cantidad_reservada, 0) AS cantidad_disponible,
      p.stock_minimo,
      p.punto_reposicion,
      p.stock_maximo,
      COALESCE(l.lotes, '[]'::json) AS lotes_con_cantidad_positiva
    FROM stock s
    INNER JOIN productos p ON p.id_producto = s.id_producto
    INNER JOIN unidades_medida um ON um.id_unidad = p.id_unidad
    INNER JOIN almacenes a ON a.id_almacen = s.id_almacen
    LEFT JOIN LATERAL (
      SELECT json_agg(json_build_object(
        'id_lote', lp.id_lote,
        'numero_lote', lp.numero_lote,
        'cantidad_actual', lp.cantidad_actual,
        'fecha_vencimiento', lp.fecha_vencimiento
      ) ORDER BY lp.fecha_vencimiento NULLS LAST, lp.id_lote) AS lotes
      FROM lotes_productos lp
      WHERE lp.id_producto = p.id_producto
        AND lp.id_almacen = a.id_almacen
        AND lp.cantidad_actual > 0
    ) l ON true
    WHERE (s.cantidad <= NULLIF(p.punto_reposicion, 0)
       OR s.cantidad <= p.stock_minimo)
      AND ($1::int IS NULL OR s.id_producto = $1)
      AND ($2::int IS NULL OR s.id_almacen = $2)
    ORDER BY s.cantidad ASC, p.nombre ASC, a.nombre ASC
  `,
    [idProducto, idAlmacen],
  );

  return result.rows.map((row) => ({
    producto: {
      id_producto: row.id_producto,
      codigo: row.producto_codigo,
      nombre: row.producto,
      unidad: row.unidad,
    },
    almacen: {
      id_almacen: row.id_almacen,
      codigo: row.almacen_codigo,
      nombre: row.almacen,
    },
    inventario: {
      cantidad_actual: Number(row.cantidad_actual),
      cantidad_reservada: Number(row.cantidad_reservada),
      cantidad_disponible: Number(row.cantidad_disponible),
      stock_minimo: Number(row.stock_minimo),
      punto_reposicion: Number(row.punto_reposicion),
      stock_maximo: Number(row.stock_maximo),
    },
    lotes_con_cantidad_positiva: row.lotes_con_cantidad_positiva,
  }));
};

// Publica un evento de la bajada de stock. Se toma el estado actual del
// inventario; si ya se repuso, igual se informa el movimiento que lo dejó bajo.
const publicarEvento = async (evento) => {
  const [actual] = await consultarStockBajo({
    idProducto: evento.id_producto,
    idAlmacen: evento.id_almacen,
  });

  const payload = {
    tipo_evento: "STOCK_BAJO",
    origen: "inventario_hipermaxi",
    id_evento: Number(evento.id_evento),
    detectado_en: evento.fecha_creacion,
    generado_en: new Date().toISOString(),
    movimiento: {
      cantidad_anterior:
        evento.cantidad_anterior === null ? null : Number(evento.cantidad_anterior),
      cantidad_resultante: Number(evento.cantidad_actual),
    },
    sigue_bajo: Boolean(actual),
    productos: actual ? [actual] : [],
  };

  return publicarMensaje(payload, {
    tipo_evento: "STOCK_BAJO",
    id_evento: String(evento.id_evento),
    id_producto: String(evento.id_producto),
    id_almacen: String(evento.id_almacen),
  });
};

// Toma un evento pendiente con bloqueo de fila (SKIP LOCKED) para que, si hay
// varias instancias del backend, cada evento se publique una sola vez.
// Devuelve false cuando no quedan eventos por publicar.
const procesarSiguienteEvento = async () => {
  const client = await db.pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query(
      `SELECT id_evento, id_producto, id_almacen, cantidad_anterior, cantidad_actual, fecha_creacion
       FROM eventos_stock_bajo
       WHERE estado <> 'PUBLICADO' AND intentos < $1
       ORDER BY id_evento
       LIMIT 1
       FOR UPDATE SKIP LOCKED`,
      [MAX_INTENTOS],
    );
    const evento = rows[0];
    if (!evento) {
      await client.query("COMMIT");
      return false;
    }

    try {
      const messageId = await publicarEvento(evento);
      await client.query(
        `UPDATE eventos_stock_bajo
         SET estado = 'PUBLICADO', message_id = $2, intentos = intentos + 1,
             ultimo_error = NULL, fecha_publicacion = CURRENT_TIMESTAMP
         WHERE id_evento = $1`,
        [evento.id_evento, messageId],
      );
      console.log(`Pub/Sub: evento stock bajo ${evento.id_evento} publicado (${messageId})`);
    } catch (error) {
      await client.query(
        `UPDATE eventos_stock_bajo
         SET estado = 'ERROR', intentos = intentos + 1, ultimo_error = $2
         WHERE id_evento = $1`,
        [evento.id_evento, error.message],
      );
      console.error(`Pub/Sub: error publicando evento ${evento.id_evento}:`, error.message);
      await client.query("COMMIT");
      // Los fallidos se reintentan en el siguiente ciclo periódico
      return false;
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
let pendienteOtraVuelta = false;

const procesarPendientes = async () => {
  if (procesando) {
    pendienteOtraVuelta = true;
    return;
  }
  procesando = true;

  try {
    do {
      pendienteOtraVuelta = false;
      while (await procesarSiguienteEvento());
    } while (pendienteOtraVuelta);
  } catch (error) {
    console.error("Pub/Sub: error procesando eventos de stock bajo:", error.message);
  } finally {
    procesando = false;
  }
};

const conectarListener = async () => {
  let client;
  try {
    client = await db.pool.connect();
    let activo = true;

    client.on("notification", (msg) => {
      if (msg.channel === CANAL_STOCK_BAJO) procesarPendientes();
    });
    client.on("error", (error) => {
      if (!activo) return;
      activo = false;
      console.error("Pub/Sub: se perdió la escucha de PostgreSQL:", error.message);
      client.release(true);
      setTimeout(conectarListener, 5000);
    });

    await client.query(`LISTEN ${CANAL_STOCK_BAJO}`);
    console.log(`Pub/Sub: escuchando alertas de stock bajo -> ${env.pubsubTopic.trim()}`);
    // Al (re)conectar se publica lo que haya quedado pendiente
    procesarPendientes();
  } catch (error) {
    console.error("Pub/Sub: no se pudo iniciar la escucha, reintentando:", error.message);
    if (client) client.release(true);
    setTimeout(conectarListener, 5000);
  }
};

const iniciarPublicadorStockBajo = () => {
  if (!env.pubsubTopic.trim()) {
    console.warn("Pub/Sub: PUBSUB_TOPIC no configurado, no se publicarán alertas de stock bajo");
    return;
  }

  conectarListener();

  // Reintento periódico de eventos con error o perdidos
  setInterval(procesarPendientes, INTERVALO_REINTENTO_MS).unref();
};

module.exports = {
  consultarStockBajo,
  publicarMensaje,
  iniciarPublicadorStockBajo,
};
