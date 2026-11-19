// RF72: simula al SI de Ventas publicando en el tópico del grupo (PUBSUB_TOPIC).
//
//   node scripts/simular-ventas.js confirmada <id_venta> <sucursal> <codigo:cantidad> [...]
//   node scripts/simular-ventas.js anulada <id_venta> <sucursal>
//
// Ejemplo:
//   node scripts/simular-ventas.js confirmada V-1001 SUC-001 PRD-001:2 7770000000012:1
//   node scripts/simular-ventas.js anulada V-1001 SUC-001

require("dotenv").config();
const { randomUUID } = require("node:crypto");
const { PubSub } = require("@google-cloud/pubsub");

const TIPOS = { confirmada: "venta.confirmada", anulada: "venta.anulada" };

const publicar = async (tipoEvento, [idVenta, sucursal, ...lineas]) => {
  const topico = process.env.PUBSUB_TOPIC?.trim();
  if (!topico) throw new Error("Configura PUBSUB_TOPIC en backend/.env");
  if (!idVenta || !sucursal) throw new Error("Indica el id de la venta y la sucursal");
  if (tipoEvento === TIPOS.confirmada && lineas.length === 0) {
    throw new Error("Indica al menos una línea codigo_producto:cantidad");
  }

  const payload = {
    id_mensaje: randomUUID(),
    tipo_evento: tipoEvento,
    id_venta: idVenta,
    sucursal,
    fecha: new Date().toISOString(),
    ...(tipoEvento === TIPOS.confirmada
      ? {
          detalle: lineas.map((linea) => {
            const [codigo, cantidad] = linea.split(":");
            return { codigo_producto: codigo, cantidad: Number(cantidad) };
          }),
        }
      : {}),
  };
  const messageId = await new PubSub().topic(topico).publishMessage({
    json: payload,
    attributes: { tipo_evento: tipoEvento },
  });
  console.log(`Publicado en ${topico} (${messageId}):\n${JSON.stringify(payload, null, 2)}`);
};

const [comando, ...argumentos] = process.argv.slice(2);

if (!TIPOS[comando]) {
  console.error("Comandos: confirmada | anulada");
  process.exit(1);
}

publicar(TIPOS[comando], argumentos).catch((error) => {
  console.error(error.message);
  process.exit(1);
});
