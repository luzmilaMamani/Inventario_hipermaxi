import { useEffect, useState } from "react";
import Layout from "../../components/layout/Layout";
import Pagination from "../../components/ui/Pagination";
import Select from "../../components/ui/Select";
import { useAuth } from "../../context/AuthContext";
import { ROLES_GESTION, tieneRol } from "../../utils/permissions";
import { listarAlmacenes } from "../../api/almacenes.api";
import { useResumenAlertasVencimiento } from "../../components/ui/IndicadorAlertasVencimiento";
import {
  TIPOS_ALERTA_VENCIMIENTO,
  etiquetaTipoVencimiento,
  generarAlertasVencimiento,
  listarAlertasVencimiento,
  marcarAlertaVencimientoLeida,
  marcarAlertasVencimientoLeidas,
  notificarCambioAlertas,
} from "../../api/alertasVencimiento.api";

const FILTROS_INICIALES = { estado: "PENDIENTE", tipo: "", id_almacen: "" };

const ESTILO_TIPO = {
  VENCIDO: "bg-red-100 text-red-700",
  POR_VENCER: "bg-amber-100 text-amber-800",
};

function formatearFecha(fecha) {
  const [anio, mes, dia] = String(fecha).slice(0, 10).split("-");
  return `${dia}/${mes}/${anio}`;
}

function textoDias(dias) {
  if (dias === 0) return "Vence hoy";
  if (dias < 0) return `Venció hace ${Math.abs(dias)} día${dias !== -1 ? "s" : ""}`;
  return `Faltan ${dias} día${dias !== 1 ? "s" : ""}`;
}

export default function PanelAlertasVencimiento() {
  const { user } = useAuth();
  const puedeGestionar = tieneRol(user?.rol, ROLES_GESTION);
  const resumen = useResumenAlertasVencimiento();

  const [alertas, setAlertas] = useState([]);
  const [almacenes, setAlmacenes] = useState([]);
  const [filtros, setFiltros] = useState(FILTROS_INICIALES);
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0 });
  const [loading, setLoading] = useState(false);
  const [procesando, setProcesando] = useState(false);
  const [error, setError] = useState("");
  const [mensaje, setMensaje] = useState("");

  const cargar = async (page = 1) => {
    setLoading(true);
    setError("");
    try {
      const params = { page, limit: pagination.limit, estado: filtros.estado };
      if (filtros.tipo) params.tipo = filtros.tipo;
      if (filtros.id_almacen) params.id_almacen = filtros.id_almacen;
      const respuesta = await listarAlertasVencimiento(params);
      setAlertas(respuesta.data || []);
      setPagination(respuesta.pagination || { page, limit: pagination.limit, total: 0 });
    } catch (err) {
      setError(err.response?.data?.message || "No se pudieron cargar las alertas");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    cargar(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtros]);

  useEffect(() => {
    listarAlmacenes({ limit: 200, activo: true, orderBy: "nombre", order: "ASC" })
      .then((respuesta) => setAlmacenes(respuesta.data || []))
      .catch(() => setAlmacenes([]));
  }, []);

  const ejecutar = async (accion) => {
    setProcesando(true);
    setError("");
    try {
      const respuesta = await accion();
      setMensaje(respuesta.message || "Listo");
      setTimeout(() => setMensaje(""), 3000);
      notificarCambioAlertas();
      await cargar(pagination.page);
    } catch (err) {
      setError(err.response?.data?.message || "No se pudo completar la acción");
    } finally {
      setProcesando(false);
    }
  };

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">Alertas de vencimiento</h1>
            <p className="text-sm text-gray-500">
              Lotes que ya vencieron o que vencen dentro de los días de
              anticipación configurados para su categoría
            </p>
          </div>
          {puedeGestionar && (
            <div className="flex gap-2">
              <button
                className="btn-secondary"
                disabled={procesando}
                onClick={() => ejecutar(generarAlertasVencimiento)}
              >
                Revisar lotes ahora
              </button>
              <button
                className="btn-primary"
                disabled={procesando || resumen.pendientes === 0}
                onClick={() => ejecutar(() => marcarAlertasVencimientoLeidas())}
              >
                Marcar todas como leídas
              </button>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div className="card border-l-4 border-red-500">
            <p className="text-sm text-gray-500">Vencidos sin leer</p>
            <p className="text-3xl font-bold text-red-600">{resumen.vencidas}</p>
          </div>
          <div className="card border-l-4 border-amber-500">
            <p className="text-sm text-gray-500">Por vencer sin leer</p>
            <p className="text-3xl font-bold text-amber-600">{resumen.por_vencer}</p>
          </div>
          <div className="card border-l-4 border-gray-400">
            <p className="text-sm text-gray-500">Total pendientes</p>
            <p className="text-3xl font-bold">{resumen.pendientes}</p>
          </div>
        </div>

        {mensaje && (
          <p className="rounded bg-green-50 p-2 text-sm text-green-700">{mensaje}</p>
        )}

        <section className="card space-y-4">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
            <div>
              <label className="mb-1 block text-sm font-medium" htmlFor="estado-alerta-venc">
                Estado
              </label>
              <select
                id="estado-alerta-venc"
                className="input-field"
                value={filtros.estado}
                onChange={(e) => setFiltros({ ...filtros, estado: e.target.value })}
              >
                <option value="PENDIENTE">Pendientes</option>
                <option value="LEIDA">Leídas</option>
                <option value="TODAS">Todas</option>
              </select>
            </div>
            <Select
              label="Severidad"
              value={filtros.tipo}
              onChange={(e) => setFiltros({ ...filtros, tipo: e.target.value })}
              options={TIPOS_ALERTA_VENCIMIENTO}
              placeholder="Todas"
            />
            <Select
              label="Almacén"
              value={filtros.id_almacen}
              onChange={(e) => setFiltros({ ...filtros, id_almacen: e.target.value })}
              options={almacenes.map((almacen) => ({
                value: almacen.id_almacen,
                label: `${almacen.codigo} - ${almacen.nombre}`,
              }))}
              placeholder="Todos los almacenes"
            />
            <div className="flex items-end">
              <button
                type="button"
                className="btn-secondary w-full"
                onClick={() => setFiltros(FILTROS_INICIALES)}
              >
                Limpiar filtros
              </button>
            </div>
          </div>

          {error && <p className="rounded bg-red-50 p-3 text-sm text-red-600">{error}</p>}

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-left text-gray-500">
                  <th className="py-2 pr-3">Severidad</th>
                  <th className="py-2 pr-3">Producto</th>
                  <th className="py-2 pr-3">Lote</th>
                  <th className="py-2 pr-3">Almacén</th>
                  <th className="py-2 pr-3 text-right">Cantidad</th>
                  <th className="py-2 pr-3">Vencimiento</th>
                  <th className="py-2 pr-3">Generada</th>
                  <th className="py-2 text-right">Estado</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan="8" className="py-6 text-center text-gray-500">
                      Cargando alertas...
                    </td>
                  </tr>
                ) : alertas.length === 0 ? (
                  <tr>
                    <td colSpan="8" className="py-6 text-center text-gray-500">
                      No hay alertas para esos filtros.
                    </td>
                  </tr>
                ) : (
                  alertas.map((alerta) => (
                    <tr
                      key={alerta.id_alerta}
                      className={`border-b border-gray-100 ${
                        alerta.estado === "PENDIENTE" ? "" : "opacity-60"
                      }`}
                    >
                      <td className="py-2 pr-3">
                        <span
                          className={`rounded px-2 py-1 text-xs font-semibold ${
                            ESTILO_TIPO[alerta.tipo] || "bg-gray-100 text-gray-600"
                          }`}
                        >
                          {etiquetaTipoVencimiento(alerta.tipo)}
                        </span>
                      </td>
                      <td className="py-2 pr-3">
                        <div className="font-medium">{alerta.producto}</div>
                        <div className="font-mono text-xs text-gray-500">
                          {alerta.producto_codigo}
                          {alerta.categoria && ` · ${alerta.categoria}`}
                        </div>
                      </td>
                      <td className="py-2 pr-3 font-mono text-xs">{alerta.numero_lote || "-"}</td>
                      <td className="py-2 pr-3">{alerta.almacen}</td>
                      <td className="py-2 pr-3 text-right">
                        {Number(alerta.cantidad ?? 0).toLocaleString("es-BO")}{" "}
                        {alerta.unidad || ""}
                      </td>
                      <td className="whitespace-nowrap py-2 pr-3">
                        <div>{formatearFecha(alerta.fecha_vencimiento)}</div>
                        <div className="text-xs text-gray-500">
                          {textoDias(alerta.dias_restantes)}
                        </div>
                      </td>
                      <td className="whitespace-nowrap py-2 pr-3 text-xs text-gray-600">
                        {new Date(alerta.fecha_generacion).toLocaleString("es-BO")}
                      </td>
                      <td className="py-2 text-right">
                        {alerta.estado === "PENDIENTE" ? (
                          puedeGestionar ? (
                            <button
                              className="btn-secondary text-xs"
                              disabled={procesando}
                              onClick={() =>
                                ejecutar(() => marcarAlertaVencimientoLeida(alerta.id_alerta))
                              }
                            >
                              Marcar leída
                            </button>
                          ) : (
                            <span className="text-xs font-semibold text-amber-700">Pendiente</span>
                          )
                        ) : (
                          <span className="text-xs text-gray-500">
                            Leída{alerta.leida_por ? ` por ${alerta.leida_por}` : ""}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <Pagination
            page={pagination.page}
            limit={pagination.limit}
            total={pagination.total}
            onChange={cargar}
          />
        </section>
      </div>
    </Layout>
  );
}
