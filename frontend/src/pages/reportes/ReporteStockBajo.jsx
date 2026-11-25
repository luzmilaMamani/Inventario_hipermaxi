import { useEffect, useMemo, useState } from "react";
import Layout from "../../components/layout/Layout";
import Select from "../../components/ui/Select";
import BotonesExportar from "../../components/ui/BotonesExportar";
import Pagination from "../../components/ui/Pagination";
import { reporteStockBajo } from "../../api/reportes.api";
import { listarAlmacenes, listarCategorias } from "../../api/catalogos.api";
import { formatearValor } from "../../utils/exportar";

const FILTROS_INICIALES = {
  id_almacen: "",
  id_categoria: "",
  nivel: "",
};

const NIVELES = [
  { value: "BAJO_MINIMO", label: "Bajo el mínimo" },
  { value: "PUNTO_REPOSICION", label: "En punto de reposición" },
];

const etiquetaNivel = (fila) => {
  if (fila.bajo_minimo && fila.en_punto_reposicion) return "Bajo el mínimo y en punto de reposición";
  if (fila.bajo_minimo) return "Bajo el mínimo";
  return "En punto de reposición";
};

const COLUMNAS = [
  { key: "producto_codigo", label: "Código" },
  { key: "producto", label: "Producto" },
  { key: "categoria", label: "Categoría" },
  { key: "almacen", label: "Almacén" },
  { key: "unidad", label: "Unidad" },
  { key: "cantidad_disponible", label: "Disponible", tipo: "numero" },
  { key: "stock_minimo", label: "Mínimo", tipo: "numero" },
  { key: "punto_reposicion", label: "Punto de reposición", tipo: "numero" },
  { key: "stock_maximo", label: "Máximo", tipo: "numero" },
  { key: "cantidad_sugerida", label: "A reponer", tipo: "numero" },
  { key: "nivel", label: "Nivel", valor: etiquetaNivel },
];

const RESUMEN_VACIO = {
  registros: 0,
  bajo_minimo: 0,
  en_punto_reposicion: 0,
  cantidad_sugerida: 0,
};

export default function ReporteStockBajo() {
  const [filtros, setFiltros] = useState(FILTROS_INICIALES);
  const [registros, setRegistros] = useState([]);
  const [resumen, setResumen] = useState(RESUMEN_VACIO);
  const [almacenes, setAlmacenes] = useState([]);
  const [categorias, setCategorias] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ page: 1, limit: 100, total: 0 });

  useEffect(() => {
    listarAlmacenes().then((r) => setAlmacenes(r.data || [])).catch(() => setAlmacenes([]));
    listarCategorias().then((r) => setCategorias(r.data || [])).catch(() => setCategorias([]));
  }, []);

  useEffect(() => {
    let vigente = true;
    setLoading(true);
    setError("");
    const params = Object.fromEntries(Object.entries(filtros).filter(([, v]) => v !== ""));
    reporteStockBajo({ ...params, page, limit: 100 })
      .then((data) => {
        if (!vigente) return;
        setRegistros(data.data || []);
        setPagination(data.pagination || { page: 1, limit: 100, total: 0 });
        setResumen(data.resumen || RESUMEN_VACIO);
      })
      .catch((err) => {
        if (vigente) setError(err.response?.data?.message || "Error al cargar el reporte");
      })
      .finally(() => {
        if (vigente) setLoading(false);
      });
    return () => {
      vigente = false;
    };
  }, [filtros, page]);

  const cambiar = (campo) => (e) => {
    setFiltros({ ...filtros, [campo]: e.target.value });
    setPage(1);
  };

  const paramsExportar = Object.fromEntries(Object.entries(filtros).filter(([, v]) => v !== ""));

  const subtitulo = useMemo(() => {
    const partes = [];
    if (filtros.id_almacen) {
      const almacen = almacenes.find((a) => String(a.id_almacen) === String(filtros.id_almacen));
      partes.push(`Almacén: ${almacen ? almacen.nombre : filtros.id_almacen}`);
    }
    if (filtros.id_categoria) {
      const categoria = categorias.find((c) => String(c.id_categoria) === String(filtros.id_categoria));
      partes.push(`Categoría: ${categoria ? categoria.nombre : filtros.id_categoria}`);
    }
    const nivel = NIVELES.find((n) => n.value === filtros.nivel);
    if (nivel) partes.push(nivel.label);
    return partes.length ? partes.join(" · ") : "Todos los almacenes y categorías";
  }, [filtros, almacenes, categorias]);

  const tarjetas = [
    { label: "Productos a reponer", valor: resumen.registros, tipo: "numero", color: "blue" },
    { label: "Bajo el mínimo", valor: resumen.bajo_minimo, tipo: "numero", color: "red" },
    { label: "En punto de reposición", valor: resumen.en_punto_reposicion, tipo: "numero", color: "amber" },
    { label: "Unidades sugeridas", valor: resumen.cantidad_sugerida, tipo: "numero", color: "green" },
  ];
  const COLORES = {
    blue: "bg-blue-50 border-blue-100 text-blue-700",
    red: "bg-red-50 border-red-100 text-red-700",
    amber: "bg-amber-50 border-amber-100 text-amber-700",
    green: "bg-green-50 border-green-100 text-green-700",
  };

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">Reporte de stock bajo</h1>
            <p className="text-sm text-gray-500">
              Productos cuya cantidad disponible llegó al mínimo o al punto de reposición, para saber qué comprar.
            </p>
          </div>
          <BotonesExportar
            titulo="Reporte de stock bajo"
            subtitulo={subtitulo}
            nombreArchivo="stock-bajo"
            columnas={COLUMNAS}
            filas={registros}
            cargarFilas={() => reporteStockBajo({ ...paramsExportar, todos: "true" }).then((r) => r.data)}
            resumen={tarjetas}
          />
        </div>

        <div className="card">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
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
              label="Nivel"
              value={filtros.nivel}
              onChange={cambiar("nivel")}
              options={NIVELES}
              placeholder="Mínimo o reposición"
            />
            <div className="flex items-end">
              <button
                type="button"
                className="btn-secondary w-full"
                onClick={() => {
                  setFiltros(FILTROS_INICIALES);
                  setPage(1);
                }}
              >
                Limpiar filtros
              </button>
            </div>
          </div>
          <p className="mt-3 text-xs text-gray-500">
            Un mínimo o un punto de reposición en 0 no se toma en cuenta. La cantidad a reponer es lo que falta
            para llegar al stock máximo; si el máximo es 0, hasta el mayor umbral configurado.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {tarjetas.map((t) => (
            <div key={t.label} className={`rounded border p-3 ${COLORES[t.color]}`}>
              <p className="text-xs text-gray-600">{t.label}</p>
              <p className="text-xl font-bold">{formatearValor(t.valor || 0, t.tipo)}</p>
            </div>
          ))}
        </div>

        {error && <p className="rounded bg-red-50 p-2 text-sm text-red-600">{error}</p>}

        <div className="card">
          <h2 className="mb-3 font-semibold">Productos a reponer</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-left text-gray-500">
                  <th className="py-2 pr-3">Producto</th>
                  <th className="py-2 pr-3">Categoría</th>
                  <th className="py-2 pr-3">Almacén</th>
                  <th className="py-2 pr-3 text-right">Disponible</th>
                  <th className="py-2 pr-3 text-right">Mínimo</th>
                  <th className="py-2 pr-3 text-right">Reposición</th>
                  <th className="py-2 pr-3 text-right">A reponer</th>
                  <th className="py-2">Nivel</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan="8" className="py-6 text-center text-gray-500">
                      Cargando...
                    </td>
                  </tr>
                ) : registros.length === 0 ? (
                  <tr>
                    <td colSpan="8" className="py-6 text-center text-gray-500">
                      No hay productos con stock bajo para esos filtros
                    </td>
                  </tr>
                ) : (
                  registros.map((r) => (
                    <tr key={r.id_stock} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="py-2 pr-3">
                        <div className="font-medium">{r.producto}</div>
                        <div className="font-mono text-xs text-gray-500">{r.producto_codigo}</div>
                      </td>
                      <td className="py-2 pr-3">{r.categoria}</td>
                      <td className="py-2 pr-3">{r.almacen}</td>
                      <td className="py-2 pr-3 text-right font-semibold text-amber-700">
                        {formatearValor(r.cantidad_disponible, "numero")} {r.unidad}
                      </td>
                      <td className="py-2 pr-3 text-right">{formatearValor(r.stock_minimo, "numero")}</td>
                      <td className="py-2 pr-3 text-right">{formatearValor(r.punto_reposicion, "numero")}</td>
                      <td className="py-2 pr-3 text-right font-semibold">
                        {formatearValor(r.cantidad_sugerida, "numero")}
                      </td>
                      <td className="py-2">
                        <div className="flex flex-wrap gap-1">
                          {r.bajo_minimo && (
                            <span className="rounded bg-red-100 px-2 py-1 text-xs font-semibold text-red-800">
                              Bajo el mínimo
                            </span>
                          )}
                          {r.en_punto_reposicion && (
                            <span className="rounded bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-800">
                              Punto de reposición
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <Pagination page={pagination.page} limit={pagination.limit} total={pagination.total} onChange={setPage} />
        </div>
      </div>
    </Layout>
  );
}
