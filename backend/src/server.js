const app = require("./app");
const env = require("./config/env");
const db = require("./config/db");
const { aplicarMigraciones } = require("./utils/migrar");
const { iniciarPublicadorStockBajo } = require("./services/stockBajoPubSub");
const { iniciarRevisionVencimientos } = require("./services/alertasVencimiento");
const { iniciarPublicadorEventos } = require("./services/eventosProduccion");
const { iniciarSuscripcionesProduccion } = require("./services/integracionProduccion");

aplicarMigraciones(db.pool)
  .then(() => {
    app.listen(env.port, () => {
      console.log(`API REST escuchando en http://localhost:${env.port}`);
      iniciarPublicadorStockBajo();
      iniciarRevisionVencimientos();
      iniciarPublicadorEventos();
      iniciarSuscripcionesProduccion();
    });
  })
  .catch((error) => {
    console.error("Error al aplicar las migraciones:", error.message);
    process.exit(1);
  });
