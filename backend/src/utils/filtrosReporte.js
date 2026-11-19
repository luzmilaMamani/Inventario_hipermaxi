const ApiError = require("./apiError");

// Ayudas comunes para armar el WHERE de los reportes con parámetros numerados.

function esFechaValida(fecha) {
  if (typeof fecha !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return false;
  const fechaParseada = new Date(`${fecha}T00:00:00.000Z`);
  return (
    !Number.isNaN(fechaParseada.getTime()) &&
    fechaParseada.toISOString().slice(0, 10) === fecha
  );
}

function crearFiltros() {
  const condiciones = [];
  const valores = [];

  const agregar = (sql, valor) => {
    valores.push(valor);
    condiciones.push(sql.replaceAll("?", `$${valores.length}`));
  };

  return {
    condiciones,
    valores,
    agregar,

    // Filtro por un id entero positivo; vacío u omitido no filtra.
    id(valor, columna, mensaje) {
      if (valor === undefined || valor === null || valor === "") return;
      const id = Number(valor);
      if (!Number.isSafeInteger(id) || id <= 0) throw new ApiError(400, mensaje);
      agregar(`${columna} = ?`, id);
    },

    // Filtro por un valor de una lista cerrada.
    opcion(valor, columna, permitidos, mensaje) {
      if (valor === undefined || valor === null || valor === "") return;
      if (!permitidos.includes(valor)) throw new ApiError(400, mensaje);
      agregar(`${columna} = ?`, valor);
    },

    // Rango de fechas inclusivo sobre una columna timestamp: hasta incluye todo
    // ese día.
    rangoFechas(desde, hasta, columna) {
      for (const [nombre, fecha] of [["fecha_desde", desde], ["fecha_hasta", hasta]]) {
        if (fecha && !esFechaValida(fecha)) {
          throw new ApiError(400, `La fecha ${nombre} no es válida`);
        }
      }
      if (desde && hasta && desde > hasta) {
        throw new ApiError(400, "La fecha inicial no puede ser posterior a la final");
      }
      if (desde) agregar(`${columna} >= ?::date`, desde);
      if (hasta) agregar(`${columna} < ?::date + INTERVAL '1 day'`, hasta);
    },

    where(extra = []) {
      const todas = [...condiciones, ...extra];
      return todas.length ? `WHERE ${todas.join(" AND ")}` : "";
    },
  };
}

module.exports = { crearFiltros, esFechaValida };
