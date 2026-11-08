import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import Layout from "../../components/layout/Layout";
import Modal from "../../components/ui/Modal";
import Pagination from "../../components/ui/Pagination";
import RoleGate from "../../components/ui/RoleGate";
import Select from "../../components/ui/Select";
import { useAuth } from "../../context/AuthContext";
import { ROLES_GESTION, tieneRol } from "../../utils/permissions";
import { listarAlmacenes } from "../../api/almacenes.api";
import {
  ESTADOS_REPOSICION,
  listarDevolucionesProveedor,
  obtenerDevolucionProveedor,
  registrarReposicion,
} from "../../api/devolucionesProveedor.api";

const FILTROS_INICIALES = {
  search: "",
  id_almacen: "",
  estado_reposicion: "",
  fecha_desde: "",
  fecha_hasta: "",
};

function formatearFecha(fecha) {
  return fecha ? new Date(fecha).toLocaleString("es-BO") : "-";
}

function formatearCantidad(valor) {
  return Number(valor ?? 0).toLocaleString("es-BO");
}

function EstadoReposicion({ estado }) {
  const info = ESTADOS_REPOSICION[estado] || { label: estado, clase: "bg-gray-100 text-gray-700" };
  return <span className={`rounded-full px-2 py-1 text-xs font-semibold ${info.clase}`}>{info.label}</span>;
}

// RF56: historial de devoluciones a proveedor y seguimiento de su reposición.
export default function ListaDevolucionesProveedor() {
  const location = useLocation();
  const { user } = useAuth();
  const [devoluciones, setDevoluciones] = useState([]);
  const [filtros, setFiltros] = useState(FILTROS_INICIALES);
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0 });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [mensaje, setMensaje] = useState(location.state?.mensaje || "");
  const [almacenes, setAlmacenes] = useState([]);
  const [detalle, setDetalle] = useState(null);
  const [reposicion, setReposicion] = useState(null);
  const [errorReposicion, setErrorReposicion] = useState("");
  const [guardando, setGuardando] = useState(false);

  const puedeGestionar = tieneRol(user?.rol, ROLES_GESTION);

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
      for (const [clave, valor] of Object.entries(filtros)) {
        if (String(valor).trim()) params[clave] = String(valor).trim();
      }
      const respuesta = await listarDevolucionesProveedor(params);
      setDevoluciones(respuesta.data || []);
      setPagination(respuesta.pagination || { page, limit: pagination.limit, total: 0 });
    } catch (err) {
      setError(err.response?.data?.message || "No se pudieron cargar las devoluciones a proveedor");
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
      const respuesta = await obtenerDevolucionProveedor(id);
      setDetalle(respuesta.data);
      setReposicion(null);
      setErrorReposicion("");
    } catch (err) {
      setError(err.response?.data?.message || "No se pudo consultar la devolución");
    }
  };

  const confirmarReposicion = async (event) => {
    event.preventDefault();
    setErrorReposicion("");
    if (reposicion.estado_reposicion === "SIN_REPOSICION" && reposicion.observacion.trim().length < 5) {
      return setErrorReposicion("Indica por qué no habrá reposición (mínimo 5 caracteres)");
    }
    setGuardando(true);
    try {
      const respuesta = await registrarReposicion(detalle.id_devolucion_proveedor, {
        estado_reposicion: reposicion.estado_reposicion,
        observacion: reposicion.observacion.trim() || null,
      });
      setMensaje(respuesta.message);
      await verDetalle(detalle.id_devolucion_proveedor);
      cargar(pagination.page);
    } catch (err) {
      setErrorReposicion(err.response?.data?.message || "No se pudo registrar la reposición");
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">Devoluciones a proveedor</h1>
            <p className="text-sm text-gray-500">
              Mercadería defectuosa devuelta al proveedor: se descuenta del stock y se sigue su reposición (RF56).
            </p>
          </div>
          <RoleGate roles={ROLES_GESTION}>
            <Link to="/devoluciones-proveedor/nueva" className="btn-primary">
              Registrar devolución a proveedor
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
          <div className="grid grid-cols-1 gap-3 md:grid-cols-6">
            <div>
              <label className="mb-1 block text-sm font-medium" htmlFor="fecha-desde-dvp">
                Desde
              </label>
              <input
                id="fecha-desde-dvp"
                type="date"
                className="input-field"
                value={filtros.fecha_desde}
                onChange={(event) => setFiltros({ ...filtros, fecha_desde: event.target.value })}
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium" htmlFor="fecha-hasta-dvp">
                Hasta
              </label>
              <input
                id="fecha-hasta-dvp"
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
            <Select
              label="Reposición"
              value={filtros.estado_reposicion}
              onChange={(event) => setFiltros({ ...filtros, estado_reposicion: event.target.value })}
              options={Object.entries(ESTADOS_REPOSICION).map(([value, info]) => ({ value, label: info.label }))}
              placeholder="Todas"
            />
            <div>
              <label className="mb-1 block text-sm font-medium" htmlFor="buscar-dvp">
                Buscar
              </label>
              <input
                id="buscar-dvp"
                className="input-field"
                value={filtros.search}
                onChange={(event) => setFiltros({ ...filtros, search: event.target.value })}
                placeholder="Devolución, proveedor o recepción"
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
                  <th className="py-2 pr-3">Proveedor</th>
                  <th className="py-2 pr-3">Recepción</th>
                  <th className="py-2 pr-3">Almacén</th>
                  <th className="py-2 pr-3 text-right">Unidades</th>
                  <th className="py-2 pr-3">Motivo</th>
                  <th className="py-2 pr-3">Responsable</th>
                  <th className="py-2 pr-3">Reposición</th>
                  <th className="py-2">Detalle</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan="10" className="py-6 text-center text-gray-500">
                      Cargando devoluciones...
                    </td>
                  </tr>
                ) : devoluciones.length === 0 ? (
                  <tr>
                    <td colSpan="10" className="py-6 text-center text-gray-500">
                      No hay devoluciones a proveedor para esos filtros.
                    </td>
                  </tr>
                ) : (
                  devoluciones.map((devolucion) => (
                    <tr key={devolucion.id_devolucion_proveedor} className="border-b border-gray-100 align-top">
                      <td className="py-2 pr-3 font-mono text-xs">{devolucion.numero_devolucion}</td>
                      <td className="whitespace-nowrap py-2 pr-3">{formatearFecha(devolucion.fecha_devolucion)}</td>
                      <td className="py-2 pr-3 font-medium">{devolucion.proveedor}</td>
                      <td className="py-2 pr-3">
                        <div className="font-mono text-xs">{devolucion.numero_entrada}</div>
                        {devolucion.referencia_recepcion && (
                          <div className="text-xs text-gray-500">Ref. {devolucion.referencia_recepcion}</div>
                        )}
                      </td>
                      <td className="py-2 pr-3">{devolucion.almacen}</td>
                      <td className="py-2 pr-3 text-right text-red-700">{formatearCantidad(devolucion.total_devuelto)}</td>
                      <td className="max-w-xs py-2 pr-3 text-gray-700">{devolucion.motivo}</td>
                      <td className="py-2 pr-3">{devolucion.usuario_registra}</td>
                      <td className="py-2 pr-3">
                        <EstadoReposicion estado={devolucion.estado_reposicion} />
                      </td>
                      <td className="py-2">
                        <button
                          type="button"
                          className="font-semibold text-blue-600 hover:underline"
                          onClick={() => verDetalle(devolucion.id_devolucion_proveedor)}
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
          <div className="max-h-[75vh] space-y-3 overflow-y-auto text-sm">
            <dl className="grid grid-cols-2 gap-3">
              <div>
                <dt className="text-gray-500">Proveedor</dt>
                <dd className="font-medium">{detalle.proveedor}</dd>
              </div>
              <div>
                <dt className="text-gray-500">Fecha</dt>
                <dd className="font-medium">{formatearFecha(detalle.fecha_devolucion)}</dd>
              </div>
              <div>
                <dt className="text-gray-500">Recepción</dt>
                <dd className="font-medium">
                  {detalle.numero_entrada}
                  {detalle.referencia_recepcion && ` (${detalle.referencia_recepcion})`}
                </dd>
              </div>
              <div>
                <dt className="text-gray-500">Almacén</dt>
                <dd className="font-medium">{detalle.almacen}</dd>
              </div>
              <div>
                <dt className="text-gray-500">Responsable</dt>
                <dd className="font-medium">{detalle.usuario_registra}</dd>
              </div>
              <div>
                <dt className="text-gray-500">Reposición</dt>
                <dd>
                  <EstadoReposicion estado={detalle.estado_reposicion} />
                </dd>
              </div>
              <div className="col-span-2">
                <dt className="text-gray-500">Motivo</dt>
                <dd className="whitespace-pre-wrap rounded bg-gray-50 p-2">{detalle.motivo}</dd>
              </div>
              {detalle.observaciones && (
                <div className="col-span-2">
                  <dt className="text-gray-500">Observaciones</dt>
                  <dd className="whitespace-pre-wrap rounded bg-gray-50 p-2">{detalle.observaciones}</dd>
                </div>
              )}
              {detalle.estado_reposicion !== "PENDIENTE" && (
                <div className="col-span-2 rounded bg-blue-50 p-2">
                  <dt className="text-gray-500">Cierre de la reposición</dt>
                  <dd>
                    {formatearFecha(detalle.fecha_reposicion)}
                    {detalle.usuario_reposicion && ` · ${detalle.usuario_reposicion}`}
                    {detalle.observacion_reposicion && ` · ${detalle.observacion_reposicion}`}
                  </dd>
                </div>
              )}
            </dl>

            <div className="space-y-2">
              {detalle.detalles.map((linea) => (
                <div key={linea.id_detalle_devolucion_proveedor} className="rounded border border-gray-200 p-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">{linea.producto}</span>
                    <span className="font-semibold text-red-700">
                      -{formatearCantidad(linea.cantidad)} {linea.unidad || "u"}
                    </span>
                  </div>
                  <div className="text-xs text-gray-500">
                    <span className="font-mono">{linea.producto_codigo}</span> · Lote {linea.numero_lote || "-"}
                  </div>
                  {linea.observacion && <div className="mt-1 text-xs text-red-700">{linea.observacion}</div>}
                </div>
              ))}
            </div>

            {puedeGestionar && detalle.estado_reposicion === "PENDIENTE" && !reposicion && (
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setReposicion({ estado_reposicion: "SIN_REPOSICION", observacion: "" })}
                >
                  Cerrar sin reposición
                </button>
                <button
                  type="button"
                  className="btn-primary"
                  onClick={() => setReposicion({ estado_reposicion: "REPUESTA", observacion: "" })}
                >
                  Marcar como repuesta
                </button>
              </div>
            )}

            {reposicion && (
              <form onSubmit={confirmarReposicion} className="space-y-2 rounded border border-blue-200 bg-blue-50 p-3">
                <label className="block font-medium" htmlFor="observacion-reposicion">
                  {reposicion.estado_reposicion === "REPUESTA"
                    ? "Observación de la reposición"
                    : "¿Por qué no habrá reposición? *"}
                </label>
                <textarea
                  id="observacion-reposicion"
                  className="input-field"
                  rows="2"
                  maxLength="500"
                  value={reposicion.observacion}
                  onChange={(event) => setReposicion({ ...reposicion, observacion: event.target.value })}
                  placeholder={
                    reposicion.estado_reposicion === "REPUESTA"
                      ? "Opcional: ej. repuesto con la factura FAC-123"
                      : "Ej.: el proveedor emitió una nota de crédito"
                  }
                  autoFocus
                />
                {reposicion.estado_reposicion === "REPUESTA" && (
                  <p className="text-xs text-gray-600">
                    La mercadería repuesta se suma al stock registrando su recepción en Recepciones.
                  </p>
                )}
                {errorReposicion && <p className="text-sm text-red-600">{errorReposicion}</p>}
                <div className="flex justify-end gap-2">
                  <button type="button" className="btn-secondary" onClick={() => setReposicion(null)} disabled={guardando}>
                    Volver
                  </button>
                  <button type="submit" className="btn-primary" disabled={guardando}>
                    {guardando ? "Guardando..." : "Confirmar"}
                  </button>
                </div>
              </form>
            )}

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
