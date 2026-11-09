// Simula a Producción y Logística publicando en el tópico del grupo (PUBSUB_TOPIC).
//
//   node scripts/simular-logistica.js solicitud <id_almacen> <id_producto:cantidad> [...]
//   node scripts/simular-logistica.js terminado <id_almacen> <id_producto:cantidad[:YYYY-MM-DD]> [...]

require("dotenv").config();
const { randomUUID } = require("node:crypto");
const { PubSub } = require("@google-cloud/pubsub");

const TIPOS = { solicitud: "SOLICITUD_MATERIALES", terminado: "PRODUCTOS_TERMINADOS" };

const leerLineas = (argumentos) =>
  argumentos.map((argumento) => {
    const [idProducto, cantidad, fechaVencimiento] = argumento.split(":");
    return {
      id_producto: Number(idProducto),
      cantidad: Number(cantidad),
      ...(fechaVencimiento ? { fecha_vencimiento: fechaVencimiento } : {}),
    };
  });

const publicar = async (tipoEvento, [idAlmacen, ...lineas]) => {
  const topico = process.env.PUBSUB_TOPIC?.trim();
  if (!topico) throw new Error("Configura PUBSUB_TOPIC en backend/.env");
  if (!idAlmacen || lineas.length === 0) {
    throw new Error("Indica el almacén y al menos una línea id_producto:cantidad");
  }

  const payload = {
    id_mensaje: randomUUID(),
    tipo_evento: tipoEvento,
    origen: "produccion_logistica",
    orden_produccion: `OP-${Date.now()}`,
    id_almacen: Number(idAlmacen),
    productos: leerLineas(lineas),
    generado_en: new Date().toISOString(),
  };
  const messageId = await new PubSub().topic(topico).publishMessage({
    data: Buffer.from(JSON.stringify(payload), "utf8"),
    attributes: { tipo_evento: tipoEvento },
  });
  console.log(`Publicado en ${topico} (${messageId}):\n${JSON.stringify(payload, null, 2)}`);
};

const [comando, ...argumentos] = process.argv.slice(2);

if (!TIPOS[comando]) {
  console.error("Comandos: solicitud | terminado");
  process.exit(1);
}

publicar(TIPOS[comando], argumentos).catch((error) => {
  console.error(error.message);
  process.exit(1);
});
