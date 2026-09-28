import { useEffect, useState } from "react";
import Layout from "../../components/layout/Layout";
import Badge from "../../components/ui/Badge";
import Modal from "../../components/ui/Modal";
import Pagination from "../../components/ui/Pagination";
import {
  listarProductos,
  cambiarEstadoProducto,
} from "../../api/productos.api";

const ESTADOS = ["ACTIVO", "INACTIVO", "DESCONTINUADO"];

export default function ListaProductos() {
  const [productos, setProductos] = useState([]);
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 10,
    total: 0,
  });
  const [filtros, setFiltros] = useState({ search: "", estado: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [modalOpen, setModalOpen] = useState(false);
  const [productoSeleccionado, setProductoSeleccionado] = useState(null);
  const [nuevoEstado, setNuevoEstado] = useState("");
  const [motivo, setMotivo] = useState("");
  const [guardando, setGuardando] = useState(false);

  const cargar = async (page = 1) => {
    setLoading(true);
    setError("");
    try {
      const data = await listarProductos({
        page,
        limit: pagination.limit,
        search: filtros.search || undefined,
        estado: filtros.estado || undefined,
      });
      setProductos(data.data);
      setPagination(data.pagination);
    } catch (err) {
      setError(err.response?.data?.message || "Error al cargar productos");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    cargar(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtros]);

  const abrirModal = (producto) => {
    setProductoSeleccionado(producto);
    setNuevoEstado(producto.estado);
    setMotivo("");
    setModalOpen(true);
  };

  const confirmarCambio = async () => {
    if (!nuevoEstado || nuevoEstado === productoSeleccionado.estado) {
      setError("Selecciona un estado diferente al actual");
      return;
    }
    setGuardando(true);
    setError("");
    try {
      await cambiarEstadoProducto(
        productoSeleccionado.id_producto,
        nuevoEstado,
        motivo
      );
      setModalOpen(false);
      cargar(pagination.page);
    } catch (err) {
      setError(err.response?.data?.message || "Error al cambiar estado");
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold">Productos</h1>
            <p className="text-sm text-gray-500">
              Gestión de productos y estado (RF06)
            </p>
          </div>
        </div>

        <div className="card">
          <div className="flex flex-wrap gap-3 mb-4">
            <input
              className="input-field max-w-xs"
              placeholder="Buscar por nombre, código o código de barras"
              value={filtros.search}
              onChange={(e) =>
                setFiltros({ ...filtros, search: e.target.value })
              }
            />
            <select
              className="input-field max-w-xs"
              value={filtros.estado}
              onChange={(e) =>
                setFiltros({ ...filtros, estado: e.target.value })
              }
            >
              <option value="">Todos los estados</option>
              {ESTADOS.map((e) => (
                <option key={e} value={e}>
                  {e}
                </option>
              ))}
            </select>
          </div>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 p-2 rounded mb-3">
              {error}
            </p>
          )}

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left border-b border-gray-200 text-gray-500">
                  <th className="py-2">Código</th>
                  <th className="py-2">Nombre</th>
                  <th className="py-2">Categoría</th>
                  <th className="py-2">Marca</th>
                  <th className="py-2">Estado</th>
                  <th className="py-2 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan="6" className="py-6 text-center text-gray-500">
                      Cargando...
                    </td>
                  </tr>
                ) : productos.length === 0 ? (
                  <tr>
                    <td colSpan="6" className="py-6 text-center text-gray-500">
                      No hay productos registrados
                    </td>
                  </tr>
                ) : (
                  productos.map((p) => (
                    <tr
                      key={p.id_producto}
                      className="border-b border-gray-100 hover:bg-gray-50"
                    >
                      <td className="py-2 font-mono text-xs">{p.codigo}</td>
                      <td className="py-2">{p.nombre}</td>
                      <td className="py-2">{p.categoria}</td>
                      <td className="py-2">{p.marca || "-"}</td>
                      <td className="py-2">
                        <Badge estado={p.estado} />
                      </td>
                      <td className="py-2 text-right">
                        <button
                          onClick={() => abrirModal(p)}
                          className="text-brand-red hover:underline text-sm font-medium"
                        >
                          Cambiar estado
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
            onChange={(page) => cargar(page)}
          />
        </div>
      </div>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Cambiar estado del producto"
      >
        {productoSeleccionado && (
          <div className="space-y-4">
            <div>
              <p className="text-sm text-gray-500">Producto</p>
              <p className="font-semibold">
                {productoSeleccionado.codigo} - {productoSeleccionado.nombre}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Estado actual</p>
              <Badge estado={productoSeleccionado.estado} />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">
                Nuevo estado
              </label>
              <select
                className="input-field"
                value={nuevoEstado}
                onChange={(e) => setNuevoEstado(e.target.value)}
              >
                {ESTADOS.map((e) => (
                  <option key={e} value={e}>
                    {e}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">
                Motivo (opcional)
              </label>
              <textarea
                className="input-field"
                rows="3"
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                placeholder="Ej: Producto descontinuado por el proveedor"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                className="btn-secondary"
                onClick={() => setModalOpen(false)}
                disabled={guardando}
              >
                Cancelar
              </button>
              <button
                className="btn-primary"
                onClick={confirmarCambio}
                disabled={guardando}
              >
                {guardando ? "Guardando..." : "Confirmar cambio"}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </Layout>
  );
}