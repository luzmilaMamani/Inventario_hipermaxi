const db = require("../config/db");
const { registrarVentaConfirmada, registrarVentaAnulada } = require("./ventasRecibidas");

// RF72 (HIP-272): consumo de los eventos del SI de Ventas que llegan por la
// suscripción exclusiva de Inventario sobre el tópico del grupo, distinguidos
// por el atributo tipo_evento.
//
// Mensaje: { id_mensaje, tipo_evento, id_venta, sucursal, fecha,
//            detalle: [{ codigo_producto, cantidad }] }
//
// Garantías:
//  - Idempotencia: el id_mensaje se registra en mensajes_integracion en la misma
//    transacción que el efecto sobre el stock; una reentrega no descuenta dos veces.
//  - Formato inválido: se guarda como INVALIDO y se confirma (ack).
//  - Falla de negocio (producto inexistente, sin stock): se guarda como ERROR y
//    se confirma; se reprocesa desde el dashboard de integraciones.
//  - Cualquier otra falla (BD caída): se lanza para que Pub/Sub reentregue.

const EVENTO_CONFIRMADA = "venta.confirmada";
const EVENTO_ANULADA = "venta.anulada";
const EVENTOS_VENTAS = [EVENTO_CONFIRMADA, EVENTO_ANULADA];

class MensajeVentaInvalido extends Error {}

const textoNoVacio = (valor, maximo) =>
  (typeof valor === "string" || typeof valor === "number") &&
  String(valor).trim() !== "" &&
  String(valor).length <= maximo;

function validarMensajeVenta(data) {
  if (!data || typeof data !== "object" || data.contenido_invalido !== undefined) {
    throw new MensajeVentaInvalido("El contenido no es un objeto JSON");
  }
  if (!EVENTOS_VENTAS.includes(data.tipo_evento)) {
    throw new MensajeVentaInvalido(`tipo_evento debe ser ${EVENTOS_VENTAS.join(" o ")}`);
  }
  if (!textoNoVacio(data.id_mensaje, 100)) throw new MensajeVentaInvalido("id_mensaje es obligatorio");
  if (!textoNoVacio(data.id_venta, 60)) throw new MensajeVentaInvalido("id_venta es obligatorio (máximo 60 caracteres)");
  if (!textoNoVacio(data.sucursal, 60)) throw new MensajeVentaInvalido("sucursal es obligatoria");
  if (!data.fecha || Number.isNaN(Date.parse(data.fecha))) {
    throw new MensajeVentaInvalido("fecha debe ser una fecha válida (ISO 8601)");
  }

  if (data.tipo_evento === EVENTO_CONFIRMADA) {
    if (!Array.isArray(data.detalle) || data.detalle.length === 0) {
      throw new MensajeVentaInvalido("detalle debe tener al menos una línea");
    }
    data.detalle.forEach((linea, i) => {
      if (!textoNoVacio(linea?.codigo_producto, 50)) {
        throw new MensajeVentaInvalido(`detalle[${i}].codigo_producto es obligatorio`);
      }
      if (!Number.isSafeInteger(linea.cantidad) || linea.cantidad <= 0) {
        throw new MensajeVentaInvalido(`detalle[${i}].cantidad debe ser un entero positivo`);
      }
    });
  }

  return {
    id_mensaje: String(data.id_mensaje).trim(),
    tipo_evento: data.tipo_evento,
    id_venta: String(data.id_venta).trim(),
    sucursal: String(data.sucursal).trim(),
    fecha: new Date(data.fecha).toISOString(),
    detalle: (data.detalle || []).map((l) => ({
      codigo_producto: String(l.codigo_producto).trim(),
      cantidad: l.cantidad,
    })),
  };
}

// Procesa un mensaje de Ventas. `publicado` es la hora de publicación en Pub/Sub
// (para medir la latencia). Devuelve { estado, duplicado?, ... }.
async function procesarMensajeVenta(data, { messageId = null, publicado = null } = {}) {
  const tipo = EVENTOS_VENTAS.includes(data?.tipo_evento) ? data.tipo_evento : "venta.desconocido";
  const idMensaje = String(data?.id_mensaje || messageId || "").trim() || `sin-id-${Date.now()}`;
  const fechaPublicacion = publicado ? new Date(publicado) : null;

  const client = await db.pool.connect();
  try {
    await client.query("BEGIN");
    const registro = await client.query(
      `INSERT INTO mensajes_integracion
         (tipo_mensaje, id_mensaje, payload, sistema, fecha_publicacion)
       VALUES ($1, $2, $3, 'VENTAS', $4)
       ON CONFLICT DO NOTHING
       RETURNING id_mensaje`,
      [tipo, idMensaje, JSON.stringify(data ?? {}), fechaPublicacion],
    );
    if (!registro.rowCount) {
      await client.query("COMMIT");
      return { estado: "DUPLICADO", duplicado: true, id_mensaje: idMensaje };
    }

    const resultado = await aplicarMensaje(client, data, idMensaje);
    await client.query(
      `UPDATE mensajes_integracion
       SET estado = $3, error = $4, fecha_procesado = CURRENT_TIMESTAMP,
           latencia_ms = CASE WHEN fecha_publicacion IS NULL THEN NULL
             ELSE ROUND(EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - fecha_publicacion)) * 1000)::int END
       WHERE tipo_mensaje = $1 AND id_mensaje = $2`,
      [tipo, idMensaje, resultado.estadoMensaje, resultado.error || null],
    );
    await client.query("COMMIT");
    return { ...resultado.detalle, estado: resultado.estadoMensaje, id_mensaje: idMensaje, error: resultado.error };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

// Valida y aplica el efecto de un mensaje sobre el stock. No confirma la
// transacción. Devuelve el estado con el que queda el mensaje.
async function aplicarMensaje(client, data, idMensaje) {
  let venta;
  try {
    venta = validarMensajeVenta(data);
  } catch (error) {
    if (!(error instanceof MensajeVentaInvalido)) throw error;
    return { estadoMensaje: "INVALIDO", error: error.message, detalle: {} };
  }

  const detalle =
    venta.tipo_evento === EVENTO_CONFIRMADA
      ? await registrarVentaConfirmada(client, venta, idMensaje)
      : await registrarVentaAnulada(client, venta, idMensaje);

  if (detalle.estado === "ERROR") return { estadoMensaje: "ERROR", error: detalle.error, detalle };
  return { estadoMensaje: "PROCESADO", detalle };
}

module.exports = {
  EVENTOS_VENTAS,
  MensajeVentaInvalido,
  validarMensajeVenta,
  procesarMensajeVenta,
  aplicarMensaje,
};
