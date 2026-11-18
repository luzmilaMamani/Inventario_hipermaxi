// Prepara el entorno de las pruebas unitarias: variables mínimas para que
// config/env no falle y una base de datos simulada (no se conecta a PostgreSQL).
//
// Uso en una prueba:
//   const { simularDb } = require("../helpers/entorno");
//   const db = simularDb([{ rows: [...] }, ...]); // respuestas en orden
//   ... llamar al servicio ...
//   db.consultas  // [{ sql, params }] que se ejecutaron

process.env.DB_HOST ??= "localhost";
process.env.DB_PORT ??= "5432";
process.env.DB_NAME ??= "pruebas_unitarias";
process.env.DB_USER ??= "pruebas";
process.env.DB_PASSWORD ??= "pruebas";
process.env.JWT_SECRET ??= "secreto-de-pruebas";
process.env.PUBSUB_TOPIC = "";
process.env.PUBSUB_SUBSCRIPTION = "";
process.env.NODE_ENV = "test";

const db = require("../../src/config/db");

// Cliente falso: cada query devuelve la siguiente respuesta de la lista. Una
// respuesta puede ser un objeto { rows, rowCount }, una función (sql, params)
// que la calcula, o un Error para simular una falla.
function crearClienteFalso(respuestas = []) {
  const pendientes = [...respuestas];
  const consultas = [];
  const cliente = {
    consultas,
    liberado: false,
    async query(sql, params = []) {
      consultas.push({ sql: String(sql), params });
      const siguiente = pendientes.length ? pendientes.shift() : { rows: [], rowCount: 0 };
      const respuesta = typeof siguiente === "function" ? await siguiente(String(sql), params) : siguiente;
      if (respuesta instanceof Error) throw respuesta;
      const rows = respuesta?.rows ?? [];
      return { rows, rowCount: respuesta?.rowCount ?? rows.length };
    },
    release() {
      cliente.liberado = true;
    },
  };
  return cliente;
}

// Reemplaza db.query y db.pool.connect por un cliente falso compartido.
function simularDb(respuestas = []) {
  const cliente = crearClienteFalso(respuestas);
  db.query = (sql, params) => cliente.query(sql, params);
  db.pool.connect = async () => cliente;
  return cliente;
}

// Busca una consulta ejecutada por un fragmento de su SQL.
const buscarConsulta = (cliente, fragmento) =>
  cliente.consultas.find((c) => c.sql.includes(fragmento));

module.exports = { crearClienteFalso, simularDb, buscarConsulta };
