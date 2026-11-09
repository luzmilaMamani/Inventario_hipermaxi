// Simula al sistema de Producción y Logística sobre Pub/Sub real (HIP-259 / HIP-260).
//
//   node scripts/simular-logistica.js preparar
//   node scripts/simular-logistica.js solicitud <id_almacen> <id_producto:cantidad> [...]
//   node scripts/simular-logistica.js terminado <id_almacen> <id_producto:cantidad[:YYYY-MM-DD]> [...]
//   node scripts/simular-logistica.js escuchar

require("dotenv").config();
const { randomUUID } = require("node:crypto");
const { PubSub } = require("@google-cloud/pubsub");

const TOPICO_SOLICITUDES = "produccion.solicitud-materiales";
const TOPICO_TERMINADOS = "produccion.productos-terminados";
const TOPICO_EVENTOS = process.env.PUBSUB_TOPIC_EVENTOS_PRODUCCION?.trim() || "inventario.eventos-produccion";

const SUSCRIPCION_SOLICITUDES = process.env.PUBSUB_SUB_SOLICITUD_MATERIALES?.trim() || "inventario-solicitud-materiales";
const SUSCRIPCION_TERMINADOS = process.env.PUBSUB_SUB_PRODUCTOS_TERMINADOS?.trim() || "inventario-productos-terminados";
const SUSCRIPCION_LOGISTICA = "logistica-simulada-eventos";

const pubsub = new PubSub();

const CODIGO_YA_EXISTE = 6;

const crearSiFalta = async (crear, nombre) => {
  try {
    await crear();
    console.log(`Creado: ${nombre}`);
  } catch (error) {
    if (error.code !== CODIGO_YA_EXISTE) throw error;
    console.log(`Ya existe: ${nombre}`);
  }
};

const preparar = async () => {
  for (const topico of [TOPICO_SOLICITUDES, TOPICO_TERMINADOS, TOPICO_EVENTOS]) {
    await crearSiFalta(() => pubsub.createTopic(topico), topico);
  }
  const suscripciones = [
    [TOPICO_SOLICITUDES, SUSCRIPCION_SOLICITUDES],
    [TOPICO_TERMINADOS, SUSCRIPCION_TERMINADOS],
    [TOPICO_EVENTOS, SUSCRIPCION_LOGISTICA],
  ];
  for (const [topico, suscripcion] of suscripciones) {
    await crearSiFalta(() => pubsub.topic(topico).createSubscription(suscripcion), suscripcion);
  }
};

const leerLineas = (argumentos) =>
  argumentos.map((argumento) => {
    const [idProducto, cantidad, fechaVencimiento] = argumento.split(":");
    return {
      id_producto: Number(idProducto),
      cantidad: Number(cantidad),
      ...(fechaVencimiento ? { fecha_vencimiento: fechaVencimiento } : {}),
    };
  });

const publicar = async (topico, tipoEvento, [idAlmacen, ...lineas]) => {
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
  const messageId = await pubsub.topic(topico).publishMessage({
    data: Buffer.from(JSON.stringify(payload), "utf8"),
    attributes: { tipo_evento: tipoEvento },
  });
  console.log(`Publicado en ${topico} (${messageId}):\n${JSON.stringify(payload, null, 2)}`);
};

const escuchar = () => {
  console.log(`Escuchando ${SUSCRIPCION_LOGISTICA}. Ctrl+C para salir.`);
  const subscription = pubsub.subscription(SUSCRIPCION_LOGISTICA);
  subscription.on("message", (message) => {
    console.log(JSON.stringify(JSON.parse(message.data.toString("utf8")), null, 2));
    message.ack();
  });
  subscription.on("error", (error) => {
    console.error(error.message);
    process.exit(1);
  });
};

const [comando, ...argumentos] = process.argv.slice(2);

const comandos = {
  preparar,
  solicitud: () => publicar(TOPICO_SOLICITUDES, "SOLICITUD_MATERIALES", argumentos),
  terminado: () => publicar(TOPICO_TERMINADOS, "PRODUCTOS_TERMINADOS", argumentos),
  escuchar,
};

if (!comandos[comando]) {
  console.error("Comandos: preparar | solicitud | terminado | escuchar");
  process.exit(1);
}

Promise.resolve(comandos[comando]()).catch((error) => {
  console.error(error.message);
  process.exit(1);
});
