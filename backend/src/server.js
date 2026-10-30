const app = require('./app');
const env = require('./config/env');
const { iniciarPublicadorStockBajo } = require('./services/stockBajoPubSub');

app.listen(env.port, () => {
  console.log(`API REST escuchando en http://localhost:${env.port}`);
  iniciarPublicadorStockBajo();
});
