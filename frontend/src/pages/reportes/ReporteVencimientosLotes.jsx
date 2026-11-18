import { useEffect, useState } from "react";
import Layout from "../../components/layout/Layout";
import Select from "../../components/ui/Select";
import BotonesExportar from "../../components/ui/BotonesExportar";
import { reporteVencimientosLotes } from "../../api/reportes.api";
import { listarAlmacenes, listarCategorias } from "../../api/catalogos.api";
import { formatearValor } from "../../utils/exportar";

// RF63: lotes vencidos y próximos a vencer, separados y valorizados, para
// planificar promociones o bajas.

const RANGOS = [
  { value: "7", label: "Próximos 7 días" },
  { value: "15", label: "Próximos 15 días" },
  { value: "30", label: "Próximos 30 días" },
  { value: "60", label: "Próximos 60 días" },
  { value: "90", label: "Próximos 90 días" },
];

const FILTROS_INICIALES = { dias: "30", id_almacen: "", id_categoria: "" };
const RESUMEN_VACIO = { lotes: 0, unidades: 0, valor: 0 };

const columnas = (vencido) => [
  { key: "estado", label: "Estado", valor: () => (vencido ? "Vencido" : "Por vencer") },
  { key: "producto_codigo", label: "Código" },
  { key: "producto", label: "Producto" },
  { key: "categoria", label: "Categoría" },
  { key: "numero_lote", label: "Lote" },
  { key: "almacen", label: "Almacén" },
  { key: "fecha_vencimiento", label: "Vence" },
  {
    key: "dias_restantes",
    label: vencido ? "Días vencido" : "Días restantes",
    tipo: "numero",
    valor: (f) => (vencido ? Math.abs(f.dias_restantes) : f.dias_restantes),
  },
  { key: "cantidad", label: "Cantidad", tipo: "numero" },
  { key: "valor", label: "Valor", tipo: "moneda" },
];

function TablaLotes({ titulo, filas, vencido, loading, vacio }) {
  return (
    <div className="card">
      <h2 className={`mb-3 font-semibold ${vencido ? "text-red-700" : "text-amber-700"}`}>{titulo}</h2>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-left text-gray-500">
              <th className="py-2">Producto</th>
              <th className="py-2">Lote</th>
              <th className="py-2">Almacén</th>
              <th className="py-2">Vence</th>
              <th className="py-2 text-right">{vencido ? "Días vencido" : "Días restantes"}</th>
              <th className="py-2 text-right">Cantidad</th>
              <th className="py-2 text-right">Valor</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan="7" className="py-6 text-center text-gray-500">Cargando...</td>
              </tr>
            ) : filas.length === 0 ? (
              <tr>
                <td colSpan="7" className="py-6 text-center text-gray-500">{vacio}</td>
              </tr>
            ) : (
              filas.map((f) => {
                const dias = vencido ? Math.abs(f.dias_restantes) : f.dias_restantes;
                const urgente = !vencido && f.dias_restantes <= 7;
                return (
                  <tr key={f.id_lote} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="py-2">
                      <div className="font-medium">{f.producto}</div>
                      <div className="font-mono text-xs text-gray-500">
                        {f.producto_codigo} · {f.categoria}
                      </div>
                    </td>
                    <td className="py-2 font-mono text-xs">{f.numero_lote}</td>
                    <td className="py-2">{f.almacen}</td>
                    <td className="py-2">{formatearValor(`${f.fecha_vencimiento}T00:00:00`, "fecha")}</td>
                    <td className="py-2 text-right">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                          vencido ? "bg-red-100 text-red-700" : urgente ? "bg-amber-100 text-amber-800" : "bg-gray-100 text-gray-700"
                        }`}
                      >
                        {vencido && dias === 0 ? "Vence hoy" : `${dias} ${dias === 1 ? "día" : "días"}`}
                      </span>
                    </td>
                    <td className="py-2 text-right">
                      {formatearValor(f.cantidad, "numero")} {f.unidad}
                    </td>
                    <td className="py-2 text-right font-semibold">{formatearValor(f.valor, "moneda")}</td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function ReporteVencimientosLotes() {
  const [filtros, setFiltros] = useState(FILTROS_INICIALES);
  const [vencidos, setVencidos] = useState([]);
  const [proximos, setProximos] = useState([]);
  const [resumen, setResumen] = useState({ vencidos: RESUMEN_VACIO, proximos: RESUMEN_VACIO });
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
    const params = Object.fromEntries(Object.entries(filtros).filter(([, v]) => v !== ""));
    reporteVencimientosLotes(params)
      .then((data) => {
        if (!vigente) return;
        setVencidos(data.vencidos || []);
        setProximos(data.proximos || []);
        setResumen(data.resumen || { vencidos: RESUMEN_VACIO, proximos: RESUMEN_VACIO });
      })
      .catch((err) => vigente && setError(err.response?.data?.message || "Error al cargar el reporte"))
      .finally(() => vigente && setLoading(false));
    return () => {
      vigente = false;
    };
  }, [filtros]);

  const cambiar = (campo) => (e) => setFiltros({ ...filtros, [campo]: e.target.value });
  const filasExportar = [
    ...vencidos.map((f) => ({ ...f, _vencido: true })),
    ...proximos.map((f) => ({ ...f, _vencido: false })),
  ];
  const columnasExportar = columnas(false).map((c) =>
    c.key === "estado"
      ? { ...c, valor: (f) => (f._vencido ? "Vencido" : "Por vencer") }
      : c.key === "dias_restantes"
        ? { ...c, label: "Días (negativo = vencido)", valor: (f) => f.dias_restantes }
        : c,
  );

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">Vencimientos por lote</h1>
            <p className="text-sm text-gray-500">
              Lotes vencidos y próximos a vencer, con su valor, para planificar promociones o bajas (RF63)
            </p>
          </div>
          <BotonesExportar
            titulo="Reporte de vencimientos por lote"
            subtitulo={RANGOS.find((r) => r.value === filtros.dias)?.label}
            nombreArchivo="vencimientos_lotes"
            columnas={columnasExportar}
            filas={filasExportar}
            resumen={[
              { label: "Vencidos", valor: resumen.vencidos.valor, tipo: "moneda" },
              { label: "Por vencer", valor: resumen.proximos.valor, tipo: "moneda" },
            ]}
          />
        </div>

        <div className="card">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
            <Select label="Rango" value={filtros.dias} onChange={cambiar("dias")} options={RANGOS} placeholder="Elige" />
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
            <div className="flex items-end">
              <button className="btn-secondary w-full" onClick={() => setFiltros(FILTROS_INICIALES)}>
                Limpiar filtros
              </button>
            </div>
          </div>
        </div>

        {error && <p className="rounded bg-red-50 p-2 text-sm text-red-600">{error}</p>}

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div className="rounded border border-red-100 bg-red-50 p-4">
            <p className="text-sm font-medium text-red-800">Vencidos (pendientes de baja)</p>
            <p className="mt-1 text-2xl font-bold text-red-700">{formatearValor(resumen.vencidos.valor, "moneda")}</p>
            <p className="text-xs text-gray-600">
              {resumen.vencidos.lotes} lotes · {formatearValor(resumen.vencidos.unidades, "numero")} unidades
            </p>
          </div>
          <div className="rounded border border-amber-100 bg-amber-50 p-4">
            <p className="text-sm font-medium text-amber-800">
              Por vencer · {RANGOS.find((r) => r.value === filtros.dias)?.label.toLowerCase()}
            </p>
            <p className="mt-1 text-2xl font-bold text-amber-700">{formatearValor(resumen.proximos.valor, "moneda")}</p>
            <p className="text-xs text-gray-600">
              {resumen.proximos.lotes} lotes · {formatearValor(resumen.proximos.unidades, "numero")} unidades
            </p>
          </div>
        </div>

        <TablaLotes
          titulo="Lotes vencidos"
          filas={vencidos}
          vencido
          loading={loading}
          vacio="No hay lotes vencidos con stock"
        />
        <TablaLotes
          titulo="Lotes próximos a vencer"
          filas={proximos}
          loading={loading}
          vacio="Ningún lote vence en este rango"
        />
      </div>
    </Layout>
  );
}
