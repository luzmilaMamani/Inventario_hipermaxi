const env = require("../config/env");
const ApiError = require("../utils/apiError");
const asyncHandler = require("../utils/asyncHandler");
const { consultarStockBajo, publicarMensaje } = require("../services/stockBajoPubSub");

const publicarStockBajo = asyncHandler(async (_req, res) => {
  if (!env.pubsubTopic.trim()) {
    throw new ApiError(503, "Configura PUBSUB_TOPIC en backend/.env para publicar");
  }

  const productos = await consultarStockBajo();
  if (productos.length === 0) {
    return res.json({
      ok: true,
      published: false,
      message: "No hay productos con stock bajo para publicar",
      product_count: 0,
    });
  }

  const payload = {
    tipo_evento: "STOCK_BAJO",
    origen: "inventario_hipermaxi",
    generado_en: new Date().toISOString(),
    productos,
  };
  const messageId = await publicarMensaje(payload, { tipo_evento: "STOCK_BAJO" });

  res.json({
    ok: true,
    published: true,
    topic: env.pubsubTopic.trim(),
    message_id: messageId,
    product_count: productos.length,
  });
});

module.exports = { publicarStockBajo };
