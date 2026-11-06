const app = require("./app");
const env = require("./config/env");
const db = require("./config/db");
const { aplicarMigraciones } = require("./utils/migrar");
const { iniciarPublicadorStockBajo } = require("./services/stockBajoPubSub");
const { iniciarRevisionVencimientos } = require("./services/alertasVencimiento");

aplicarMigraciones(db.pool)
  .then(() => {
    app.listen(env.port, () => {
      console.log(`API REST escuchando en http://localhost:${env.port}`);
      iniciarPublicadorStockBajo();
      iniciarRevisionVencimientos();
    });
  })
  .catch((error) => {
    console.error("Error al aplicar las migraciones:", error.message);
    process.exit(1);
  });
