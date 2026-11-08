import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import Layout from "../../components/layout/Layout";
import Modal from "../../components/ui/Modal";
import Pagination from "../../components/ui/Pagination";
import RoleGate from "../../components/ui/RoleGate";
import Select from "../../components/ui/Select";
import { ROLES_GESTION } from "../../utils/permissions";
import { listarAlmacenes } from "../../api/almacenes.api";
import { listarDevoluciones, obtenerDevolucion } from "../../api/devoluciones.api";

const FILTROS_INICIALES = { search: "", id_almacen: "", fecha_desde: "", fecha_hasta: "" };

function formatearFecha(fecha) {
  return fecha ? new Date(fecha).toLocaleString("es-BO") : "-";
}

function formatearCantidad(valor) {
  return Number(valor ?? 0).toLocaleString("es-BO");
}

function EstadoProducto({ estado }) {
  const apto = estado === "APTO";
  return (
    <span
      className={`rounded-full px-2 py-1 text-xs font-semibold ${
        apto ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
      }`}
    >
      {apto ? "Apto" : "No apto"}
    </span>
  );
}

export default function ListaDevoluciones() {
  const location = useLocation();
  const [devoluciones, setDevoluciones] = useState([]);
  const [filtros, setFiltros] = useState(FILTROS_INICIALES);
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0 });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [mensaje, setMensaje] = useState(location.state?.mensaje || "");
  const [almacenes, setAlmacenes] = useState([]);
  const [detalle, setDetalle] = useState(null);

  const cargar = async (page = 1) => {
    if (filtros.fecha_desde && filtros.fecha_hasta && filtros.fecha_desde > filtros.fecha_hasta) {
      setDevoluciones([]);
      setPagination({ page: 1, limit: pagination.limit, total: 0 });
      setError("La fecha inicial no puede ser posterior a la final");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const params = { page, limit: pagination.limit };
      if (filtros.search.trim()) params.search = filtros.search.trim();
      if (filtros.id_almacen) params.id_almacen = filtros.id_almacen;
      if (filtros.fecha_desde) params.fecha_desde = filtros.fecha_desde;
      if (filtros.fecha_hasta) params.fecha_hasta = filtros.fecha_hasta;
      const respuesta = await listarDevoluciones(params);
      setDevoluciones(respuesta.data || []);
      setPagination(respuesta.pagination || { page, limit: pagination.limit, total: 0 });
    } catch (err) {
      setError(err.response?.data?.message || "No se pudieron cargar las devoluciones");
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

  const verDetalle = async (id) => {
    setError("");
    try {
      const respuesta = await obtenerDevolucion(id);
      setDetalle(respuesta.data);
    } catch (err) {
      setError(err.response?.data?.message || "No se pudo consultar la devolución");
    }
  };

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">Devoluciones de clientes</h1>
            <p className="text-sm text-gray-500">
              Productos devueltos por clientes: lo apto reingresa al stock y lo no apto queda como salida por daño.
            </p>
          </div>
          <RoleGate roles={ROLES_GESTION}>
            <Link to="/devoluciones/nueva" className="btn-primary">
              Registrar devolución
            </Link>
          </RoleGate>
        </div>

        {mensaje && (
          <div className="flex items-start justify-between gap-3 rounded bg-green-50 p-3 text-sm text-green-700">
            <span>{mensaje}</span>
            <button type="button" className="font-semibold" onClick={() => setMensaje("")}>
              ×
            </button>
          </div>
        )}

        <section className="card space-y-4">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-5">
            <div>
              <label className="mb-1 block text-sm font-medium" htmlFor="fecha-desde-devolucion">
                Desde
              </label>
              <input
                id="fecha-desde-devolucion"
                type="date"
                className="input-field"
                value={filtros.fecha_desde}
                onChange={(event) => setFiltros({ ...filtros, fecha_desde: event.target.value })}
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium" htmlFor="fecha-hasta-devolucion">
                Hasta
              </label>
              <input
                id="fecha-hasta-devolucion"
                type="date"
                className="input-field"
                value={filtros.fecha_hasta}
                onChange={(event) => setFiltros({ ...filtros, fecha_hasta: event.target.value })}
              />
            </div>
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
            <div>
              <label className="mb-1 block text-sm font-medium" htmlFor="buscar-devolucion">
                Buscar
              </label>
              <input
                id="buscar-devolucion"
                className="input-field"
                value={filtros.search}
                onChange={(event) => setFiltros({ ...filtros, search: event.target.value })}
                placeholder="Devolución o venta"
              />
            </div>
            <div className="flex items-end">
              <button type="button" className="btn-secondary w-full" onClick={() => setFiltros(FILTROS_INICIALES)}>
                Limpiar filtros
              </button>
            </div>
          </div>

          {error && <p className="rounded bg-red-50 p-3 text-sm text-red-600">{error}</p>}

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-left text-gray-500">
                  <th className="py-2 pr-3">Número</th>
                  <th className="py-2 pr-3">Fecha</th>
                  <th className="py-2 pr-3">Venta</th>
                  <th className="py-2 pr-3">Almacén</th>
                  <th className="py-2 pr-3 text-right">Aptos</th>
                  <th className="py-2 pr-3 text-right">No aptos</th>
                  <th className="py-2 pr-3">Responsable</th>
                  <th className="py-2">Detalle</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan="8" className="py-6 text-center text-gray-500">
                      Cargando devoluciones...
                    </td>
                  </tr>
                ) : devoluciones.length === 0 ? (
                  <tr>
                    <td colSpan="8" className="py-6 text-center text-gray-500">
                      No hay devoluciones para esos filtros.
                    </td>
                  </tr>
                ) : (
                  devoluciones.map((devolucion) => (
                    <tr key={devolucion.id_devolucion} className="border-b border-gray-100">
                      <td className="py-2 pr-3 font-mono text-xs">{devolucion.numero_devolucion}</td>
                      <td className="whitespace-nowrap py-2 pr-3">{formatearFecha(devolucion.fecha_devolucion)}</td>
                      <td className="py-2 pr-3">
                        <div className="font-mono text-xs">{devolucion.numero_venta}</div>
                        {devolucion.referencia_venta && (
                          <div className="text-xs text-gray-500">Ref. {devolucion.referencia_venta}</div>
                        )}
                      </td>
                      <td className="py-2 pr-3">{devolucion.almacen}</td>
                      <td className="py-2 pr-3 text-right text-green-700">{formatearCantidad(devolucion.total_apto)}</td>
                      <td className="py-2 pr-3 text-right text-red-700">{formatearCantidad(devolucion.total_no_apto)}</td>
                      <td className="py-2 pr-3">{devolucion.usuario_registra}</td>
                      <td className="py-2">
                        <button
                          type="button"
                          className="font-semibold text-blue-600 hover:underline"
                          onClick={() => verDetalle(devolucion.id_devolucion)}
                        >
                          Ver
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <Pagination page={pagination.page} limit={pagination.limit} total={pagination.total} onChange={cargar} />
        </section>
      </div>

      {detalle && (
        <Modal open onClose={() => setDetalle(null)} title={`Devolución ${detalle.numero_devolucion}`}>
          <div className="space-y-3 text-sm">
            <dl className="grid grid-cols-2 gap-3">
              <div>
                <dt className="text-gray-500">Fecha</dt>
                <dd className="font-medium">{formatearFecha(detalle.fecha_devolucion)}</dd>
              </div>
              <div>
                <dt className="text-gray-500">Responsable</dt>
                <dd className="font-medium">{detalle.usuario_registra}</dd>
              </div>
              <div>
                <dt className="text-gray-500">Venta</dt>
                <dd className="font-medium">
                  {detalle.numero_venta}
                  {detalle.referencia_venta && ` (${detalle.referencia_venta})`}
                </dd>
              </div>
              <div>
                <dt className="text-gray-500">Almacén</dt>
                <dd className="font-medium">{detalle.almacen}</dd>
              </div>
              {detalle.numero_salida_dano && (
                <div className="col-span-2">
                  <dt className="text-gray-500">Salida por daño</dt>
                  <dd className="font-mono font-medium">{detalle.numero_salida_dano}</dd>
                </div>
              )}
              {detalle.observaciones && (
                <div className="col-span-2">
                  <dt className="text-gray-500">Observaciones</dt>
                  <dd className="whitespace-pre-wrap rounded bg-gray-50 p-2">{detalle.observaciones}</dd>
                </div>
              )}
            </dl>
            <div className="max-h-64 space-y-2 overflow-y-auto">
              {detalle.detalles.map((linea) => (
                <div key={linea.id_detalle_devolucion} className="rounded border border-gray-200 p-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">{linea.producto}</span>
                    <EstadoProducto estado={linea.estado_producto} />
                  </div>
                  <div className="text-xs text-gray-500">
                    {formatearCantidad(linea.cantidad)} {linea.unidad || "u"} · Lote {linea.numero_lote || "-"}
                  </div>
                  {linea.motivo && <div className="mt-1 text-xs text-red-700">Motivo: {linea.motivo}</div>}
                </div>
              ))}
            </div>
            <div className="flex justify-end">
              <button type="button" className="btn-secondary" onClick={() => setDetalle(null)}>
                Cerrar
              </button>
            </div>
          </div>
        </Modal>
      )}
    </Layout>
  );
}
