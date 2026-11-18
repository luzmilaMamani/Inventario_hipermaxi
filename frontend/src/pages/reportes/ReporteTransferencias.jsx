import { useEffect, useState } from "react";
import Layout from "../../components/layout/Layout";
import Select from "../../components/ui/Select";
import BotonesExportar from "../../components/ui/BotonesExportar";
import { reporteTransferencias } from "../../api/reportes.api";
import { listarAlmacenes } from "../../api/catalogos.api";
import { formatearValor } from "../../utils/exportar";

// RF64: flujo de mercadería entre sucursales y tiempos de entrega.

const ESTADOS = [
  { value: "SOLICITADA", label: "Solicitada", clase: "bg-gray-100 text-gray-700" },
  { value: "APROBADA", label: "Aprobada", clase: "bg-blue-100 text-blue-700" },
  { value: "ENVIADA", label: "Enviada", clase: "bg-indigo-100 text-indigo-700" },
  { value: "RECIBIDA", label: "Recibida", clase: "bg-green-100 text-green-700" },
  { value: "RECIBIDA_CON_DIFERENCIAS", label: "Con diferencias", clase: "bg-amber-100 text-amber-800" },
  { value: "RECHAZADA", label: "Rechazada", clase: "bg-red-100 text-red-700" },
  { value: "CANCELADA", label: "Cancelada", clase: "bg-red-50 text-red-600" },
];
const ESTADO = Object.fromEntries(ESTADOS.map((e) => [e.value, e]));

const FILTROS_INICIALES = { fecha_desde: "", fecha_hasta: "", id_origen: "", id_destino: "", estado: "" };

// Las horas de entrega se leen mejor en días cuando pasan de 48 h.
function duracion(horas) {
  if (horas === null || horas === undefined) return "—";
  const h = Number(horas);
  return h >= 48 ? `${formatearValor(h / 24, "numero")} días` : `${formatearValor(h, "numero")} h`;
}

const COLUMNAS = [
  { key: "numero_transferencia", label: "Número" },
  { key: "almacen_origen", label: "Origen" },
  { key: "almacen_destino", label: "Destino" },
  { key: "estado", label: "Estado", valor: (r) => ESTADO[r.estado]?.label || r.estado },
  { key: "fecha_solicitud", label: "Solicitada", tipo: "fecha" },
  { key: "fecha_envio", label: "Enviada", tipo: "fecha" },
  { key: "fecha_recepcion", label: "Recibida", tipo: "fecha" },
  { key: "horas_entrega", label: "Horas de entrega", tipo: "numero" },
  { key: "a_tiempo", label: "A tiempo", valor: (r) => (r.a_tiempo === null ? "" : r.a_tiempo ? "Sí" : "No") },
  { key: "unidades_enviadas", label: "Enviadas", tipo: "numero" },
  { key: "unidades_recibidas", label: "Recibidas", tipo: "numero" },
  { key: "diferencia_unidades", label: "Diferencia", tipo: "numero" },
  { key: "valor_diferencia", label: "Valor diferencia", tipo: "moneda" },
];

export default function ReporteTransferencias() {
  const [filtros, setFiltros] = useState(FILTROS_INICIALES);
  const [datos, setDatos] = useState({ data: [], resumen: {}, por_ruta: [], por_estado: [] });
  const [almacenes, setAlmacenes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    listarAlmacenes().then((r) => setAlmacenes(r.data || [])).catch(() => setAlmacenes([]));
  }, []);

  useEffect(() => {
    if (filtros.fecha_desde && filtros.fecha_hasta && filtros.fecha_desde > filtros.fecha_hasta) return undefined;
    let vigente = true;
    setLoading(true);
    setError("");
    const params = Object.fromEntries(Object.entries(filtros).filter(([, v]) => v !== ""));
    reporteTransferencias(params)
      .then((r) => vigente && setDatos(r))
      .catch((err) => vigente && setError(err.response?.data?.message || "Error al cargar el reporte"))
      .finally(() => vigente && setLoading(false));
    return () => {
      vigente = false;
    };
  }, [filtros]);

  const cambiar = (campo) => (e) => setFiltros({ ...filtros, [campo]: e.target.value });
  const opcionesAlmacen = almacenes.map((a) => ({ value: a.id_almacen, label: `${a.codigo} - ${a.nombre}` }));
  const r = datos.resumen || {};

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">Reporte de transferencias</h1>
            <p className="text-sm text-gray-500">
              Flujo de mercadería entre sucursales y tiempos de entrega (RF64)
            </p>
          </div>
          <BotonesExportar
            titulo="Reporte de transferencias entre sucursales"
            subtitulo={
              filtros.fecha_desde || filtros.fecha_hasta
                ? `Solicitadas del ${filtros.fecha_desde || "inicio"} al ${filtros.fecha_hasta || "hoy"}`
                : "Todo el período"
            }
            nombreArchivo="transferencias"
            columnas={COLUMNAS}
            filas={datos.data}
            resumen={[
              { label: "Transferencias", valor: r.transferencias, tipo: "numero" },
              { label: "Horas promedio de entrega", valor: r.horas_promedio, tipo: "numero" },
              { label: "% a tiempo", valor: r.porcentaje_a_tiempo, tipo: "porcentaje" },
            ]}
          />
        </div>

        <div className="card">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3 xl:grid-cols-6">
            <div>
              <label className="mb-1 block text-sm font-medium">Desde</label>
              <input type="date" className="input-field" value={filtros.fecha_desde} onChange={cambiar("fecha_desde")} />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Hasta</label>
              <input type="date" className="input-field" value={filtros.fecha_hasta} onChange={cambiar("fecha_hasta")} />
            </div>
            <Select label="Origen" value={filtros.id_origen} onChange={cambiar("id_origen")} options={opcionesAlmacen} placeholder="Todos" />
            <Select label="Destino" value={filtros.id_destino} onChange={cambiar("id_destino")} options={opcionesAlmacen} placeholder="Todos" />
            <Select label="Estado" value={filtros.estado} onChange={cambiar("estado")} options={ESTADOS} placeholder="Todos" />
            <div className="flex items-end">
              <button className="btn-secondary w-full" onClick={() => setFiltros(FILTROS_INICIALES)}>
                Limpiar filtros
              </button>
            </div>
          </div>
          {filtros.fecha_desde && filtros.fecha_hasta && filtros.fecha_desde > filtros.fecha_hasta && (
            <p className="mt-2 text-sm text-red-600">La fecha inicial no puede ser posterior a la final.</p>
          )}
        </div>

        {error && <p className="rounded bg-red-50 p-2 text-sm text-red-600">{error}</p>}

        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <div className="rounded border border-blue-100 bg-blue-50 p-3">
            <p className="text-xs text-gray-600">Transferencias</p>
            <p className="text-xl font-bold text-blue-700">{formatearValor(r.transferencias || 0, "numero")}</p>
            <p className="text-xs text-gray-500">{formatearValor(r.unidades_enviadas || 0, "numero")} unidades enviadas</p>
          </div>
          <div className="rounded border border-green-100 bg-green-50 p-3">
            <p className="text-xs text-gray-600">Tiempo promedio de entrega</p>
            <p className="text-xl font-bold text-green-700">{duracion(r.horas_promedio)}</p>
            <p className="text-xs text-gray-500">{r.recibidas || 0} recibidas</p>
          </div>
          <div className="rounded border border-purple-100 bg-purple-50 p-3">
            <p className="text-xs text-gray-600">Entregadas a tiempo</p>
            <p className="text-xl font-bold text-purple-700">
              {r.porcentaje_a_tiempo === null || r.porcentaje_a_tiempo === undefined
                ? "—"
                : formatearValor(r.porcentaje_a_tiempo, "porcentaje")}
            </p>
            <p className="text-xs text-gray-500">según la llegada estimada</p>
          </div>
          <div className="rounded border border-amber-100 bg-amber-50 p-3">
            <p className="text-xs text-gray-600">Con diferencias</p>
            <p className="text-xl font-bold text-amber-700">{r.con_diferencias || 0}</p>
            <p className="text-xs text-gray-500">{formatearValor(r.valor_diferencia || 0, "moneda")}</p>
          </div>
        </div>

        <div className="card">
          <h2 className="mb-3 font-semibold">Tiempo de entrega por ruta</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-left text-gray-500">
                  <th className="py-2">Ruta</th>
                  <th className="py-2 text-right">Transferencias</th>
                  <th className="py-2 text-right">Promedio</th>
                  <th className="py-2 text-right">Más rápida</th>
                  <th className="py-2 text-right">Más lenta</th>
                  <th className="py-2 text-right">A tiempo</th>
                  <th className="py-2 text-right">Unid. enviadas</th>
                  <th className="py-2 text-right">Diferencia</th>
                </tr>
              </thead>
              <tbody>
                {datos.por_ruta.length === 0 ? (
                  <tr>
                    <td colSpan="8" className="py-6 text-center text-gray-500">Sin transferencias con esos filtros</td>
                  </tr>
                ) : (
                  datos.por_ruta.map((ruta) => (
                    <tr key={`${ruta.id_almacen_origen}-${ruta.id_almacen_destino}`} className="border-b border-gray-100">
                      <td className="py-2 font-medium">
                        {ruta.almacen_origen} → {ruta.almacen_destino}
                      </td>
                      <td className="py-2 text-right">{ruta.transferencias}</td>
                      <td className="py-2 text-right font-semibold">{duracion(ruta.horas_promedio)}</td>
                      <td className="py-2 text-right">{duracion(ruta.horas_minimo)}</td>
                      <td className="py-2 text-right">{duracion(ruta.horas_maximo)}</td>
                      <td className="py-2 text-right">
                        {ruta.porcentaje_a_tiempo === null ? "—" : formatearValor(ruta.porcentaje_a_tiempo, "porcentaje")}
                      </td>
                      <td className="py-2 text-right">{formatearValor(ruta.unidades_enviadas, "numero")}</td>
                      <td className={`py-2 text-right ${Number(ruta.diferencia_unidades) !== 0 ? "font-semibold text-amber-700" : ""}`}>
                        {formatearValor(ruta.diferencia_unidades, "numero")}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="card">
          <h2 className="mb-3 font-semibold">Transferencias</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-left text-gray-500">
                  <th className="py-2">Número</th>
                  <th className="py-2">Ruta</th>
                  <th className="py-2">Estado</th>
                  <th className="py-2">Solicitada</th>
                  <th className="py-2">Enviada</th>
                  <th className="py-2">Recibida</th>
                  <th className="py-2 text-right">Entrega</th>
                  <th className="py-2 text-right">Enviadas / recibidas</th>
                  <th className="py-2 text-right">Diferencia</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan="9" className="py-6 text-center text-gray-500">Cargando...</td>
                  </tr>
                ) : datos.data.length === 0 ? (
                  <tr>
                    <td colSpan="9" className="py-6 text-center text-gray-500">No hay transferencias con esos filtros</td>
                  </tr>
                ) : (
                  datos.data.map((t) => (
                    <tr key={t.id_transferencia} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="py-2 font-mono text-xs">{t.numero_transferencia}</td>
                      <td className="py-2">
                        {t.almacen_origen} → {t.almacen_destino}
                      </td>
                      <td className="py-2">
                        <span className={`whitespace-nowrap rounded-full px-2 py-1 text-xs font-semibold ${ESTADO[t.estado]?.clase || ""}`}>
                          {ESTADO[t.estado]?.label || t.estado}
                        </span>
                      </td>
                      <td className="py-2">{formatearValor(t.fecha_solicitud, "fecha")}</td>
                      <td className="py-2">{formatearValor(t.fecha_envio, "fecha") || "—"}</td>
                      <td className="py-2">{formatearValor(t.fecha_recepcion, "fecha") || "—"}</td>
                      <td className="whitespace-nowrap py-2 text-right">
                        {duracion(t.horas_entrega)}
                        {t.a_tiempo === false && (
                          <span className="ml-1 text-xs text-red-600" title="Llegó después de la fecha estimada">
                            (tarde)
                          </span>
                        )}
                      </td>
                      <td className="py-2 text-right">
                        {formatearValor(t.unidades_enviadas, "numero")} / {formatearValor(t.unidades_recibidas, "numero")}
                      </td>
                      <td className={`py-2 text-right ${Number(t.diferencia_unidades) !== 0 ? "font-semibold text-amber-700" : ""}`}>
                        {formatearValor(t.diferencia_unidades, "numero")}
                      </td>
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
