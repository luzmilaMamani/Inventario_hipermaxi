const db = require("../config/db");
const ApiError = require("../utils/apiError");

// RF62: indicadores principales del inventario. Fórmulas (presentación de KPIs
// del Sprint 4):
//  1. Valor del inventario = Σ stock × precio.
//  2. Rotación = costo de lo vendido en el período / inventario promedio;
//     días de inventario = 30 / rotación mensual.
//  3. Quiebre de stock = productos con disponible ≤ mínimo / productos activos.
//  4. Merma = valor de pérdidas, daños y vencimientos / inventario promedio.
//  5. Exactitud = líneas contadas sin diferencia / líneas contadas.
//  6. Valor en riesgo = Σ valor de lotes vigentes que vencen en ≤ 30 días.
//  7. Cumplimiento de proveedores = recepciones sin diferencia / recepciones.
// En todos, id_almacen = null significa todas las sucursales.

const redondear = (valor, decimales = 2) =>
  valor === null || valor === undefined || Number.isNaN(Number(valor))
    ? null
    : Math.round(Number(valor) * 10 ** decimales) / 10 ** decimales;

// MAYOR: conviene superar la meta (rotación, exactitud, cumplimiento).
// MENOR: conviene no pasarla (capital, quiebre, merma, valor en riesgo).
const DEFINICIONES_KPI = {
  VALOR_INVENTARIO: { sentido: "MENOR", decimales: 2 },
  ROTACION: { sentido: "MAYOR", decimales: 2 },
  QUIEBRE_STOCK: { sentido: "MENOR", decimales: 1 },
  MERMA: { sentido: "MENOR", decimales: 2 },
  EXACTITUD: { sentido: "MAYOR", decimales: 1 },
  VALOR_RIESGO_VENCIMIENTO: { sentido: "MENOR", decimales: 2 },
  CUMPLIMIENTO_PROVEEDORES: { sentido: "MAYOR", decimales: 1 },
};

// Verde si cumple. Amarillo si el desvío no pasa del 10 %. Rojo si pasa.
const calcularSemaforo = (valor, meta, sentido) => {
  if (valor === null || valor === undefined || meta === null || meta === undefined) return "sin_datos";
  const v = Number(valor);
  const m = Number(meta);
  if (sentido === "MENOR") {
    if (v <= m) return "verde";
    if (v <= m * 1.1) return "amarillo";
    return "rojo";
  }
  if (v >= m) return "verde";
  if (v >= m * 0.9) return "amarillo";
  return "rojo";
};

// Seis meses calendario cerrados en `hasta`. El último llega solo hasta esa fecha.
const mesesHasta = (hasta, cantidad = 6) => {
  const fin = new Date(`${hasta}T00:00:00Z`);
  const meses = [];
  for (let i = cantidad - 1; i >= 0; i -= 1) {
    const inicio = new Date(Date.UTC(fin.getUTCFullYear(), fin.getUTCMonth() - i, 1));
    const anio = inicio.getUTCFullYear();
    const mes = inicio.getUTCMonth() + 1;
    const desde = `${anio}-${String(mes).padStart(2, "0")}-01`;
    const cierre = new Date(Date.UTC(anio, mes, 0)).toISOString().slice(0, 10);
    meses.push({
      anio,
      mes,
      desde,
      hasta: cierre > hasta ? hasta : cierre,
      etiqueta: `${String(mes).padStart(2, "0")}/${String(anio).slice(2)}`,
    });
  }
  return meses;
};

const porcentaje = (parte, total) => (Number(total) > 0 ? (Number(parte) / Number(total)) * 100 : null);

// El inventario de una fecha pasada se reconstruye restando al stock actual lo
// que se movió desde entonces.
const SQL_VALOR_Y_VENTAS = `
  WITH actual AS (
    SELECT COALESCE(SUM(valor_total), 0) AS valor
    FROM vw_reporte_existencias
    WHERE ($1::int IS NULL OR id_almacen = $1)
  ), movs AS (
    SELECT
      COALESCE(SUM(cantidad_neta * precio_unitario) FILTER (WHERE fecha_movimiento >= $2::date), 0) AS neto_desde_inicio,
      COALESCE(SUM(cantidad_neta * precio_unitario) FILTER (WHERE fecha_movimiento >= $3::date + 1), 0) AS neto_desde_fin,
      COALESCE(SUM(valor) FILTER (WHERE es_venta AND fecha_movimiento >= $2::date AND fecha_movimiento < $3::date + 1), 0) AS costo_vendido,
      COALESCE(SUM(valor) FILTER (WHERE es_merma AND fecha_movimiento >= $2::date AND fecha_movimiento < $3::date + 1), 0) AS valor_merma,
      COALESCE(SUM(cantidad) FILTER (WHERE es_merma AND fecha_movimiento >= $2::date AND fecha_movimiento < $3::date + 1), 0) AS unidades_merma
    FROM vw_movimientos_valorizados
    WHERE ($1::int IS NULL OR id_almacen = $1)
      AND fecha_movimiento >= $2::date
  )
  SELECT actual.valor AS valor_actual,
         GREATEST(actual.valor - movs.neto_desde_inicio, 0) AS valor_inicio,
         GREATEST(actual.valor - movs.neto_desde_fin, 0) AS valor_fin,
         movs.costo_vendido, movs.valor_merma, movs.unidades_merma
  FROM actual, movs`;

const SQL_QUIEBRE = `
  SELECT COUNT(*)::int AS registros,
         COUNT(*) FILTER (WHERE cantidad_disponible <= stock_minimo)::int AS en_quiebre
  FROM vw_reporte_existencias
  WHERE estado_producto = 'ACTIVO' AND ($1::int IS NULL OR id_almacen = $1)`;

const SQL_EXACTITUD = `
  SELECT COUNT(*)::int AS lineas,
         COUNT(*) FILTER (WHERE sin_diferencia)::int AS exactas,
         COUNT(DISTINCT id_inventario)::int AS inventarios
  FROM vw_conteos_inventario
  WHERE ($1::int IS NULL OR id_almacen = $1)
    AND fecha_conteo >= $2::date AND fecha_conteo < $3::date + 1`;

const SQL_RIESGO = `
  SELECT COUNT(*)::int AS lotes,
         COALESCE(SUM(lp.cantidad_actual), 0) AS unidades,
         COALESCE(SUM(lp.cantidad_actual * COALESCE(p.precio, 0)), 0) AS valor
  FROM lotes_productos lp
  INNER JOIN productos p ON p.id_producto = lp.id_producto
  WHERE lp.cantidad_actual > 0
    AND lp.estado IN ('DISPONIBLE', 'PROXIMO_A_VENCER')
    AND lp.fecha_vencimiento > CURRENT_DATE
    AND lp.fecha_vencimiento <= CURRENT_DATE + 30
    AND ($1::int IS NULL OR lp.id_almacen = $1)`;

const SQL_CUMPLIMIENTO = `
  SELECT COUNT(*)::int AS recepciones,
         COUNT(*) FILTER (WHERE sin_diferencia)::int AS sin_diferencia
  FROM vw_recepciones_cumplimiento
  WHERE ($1::int IS NULL OR id_almacen = $1)
    AND fecha_entrada >= $2::date AND fecha_entrada < $3::date + 1`;

const SQL_VALOR_POR_SUCURSAL = `
  SELECT a.id_almacen, a.codigo, a.nombre AS almacen,
         COALESCE(SUM(e.valor_total), 0) AS valor
  FROM almacenes a
  LEFT JOIN vw_reporte_existencias e ON e.id_almacen = a.id_almacen
  WHERE a.activo = TRUE
  GROUP BY a.id_almacen
  ORDER BY valor DESC`;

const SQL_MOVIMIENTOS_POR_DIA = `
  SELECT TO_CHAR(fecha_movimiento::date, 'YYYY-MM-DD') AS dia,
         COALESCE(SUM(cantidad) FILTER (WHERE signo > 0), 0) AS entradas,
         COALESCE(SUM(cantidad) FILTER (WHERE signo < 0), 0) AS salidas
  FROM vw_movimientos_valorizados
  WHERE ($1::int IS NULL OR id_almacen = $1)
    AND fecha_movimiento >= $2::date AND fecha_movimiento < $3::date + 1
  GROUP BY 1
  ORDER BY 1`;

const SQL_TOP_QUIEBRE = `
  SELECT id_producto, producto_codigo, producto, id_almacen, almacen,
         cantidad_disponible, stock_minimo, unidad
  FROM vw_reporte_existencias
  WHERE estado_producto = 'ACTIVO'
    AND cantidad_disponible <= stock_minimo
    AND ($1::int IS NULL OR id_almacen = $1)
  ORDER BY cantidad_disponible / NULLIF(stock_minimo, 0) ASC NULLS LAST, producto
  LIMIT 5`;

async function obtenerIndicadores({ idAlmacen = null, desde, hasta }) {
  const p3 = [idAlmacen, desde, hasta];
  const p1 = [idAlmacen];

  const [base, quiebre, exactitud, riesgo, cumplimiento, porSucursal, porDia, topQuiebre] =
    await Promise.all([
      db.query(SQL_VALOR_Y_VENTAS, p3),
      db.query(SQL_QUIEBRE, p1),
      db.query(SQL_EXACTITUD, p3),
      db.query(SQL_RIESGO, p1),
      db.query(SQL_CUMPLIMIENTO, p3),
      db.query(SQL_VALOR_POR_SUCURSAL),
      db.query(SQL_MOVIMIENTOS_POR_DIA, p3),
      db.query(SQL_TOP_QUIEBRE, p1),
    ]);

  const dias = Math.round((Date.parse(hasta) - Date.parse(desde)) / 86400000) + 1;
  const kpis = kpisDesdeConsultas({ base, quiebre, exactitud, riesgo, cumplimiento, dias });

  return {
    periodo: { desde, hasta, dias, id_almacen: idAlmacen },
    kpis,
    graficos: {
      valor_por_sucursal: porSucursal.rows.map((f) => ({ ...f, valor: Number(f.valor) })),
      movimientos_por_dia: porDia.rows.map((f) => ({
        dia: f.dia,
        entradas: Number(f.entradas),
        salidas: Number(f.salidas),
      })),
      top_quiebre: topQuiebre.rows,
    },
  };
}

function kpisDesdeConsultas({ base, quiebre, exactitud, riesgo, cumplimiento, dias }) {
  const b = base.rows[0];
  const promedio = (Number(b.valor_inicio) + Number(b.valor_fin)) / 2;
  const rotacion = promedio > 0 ? Number(b.costo_vendido) / promedio : null;
  const rotacionMensual = rotacion === null ? null : (rotacion * 30) / dias;
  const q = quiebre.rows[0];
  const ex = exactitud.rows[0];
  const r = riesgo.rows[0];
  const c = cumplimiento.rows[0];

  return [
    {
      codigo: "VALOR_INVENTARIO",
      nombre: "Valor total del inventario",
      valor: redondear(b.valor_actual),
      unidad: "Bs",
      descripcion: "Stock actual × precio",
      enlace: "/reportes/existencias",
      detalle: { valor_inicio_periodo: redondear(b.valor_inicio), valor_fin_periodo: redondear(b.valor_fin) },
    },
    {
      codigo: "ROTACION",
      nombre: "Índice de rotación",
      valor: redondear(rotacionMensual),
      unidad: "veces/mes",
      descripcion: "Costo de lo vendido / inventario promedio",
      enlace: "/reportes/rotacion",
      detalle: {
        costo_vendido: redondear(b.costo_vendido),
        inventario_promedio: redondear(promedio),
        rotacion_periodo: redondear(rotacion),
        dias_inventario: rotacionMensual > 0 ? redondear(30 / rotacionMensual, 1) : null,
      },
    },
    {
      codigo: "QUIEBRE_STOCK",
      nombre: "Tasa de quiebre de stock",
      valor: redondear(porcentaje(q.en_quiebre, q.registros), 1),
      unidad: "%",
      descripcion: "Productos con disponible ≤ mínimo / productos activos",
      enlace: "/reportes/comparativo-sucursales",
      detalle: { en_quiebre: q.en_quiebre, productos: q.registros },
    },
    {
      codigo: "MERMA",
      nombre: "Tasa de merma",
      valor: redondear(porcentaje(b.valor_merma, promedio), 2),
      unidad: "%",
      descripcion: "Pérdidas, daños y vencimientos / inventario promedio",
      enlace: "/reportes/perdidas",
      detalle: { valor_merma: redondear(b.valor_merma), unidades_merma: Number(b.unidades_merma) },
    },
    {
      codigo: "EXACTITUD",
      nombre: "Exactitud del inventario",
      valor: redondear(porcentaje(ex.exactas, ex.lineas), 1),
      unidad: "%",
      descripcion: "Conteos sin diferencia / conteos realizados",
      enlace: "/inventarios",
      detalle: { lineas_contadas: ex.lineas, lineas_exactas: ex.exactas, inventarios: ex.inventarios },
    },
    {
      codigo: "VALOR_RIESGO_VENCIMIENTO",
      nombre: "Valor en riesgo por vencimiento",
      valor: redondear(r.valor),
      unidad: "Bs",
      descripcion: "Lotes que vencen en 30 días o menos",
      enlace: "/reportes/vencimientos-lotes",
      detalle: { lotes: r.lotes, unidades: Number(r.unidades) },
    },
    {
      codigo: "CUMPLIMIENTO_PROVEEDORES",
      nombre: "Cumplimiento de proveedores",
      valor: redondear(porcentaje(c.sin_diferencia, c.recepciones), 1),
      unidad: "%",
      descripcion: "Recepciones sin diferencia / recepciones",
      enlace: "/reportes/cumplimiento-proveedores",
      detalle: { recepciones: c.recepciones, sin_diferencia: c.sin_diferencia },
    },
  ];
}

async function calcularKpisPeriodo({ idAlmacen, desde, hasta }) {
  const dias = Math.round((Date.parse(hasta) - Date.parse(desde)) / 86400000) + 1;
  const [base, quiebre, exactitud, riesgo, cumplimiento] = await Promise.all([
    db.query(SQL_VALOR_Y_VENTAS, [idAlmacen, desde, hasta]),
    db.query(SQL_QUIEBRE, [idAlmacen]),
    db.query(SQL_EXACTITUD, [idAlmacen, desde, hasta]),
    db.query(SQL_RIESGO, [idAlmacen]),
    db.query(SQL_CUMPLIMIENTO, [idAlmacen, desde, hasta]),
  ]);
  return kpisDesdeConsultas({ base, quiebre, exactitud, riesgo, cumplimiento, dias });
}

const metaAplicable = (filas, codigo, idAlmacen) => {
  const deSucursal = filas.find((f) => f.codigo_kpi === codigo && f.id_almacen !== null && Number(f.id_almacen) === Number(idAlmacen));
  const global = filas.find((f) => f.codigo_kpi === codigo && f.id_almacen === null);
  const elegida = deSucursal || global;
  return elegida ? Number(elegida.meta) : null;
};

const guardarSnapshot = (idAlmacen, mes, kpi) => {
  if (idAlmacen === null) {
    return db.query(
      `INSERT INTO kpi_snapshot (anio, mes, id_almacen, codigo_kpi, valor)
       VALUES ($1, $2, NULL, $3, $4)
       ON CONFLICT (codigo_kpi, anio, mes) WHERE id_almacen IS NULL
       DO UPDATE SET valor = EXCLUDED.valor, calculado_en = CURRENT_TIMESTAMP`,
      [mes.anio, mes.mes, kpi.codigo, kpi.valor],
    );
  }
  return db.query(
    `INSERT INTO kpi_snapshot (anio, mes, id_almacen, codigo_kpi, valor)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (codigo_kpi, id_almacen, anio, mes) WHERE id_almacen IS NOT NULL
     DO UPDATE SET valor = EXCLUDED.valor, calculado_en = CURRENT_TIMESTAMP`,
    [mes.anio, mes.mes, idAlmacen, kpi.codigo, kpi.valor],
  );
};

// Agrega meta, semáforo y los 6 meses hasta el fin del período.
// Los meses ya cerrados se leen de la foto; el último se vuelve a calcular.
async function aplicarMetasYTendencia(kpis, { idAlmacen, hasta }) {
  const meses = mesesHasta(hasta, 6);
  const { rows: metas } = await db.query(
    `SELECT codigo_kpi, id_almacen, meta
     FROM kpi_meta
     WHERE id_almacen IS NULL OR id_almacen = $1`,
    [idAlmacen],
  );
  const { rows: fotos } = await db.query(
    `SELECT anio, mes, codigo_kpi, valor
     FROM kpi_snapshot
     WHERE id_almacen IS NOT DISTINCT FROM $1
       AND anio = ANY($2::int[])
       AND mes = ANY($3::int[])`,
    [idAlmacen, meses.map((m) => m.anio), meses.map((m) => m.mes)],
  );

  const tendencia = Object.fromEntries(kpis.map((k) => [k.codigo, []]));
  for (const [indice, mes] of meses.entries()) {
    const esUltimo = indice === meses.length - 1;
    const delMes = fotos.filter((f) => Number(f.anio) === mes.anio && Number(f.mes) === mes.mes);
    const completa = kpis.every((k) => delMes.some((f) => f.codigo_kpi === k.codigo));
    let valores;
    if (!esUltimo && completa) {
      valores = Object.fromEntries(delMes.map((f) => [f.codigo_kpi, f.valor === null ? null : Number(f.valor)]));
    } else {
      const calculados = await calcularKpisPeriodo({ idAlmacen, desde: mes.desde, hasta: mes.hasta });
      await Promise.all(calculados.map((kpi) => guardarSnapshot(idAlmacen, mes, kpi)));
      valores = Object.fromEntries(calculados.map((k) => [k.codigo, k.valor]));
    }
    for (const kpi of kpis) {
      tendencia[kpi.codigo].push({
        anio: mes.anio,
        mes: mes.mes,
        etiqueta: mes.etiqueta,
        valor: valores[kpi.codigo] ?? null,
      });
    }
  }

  return kpis.map((kpi) => {
    const definicion = DEFINICIONES_KPI[kpi.codigo];
    const meta = metaAplicable(metas, kpi.codigo, idAlmacen);
    return {
      ...kpi,
      sentido: definicion.sentido,
      meta,
      semaforo: calcularSemaforo(kpi.valor, meta, definicion.sentido),
      tendencia: tendencia[kpi.codigo],
    };
  });
}

async function guardarMetaKpi({ codigo, idAlmacen, meta, idUsuario }) {
  if (!DEFINICIONES_KPI[codigo]) {
    throw new ApiError(400, "El indicador no existe");
  }
  const valor = Number(meta);
  if (!Number.isFinite(valor) || valor < 0) {
    throw new ApiError(400, "La meta debe ser un número igual o mayor a 0");
  }

  if (idAlmacen === null) {
    await db.query(
      `INSERT INTO kpi_meta (codigo_kpi, id_almacen, meta, id_usuario)
       VALUES ($1, NULL, $2, $3)
       ON CONFLICT (codigo_kpi) WHERE id_almacen IS NULL
       DO UPDATE SET meta = EXCLUDED.meta, id_usuario = EXCLUDED.id_usuario,
                     actualizado_en = CURRENT_TIMESTAMP`,
      [codigo, valor, idUsuario],
    );
  } else {
    await db.query(
      `INSERT INTO kpi_meta (codigo_kpi, id_almacen, meta, id_usuario)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (codigo_kpi, id_almacen) WHERE id_almacen IS NOT NULL
       DO UPDATE SET meta = EXCLUDED.meta, id_usuario = EXCLUDED.id_usuario,
                     actualizado_en = CURRENT_TIMESTAMP`,
      [codigo, idAlmacen, valor, idUsuario],
    );
  }
  return { codigo, id_almacen: idAlmacen, meta: valor };
}

module.exports = {
  obtenerIndicadores,
  aplicarMetasYTendencia,
  guardarMetaKpi,
  calcularSemaforo,
  mesesHasta,
  DEFINICIONES_KPI,
};
