import { useEffect, useState } from "react";
import Layout from "../../components/layout/Layout";
import Badge from "../../components/ui/Badge";
import Modal from "../../components/ui/Modal";
import Pagination from "../../components/ui/Pagination";
import Select from "../../components/ui/Select";
import DetalleProducto from "./DetalleProducto";
import FormProducto from "./FormProducto";
import {
  listarProductos,
  cambiarEstadoProducto,
} from "../../api/productos.api";
import {
  listarCategorias,
  listarSubcategorias,
  listarMarcas,
} from "../../api/catalogos.api";

const ESTADOS = ["ACTIVO", "INACTIVO", "DESCONTINUADO"];
const ORDENES = [
  { value: "nombre", label: "Nombre" },
  { value: "codigo", label: "Código" },
  { value: "fecha_creacion", label: "Fecha de creación" },
  { value: "estado", label: "Estado" },
];

const FILTROS_INICIALES = {
  search: "",
  id_categoria: "",
  id_subcategoria: "",
  id_marca: "",
  estado: "",
  controla_vencimiento: "",
  orderBy: "fecha_creacion",
  order: "DESC",
};

export default function ListaProductos() {
  const [productos, setProductos] = useState([]);
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 10,
    total: 0,
  });
  const [filtros, setFiltros] = useState(FILTROS_INICIALES);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Catálogos
  const [categorias, setCategorias] = useState([]);
  const [subcategorias, setSubcategorias] = useState([]);
  const [marcas, setMarcas] = useState([]);

  // Modal de cambio de estado (HIP-15)
  const [modalOpen, setModalOpen] = useState(false);
  const [productoSeleccionado, setProductoSeleccionado] = useState(null);
  const [nuevoEstado, setNuevoEstado] = useState("");
  const [motivo, setMotivo] = useState("");
  const [guardando, setGuardando] = useState(false);

  // Modal de detalle (HIP-12)
  const [detalleId, setDetalleId] = useState(null);

  // Modal de crear/editar producto
  const [formOpen, setFormOpen] = useState(false);
  const [productoEditar, setProductoEditar] = useState(null);

  // Cargar catálogos al montar
  useEffect(() => {
    listarCategorias()
      .then((res) => setCategorias(res.data))
      .catch(() => {});
    listarMarcas()
      .then((res) => setMarcas(res.data))
      .catch(() => {});
  }, []);

  // Cargar subcategorías cuando cambia la categoría
  useEffect(() => {
    if (!filtros.id_categoria) {
      setSubcategorias([]);
      return;
    }
    listarSubcategorias(filtros.id_categoria)
      .then((res) => setSubcategorias(res.data))
      .catch(() => setSubcategorias([]));
  }, [filtros.id_categoria]);

  const cargar = async (page = 1) => {
    setLoading(true);
    setError("");
    try {
      const params = {
        page,
        limit: pagination.limit,
        orderBy: filtros.orderBy,
        order: filtros.order,
      };
      for (const [key, value] of Object.entries(filtros)) {
        if (value !== "" && key !== "orderBy" && key !== "order") {
          params[key] = value;
        }
      }

      const data = await listarProductos(params);
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

  const limpiarFiltros = () => {
    setFiltros(FILTROS_INICIALES);
  };

  const abrirModalEstado = (producto) => {
    setProductoSeleccionado(producto);
    setNuevoEstado(producto.estado);
    setMotivo("");
    setModalOpen(true);
  };

  const abrirCrear = () => {
    setProductoEditar(null);
    setFormOpen(true);
  };

  const abrirEditar = (producto) => {
    setProductoEditar(producto);
    setFormOpen(true);
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

  // Opciones para los selects
  const opcionesCategorias = categorias.map((c) => ({
    value: c.id_categoria,
    label: c.nombre,
  }));

  const opcionesSubcategorias = subcategorias.map((s) => ({
    value: s.id_subcategoria,
    label: s.nombre,
  }));

  const opcionesMarcas = marcas.map((m) => ({
    value: m.id_marca,
    label: m.nombre,
  }));

  const opcionesEstados = ESTADOS.map((e) => ({ value: e, label: e }));

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold">Productos</h1>
            <p className="text-sm text-gray-500">
              Consulta y gestión de productos (RF03, RF06)
            </p>
          </div>
          <button className="btn-primary" onClick={abrirCrear}>
            + Nuevo producto
          </button>
        </div>

        <div className="card">
          {/* Filtros */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
            <div className="md:col-span-2">
              <label className="block text-sm font-medium mb-1">
                Buscar
              </label>
              <input
                className="input-field"
                placeholder="Nombre, código o código de barras"
                value={filtros.search}
                onChange={(e) =>
                  setFiltros({ ...filtros, search: e.target.value })
                }
              />
            </div>

            <Select
              label="Categoría"
              value={filtros.id_categoria}
              onChange={(e) =>
                setFiltros({
                  ...filtros,
                  id_categoria: e.target.value,
                  id_subcategoria: "",
                })
              }
              options={opcionesCategorias}
              placeholder="Todas las categorías"
            />

            <Select
              label="Subcategoría"
              value={filtros.id_subcategoria}
              onChange={(e) =>
                setFiltros({ ...filtros, id_subcategoria: e.target.value })
              }
              options={opcionesSubcategorias}
              placeholder="Todas las subcategorías"
              disabled={!filtros.id_categoria}
            />

            <Select
              label="Marca"
              value={filtros.id_marca}
              onChange={(e) =>
                setFiltros({ ...filtros, id_marca: e.target.value })
              }
              options={opcionesMarcas}
              placeholder="Todas las marcas"
            />

            <Select
              label="Estado"
              value={filtros.estado}
              onChange={(e) =>
                setFiltros({ ...filtros, estado: e.target.value })
              }
              options={opcionesEstados}
              placeholder="Todos los estados"
            />

            <Select
              label="Controla vencimiento"
              value={filtros.controla_vencimiento}
              onChange={(e) =>
                setFiltros({ ...filtros, controla_vencimiento: e.target.value })
              }
              options={[
                { value: "true", label: "Sí" },
                { value: "false", label: "No" },
              ]}
              placeholder="Todos"
            />

            <Select
              label="Ordenar por"
              value={filtros.orderBy}
              onChange={(e) =>
                setFiltros({ ...filtros, orderBy: e.target.value })
              }
              options={ORDENES}
              placeholder="Selecciona campo"
            />

            <Select
              label="Dirección"
              value={filtros.order}
              onChange={(e) =>
                setFiltros({ ...filtros, order: e.target.value })
              }
              options={[
                { value: "ASC", label: "Ascendente" },
                { value: "DESC", label: "Descendente" },
              ]}
              placeholder="Selecciona dirección"
            />

            <div className="flex items-end">
              <button
                onClick={limpiarFiltros}
                className="btn-secondary w-full"
              >
                Limpiar filtros
              </button>
            </div>
          </div>

          {/* Contador de resultados */}
          <div className="flex justify-between items-center mb-3 text-sm text-gray-600">
            <span>
              {pagination.total} resultado{pagination.total !== 1 && "s"}
            </span>
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
                  <th className="py-2">Subcategoría</th>
                  <th className="py-2">Marca</th>
                  <th className="py-2">Estado</th>
                  <th className="py-2 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan="7" className="py-6 text-center text-gray-500">
                      Cargando...
                    </td>
                  </tr>
                ) : productos.length === 0 ? (
                  <tr>
                    <td colSpan="7" className="py-6 text-center text-gray-500">
                      No se encontraron productos con esos filtros
                    </td>
                  </tr>
                ) : (
                  productos.map((p) => (
                    <tr
                      key={p.id_producto}
                      className="border-b border-gray-100 hover:bg-gray-50"
                    >
                      <td className="py-2 font-mono text-xs">{p.codigo}</td>
                      <td
                        className="py-2 cursor-pointer hover:text-brand-red font-medium"
                        onClick={() => setDetalleId(p.id_producto)}
                      >
                        {p.nombre}
                      </td>
                      <td className="py-2">{p.categoria}</td>
                      <td className="py-2">{p.subcategoria || "-"}</td>
                      <td className="py-2">{p.marca || "-"}</td>
                      <td className="py-2">
                        <Badge estado={p.estado} />
                      </td>
                      <td className="py-2 text-right whitespace-nowrap">
                        <button
                          onClick={() => setDetalleId(p.id_producto)}
                          className="text-blue-600 hover:underline text-sm font-medium mr-3"
                        >
                          Ver
                        </button>
                        <button
                          onClick={() => abrirEditar(p)}
                          className="text-green-600 hover:underline text-sm font-medium mr-3"
                        >
                          Editar
                        </button>
                        <button
                          onClick={() => abrirModalEstado(p)}
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

      {/* Modal cambio de estado (HIP-15) */}
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

      {/* Modal detalle (HIP-12) */}
      <DetalleProducto
        productoId={detalleId}
        onClose={() => setDetalleId(null)}
      />

      {/* Modal crear/editar producto */}
      {formOpen && (
        <FormProducto
          producto={productoEditar}
          onClose={() => setFormOpen(false)}
          onSaved={() => {
            setFormOpen(false);
            cargar(pagination.page);
          }}
        />
      )}
    </Layout>
  );
}