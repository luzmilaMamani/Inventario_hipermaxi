import { useEffect, useState } from "react";
import Layout from "../../components/layout/Layout";
import Pagination from "../../components/ui/Pagination";
import Select from "../../components/ui/Select";
import FormUbicacion from "./FormUbicacion";
import StockUbicacion from "./StockUbicacion";
import {
  listarUbicaciones,
  eliminarUbicacion,
  actualizarUbicacion,
} from "../../api/ubicaciones.api";
import { listarAlmacenes } from "../../api/almacenes.api";

const FILTROS_INICIALES = {
  id_almacen: "",
  zona: "",
  pasillo: "",
  search: "",
  activo: "",
};

export default function ListaUbicaciones() {
  const [ubicaciones, setUbicaciones] = useState([]);
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 10,
    total: 0,
  });
  const [filtros, setFiltros] = useState(FILTROS_INICIALES);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [almacenes, setAlmacenes] = useState([]);

  const [formOpen, setFormOpen] = useState(false);
  const [ubicacionEditar, setUbicacionEditar] = useState(null);
  const [ubicacionStock, setUbicacionStock] = useState(null);

  useEffect(() => {
    listarAlmacenes({ limit: 200, orderBy: "nombre", order: "ASC" })
      .then((res) => setAlmacenes(res.data))
      .catch(() => setAlmacenes([]));
  }, []);

  const cargar = async (page = 1) => {
    setLoading(true);
    setError("");
    try {
      const params = { page, limit: pagination.limit };
      for (const [key, value] of Object.entries(filtros)) {
        if (value !== "") params[key] = value;
      }
      const data = await listarUbicaciones(params);
      setUbicaciones(data.data);
      setPagination(data.pagination);
    } catch (err) {
      setError(err.response?.data?.message || "Error al cargar ubicaciones");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    cargar(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtros]);

  const abrirCrear = () => {
    setUbicacionEditar(null);
    setFormOpen(true);
  };

  const abrirEditar = (u) => {
    setUbicacionEditar(u);
    setFormOpen(true);
  };

  const desactivar = async (u) => {
    if (!window.confirm(`¿Desactivar la ubicación ${u.zona || ""} ${u.pasillo || ""}?`)) return;
    try {
      await eliminarUbicacion(u.id_ubicacion);
      cargar(pagination.page);
    } catch (err) {
      setError(err.response?.data?.message || "Error al desactivar");
    }
  };

  const activar = async (u) => {
    if (!window.confirm(`¿Activar la ubicación ${u.zona || ""} ${u.pasillo || ""}?`)) return;
    try {
      await actualizarUbicacion(u.id_ubicacion, { activo: true });
      cargar(pagination.page);
    } catch (err) {
      setError(err.response?.data?.message || "Error al activar");
    }
  };

  const limpiarFiltros = () => setFiltros(FILTROS_INICIALES);

  const opcionesAlmacenes = almacenes.map((a) => ({
    value: a.id_almacen,
    label: `${a.codigo} - ${a.nombre}`,
  }));

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold">Ubicaciones</h1>
            <p className="text-sm text-gray-500">
              Administración de zonas, pasillos y estantes (RF08)
            </p>
          </div>
          <button className="btn-primary" onClick={abrirCrear}>
            + Nueva ubicación
          </button>
        </div>

        <div className="card">
          <div className="grid grid-cols-1 md:grid-cols-6 gap-3 mb-4">
            <div className="md:col-span-2">
              <label className="block text-sm font-medium mb-1">Buscar</label>
              <input
                className="input-field"
                placeholder="Zona, pasillo, estante, nivel o descripción"
                value={filtros.search}
                onChange={(e) =>
                  setFiltros({ ...filtros, search: e.target.value })
                }
              />
            </div>
            <Select
              label="Almacén"
              value={filtros.id_almacen}
              onChange={(e) =>
                setFiltros({ ...filtros, id_almacen: e.target.value })
              }
              options={opcionesAlmacenes}
              placeholder="Todos los almacenes"
            />
            <div>
              <label className="block text-sm font-medium mb-1">Zona</label>
              <input
                className="input-field"
                value={filtros.zona}
                onChange={(e) => setFiltros({ ...filtros, zona: e.target.value })}
                placeholder="Ej. A"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Pasillo</label>
              <input
                className="input-field"
                value={filtros.pasillo}
                onChange={(e) => setFiltros({ ...filtros, pasillo: e.target.value })}
                placeholder="Ej. P1"
              />
            </div>
            <Select
              label="Activo"
              value={filtros.activo}
              onChange={(e) =>
                setFiltros({ ...filtros, activo: e.target.value })
              }
              options={[
                { value: "true", label: "Sí" },
                { value: "false", label: "No" },
              ]}
              placeholder="Todos"
            />
            <div className="flex items-end">
              <button
                className="btn-secondary w-full"
                onClick={limpiarFiltros}
              >
                Limpiar filtros
              </button>
            </div>
          </div>

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
                  <th className="py-2">Almacén</th>
                  <th className="py-2">Dirección</th>
                  <th className="py-2 text-right">Unidades</th>
                  <th className="py-2">Estado</th>
                  <th className="py-2 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan="5" className="py-6 text-center text-gray-500">
                      Cargando...
                    </td>
                  </tr>
                ) : ubicaciones.length === 0 ? (
                  <tr>
                    <td colSpan="5" className="py-6 text-center text-gray-500">
                      No hay ubicaciones registradas
                    </td>
                  </tr>
                ) : (
                  ubicaciones.map((u) => (
                    <tr
                      key={u.id_ubicacion}
                      className="border-b border-gray-100 hover:bg-gray-50"
                    >
                      <td className="py-2">{u.almacen}</td>
                      <td className="py-2 font-mono text-xs">
                        {[u.zona, u.pasillo, u.estante, u.nivel]
                          .filter(Boolean)
                          .join(" / ") || "-"}
                      </td>
                      <td className="py-2 text-right">
                        {Number(u.total_productos).toFixed(0)}
                      </td>
                      <td className="py-2">
                        <span
                          className={`px-2 py-1 rounded-full text-xs font-semibold ${
                            u.activo
                              ? "bg-green-100 text-green-700"
                              : "bg-gray-200 text-gray-700"
                          }`}
                        >
                          {u.activo ? "ACTIVA" : "INACTIVA"}
                        </span>
                      </td>
                      <td className="py-2 text-right whitespace-nowrap">
                        <button
                          className="text-blue-600 hover:underline text-sm font-medium mr-3"
                          onClick={() => setUbicacionStock(u)}
                        >
                          Ver stock
                        </button>
                        <button
                          className="text-brand-red hover:underline text-sm font-medium mr-3"
                          onClick={() => abrirEditar(u)}
                        >
                          Editar
                        </button>
                        {u.activo ? (
                          <button
                            className="text-gray-500 hover:underline text-sm font-medium"
                            onClick={() => desactivar(u)}
                          >
                            Desactivar
                          </button>
                        ) : (
                          <button
                            className="text-green-600 hover:underline text-sm font-medium"
                            onClick={() => activar(u)}
                          >
                            Activar
                          </button>
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
            onChange={(page) => cargar(page)}
          />
        </div>
      </div>

      {formOpen && (
        <FormUbicacion
          ubicacion={ubicacionEditar}
          onClose={() => setFormOpen(false)}
          onSaved={() => {
            setFormOpen(false);
            cargar(pagination.page);
          }}
        />
      )}

      {ubicacionStock && (
        <StockUbicacion
          ubicacion={ubicacionStock}
          onClose={() => setUbicacionStock(null)}
          onChanged={() => cargar(pagination.page)}
        />
      )}
    </Layout>
  );
}