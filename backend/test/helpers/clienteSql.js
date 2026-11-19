// Cliente de base de datos falso que responde según el texto de la consulta.
//
//   const cliente = clienteSql([
//     [/FROM lotes_productos/, { rows: [...] }],
//     ["UPDATE stock", (sql, params) => ({ rowCount: 1 })],
//   ]);
//
// Gana la primera regla cuyo patrón coincide; sin coincidencia responde vacío.
// Una regla con { una_vez: true } se usa solo la primera vez.

function clienteSql(reglas = []) {
  const pendientes = reglas.map(([patron, respuesta, opciones = {}]) => ({ patron, respuesta, ...opciones }));
  const consultas = [];

  const coincide = (patron, sql) => (patron instanceof RegExp ? patron.test(sql) : sql.includes(patron));

  const cliente = {
    consultas,
    liberado: false,
    async query(sql, params = []) {
      const texto = String(sql);
      consultas.push({ sql: texto, params });
      const indice = pendientes.findIndex((r) => coincide(r.patron, texto));
      if (indice === -1) return { rows: [], rowCount: 0 };
      const regla = pendientes[indice];
      if (regla.una_vez) pendientes.splice(indice, 1);
      const respuesta = typeof regla.respuesta === "function" ? await regla.respuesta(texto, params) : regla.respuesta;
      if (respuesta instanceof Error) throw respuesta;
      const rows = respuesta?.rows ?? [];
      return { rows, rowCount: respuesta?.rowCount ?? rows.length };
    },
    release() {
      cliente.liberado = true;
    },
    // Consultas que contienen el fragmento, en orden.
    buscar(fragmento) {
      return consultas.filter((c) => coincide(fragmento, c.sql));
    },
  };
  return cliente;
}

module.exports = { clienteSql };
