import { useEffect, useState } from "react";
import Layout from "../../components/layout/Layout";
import Pagination from "../../components/ui/Pagination";
import Select from "../../components/ui/Select";
import { listarAlmacenes } from "../../api/almacenes.api";
import { TIPOS_ALERTA, etiquetaTipoAlerta, listarAlertasStock } from "../../api/alertas.api";

const FILTROS_INICIALES = { estado: "ABIERTA", tipo: "", id_almacen: "" };

function formatearFecha(fecha) {
  return fecha ? new Date(fecha).toLocaleString("es-BO") : "-";
}

function formatearCantidad(valor) {
  return Number(valor ?? 0).toLocaleString("es-BO");
}

export default function PanelAlertasStock() {
  const [alertas, setAlertas] = useState([]);
  const [almacenes, setAlmacenes] = useState([]);
  const [filtros, setFiltros] = useState(FILTROS_INICIALES);
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0 });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const cargar = async (page = 1) => {
    setLoading(true);
    setError("");
    try {
      const params = { page, limit: pagination.limit, estado: filtros.estado };
      if (filtros.tipo) params.tipo = filtros.tipo;
      if (filtros.id_almacen) params.id_almacen = filtros.id_almacen;
      const respuesta = await listarAlertasStock(params);
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

  return (
    <Layout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Alertas de stock</h1>
          <p className="text-sm text-gray-500">
            Se abre una alerta al llegar al punto de reposición y otra al llegar al stock mínimo.
            Se cierran solas cuando el stock se recupera.
          </p>
        </div>

        <section className="card space-y-4">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
            <div>
              <label className="mb-1 block text-sm font-medium" htmlFor="estado-alerta">
                Estado
              </label>
              <select
                id="estado-alerta"
                className="input-field"
                value={filtros.estado}
                onChange={(event) => setFiltros({ ...filtros, estado: event.target.value })}
              >
                <option value="ABIERTA">Abiertas</option>
                <option value="CERRADA">Cerradas</option>
                <option value="TODAS">Todas</option>
              </select>
            </div>
            <Select
              label="Tipo"
              value={filtros.tipo}
              onChange={(event) => setFiltros({ ...filtros, tipo: event.target.value })}
              options={TIPOS_ALERTA}
              placeholder="Todos los tipos"
            />
            <Select
              label="Almacén"
              value={filtros.id_almacen}
              onChange={(event) => setFiltros({ ...filtros, id_almacen: event.target.value })}
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
                  <th className="py-2 pr-3">Fecha</th>
                  <th className="py-2 pr-3">Producto</th>
                  <th className="py-2 pr-3">Almacén</th>
                  <th className="py-2 pr-3 text-right">Stock actual</th>
                  <th className="py-2 pr-3 text-right">Mínimo</th>
                  <th className="py-2 pr-3 text-right">Reposición</th>
                  <th className="py-2 pr-3">Tipo</th>
                  <th className="py-2">Estado</th>
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
                    <tr key={alerta.id_alerta} className="border-b border-gray-100">
                      <td className="whitespace-nowrap py-2 pr-3">{formatearFecha(alerta.fecha_alerta)}</td>
                      <td className="py-2 pr-3">
                        <div className="font-medium">{alerta.producto}</div>
                        <div className="font-mono text-xs text-gray-500">{alerta.producto_codigo}</div>
                      </td>
                      <td className="py-2 pr-3">{alerta.almacen}</td>
                      <td className="py-2 pr-3 text-right font-semibold">
                        {formatearCantidad(alerta.cantidad_actual)}
                      </td>
                      <td className="py-2 pr-3 text-right">{formatearCantidad(alerta.stock_minimo)}</td>
                      <td className="py-2 pr-3 text-right">{formatearCantidad(alerta.punto_reposicion)}</td>
                      <td className="py-2 pr-3">{etiquetaTipoAlerta(alerta.tipo)}</td>
                      <td className="py-2">
                        <span
                          className={
                            alerta.estado === "ABIERTA"
                              ? "rounded bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-800"
                              : "rounded bg-green-100 px-2 py-1 text-xs font-semibold text-green-800"
                          }
                        >
                          {alerta.estado === "ABIERTA" ? "Abierta" : "Cerrada"}
                        </span>
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
