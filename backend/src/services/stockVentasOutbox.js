const db = require("../config/db");
const env = require("../config/env");

const TIPO_EVENTO = "inventario.stock-actualizado";
const INTERVALO_MS = 5 * 1000;
const SEGUNDOS_ENTRE_REINTENTOS = 15;

let topic = null;

const idMensaje = ({ tipoMovimiento, idMovimiento, idProducto, idAlmacen }) =>
  `${TIPO_EVENTO}:${tipoMovimiento}:${idMovimiento}:${idProducto}:${idAlmacen}`;

const armarMensaje = (fila) => ({
  id_mensaje: fila.id_mensaje,
  tipo_evento: TIPO_EVENTO,
  sucursal: fila.sucursal,
  codigo_producto: fila.codigo_producto,
  stock_disponible: Number(fila.stock_disponible),
  fecha: fila.fecha,
});

// Dentro de la transacción del movimiento. La clave id_mensaje es el movimiento,
// el producto y la sucursal: un segundo intento no crea otra fila. Si el evento
// todavía no se envió, se actualiza el stock disponible con el valor final.
const registrarStockActualizado = async (client, datos) => {
  const clave = idMensaje(datos);
  await client.query(
    `INSERT INTO outbox_evento (
       id_mensaje, tipo_evento, tipo_movimiento, id_movimiento,
       id_producto, id_almacen, sucursal, codigo_producto, stock_disponible, fecha
     )
     SELECT $1, $2, $3, $4, p.id_producto, a.id_almacen, a.codigo, p.codigo,
            GREATEST(
              COALESCE(s.cantidad, 0) - COALESCE(s.cantidad_reservada, 0)
                - COALESCE(fn_cantidad_no_disponible(p.id_producto, a.id_almacen), 0),
              0
            ),
            CURRENT_TIMESTAMP
     FROM productos p
     JOIN almacenes a ON a.id_almacen = $6
     LEFT JOIN stock s ON s.id_producto = p.id_producto AND s.id_almacen = a.id_almacen
     WHERE p.id_producto = $5
     ON CONFLICT (id_mensaje) DO UPDATE
       SET stock_disponible = EXCLUDED.stock_disponible,
           fecha = EXCLUDED.fecha,
           sucursal = EXCLUDED.sucursal,
           codigo_producto = EXCLUDED.codigo_producto
       WHERE outbox_evento.estado <> 'enviado'`,
    [
      clave,
      TIPO_EVENTO,
      datos.tipoMovimiento,
      String(datos.idMovimiento),
      datos.idProducto,
      datos.idAlmacen,
    ],
  );
};

const getTopic = () => {
  if (!topic) {
    const { PubSub } = require("@google-cloud/pubsub");
    topic = new PubSub().topic(env.pubsubTopic.trim());
  }
  return topic;
};

const publicarEvento = (evento) => {
  const mensaje = armarMensaje(evento);
  return getTopic().publishMessage({
    data: Buffer.from(JSON.stringify(mensaje), "utf8"),
    attributes: { tipo_evento: TIPO_EVENTO },
  });
};

// false cuando no queda nada por enviar. SKIP LOCKED impide que dos procesos
// publiquen la misma fila.
const procesarSiguienteEvento = async (publicar = publicarEvento) => {
  const client = await db.pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query(
      `SELECT id_outbox, id_mensaje, sucursal, codigo_producto, stock_disponible,
              to_char(fecha AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS fecha
       FROM outbox_evento
       WHERE estado = 'pendiente'
          OR (estado = 'error'
              AND fecha_ultimo_intento <= CURRENT_TIMESTAMP - make_interval(secs => $1))
       ORDER BY id_outbox
       LIMIT 1
       FOR UPDATE SKIP LOCKED`,
      [SEGUNDOS_ENTRE_REINTENTOS],
    );
    const evento = rows[0];
    if (!evento) {
      await client.query("COMMIT");
      return false;
    }

    try {
      const messageId = await publicar(evento);
      await client.query(
        `UPDATE outbox_evento
         SET estado = 'enviado', message_id = $2, intentos = intentos + 1,
             ultimo_error = NULL, fecha_ultimo_intento = CURRENT_TIMESTAMP,
             fecha_envio = CURRENT_TIMESTAMP
         WHERE id_outbox = $1`,
        [evento.id_outbox, messageId],
      );
      console.log(`Pub/Sub: stock ${evento.id_mensaje} enviado (${messageId})`);
    } catch (error) {
      await client.query(
        `UPDATE outbox_evento
         SET estado = 'error', intentos = intentos + 1, ultimo_error = $2,
             fecha_ultimo_intento = CURRENT_TIMESTAMP
         WHERE id_outbox = $1`,
        [evento.id_outbox, error.message],
      );
      console.error(`Pub/Sub: no se pudo enviar ${evento.id_mensaje}:`, error.message);
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
    console.error("Pub/Sub: error publicando stock para Ventas:", error.message);
  } finally {
    procesando = false;
  }
};

const iniciarPublicadorStockVentas = () => {
  if (!env.pubsubTopic.trim()) {
    console.warn("Pub/Sub: PUBSUB_TOPIC no configurado, el stock para Ventas queda pendiente");
    return;
  }
  procesarPendientes();
  setInterval(procesarPendientes, INTERVALO_MS).unref();
};

module.exports = {
  TIPO_EVENTO,
  idMensaje,
  armarMensaje,
  registrarStockActualizado,
  procesarSiguienteEvento,
  iniciarPublicadorStockVentas,
};
