import { useEffect, useState } from "react";
import Pagination from "../../components/ui/Pagination";
import FormCategoria from "./FormCategoria";
import {
  listarCategoriasAdmin,
  actualizarCategoria,
  eliminarCategoria,
} from "../../api/clasificacion.api";

export default function TabCategorias() {
  const [items, setItems] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 10, total: 0 });
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editar, setEditar] = useState(null);

  const cargar = async (page = 1) => {
    setLoading(true);
    setError("");
    try {
      const params = { page, limit: pagination.limit, orderBy: "nombre", order: "ASC" };
      if (search) params.nombre = search;
      const data = await listarCategoriasAdmin(params);
      setItems(data.data);
      setPagination(data.pagination);
    } catch (err) {
      setError(err.response?.data?.message || "Error al cargar");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { cargar(1); /* eslint-disable-next-line */ }, [search]);

  const desactivar = async (item) => {
    if (!window.confirm(`¿Desactivar "${item.nombre}"?`)) return;
    try {
      await eliminarCategoria(item.id_categoria);
      cargar(pagination.page);
    } catch (err) {
      setError(err.response?.data?.message || "Error al desactivar");
    }
  };

  const activar = async (item) => {
    try {
      await actualizarCategoria(item.id_categoria, { activo: true });
      cargar(pagination.page);
    } catch (err) {
      setError(err.response?.data?.message || "Error al activar");
    }
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <input
          className="input-field max-w-xs"
          placeholder="Buscar categoría..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <button
          className="btn-primary"
          onClick={() => { setEditar(null); setFormOpen(true); }}
        >
          + Nueva categoría
        </button>
      </div>

      {error && <p className="text-sm text-red-600 bg-red-50 p-2 rounded mb-3">{error}</p>}

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left border-b border-gray-200 text-gray-500">
              <th className="py-2">Nombre</th>
              <th className="py-2">Descripción</th>
              <th className="py-2">Estado</th>
              <th className="py-2 text-right">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan="4" className="py-6 text-center text-gray-500">Cargando...</td></tr>
            ) : items.length === 0 ? (
              <tr><td colSpan="4" className="py-6 text-center text-gray-500">No hay categorías</td></tr>
            ) : (
              items.map((c) => (
                <tr key={c.id_categoria} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="py-2 font-medium">{c.nombre}</td>
                  <td className="py-2 text-gray-600">{c.descripcion || "-"}</td>
                  <td className="py-2">
                    <span className={`px-2 py-1 rounded-full text-xs font-semibold ${
                      c.activo ? "bg-green-100 text-green-700" : "bg-gray-200 text-gray-700"
                    }`}>{c.activo ? "ACTIVA" : "INACTIVA"}</span>
                  </td>
                  <td className="py-2 text-right whitespace-nowrap">
                    <button
                      className="text-green-600 hover:underline text-sm font-medium mr-3"
                      onClick={() => { setEditar(c); setFormOpen(true); }}
                    >Editar</button>
                    {c.activo ? (
                      <button
                        className="text-gray-500 hover:underline text-sm font-medium"
                        onClick={() => desactivar(c)}
                      >Desactivar</button>
                    ) : (
                      <button
                        className="text-brand-red hover:underline text-sm font-medium"
                        onClick={() => activar(c)}
                      >Activar</button>
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
        onChange={(p) => cargar(p)}
      />

      {formOpen && (
        <FormCategoria
          categoria={editar}
          onClose={() => setFormOpen(false)}
          onSaved={() => { setFormOpen(false); cargar(pagination.page); }}
        />
      )}
    </div>
  );
}