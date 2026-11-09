import { useEffect, useState } from "react";
import Layout from "../../components/layout/Layout";
import Modal from "../../components/ui/Modal";
import Pagination from "../../components/ui/Pagination";
import RoleGate from "../../components/ui/RoleGate";
import Select from "../../components/ui/Select";
import { useAuth } from "../../context/AuthContext";
import { ROLES_GESTION, tieneRol } from "../../utils/permissions";
import { listarAlmacenes } from "../../api/almacenes.api";
import { listarProductos } from "../../api/productos.api";
import {
  ESTADOS_EVENTO,
  ESTADOS_SOLICITUD,
  despacharSolicitudMaterial,
  listarEventosIntegracion,
  listarSolicitudesMateriales,
  obtenerSolicitudMaterial,
  simularProductoTerminado,
  simularSolicitudLogistica,
} from "../../api/solicitudesMateriales.api";

const SIMULACION_INICIAL = {
  tipo: "solicitud",
  id_almacen: "",
  id_producto: "",
  cantidad: "",
  fecha_vencimiento: "",
};

const POR_DESPACHAR = ["RESERVADA", "PARCIAL"];

function formatearFecha(fecha) {
  return fecha ? new Date(fecha).toLocaleString("es-BO") : "-";
}

function formatearCantidad(valor) {
  return Number(valor ?? 0).toLocaleString("es-BO");
}

function Estado({ catalogo, estado }) {
  const info = catalogo[estado] || { label: estado, clase: "bg-gray-100 text-gray-700" };
  return <span className={`rounded-full px-2 py-1 text-xs font-semibold ${info.clase}`}>{info.label}</span>;
}

// HIP-259 / HIP-260: solicitudes de Producción y Logística y eventos publicados.
export default function ListaSolicitudesMateriales() {
  const { user } = useAuth();
  const [solicitudes, setSolicitudes] = useState([]);
  const [estado, setEstado] = useState("");
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0 });
  const [eventos, setEventos] = useState([]);
  const [paginationEventos, setPaginationEventos] = useState({ page: 1, limit: 10, total: 0 });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [mensaje, setMensaje] = useState("");
  const [detalle, setDetalle] = useState(null);
  const [errorDespacho, setErrorDespacho] = useState("");
  const [despachando, setDespachando] = useState(false);
  const [almacenes, setAlmacenes] = useState([]);
  const [productos, setProductos] = useState([]);
  const [simulacion, setSimulacion] = useState(SIMULACION_INICIAL);
  const [errorSimulacion, setErrorSimulacion] = useState("");
  const [simulando, setSimulando] = useState(false);

  const puedeGestionar = tieneRol(user?.rol, ROLES_GESTION);

  const cargar = async (page = 1) => {
    setLoading(true);
    setError("");
    try {
      const params = { page, limit: pagination.limit };
      if (estado) params.estado = estado;
      const respuesta = await listarSolicitudesMateriales(params);
      setSolicitudes(respuesta.data || []);
      setPagination(respuesta.pagination || { page, limit: pagination.limit, total: 0 });
    } catch (err) {
      setError(err.response?.data?.message || "No se pudieron cargar las solicitudes de materiales");
    } finally {
      setLoading(false);
    }
  };

  const cargarEventos = async (page = 1) => {
    try {
      const respuesta = await listarEventosIntegracion({ page, limit: paginationEventos.limit });
      setEventos(respuesta.data || []);
      setPaginationEventos(respuesta.pagination || { page, limit: paginationEventos.limit, total: 0 });
    } catch (err) {
      setError(err.response?.data?.message || "No se pudieron cargar los eventos publicados");
    }
  };

  useEffect(() => {
    cargar(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [estado]);

  useEffect(() => {
    cargarEventos(1);
    listarAlmacenes({ limit: 200, activo: true, orderBy: "nombre", order: "ASC" })
      .then((respuesta) => setAlmacenes(respuesta.data || []))
      .catch(() => setAlmacenes([]));
    listarProductos({ limit: 200, estado: "ACTIVO" })
      .then((respuesta) => setProductos(respuesta.data || []))
      .catch(() => setProductos([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const verDetalle = async (id) => {
    setError("");
    setErrorDespacho("");
    try {
      const respuesta = await obtenerSolicitudMaterial(id);
      setDetalle(respuesta.data);
    } catch (err) {
      setError(err.response?.data?.message || "No se pudo consultar la solicitud");
    }
  };

  const despachar = async () => {
    setDespachando(true);
    setErrorDespacho("");
    try {
      const respuesta = await despacharSolicitudMaterial(detalle.id_solicitud);
      setMensaje(`${respuesta.message}. Salida ${respuesta.data.numero_salida}.`);
      setDetalle(null);
      cargar(pagination.page);
      cargarEventos(1);
    } catch (err) {
      setErrorDespacho(err.response?.data?.message || "No se pudo confirmar el despacho");
    } finally {
      setDespachando(false);
    }
  };

  const enviarSimulacion = async (event) => {
    event.preventDefault();
    setErrorSimulacion("");
    const cantidad = Number(simulacion.cantidad);
    if (!simulacion.id_almacen || !simulacion.id_producto || !Number.isSafeInteger(cantidad) || cantidad <= 0) {
      return setErrorSimulacion("Selecciona almacén y producto, e indica una cantidad entera mayor a 0");
    }

    const esSolicitud = simulacion.tipo === "solicitud";
    const linea = { id_producto: Number(simulacion.id_producto), cantidad };
    if (!esSolicitud && simulacion.fecha_vencimiento) {
      linea.fecha_vencimiento = simulacion.fecha_vencimiento;
    }

    setSimulando(true);
    try {
      const enviar = esSolicitud ? simularSolicitudLogistica : simularProductoTerminado;
      await enviar({
        orden_produccion: `OP-${Date.now()}`,
        id_almacen: Number(simulacion.id_almacen),
        productos: [linea],
      });
      setMensaje(
        esSolicitud
          ? "Solicitud simulada procesada. Revisa su resultado en la lista."
          : "Producto terminado simulado procesado. Revisa el evento generado.",
      );
      setSimulacion({ ...simulacion, cantidad: "", fecha_vencimiento: "" });
      cargar(1);
      cargarEventos(1);
    } catch (err) {
      setErrorSimulacion(err.response?.data?.message || "No se pudo simular el mensaje");
    } finally {
      setSimulando(false);
    }
  };

  return (
    <Layout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Solicitudes de materiales</h1>
          <p className="text-sm text-gray-500">
            Pedidos recibidos de Producción y Logística: el stock se reserva al llegar y se descuenta al despachar.
          </p>
        </div>

        {mensaje && (
          <div className="flex items-start justify-between gap-3 rounded bg-green-50 p-3 text-sm text-green-700">
            <span>{mensaje}</span>
            <button type="button" className="font-semibold" onClick={() => setMensaje("")}>
              ×
            </button>
          </div>
        )}

        <RoleGate roles={ROLES_GESTION}>
          <section className="card space-y-3">
            <div>
              <h2 className="text-lg font-semibold">Simular mensaje de Producción y Logística</h2>
              <p className="text-sm text-gray-500">
                Entrega el mensaje al mismo proceso que usa la suscripción de Pub/Sub. Solo para pruebas.
              </p>
            </div>
            <form onSubmit={enviarSimulacion} className="grid grid-cols-1 gap-3 md:grid-cols-6">
              <Select
                label="Mensaje"
                value={simulacion.tipo}
                onChange={(event) => setSimulacion({ ...simulacion, tipo: event.target.value || "solicitud" })}
                options={[
                  { value: "solicitud", label: "Solicitud de materiales" },
                  { value: "terminado", label: "Producto terminado" },
                ]}
                placeholder="Selecciona"
              />
              <Select
                label="Almacén"
                value={simulacion.id_almacen}
                onChange={(event) => setSimulacion({ ...simulacion, id_almacen: event.target.value })}
                options={almacenes.map((almacen) => ({
                  value: almacen.id_almacen,
                  label: `${almacen.codigo} - ${almacen.nombre}`,
                }))}
              />
              <Select
                label="Producto"
                value={simulacion.id_producto}
                onChange={(event) => setSimulacion({ ...simulacion, id_producto: event.target.value })}
                options={productos.map((producto) => ({
                  value: producto.id_producto,
                  label: `${producto.codigo} - ${producto.nombre}`,
                }))}
              />
              <div>
                <label className="mb-1 block text-sm font-medium" htmlFor="cantidad-simulacion">
                  Cantidad
                </label>
                <input
                  id="cantidad-simulacion"
                  type="number"
                  min="1"
                  step="1"
                  className="input-field"
                  value={simulacion.cantidad}
                  onChange={(event) => setSimulacion({ ...simulacion, cantidad: event.target.value })}
                />
              </div>
              {simulacion.tipo === "terminado" && (
                <div>
                  <label className="mb-1 block text-sm font-medium" htmlFor="vencimiento-simulacion">
                    Vencimiento
                  </label>
                  <input
                    id="vencimiento-simulacion"
                    type="date"
                    className="input-field"
                    value={simulacion.fecha_vencimiento}
                    onChange={(event) => setSimulacion({ ...simulacion, fecha_vencimiento: event.target.value })}
                  />
                </div>
              )}
              <div className="flex items-end">
                <button type="submit" className="btn-primary w-full" disabled={simulando}>
                  {simulando ? "Enviando..." : "Enviar mensaje"}
                </button>
              </div>
            </form>
            {errorSimulacion && <p className="rounded bg-red-50 p-3 text-sm text-red-600">{errorSimulacion}</p>}
          </section>
        </RoleGate>

        <section className="card space-y-4">
          <div className="max-w-xs">
            <Select
              label="Estado"
              value={estado}
              onChange={(event) => setEstado(event.target.value)}
              options={Object.entries(ESTADOS_SOLICITUD).map(([value, info]) => ({ value, label: info.label }))}
              placeholder="Todos"
            />
          </div>

          {error && <p className="rounded bg-red-50 p-3 text-sm text-red-600">{error}</p>}

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-left text-gray-500">
                  <th className="py-2 pr-3">Orden de producción</th>
                  <th className="py-2 pr-3">Recibida</th>
                  <th className="py-2 pr-3">Almacén</th>
                  <th className="py-2 pr-3">Estado</th>
                  <th className="py-2 pr-3">Salida</th>
                  <th className="py-2">Detalle</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan="6" className="py-6 text-center text-gray-500">
                      Cargando solicitudes...
                    </td>
                  </tr>
                ) : solicitudes.length === 0 ? (
                  <tr>
                    <td colSpan="6" className="py-6 text-center text-gray-500">
                      No hay solicitudes de materiales.
                    </td>
                  </tr>
                ) : (
                  solicitudes.map((solicitud) => (
                    <tr key={solicitud.id_solicitud} className="border-b border-gray-100">
                      <td className="py-2 pr-3 font-mono text-xs">{solicitud.orden_produccion}</td>
                      <td className="whitespace-nowrap py-2 pr-3">{formatearFecha(solicitud.fecha_recepcion)}</td>
                      <td className="py-2 pr-3">{solicitud.almacen}</td>
                      <td className="py-2 pr-3">
                        <Estado catalogo={ESTADOS_SOLICITUD} estado={solicitud.estado} />
                      </td>
                      <td className="py-2 pr-3 font-mono text-xs">{solicitud.numero_salida || "-"}</td>
                      <td className="py-2">
                        <button
                          type="button"
                          className="font-semibold text-blue-600 hover:underline"
                          onClick={() => verDetalle(solicitud.id_solicitud)}
                        >
                          {puedeGestionar && POR_DESPACHAR.includes(solicitud.estado) ? "Despachar" : "Ver"}
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

        <section className="card space-y-4">
          <h2 className="text-lg font-semibold">Eventos enviados a Producción y Logística</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-left text-gray-500">
                  <th className="py-2 pr-3">Evento</th>
                  <th className="py-2 pr-3">Generado</th>
                  <th className="py-2 pr-3">Orden</th>
                  <th className="py-2 pr-3">Envío</th>
                  <th className="py-2">Publicado</th>
                </tr>
              </thead>
              <tbody>
                {eventos.length === 0 ? (
                  <tr>
                    <td colSpan="5" className="py-6 text-center text-gray-500">
                      Todavía no se generaron eventos.
                    </td>
                  </tr>
                ) : (
                  eventos.map((evento) => (
                    <tr key={evento.id_evento} className="border-b border-gray-100 align-top">
                      <td className="py-2 pr-3">
                        <div className="font-medium">{evento.tipo_evento}</div>
                        {evento.payload.estado && (
                          <div className="text-xs text-gray-500">Resultado: {evento.payload.estado}</div>
                        )}
                        {evento.payload.motivo && <div className="text-xs text-gray-500">{evento.payload.motivo}</div>}
                      </td>
                      <td className="whitespace-nowrap py-2 pr-3">{formatearFecha(evento.fecha_creacion)}</td>
                      <td className="py-2 pr-3 font-mono text-xs">{evento.payload.orden_produccion || "-"}</td>
                      <td className="py-2 pr-3">
                        <Estado catalogo={ESTADOS_EVENTO} estado={evento.estado} />
                        {evento.ultimo_error && <div className="mt-1 text-xs text-red-700">{evento.ultimo_error}</div>}
                      </td>
                      <td className="whitespace-nowrap py-2">{formatearFecha(evento.fecha_publicacion)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <Pagination
            page={paginationEventos.page}
            limit={paginationEventos.limit}
            total={paginationEventos.total}
            onChange={cargarEventos}
          />
        </section>
      </div>

      {detalle && (
        <Modal open onClose={() => setDetalle(null)} title={`Orden ${detalle.orden_produccion}`}>
          <div className="max-h-[75vh] space-y-3 overflow-y-auto text-sm">
            <div className="flex items-center justify-between gap-2">
              <span>{detalle.almacen}</span>
              <Estado catalogo={ESTADOS_SOLICITUD} estado={detalle.estado} />
            </div>

            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200 text-left text-gray-500">
                  <th className="py-2 pr-3">Producto</th>
                  <th className="py-2 pr-3 text-right">Solicitado</th>
                  <th className="py-2 pr-3 text-right">Reservado</th>
                  <th className="py-2 text-right">Despachado</th>
                </tr>
              </thead>
              <tbody>
                {detalle.detalles.map((linea) => (
                  <tr key={linea.id_detalle_solicitud} className="border-b border-gray-100">
                    <td className="py-2 pr-3">
                      <div className="font-medium">{linea.producto}</div>
                      <div className="font-mono text-xs text-gray-500">{linea.producto_codigo}</div>
                    </td>
                    <td className="py-2 pr-3 text-right">{formatearCantidad(linea.cantidad_solicitada)}</td>
                    <td className="py-2 pr-3 text-right">{formatearCantidad(linea.cantidad_reservada)}</td>
                    <td className="py-2 text-right">{formatearCantidad(linea.cantidad_despachada)}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            {detalle.estado === "PARCIAL" && (
              <p className="rounded bg-amber-50 p-2 text-amber-700">
                Se despachará solo lo reservado; el faltante ya fue informado a Producción y Logística.
              </p>
            )}
            {errorDespacho && <p className="rounded bg-red-50 p-2 text-red-600">{errorDespacho}</p>}

            <div className="flex justify-end gap-2">
              <button type="button" className="btn-secondary" onClick={() => setDetalle(null)} disabled={despachando}>
                Cerrar
              </button>
              {puedeGestionar && POR_DESPACHAR.includes(detalle.estado) && (
                <button type="button" className="btn-primary" onClick={despachar} disabled={despachando}>
                  {despachando ? "Despachando..." : "Confirmar despacho"}
                </button>
              )}
            </div>
          </div>
        </Modal>
      )}
    </Layout>
  );
}
