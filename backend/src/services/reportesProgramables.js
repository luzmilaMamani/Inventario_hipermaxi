const db = require("../config/db");
const { obtenerIndicadores } = require("./indicadores");

// RF70: reportes que se pueden programar. Cada generador devuelve el contenido
// listo para el PDF: título, columnas tipadas, filas y un resumen.
// Parámetros comunes: id_almacen (opcional). Los reportes con período toman el
// tramo cubierto por la frecuencia (último día, semana o mes).

const hoy = () => new Date().toISOString().slice(0, 10);
const restarDias = (dias) => {
  const d = new Date();
  d.setDate(d.getDate() - dias);
  return d.toISOString().slice(0, 10);
};
const DIAS_POR_FRECUENCIA = { DIARIA: 1, SEMANAL: 7, MENSUAL: 30 };

const idAlmacenDe = (parametros) => {
  const id = Number(parametros?.id_almacen);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
};

async function nombreAlmacen(idAlmacen) {
  if (!idAlmacen) return "Todas las sucursales";
  const r = await db.query("SELECT nombre FROM almacenes WHERE id_almacen = $1", [idAlmacen]);
  return r.rows[0]?.nombre || `Almacén ${idAlmacen}`;
}

const TIPOS = {
  EXISTENCIAS: {
    nombre: "Existencias por almacén",
    async generar(parametros) {
      const idAlmacen = idAlmacenDe(parametros);
      const { rows } = await db.query(
        `SELECT producto_codigo, producto, categoria, almacen, cantidad_total,
                cantidad_reservada, cantidad_disponible, valor_total
         FROM vw_reporte_existencias
         WHERE estado_producto = 'ACTIVO' AND cantidad_total > 0
           AND ($1::int IS NULL OR id_almacen = $1)
         ORDER BY almacen, producto`,
        [idAlmacen],
      );
      const total = rows.reduce((s, f) => s + Number(f.valor_total), 0);
      return {
        titulo: "Reporte de existencias",
        subtitulo: await nombreAlmacen(idAlmacen),
        columnas: [
          { key: "producto_codigo", label: "Código", ancho: 60 },
          { key: "producto", label: "Producto", ancho: 150 },
          { key: "almacen", label: "Almacén", ancho: 95 },
          { key: "cantidad_total", label: "Total", tipo: "numero" },
          { key: "cantidad_reservada", label: "Reserv.", tipo: "numero" },
          { key: "cantidad_disponible", label: "Disp.", tipo: "numero" },
          { key: "valor_total", label: "Valor", tipo: "moneda", ancho: 75 },
        ],
        filas: rows,
        resumen: [
          { label: "Registros", valor: rows.length, tipo: "numero" },
          { label: "Valor total", valor: total, tipo: "moneda" },
        ],
      };
    },
  },

  INDICADORES: {
    nombre: "Indicadores del inventario (KPIs)",
    async generar(parametros, { frecuencia }) {
      const idAlmacen = idAlmacenDe(parametros);
      const desde = restarDias((DIAS_POR_FRECUENCIA[frecuencia] || 30) - 1);
      const data = await obtenerIndicadores({ idAlmacen, desde, hasta: hoy() });
      return {
        titulo: "Indicadores del inventario",
        subtitulo: `${await nombreAlmacen(idAlmacen)} · del ${desde} al ${hoy()}`,
        columnas: [
          { key: "nombre", label: "Indicador", ancho: 200 },
          { key: "valor_texto", label: "Valor", ancho: 110 },
          { key: "descripcion", label: "Cómo se calcula", ancho: 200 },
        ],
        filas: data.kpis.map((k) => ({
          ...k,
          valor_texto:
            k.valor === null ? "Sin datos" : k.unidad === "Bs" ? `Bs ${k.valor.toFixed(2)}` : `${k.valor} ${k.unidad}`,
        })),
        resumen: [],
      };
    },
  },

  STOCK_BAJO: {
    nombre: "Productos con stock bajo",
    async generar(parametros) {
      const idAlmacen = idAlmacenDe(parametros);
      const { rows } = await db.query(
        `SELECT producto_codigo, producto, almacen, cantidad_disponible,
                stock_minimo, punto_reposicion, cantidad_sugerida
         FROM vw_reporte_stock_bajo
         WHERE ($1::int IS NULL OR id_almacen = $1)
         ORDER BY bajo_minimo DESC, cantidad_disponible ASC, producto ASC`,
        [idAlmacen],
      );
      return {
        titulo: "Productos con stock bajo",
        subtitulo: await nombreAlmacen(idAlmacen),
        columnas: [
          { key: "producto_codigo", label: "Código", ancho: 60 },
          { key: "producto", label: "Producto", ancho: 140 },
          { key: "almacen", label: "Almacén", ancho: 90 },
          { key: "cantidad_disponible", label: "Disp.", tipo: "numero" },
          { key: "stock_minimo", label: "Mínimo", tipo: "numero" },
          { key: "punto_reposicion", label: "Reposición", tipo: "numero" },
          { key: "cantidad_sugerida", label: "A reponer", tipo: "numero" },
        ],
        filas: rows,
        resumen: [{ label: "Productos a reponer", valor: rows.length, tipo: "numero" }],
      };
    },
  },

  PERDIDAS: {
    nombre: "Pérdidas, daños y vencimientos",
    async generar(parametros, { frecuencia }) {
      const idAlmacen = idAlmacenDe(parametros);
      const desde = restarDias((DIAS_POR_FRECUENCIA[frecuencia] || 30) - 1);
      const { rows } = await db.query(
        `SELECT s.numero_salida, TO_CHAR(s.fecha_salida, 'YYYY-MM-DD') AS fecha, s.motivo,
                a.nombre AS almacen, p.nombre AS producto, ds.cantidad,
                (ds.cantidad * ds.precio_unitario) AS valor
         FROM salidas_inventario s
         INNER JOIN detalle_salidas ds ON ds.id_salida = s.id_salida
         INNER JOIN productos p ON p.id_producto = ds.id_producto
         INNER JOIN almacenes a ON a.id_almacen = s.id_almacen
         WHERE s.motivo IN ('PERDIDA', 'DANO', 'VENCIMIENTO')
           AND s.fecha_salida >= $2::date
           AND ($1::int IS NULL OR s.id_almacen = $1)
         ORDER BY s.fecha_salida DESC`,
        [idAlmacen, desde],
      );
      return {
        titulo: "Pérdidas, daños y vencimientos",
        subtitulo: `${await nombreAlmacen(idAlmacen)} · desde ${desde}`,
        columnas: [
          { key: "fecha", label: "Fecha", ancho: 65 },
          { key: "motivo", label: "Tipo", ancho: 75 },
          { key: "almacen", label: "Almacén", ancho: 95 },
          { key: "producto", label: "Producto", ancho: 150 },
          { key: "cantidad", label: "Cant.", tipo: "numero" },
          { key: "valor", label: "Valor", tipo: "moneda", ancho: 70 },
        ],
        filas: rows,
        resumen: [
          { label: "Registros", valor: rows.length, tipo: "numero" },
          { label: "Valor perdido", valor: rows.reduce((s, f) => s + Number(f.valor), 0), tipo: "moneda" },
        ],
      };
    },
  },

  VENCIMIENTOS_LOTES: {
    nombre: "Lotes vencidos y por vencer (30 días)",
    async generar(parametros) {
      const idAlmacen = idAlmacenDe(parametros);
      const { rows } = await db.query(
        `SELECT p.nombre AS producto, lp.numero_lote, a.nombre AS almacen,
                TO_CHAR(lp.fecha_vencimiento, 'YYYY-MM-DD') AS fecha_vencimiento,
                (lp.fecha_vencimiento - CURRENT_DATE)::int AS dias_restantes,
                lp.cantidad_actual, lp.cantidad_actual * COALESCE(p.precio, 0) AS valor
         FROM lotes_productos lp
         INNER JOIN productos p ON p.id_producto = lp.id_producto
         INNER JOIN almacenes a ON a.id_almacen = lp.id_almacen
         WHERE lp.cantidad_actual > 0
           AND lp.fecha_vencimiento <= CURRENT_DATE + 30
           AND ($1::int IS NULL OR lp.id_almacen = $1)
         ORDER BY lp.fecha_vencimiento, p.nombre`,
        [idAlmacen],
      );
      return {
        titulo: "Lotes vencidos y próximos a vencer",
        subtitulo: await nombreAlmacen(idAlmacen),
        columnas: [
          { key: "producto", label: "Producto", ancho: 140 },
          { key: "numero_lote", label: "Lote", ancho: 70 },
          { key: "almacen", label: "Almacén", ancho: 95 },
          { key: "fecha_vencimiento", label: "Vence", ancho: 65 },
          { key: "dias_restantes", label: "Días", tipo: "numero" },
          { key: "cantidad_actual", label: "Cant.", tipo: "numero" },
          { key: "valor", label: "Valor", tipo: "moneda", ancho: 70 },
        ],
        filas: rows,
        resumen: [
          { label: "Lotes vencidos", valor: rows.filter((f) => f.dias_restantes <= 0).length, tipo: "numero" },
          { label: "Valor en riesgo", valor: rows.reduce((s, f) => s + Number(f.valor), 0), tipo: "moneda" },
        ],
      };
    },
  },
};

const tiposDisponibles = () =>
  Object.entries(TIPOS).map(([codigo, tipo]) => ({ codigo, nombre: tipo.nombre }));

async function generarReporte(tipoReporte, parametros = {}, contexto = {}) {
  const tipo = TIPOS[tipoReporte];
  if (!tipo) throw new Error(`Tipo de reporte no soportado: ${tipoReporte}`);
  return tipo.generar(parametros, contexto);
}

module.exports = { TIPOS, tiposDisponibles, generarReporte };
