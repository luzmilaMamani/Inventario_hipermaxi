import { useEffect, useState } from "react";
import Layout from "../../components/layout/Layout";
import BotonesExportar from "../../components/ui/BotonesExportar";
import { reporteCumplimientoProveedores } from "../../api/reportes.api";
import { formatearValor } from "../../utils/exportar";

// RF69: diferencias en recepciones por proveedor para evaluar su cumplimiento.

const FILTROS_INICIALES = { fecha_desde: "", fecha_hasta: "", proveedor: "" };

function nivel(porcentaje) {
  if (porcentaje === null || porcentaje === undefined) return { clase: "bg-gray-100 text-gray-600", texto: "Sin datos" };
  if (porcentaje >= 90) return { clase: "bg-green-100 text-green-700", texto: "Cumple" };
  if (porcentaje >= 70) return { clase: "bg-amber-100 text-amber-800", texto: "Regular" };
  return { clase: "bg-red-100 text-red-700", texto: "Bajo" };
}

const COLUMNAS_PROVEEDOR = [
  { key: "proveedor", label: "Proveedor" },
  { key: "recepciones", label: "Recepciones", tipo: "numero" },
  { key: "sin_diferencia", label: "Sin diferencia", tipo: "numero" },
  { key: "con_diferencia", label: "Con diferencia", tipo: "numero" },
  { key: "porcentaje_cumplimiento", label: "% cumplimiento", tipo: "porcentaje" },
  { key: "unidades_solicitadas", label: "Unid. solicitadas", tipo: "numero" },
  { key: "unidades_recibidas", label: "Unid. recibidas", tipo: "numero" },
  { key: "unidades_faltantes", label: "Faltantes", tipo: "numero" },
  { key: "unidades_sobrantes", label: "Sobrantes", tipo: "numero" },
  { key: "porcentaje_entrega", label: "% entrega", tipo: "porcentaje" },
];

const COLUMNAS_DIFERENCIA = [
  { key: "numero_entrada", label: "Recepción" },
  { key: "fecha_entrada", label: "Fecha", tipo: "fecha" },
  { key: "proveedor", label: "Proveedor" },
  { key: "almacen", label: "Almacén" },
  { key: "producto", label: "Producto" },
  { key: "cantidad_solicitada", label: "Solicitada", tipo: "numero" },
  { key: "cantidad_recibida", label: "Recibida", tipo: "numero" },
  { key: "diferencia", label: "Diferencia", tipo: "numero" },
  { key: "tipo", label: "Tipo" },
  { key: "valor_diferencia", label: "Valor", tipo: "moneda" },
  { key: "observaciones", label: "Observación" },
];

export default function ReporteCumplimientoProveedores() {
  const [filtros, setFiltros] = useState(FILTROS_INICIALES);
  const [datos, setDatos] = useState({ resumen: {}, por_proveedor: [], diferencias: [] });
  const [seleccionado, setSeleccionado] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (filtros.fecha_desde && filtros.fecha_hasta && filtros.fecha_desde > filtros.fecha_hasta) return undefined;
    let vigente = true;
    setLoading(true);
    setError("");
    const params = Object.fromEntries(Object.entries(filtros).filter(([, v]) => v !== ""));
    reporteCumplimientoProveedores(params)
      .then((r) => vigente && setDatos(r))
      .catch((err) => vigente && setError(err.response?.data?.message || "Error al cargar el reporte"))
      .finally(() => vigente && setLoading(false));
    return () => {
      vigente = false;
    };
  }, [filtros]);

  const cambiar = (campo) => (e) => setFiltros({ ...filtros, [campo]: e.target.value });
  const diferencias = seleccionado ? datos.diferencias.filter((d) => d.proveedor === seleccionado) : datos.diferencias;
  const r = datos.resumen || {};

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">Cumplimiento de proveedores</h1>
            <p className="text-sm text-gray-500">
              Diferencias en las recepciones de cada proveedor (RF69)
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <BotonesExportar
              titulo="Cumplimiento de proveedores"
              subtitulo={
                filtros.fecha_desde || filtros.fecha_hasta
                  ? `Del ${filtros.fecha_desde || "inicio"} al ${filtros.fecha_hasta || "hoy"}`
                  : "Todo el período"
              }
              nombreArchivo="cumplimiento_proveedores"
              columnas={COLUMNAS_PROVEEDOR}
              filas={datos.por_proveedor}
              resumen={[
                { label: "Recepciones", valor: r.recepciones, tipo: "numero" },
                { label: "% cumplimiento", valor: r.porcentaje_cumplimiento, tipo: "porcentaje" },
              ]}
            />
          </div>
        </div>

        <div className="card">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
            <div>
              <label className="mb-1 block text-sm font-medium">Desde</label>
              <input type="date" className="input-field" value={filtros.fecha_desde} onChange={cambiar("fecha_desde")} />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Hasta</label>
              <input type="date" className="input-field" value={filtros.fecha_hasta} onChange={cambiar("fecha_hasta")} />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Proveedor</label>
              <select className="input-field" value={filtros.proveedor} onChange={cambiar("proveedor")}>
                <option value="">Todos</option>
                {[...new Set(datos.por_proveedor.map((p) => p.proveedor).concat(filtros.proveedor ? [filtros.proveedor] : []))]
                  .sort()
                  .map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
              </select>
            </div>
            <div className="flex items-end">
              <button
                className="btn-secondary w-full"
                onClick={() => {
                  setFiltros(FILTROS_INICIALES);
                  setSeleccionado("");
                }}
              >
                Limpiar filtros
              </button>
            </div>
          </div>
        </div>

        {error && <p className="rounded bg-red-50 p-2 text-sm text-red-600">{error}</p>}

        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <div className="rounded border border-blue-100 bg-blue-50 p-3">
            <p className="text-xs text-gray-600">Proveedores</p>
            <p className="text-xl font-bold text-blue-700">{r.proveedores || 0}</p>
          </div>
          <div className="rounded border border-gray-200 bg-white p-3">
            <p className="text-xs text-gray-600">Recepciones</p>
            <p className="text-xl font-bold">{r.recepciones || 0}</p>
          </div>
          <div className="rounded border border-green-100 bg-green-50 p-3">
            <p className="text-xs text-gray-600">Sin diferencia</p>
            <p className="text-xl font-bold text-green-700">{r.sin_diferencia || 0}</p>
          </div>
          <div className="rounded border border-purple-100 bg-purple-50 p-3">
            <p className="text-xs text-gray-600">Cumplimiento general</p>
            <p className="text-xl font-bold text-purple-700">
              {r.porcentaje_cumplimiento === null || r.porcentaje_cumplimiento === undefined
                ? "—"
                : formatearValor(r.porcentaje_cumplimiento, "porcentaje")}
            </p>
          </div>
        </div>

        <div className="card">
          <h2 className="mb-1 font-semibold">Por proveedor</h2>
          <p className="mb-3 text-xs text-gray-500">
            Cumplimiento = recepciones sin diferencia ÷ recepciones. Entrega = unidades recibidas ÷ solicitadas. Haz
            clic en un proveedor para ver sus diferencias.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm [&_td]:px-2 [&_th]:px-2">
              <thead>
                <tr className="border-b border-gray-200 text-left text-gray-500">
                  <th className="py-2">Proveedor</th>
                  <th className="py-2 text-right">Recepciones</th>
                  <th className="py-2 text-right">Con diferencia</th>
                  <th className="w-1/4 py-2">Cumplimiento</th>
                  <th className="py-2 text-right">Faltantes</th>
                  <th className="py-2 text-right">Sobrantes</th>
                  <th className="py-2 text-right">% entrega</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan="7" className="py-6 text-center text-gray-500">Cargando...</td>
                  </tr>
                ) : datos.por_proveedor.length === 0 ? (
                  <tr>
                    <td colSpan="7" className="py-6 text-center text-gray-500">No hay recepciones con esos filtros</td>
                  </tr>
                ) : (
                  datos.por_proveedor.map((p) => {
                    const n = nivel(Number(p.porcentaje_cumplimiento));
                    const activo = seleccionado === p.proveedor;
                    return (
                      <tr
                        key={p.proveedor}
                        className={`cursor-pointer border-b border-gray-100 hover:bg-gray-50 ${activo ? "bg-blue-50" : ""}`}
                        onClick={() => setSeleccionado(activo ? "" : p.proveedor)}
                      >
                        <td className="py-2 font-medium">{p.proveedor}</td>
                        <td className="py-2 text-right">{p.recepciones}</td>
                        <td className="py-2 text-right">{p.con_diferencia}</td>
                        <td className="py-2">
                          <div className="flex items-center gap-2">
                            <div className="h-2 flex-1 rounded bg-gray-100">
                              <div className="h-2 rounded-r bg-[#2a78d6]" style={{ width: `${Number(p.porcentaje_cumplimiento) || 0}%` }} />
                            </div>
                            <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold ${n.clase}`}>
                              {formatearValor(p.porcentaje_cumplimiento, "porcentaje")} · {n.texto}
                            </span>
                          </div>
                        </td>
                        <td className="py-2 text-right">{formatearValor(p.unidades_faltantes, "numero")}</td>
                        <td className="py-2 text-right">{formatearValor(p.unidades_sobrantes, "numero")}</td>
                        <td className="py-2 text-right">{formatearValor(p.porcentaje_entrega, "porcentaje")}</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="card">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-semibold">
              Detalle de diferencias {seleccionado ? `· ${seleccionado}` : ""} ({diferencias.length})
            </h2>
            <BotonesExportar
              titulo="Diferencias en recepciones"
              subtitulo={seleccionado || "Todos los proveedores"}
              nombreArchivo="diferencias_recepciones"
              columnas={COLUMNAS_DIFERENCIA}
              filas={diferencias}
            />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm [&_td]:px-2 [&_th]:px-2">
              <thead>
                <tr className="border-b border-gray-200 text-left text-gray-500">
                  <th className="py-2">Recepción</th>
                  <th className="py-2">Proveedor</th>
                  <th className="py-2">Producto</th>
                  <th className="py-2 text-right">Solicitada</th>
                  <th className="py-2 text-right">Recibida</th>
                  <th className="py-2 text-right">Diferencia</th>
                  <th className="py-2 text-right">Valor</th>
                  <th className="py-2">Observación</th>
                </tr>
              </thead>
              <tbody>
                {diferencias.length === 0 ? (
                  <tr>
                    <td colSpan="8" className="py-6 text-center text-gray-500">Sin diferencias registradas</td>
                  </tr>
                ) : (
                  diferencias.map((d, i) => (
                    <tr key={`${d.id_entrada}-${d.producto_codigo}-${i}`} className="border-b border-gray-100">
                      <td className="py-2">
                        <div className="font-mono text-xs">{d.numero_entrada}</div>
                        <div className="text-xs text-gray-500">
                          {formatearValor(d.fecha_entrada, "fecha")} · {d.almacen}
                        </div>
                      </td>
                      <td className="py-2">{d.proveedor}</td>
                      <td className="py-2">
                        {d.producto} <span className="font-mono text-xs text-gray-500">{d.producto_codigo}</span>
                      </td>
                      <td className="py-2 text-right">{formatearValor(d.cantidad_solicitada, "numero")}</td>
                      <td className="py-2 text-right">{formatearValor(d.cantidad_recibida, "numero")}</td>
                      <td className={`py-2 text-right font-semibold ${d.tipo === "FALTANTE" ? "text-red-700" : "text-amber-700"}`}>
                        {Number(d.diferencia) > 0 ? "+" : ""}
                        {formatearValor(d.diferencia, "numero")} {d.unidad}
                        <div className="text-xs font-normal">{d.tipo === "FALTANTE" ? "Faltante" : "Sobrante"}</div>
                      </td>
                      <td className="py-2 text-right">{formatearValor(d.valor_diferencia, "moneda")}</td>
                      <td className="py-2 text-xs text-gray-600">{d.observaciones || "—"}</td>
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
