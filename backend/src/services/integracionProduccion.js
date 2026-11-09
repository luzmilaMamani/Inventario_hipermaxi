const db = require("../config/db");
const env = require("../config/env");
const ApiError = require("../utils/apiError");
const { obtenerLotesVigentes, asignarLotes } = require("./lotesFefo");
const { obtenerCantidadVencida } = require("./lotesVencidos");
const { registrarEvento } = require("./eventosProduccion");

const MENSAJE_SOLICITUD = "SOLICITUD_MATERIALES";
const MENSAJE_TERMINADOS = "PRODUCTOS_TERMINADOS";
const SEGUNDOS_RECONEXION = 30;

class MensajeInvalido extends Error {}

const esEnteroPositivo = (valor) => Number.isSafeInteger(valor) && valor > 0;

// Errores que se repetirían en cada reentrega (restricciones, tipos, longitud).
const esErrorDeDatos = (error) =>
  error instanceof MensajeInvalido || /^(22|23)/.test(error.code || "");

const validarMensaje = async (client, data) => {
  const { orden_produccion: orden, id_almacen: idAlmacen, productos } = data;

  if (typeof orden !== "string" || !orden.trim() || orden.length > 50) {
    throw new MensajeInvalido("orden_produccion es obligatoria (máximo 50 caracteres)");
  }
  if (!esEnteroPositivo(idAlmacen)) {
    throw new MensajeInvalido("id_almacen debe ser un entero positivo");
  }
  if (!Array.isArray(productos) || productos.length === 0) {
    throw new MensajeInvalido("productos debe tener al menos una línea");
  }
  for (const linea of productos) {
    if (!esEnteroPositivo(linea?.id_producto) || !esEnteroPositivo(linea?.cantidad)) {
      throw new MensajeInvalido("Cada línea requiere id_producto y cantidad enteros positivos");
    }
  }

  const ids = productos.map((linea) => linea.id_producto);
  if (new Set(ids).size !== ids.length) {
    throw new MensajeInvalido("Un producto no puede repetirse en el mensaje");
  }

  const almacen = await client.query(
    "SELECT 1 FROM almacenes WHERE id_almacen = $1 AND activo = TRUE",
    [idAlmacen],
  );
  if (!almacen.rowCount) {
    throw new MensajeInvalido(`El almacén ${idAlmacen} no existe o está inactivo`);
  }
  const activos = await client.query(
    "SELECT 1 FROM productos WHERE id_producto = ANY($1::int[]) AND estado = 'ACTIVO'",
    [ids],
  );
  if (activos.rowCount !== ids.length) {
    throw new MensajeInvalido("Uno o más productos no existen o están inactivos");
  }

  // Orden fijo de bloqueo de filas de stock entre mensajes concurrentes.
  return [...productos].sort((a, b) => a.id_producto - b.id_producto);
};

// Registrar el mensaje y aplicar su efecto en una sola transacción garantiza
// que una reentrega no repita la reserva o el ingreso. Un mensaje inválido se
// guarda como tal y se confirma; reentregarlo no lo arreglaría. Cualquier otro
// error se propaga para que Pub/Sub lo entregue de nuevo.
const procesarUnaVez = async ({ tipo, idMensaje, data, procesar, alRechazar }) => {
  const client = await db.pool.connect();
  try {
    await client.query("BEGIN");
    const registro = await client.query(
      `INSERT INTO mensajes_integracion (tipo_mensaje, id_mensaje, payload)
       VALUES ($1, $2, $3)
       ON CONFLICT DO NOTHING
       RETURNING id_mensaje`,
      [tipo, idMensaje, JSON.stringify(data)],
    );
    if (!registro.rowCount) {
      await client.query("COMMIT");
      console.log(`Pub/Sub: mensaje duplicado ignorado (${tipo} ${idMensaje})`);
      return;
    }

    await client.query("SAVEPOINT procesar_mensaje");
    try {
      await procesar(client);
    } catch (error) {
      if (!esErrorDeDatos(error)) throw error;
      await client.query("ROLLBACK TO SAVEPOINT procesar_mensaje");
      await client.query(
        `UPDATE mensajes_integracion SET estado = 'INVALIDO', error = $3
         WHERE tipo_mensaje = $1 AND id_mensaje = $2`,
        [tipo, idMensaje, error.message],
      );
      if (alRechazar) await alRechazar(client, error.message);
      console.warn(`Pub/Sub: mensaje inválido ${tipo} ${idMensaje}: ${error.message}`);
    }

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
};

// Lo reservable es lo disponible que además está en lotes vigentes, porque el
// despacho descuenta de esos lotes.
const calcularReservable = async (client, idProducto, idAlmacen, cantidad) => {
  const { rows } = await client.query(
    `SELECT cantidad, COALESCE(cantidad_reservada, 0) AS reservada
     FROM stock WHERE id_producto = $1 AND id_almacen = $2 FOR UPDATE`,
    [idProducto, idAlmacen],
  );
  if (!rows[0]) return 0;

  const reservada = Number(rows[0].reservada);
  const vencida = await obtenerCantidadVencida(client, idProducto, idAlmacen);
  const lotes = await obtenerLotesVigentes(client, { id_producto: idProducto, id_almacen: idAlmacen });
  const enLotesVigentes = lotes.reduce((suma, lote) => suma + Number(lote.cantidad_actual), 0);
  const disponible = Math.min(Number(rows[0].cantidad) - reservada - vencida, enLotesVigentes - reservada);

  return Math.max(Math.min(disponible, cantidad), 0);
};

const reservarSolicitud = async (client, data, idMensaje) => {
  const lineas = await validarMensaje(client, data);
  const orden = data.orden_produccion.trim();

  const { rows } = await client.query(
    `INSERT INTO solicitudes_materiales (id_mensaje, orden_produccion, id_almacen, estado)
     VALUES ($1, $2, $3, 'RECHAZADA')
     RETURNING id_solicitud`,
    [idMensaje, orden, data.id_almacen],
  );
  const idSolicitud = rows[0].id_solicitud;

  const detalle = [];
  for (const { id_producto: idProducto, cantidad } of lineas) {
    const reservado = await calcularReservable(client, idProducto, data.id_almacen, cantidad);
    if (reservado > 0) {
      await client.query(
        `UPDATE stock
         SET cantidad_reservada = COALESCE(cantidad_reservada, 0) + $1::numeric,
             fecha_actualizacion = CURRENT_TIMESTAMP
         WHERE id_producto = $2 AND id_almacen = $3`,
        [reservado, idProducto, data.id_almacen],
      );
    }
    await client.query(
      `INSERT INTO detalle_solicitudes_materiales
         (id_solicitud, id_producto, cantidad_solicitada, cantidad_reservada)
       VALUES ($1, $2, $3, $4)`,
      [idSolicitud, idProducto, cantidad, reservado],
    );
    detalle.push({
      id_producto: idProducto,
      solicitado: cantidad,
      reservado,
      faltante: cantidad - reservado,
    });
  }

  let estado = "PARCIAL";
  if (detalle.every((linea) => linea.faltante === 0)) estado = "RESERVADA";
  else if (detalle.every((linea) => linea.reservado === 0)) estado = "RECHAZADA";

  await client.query("UPDATE solicitudes_materiales SET estado = $2 WHERE id_solicitud = $1", [
    idSolicitud,
    estado,
  ]);
  await registrarEvento(client, "SOLICITUD_PROCESADA", {
    id_mensaje: idMensaje,
    id_solicitud: idSolicitud,
    orden_produccion: orden,
    id_almacen: data.id_almacen,
    estado,
    detalle,
  });
};

const procesarSolicitud = (data, messageId) => {
  const idMensaje = String(data.id_mensaje || messageId);
  return procesarUnaVez({
    tipo: MENSAJE_SOLICITUD,
    idMensaje,
    data,
    procesar: (client) => reservarSolicitud(client, data, idMensaje),
    alRechazar: (client, motivo) =>
      registrarEvento(client, "SOLICITUD_PROCESADA", {
        id_mensaje: idMensaje,
        orden_produccion: data.orden_produccion ?? null,
        id_almacen: data.id_almacen ?? null,
        estado: "RECHAZADA",
        motivo,
        detalle: [],
      }),
  });
};

const ingresarTerminados = async (client, data) => {
  const lineas = await validarMensaje(client, data);
  const orden = data.orden_produccion.trim();

  await client.query("SELECT set_config('inventario.omitir_stock_actualizado', 'on', true)");

  const productos = [];
  for (const linea of lineas) {
    const { id_producto: idProducto, cantidad } = linea;

    // Reportar de nuevo el mismo lote acumula sobre él.
    const lote = await client.query(
      `INSERT INTO lotes_productos
         (id_producto, id_almacen, numero_lote, fecha_ingreso,
          fecha_vencimiento, cantidad_inicial, cantidad_actual)
       VALUES ($1, $2, $3, CURRENT_DATE, $4, $5, $5)
       ON CONFLICT (id_producto, id_almacen, numero_lote)
       DO UPDATE SET
         cantidad_inicial = lotes_productos.cantidad_inicial + EXCLUDED.cantidad_inicial,
         cantidad_actual = lotes_productos.cantidad_actual + EXCLUDED.cantidad_actual,
         estado = CASE WHEN lotes_productos.estado = 'AGOTADO' THEN 'DISPONIBLE' ELSE lotes_productos.estado END
       RETURNING id_lote`,
      [
        idProducto,
        data.id_almacen,
        linea.numero_lote || `${orden}-${idProducto}`,
        linea.fecha_vencimiento || null,
        cantidad,
      ],
    );

    const stock = await client.query(
      `INSERT INTO stock (id_producto, id_almacen, cantidad, cantidad_reservada)
       VALUES ($1, $2, $3, 0)
       ON CONFLICT (id_producto, id_almacen)
       DO UPDATE SET
         cantidad = stock.cantidad + EXCLUDED.cantidad,
         fecha_actualizacion = CURRENT_TIMESTAMP
       RETURNING cantidad, COALESCE(cantidad_reservada, 0) AS reservada`,
      [idProducto, data.id_almacen, cantidad],
    );
    const stockNuevo = Number(stock.rows[0].cantidad);

    await client.query(
      `INSERT INTO movimientos_inventario
         (id_producto, id_almacen, id_lote, tipo_movimiento, cantidad,
          stock_anterior, stock_nuevo, referencia, observaciones)
       VALUES ($1, $2, $3, 'ENTRADA', $4, $5, $6, $7, $8)`,
      [
        idProducto,
        data.id_almacen,
        lote.rows[0].id_lote,
        cantidad,
        stockNuevo - cantidad,
        stockNuevo,
        orden,
        `Producto terminado reportado por Producción, orden ${orden}`,
      ],
    );

    const vencida = await obtenerCantidadVencida(client, idProducto, data.id_almacen);
    productos.push({
      id_producto: idProducto,
      cantidad_ingresada: cantidad,
      cantidad_disponible: Math.max(stockNuevo - Number(stock.rows[0].reservada) - vencida, 0),
    });
  }

  await registrarEvento(client, "STOCK_ACTUALIZADO", {
    motivo: "PRODUCTO_TERMINADO",
    orden_produccion: orden,
    id_almacen: data.id_almacen,
    productos,
  });
};

const procesarTerminados = (data, messageId) =>
  procesarUnaVez({
    tipo: MENSAJE_TERMINADOS,
    idMensaje: String(data.id_mensaje || messageId),
    data,
    procesar: (client) => ingresarTerminados(client, data),
  });

const despacharLinea = async (client, { solicitud, salida, linea, idUsuario }) => {
  const idProducto = linea.id_producto;
  const cantidad = Number(linea.cantidad_reservada);
  const asignaciones = await asignarLotes(client, {
    id_producto: idProducto,
    id_almacen: solicitud.id_almacen,
    cantidad,
  });

  const stockResult = await client.query(
    `SELECT s.id_stock, s.cantidad, COALESCE(p.precio, 0) AS precio
     FROM stock s
     INNER JOIN productos p ON p.id_producto = s.id_producto
     WHERE s.id_producto = $1 AND s.id_almacen = $2
     FOR UPDATE OF s`,
    [idProducto, solicitud.id_almacen],
  );
  const { id_stock: idStock, cantidad: stockActual, precio } = stockResult.rows[0];

  let stockCorriente = Number(stockActual);
  for (const { lote, cantidad: cantidadLote } of asignaciones) {
    await client.query(
      `INSERT INTO detalle_salidas
         (id_salida, id_producto, id_lote, cantidad, precio_unitario, valor_total, id_lote_sugerido)
       VALUES ($1, $2, $3, $4, $5, $6, $3)`,
      [salida.id_salida, idProducto, lote.id_lote, cantidadLote, precio, Number(precio) * cantidadLote],
    );
    await client.query(
      `UPDATE lotes_productos
       SET cantidad_actual = cantidad_actual - $1::numeric,
           estado = CASE WHEN cantidad_actual - $1::numeric = 0 THEN 'AGOTADO' ELSE estado END
       WHERE id_lote = $2`,
      [cantidadLote, lote.id_lote],
    );

    const stockNuevo = stockCorriente - cantidadLote;
    await client.query(
      `INSERT INTO movimientos_inventario
         (id_producto, id_almacen, id_lote, id_usuario, tipo_movimiento,
          cantidad, stock_anterior, stock_nuevo, referencia, observaciones)
       VALUES ($1, $2, $3, $4, 'SALIDA', $5, $6, $7, $8, $9)`,
      [
        idProducto,
        solicitud.id_almacen,
        lote.id_lote,
        idUsuario,
        cantidadLote,
        stockCorriente,
        stockNuevo,
        salida.numero_salida,
        `Despacho a producción, orden ${solicitud.orden_produccion}`,
      ],
    );
    stockCorriente = stockNuevo;
  }

  await client.query(
    `UPDATE stock
     SET cantidad = $1, cantidad_reservada = cantidad_reservada - $2::numeric,
         fecha_actualizacion = CURRENT_TIMESTAMP
     WHERE id_stock = $3`,
    [stockCorriente, cantidad, idStock],
  );
  await client.query(
    "UPDATE detalle_solicitudes_materiales SET cantidad_despachada = $1 WHERE id_detalle_solicitud = $2",
    [cantidad, linea.id_detalle_solicitud],
  );

  return {
    id_producto: idProducto,
    cantidad,
    lotes: asignaciones.map(({ lote, cantidad: cantidadLote }) => ({
      numero_lote: lote.numero_lote,
      fecha_vencimiento: lote.fecha_vencimiento,
      cantidad: cantidadLote,
    })),
  };
};

const despacharSolicitud = async (idSolicitud, idUsuario) => {
  const client = await db.pool.connect();
  try {
    await client.query("BEGIN");

    const solicitudResult = await client.query(
      "SELECT * FROM solicitudes_materiales WHERE id_solicitud = $1 FOR UPDATE",
      [idSolicitud],
    );
    const solicitud = solicitudResult.rows[0];
    if (!solicitud) throw new ApiError(404, "Solicitud de materiales no encontrada");
    if (!["RESERVADA", "PARCIAL"].includes(solicitud.estado)) {
      throw new ApiError(409, `No se puede despachar una solicitud en estado ${solicitud.estado}`);
    }

    const numeroSalida = `PRD-${new Date().getFullYear()}-${String(idSolicitud).padStart(4, "0")}`;
    const salidaResult = await client.query(
      `INSERT INTO salidas_inventario
         (numero_salida, id_almacen, id_usuario, motivo, referencia_externa, observaciones, estado)
       VALUES ($1, $2, $3, 'OTRO', $4, $5, 'CONFIRMADA')
       RETURNING id_salida, numero_salida`,
      [
        numeroSalida,
        solicitud.id_almacen,
        idUsuario,
        solicitud.orden_produccion,
        `Despacho a producción, orden ${solicitud.orden_produccion}`,
      ],
    );
    const salida = salidaResult.rows[0];

    const lineas = await client.query(
      `SELECT id_detalle_solicitud, id_producto, cantidad_reservada
       FROM detalle_solicitudes_materiales
       WHERE id_solicitud = $1 AND cantidad_reservada > 0
       ORDER BY id_producto`,
      [idSolicitud],
    );

    const productos = [];
    for (const linea of lineas.rows) {
      productos.push(await despacharLinea(client, { solicitud, salida, linea, idUsuario }));
    }

    await client.query(
      `UPDATE solicitudes_materiales
       SET estado = 'DESPACHADA', id_salida = $2, id_usuario_despacho = $3,
           fecha_despacho = CURRENT_TIMESTAMP
       WHERE id_solicitud = $1`,
      [idSolicitud, salida.id_salida, idUsuario],
    );
    await registrarEvento(client, "MATERIALES_DESPACHADOS", {
      id_solicitud: idSolicitud,
      orden_produccion: solicitud.orden_produccion,
      id_almacen: solicitud.id_almacen,
      numero_salida: salida.numero_salida,
      productos,
    });

    await client.query("COMMIT");
    return { id_solicitud: idSolicitud, estado: "DESPACHADA", numero_salida: salida.numero_salida, productos };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
};

// Un contenido que no sea un objeto JSON se conserva para registrarlo como inválido.
const leerMensaje = (message) => {
  const texto = message.data.toString("utf8");
  try {
    const data = JSON.parse(texto);
    if (data && typeof data === "object" && !Array.isArray(data)) return data;
  } catch {
    // Se trata igual que un JSON con forma incorrecta.
  }
  return { contenido_invalido: texto };
};

const PROCESADORES = {
  [MENSAJE_SOLICITUD]: procesarSolicitud,
  [MENSAJE_TERMINADOS]: procesarTerminados,
};

const suscribir = (pubsub, nombre) => {
  const subscription = pubsub.subscription(nombre, { flowControl: { maxMessages: 5 } });

  subscription.on("message", async (message) => {
    // El tópico es compartido: aquí también llegan los eventos que publica Inventario.
    const data = leerMensaje(message);
    const procesar = PROCESADORES[message.attributes?.tipo_evento || data.tipo_evento];
    if (!procesar) {
      message.ack();
      return;
    }

    try {
      await procesar(data, message.id);
      message.ack();
    } catch (error) {
      console.error(`Pub/Sub: error procesando mensaje de ${nombre}, se reintentará:`, error.message);
      message.nack();
    }
  });

  subscription.on("error", (error) => {
    console.error(`Pub/Sub: se perdió la suscripción ${nombre}:`, error.message);
    subscription.removeAllListeners();
    subscription.close().catch(() => {});
    setTimeout(() => suscribir(pubsub, nombre), SEGUNDOS_RECONEXION * 1000).unref();
  });

  console.log(`Pub/Sub: escuchando suscripción ${nombre}`);
};

const iniciarSuscripcionesProduccion = () => {
  const nombre = env.pubsubSubscription.trim();
  if (!nombre) {
    console.warn("Pub/Sub: PUBSUB_SUBSCRIPTION no configurada, no se reciben mensajes de Producción y Logística");
    return;
  }

  const { PubSub } = require("@google-cloud/pubsub");
  suscribir(new PubSub(), nombre);
};

module.exports = {
  procesarSolicitud,
  procesarTerminados,
  despacharSolicitud,
  iniciarSuscripcionesProduccion,
};
