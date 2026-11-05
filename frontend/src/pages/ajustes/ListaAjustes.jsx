import { useEffect, useState } from "react";
import Layout from "../../components/layout/Layout";
import Modal from "../../components/ui/Modal";
import Pagination from "../../components/ui/Pagination";
import RoleGate from "../../components/ui/RoleGate";
import Select from "../../components/ui/Select";
import { ROLES_GESTION } from "../../utils/permissions";
import { listarAlmacenes } from "../../api/almacenes.api";
import { listarProductos } from "../../api/productos.api";
import { listarUsuarios } from "../../api/usuarios.api";
import {
  MOTIVOS_AJUSTE,
  etiquetaMotivo,
  listarAjustes,
  obtenerAjuste,
} from "../../api/ajustes.api";
import FormAjuste from "./FormAjuste";

const FILTROS_INICIALES = {
  search: "",
  motivo: "",
  id_almacen: "",
  id_producto: "",
  id_usuario: "",
  fecha_desde: "",
  fecha_hasta: "",
};

function formatearFecha(fecha) {
  return fecha ? new Date(fecha).toLocaleString("es-BO") : "-";
}

function formatearCantidad(valor) {
  return Number(valor ?? 0).toLocaleString("es-BO");
}

function diferenciaDe(ajuste) {
  if (ajuste.diferencia !== undefined && ajuste.diferencia !== null && ajuste.diferencia !== "") {
    return Number(ajuste.diferencia);
  }
  return Number(ajuste.cantidad_nueva ?? 0) - Number(ajuste.cantidad_anterior ?? 0);
}

function formatearDiferencia(ajuste) {
  const diferencia = diferenciaDe(ajuste);
  const texto = Math.abs(diferencia).toLocaleString("es-BO");
  if (diferencia > 0) return `+${texto}`;
  if (diferencia < 0) return `-${texto}`;
  return texto;
}

function responsableDe(ajuste) {
  return ajuste.usuario || ajuste.usuario_aprueba || "-";
}

export default function ListaAjustes() {
  const [ajustes, setAjustes] = useState([]);
  const [filtros, setFiltros] = useState(FILTROS_INICIALES);
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0 });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [formularioAbierto, setFormularioAbierto] = useState(false);
  const [detalle, setDetalle] = useState(null);
  const [errorDetalle, setErrorDetalle] = useState("");
  const [almacenes, setAlmacenes] = useState([]);
  const [productos, setProductos] = useState([]);
  const [usuarios, setUsuarios] = useState([]);

  const cargar = async (page = 1) => {
    setLoading(true);
    setError("");
    try {
      const params = { page, limit: pagination.limit };
      if (filtros.search.trim()) params.search = filtros.search.trim();
      if (filtros.motivo) params.motivo = filtros.motivo;
      if (filtros.id_almacen) params.id_almacen = filtros.id_almacen;
      if (filtros.id_producto) params.id_producto = filtros.id_producto;
      if (filtros.id_usuario) params.id_usuario = filtros.id_usuario;
      if (filtros.fecha_desde) params.fecha_desde = filtros.fecha_desde;
      if (filtros.fecha_hasta) params.fecha_hasta = filtros.fecha_hasta;
      if (filtros.fecha_desde && filtros.fecha_hasta && filtros.fecha_desde > filtros.fecha_hasta) {
        setAjustes([]);
        setPagination({ page: 1, limit: pagination.limit, total: 0 });
        setError("La fecha inicial no puede ser posterior a la final");
        setLoading(false);
        return;
      }
      const respuesta = await listarAjustes(params);
      setAjustes(respuesta.data || []);
      setPagination(respuesta.pagination || { page, limit: pagination.limit, total: 0 });
    } catch (err) {
      setError(err.response?.data?.message || "No se pudieron cargar los ajustes");
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
    listarProductos({ limit: 200, estado: "ACTIVO", orderBy: "nombre", order: "ASC" })
      .then((respuesta) => setProductos(respuesta.data || []))
      .catch(() => setProductos([]));
    listarUsuarios({ limit: 200, activo: true, orderBy: "nombre_completo", order: "ASC" })
      .then((respuesta) => setUsuarios(respuesta.data || []))
      .catch(() => setUsuarios([]));
  }, []);

  const verDetalle = async (id) => {
    setErrorDetalle("");
    try {
      const respuesta = await obtenerAjuste(id);
      setDetalle(respuesta.data);
    } catch (err) {
      setErrorDetalle(err.response?.data?.message || "No se pudo consultar el ajuste");
    }
  };

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">Ajustes de inventario</h1>
            <p className="text-sm text-gray-500">
              Historial de cambios de stock. Los filtros de fecha, almacén, producto y responsable se pueden combinar.
            </p>
          </div>
          <RoleGate roles={ROLES_GESTION}>
            <button className="btn-primary" type="button" onClick={() => setFormularioAbierto(true)}>
              Aplicar ajuste
            </button>
          </RoleGate>
        </div>

        <section className="card space-y-4">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
            <div>
              <label className="mb-1 block text-sm font-medium" htmlFor="fecha-desde-ajuste">
                Desde
              </label>
              <input
                id="fecha-desde-ajuste"
                type="date"
                className="input-field"
                value={filtros.fecha_desde}
                onChange={(event) => setFiltros({ ...filtros, fecha_desde: event.target.value })}
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium" htmlFor="fecha-hasta-ajuste">
                Hasta
              </label>
              <input
                id="fecha-hasta-ajuste"
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
              label="Producto"
              value={filtros.id_producto}
              onChange={(event) => setFiltros({ ...filtros, id_producto: event.target.value })}
              options={productos.map((producto) => ({
                value: producto.id_producto,
                label: `${producto.codigo} - ${producto.nombre}`,
              }))}
              placeholder="Todos los productos"
            />
            <Select
              label="Responsable"
              value={filtros.id_usuario}
              onChange={(event) => setFiltros({ ...filtros, id_usuario: event.target.value })}
              options={usuarios.map((usuario) => ({
                value: usuario.id_usuario,
                label: usuario.nombre_completo || usuario.nombre_usuario,
              }))}
              placeholder="Todos los responsables"
            />
            <Select
              label="Motivo"
              value={filtros.motivo}
              onChange={(event) => setFiltros({ ...filtros, motivo: event.target.value })}
              options={MOTIVOS_AJUSTE}
              placeholder="Todos los motivos"
            />
            <div>
              <label className="mb-1 block text-sm font-medium" htmlFor="buscar-ajuste">
                Buscar
              </label>
              <input
                id="buscar-ajuste"
                className="input-field"
                value={filtros.search}
                onChange={(event) => setFiltros({ ...filtros, search: event.target.value })}
                placeholder="Número, producto o comentario"
              />
            </div>
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
          {errorDetalle && <p className="rounded bg-red-50 p-3 text-sm text-red-600">{errorDetalle}</p>}

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-left text-gray-500">
                  <th className="py-2 pr-3">Número</th>
                  <th className="py-2 pr-3">Fecha</th>
                  <th className="py-2 pr-3">Producto</th>
                  <th className="py-2 pr-3">Almacén</th>
                  <th className="py-2 pr-3 text-right">Anterior</th>
                  <th className="py-2 pr-3 text-right">Nueva</th>
                  <th className="py-2 pr-3 text-right">Diferencia</th>
                  <th className="py-2 pr-3">Motivo</th>
                  <th className="py-2 pr-3">Responsable</th>
                  <th className="py-2">Detalle</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan="10" className="py-6 text-center text-gray-500">
                      Cargando ajustes...
                    </td>
                  </tr>
                ) : ajustes.length === 0 ? (
                  <tr>
                    <td colSpan="10" className="py-6 text-center text-gray-500">
                      No hay ajustes para esos filtros.
                    </td>
                  </tr>
                ) : (
                  ajustes.map((ajuste) => (
                    <tr key={ajuste.id_ajuste} className="border-b border-gray-100">
                      <td className="py-2 pr-3 font-mono text-xs">{ajuste.numero_ajuste}</td>
                      <td className="whitespace-nowrap py-2 pr-3">{formatearFecha(ajuste.fecha_ajuste)}</td>
                      <td className="py-2 pr-3">
                        <div className="font-medium">{ajuste.producto}</div>
                        <div className="font-mono text-xs text-gray-500">{ajuste.producto_codigo}</div>
                      </td>
                      <td className="py-2 pr-3">{ajuste.almacen}</td>
                      <td className="py-2 pr-3 text-right">{formatearCantidad(ajuste.cantidad_anterior)}</td>
                      <td className="py-2 pr-3 text-right">{formatearCantidad(ajuste.cantidad_nueva)}</td>
                      <td className="py-2 pr-3 text-right font-medium">{formatearDiferencia(ajuste)}</td>
                      <td className="py-2 pr-3">{etiquetaMotivo(ajuste.motivo)}</td>
                      <td className="py-2 pr-3">{responsableDe(ajuste)}</td>
                      <td className="py-2">
                        <button
                          type="button"
                          className="font-semibold text-blue-600 hover:underline"
                          onClick={() => verDetalle(ajuste.id_ajuste)}
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
          <Pagination
            page={pagination.page}
            limit={pagination.limit}
            total={pagination.total}
            onChange={cargar}
          />
        </section>
      </div>

      {formularioAbierto && (
        <FormAjuste
          onClose={() => setFormularioAbierto(false)}
          onSaved={() => {
            setFormularioAbierto(false);
            cargar(1);
          }}
        />
      )}

      {detalle && (
        <Modal open onClose={() => setDetalle(null)} title={`Ajuste ${detalle.numero_ajuste}`}>
          <div className="space-y-3 text-sm">
            <p className="rounded bg-amber-50 p-3 text-amber-800">
              Esta justificación quedó registrada y no se puede editar ni eliminar.
            </p>
            <dl className="grid grid-cols-2 gap-3">
              <div>
                <dt className="text-gray-500">Fecha</dt>
                <dd className="font-medium">{formatearFecha(detalle.fecha_ajuste)}</dd>
              </div>
              <div>
                <dt className="text-gray-500">Responsable</dt>
                <dd className="font-medium">{responsableDe(detalle)}</dd>
              </div>
              <div>
                <dt className="text-gray-500">Producto</dt>
                <dd className="font-medium">
                  {detalle.producto_codigo} - {detalle.producto}
                </dd>
              </div>
              <div>
                <dt className="text-gray-500">Almacén</dt>
                <dd className="font-medium">{detalle.almacen}</dd>
              </div>
              <div>
                <dt className="text-gray-500">Cantidad anterior</dt>
                <dd className="font-medium">{formatearCantidad(detalle.cantidad_anterior)}</dd>
              </div>
              <div>
                <dt className="text-gray-500">Cantidad nueva</dt>
                <dd className="font-medium">{formatearCantidad(detalle.cantidad_nueva)}</dd>
              </div>
              <div>
                <dt className="text-gray-500">Diferencia</dt>
                <dd className="font-medium">{formatearDiferencia(detalle)}</dd>
              </div>
              <div className="col-span-2">
                <dt className="text-gray-500">Motivo</dt>
                <dd className="font-medium">{etiquetaMotivo(detalle.motivo)}</dd>
              </div>
              <div className="col-span-2">
                <dt className="text-gray-500">Comentario</dt>
                <dd className="whitespace-pre-wrap rounded bg-gray-50 p-3">{detalle.comentario}</dd>
              </div>
            </dl>
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
