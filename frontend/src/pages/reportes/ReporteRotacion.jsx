import { useEffect, useState } from "react";
import Layout from "../../components/layout/Layout";
import Select from "../../components/ui/Select";
import BotonesExportar from "../../components/ui/BotonesExportar";
import { reporteRotacion } from "../../api/reportes.api";
import { listarAlmacenes, listarCategorias } from "../../api/catalogos.api";
import { formatearValor } from "../../utils/exportar";

// RF65: productos de alta y baja rotación para optimizar las compras.

const CLASES = {
  ALTA: { label: "Alta rotación", corto: "Alta", clase: "bg-green-100 text-green-800", icono: "▲" },
  MEDIA: { label: "Rotación media", corto: "Media", clase: "bg-blue-100 text-blue-800", icono: "■" },
  BAJA: { label: "Baja rotación", corto: "Baja", clase: "bg-amber-100 text-amber-800", icono: "▼" },
  SIN_MOVIMIENTO: { label: "Sin movimiento", corto: "Sin mov.", clase: "bg-red-100 text-red-700", icono: "✕" },
  SIN_STOCK: { label: "Sin stock", corto: "Sin stock", clase: "bg-gray-100 text-gray-600", icono: "○" },
};

const PERIODOS = [
  { value: "30", label: "Últimos 30 días" },
  { value: "90", label: "Últimos 90 días" },
  { value: "180", label: "Últimos 6 meses" },
  { value: "365", label: "Último año" },
];

const restarDias = (dias) => new Date(Date.now() - (dias - 1) * 86400000).toISOString().slice(0, 10);
const FILTROS_INICIALES = { periodo: "90", id_almacen: "", id_categoria: "", clasificacion: "" };

const COLUMNAS = [
  { key: "posicion", label: "#", tipo: "numero" },
  { key: "codigo", label: "Código" },
  { key: "producto", label: "Producto" },
  { key: "categoria", label: "Categoría" },
  { key: "clasificacion", label: "Clasificación", valor: (f) => CLASES[f.clasificacion]?.label },
  { key: "unidades_salida", label: "Unidades que salieron", tipo: "numero" },
  { key: "stock_promedio", label: "Stock promedio", tipo: "numero" },
  { key: "rotacion_periodo", label: "Rotación del período", tipo: "numero" },
  { key: "rotacion_mensual", label: "Rotación mensual", tipo: "numero" },
  { key: "dias_inventario", label: "Días de inventario", tipo: "numero" },
  { key: "valor_stock_promedio", label: "Valor stock promedio", tipo: "moneda" },
];

export default function ReporteRotacion() {
  const [filtros, setFiltros] = useState(FILTROS_INICIALES);
  const [datos, setDatos] = useState({ data: [], resumen: {}, periodo: {} });
  const [almacenes, setAlmacenes] = useState([]);
  const [categorias, setCategorias] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    listarAlmacenes().then((r) => setAlmacenes(r.data || [])).catch(() => setAlmacenes([]));
    listarCategorias().then((r) => setCategorias(r.data || [])).catch(() => setCategorias([]));
  }, []);

  useEffect(() => {
    let vigente = true;
    setLoading(true);
    setError("");
    const { periodo, ...resto } = filtros;
    const params = {
      fecha_desde: restarDias(Number(periodo)),
      ...Object.fromEntries(Object.entries(resto).filter(([, v]) => v !== "")),
    };
    reporteRotacion(params)
      .then((r) => vigente && setDatos(r))
      .catch((err) => vigente && setError(err.response?.data?.message || "Error al cargar la rotación"))
      .finally(() => vigente && setLoading(false));
    return () => {
      vigente = false;
    };
  }, [filtros]);

  const cambiar = (campo) => (e) => setFiltros({ ...filtros, [campo]: e.target.value });
  const r = datos.resumen || {};
  const maxRotacion = Math.max(...datos.data.map((f) => f.rotacion_mensual || 0), 0.0001);

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">Rotación de productos</h1>
            <p className="text-sm text-gray-500">
              Qué productos se mueven rápido y cuáles se quedan en el almacén (RF65)
            </p>
          </div>
          <BotonesExportar
            titulo="Reporte de rotación de productos"
            subtitulo={datos.periodo?.desde ? `Del ${datos.periodo.desde} al ${datos.periodo.hasta}` : ""}
            nombreArchivo="rotacion_productos"
            columnas={COLUMNAS}
            filas={datos.data}
            resumen={[
              { label: "Rotación mensual global", valor: r.rotacion_mensual_global, tipo: "numero" },
              { label: "Días de inventario", valor: r.dias_inventario_global, tipo: "numero" },
            ]}
          />
        </div>

        <div className="card">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-5">
            <Select label="Período" value={filtros.periodo} onChange={cambiar("periodo")} options={PERIODOS} placeholder="Elige" />
            <Select
              label="Almacén"
              value={filtros.id_almacen}
              onChange={cambiar("id_almacen")}
              options={almacenes.map((a) => ({ value: a.id_almacen, label: `${a.codigo} - ${a.nombre}` }))}
              placeholder="Todos"
            />
            <Select
              label="Categoría"
              value={filtros.id_categoria}
              onChange={cambiar("id_categoria")}
              options={categorias.map((c) => ({ value: c.id_categoria, label: c.nombre }))}
              placeholder="Todas"
            />
            <Select
              label="Clasificación"
              value={filtros.clasificacion}
              onChange={cambiar("clasificacion")}
              options={Object.entries(CLASES).map(([value, c]) => ({ value, label: c.label }))}
              placeholder="Todas"
            />
            <div className="flex items-end">
              <button className="btn-secondary w-full" onClick={() => setFiltros(FILTROS_INICIALES)}>
                Limpiar filtros
              </button>
            </div>
          </div>
        </div>

        {error && <p className="rounded bg-red-50 p-2 text-sm text-red-600">{error}</p>}

        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          <div className="rounded border border-gray-200 bg-white p-3">
            <p className="text-xs text-gray-600">Rotación mensual global</p>
            <p className="text-xl font-bold">
              {r.rotacion_mensual_global === null || r.rotacion_mensual_global === undefined
                ? "—"
                : `${formatearValor(r.rotacion_mensual_global, "numero")} veces`}
            </p>
            <p className="text-xs text-gray-500">
              {r.dias_inventario_global ? `${formatearValor(r.dias_inventario_global, "numero")} días de inventario` : ""}
            </p>
          </div>
          {["ALTA", "MEDIA", "BAJA", "SIN_MOVIMIENTO"].map((c) => (
            <button
              key={c}
              type="button"
              className={`rounded border p-3 text-left transition hover:border-brand-blue ${
                filtros.clasificacion === c ? "border-brand-blue bg-blue-50" : "border-gray-200 bg-white"
              }`}
              onClick={() => setFiltros({ ...filtros, clasificacion: filtros.clasificacion === c ? "" : c })}
              title="Filtrar por esta clasificación"
            >
              <p className="text-xs text-gray-600">
                <span className={`mr-1 rounded px-1 ${CLASES[c].clase}`}>{CLASES[c].icono}</span>
                {CLASES[c].label}
              </p>
              <p className="text-xl font-bold">{r[c === "SIN_MOVIMIENTO" ? "sin_movimiento" : c.toLowerCase()] ?? 0}</p>
              {c === "SIN_MOVIMIENTO" && (
                <p className="text-xs text-gray-500">{formatearValor(r.valor_sin_movimiento || 0, "moneda")} inmovilizados</p>
              )}
            </button>
          ))}
        </div>

        <div className="card">
          <h2 className="mb-1 font-semibold">Ranking por rotación</h2>
          <p className="mb-3 text-xs text-gray-500">
            Rotación = unidades que salieron (ventas y despachos) ÷ stock promedio. Días de inventario = cuántos días
            dura el stock al ritmo de salida del período.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm [&_td]:px-2 [&_th]:px-2">
              <thead>
                <tr className="border-b border-gray-200 text-left text-gray-500">
                  <th className="py-2">#</th>
                  <th className="py-2">Producto</th>
                  <th className="py-2">Clasificación</th>
                  <th className="w-1/5 py-2">Rotación mensual</th>
                  <th className="py-2 text-right">Salidas</th>
                  <th className="py-2 text-right">Stock promedio</th>
                  <th className="py-2 text-right">Días de inventario</th>
                  <th className="py-2 text-right">Valor stock prom.</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan="8" className="py-6 text-center text-gray-500">Calculando...</td>
                  </tr>
                ) : datos.data.length === 0 ? (
                  <tr>
                    <td colSpan="8" className="py-6 text-center text-gray-500">No hay productos con esos filtros</td>
                  </tr>
                ) : (
                  datos.data.map((f) => (
                    <tr key={f.id_producto} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="py-2 text-gray-500">{f.posicion}</td>
                      <td className="py-2">
                        <div className="font-medium">{f.producto}</div>
                        <div className="font-mono text-xs text-gray-500">
                          {f.codigo} · {f.categoria}
                        </div>
                      </td>
                      <td className="py-2">
                        <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold ${CLASES[f.clasificacion]?.clase}`}>
                          {CLASES[f.clasificacion]?.icono} {CLASES[f.clasificacion]?.corto}
                        </span>
                      </td>
                      <td className="py-2">
                        <div className="flex items-center gap-2">
                          <div className="h-2 flex-1 rounded bg-gray-100">
                            <div
                              className="h-2 rounded-r bg-[#2a78d6]"
                              style={{ width: `${((f.rotacion_mensual || 0) / maxRotacion) * 100}%` }}
                            />
                          </div>
                          <span className="w-12 text-right text-xs">
                            {f.rotacion_mensual === null ? "—" : formatearValor(f.rotacion_mensual, "numero")}
                          </span>
                        </div>
                      </td>
                      <td className="py-2 text-right">{formatearValor(f.unidades_salida, "numero")} {f.unidad}</td>
                      <td className="py-2 text-right">{formatearValor(f.stock_promedio, "numero")}</td>
                      <td className="py-2 text-right font-semibold">
                        {f.dias_inventario === null ? "—" : formatearValor(f.dias_inventario, "numero")}
                      </td>
                      <td className="py-2 text-right">{formatearValor(f.valor_stock_promedio, "moneda")}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </Layout>
  );
}
