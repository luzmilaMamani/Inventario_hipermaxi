import { useEffect, useState } from "react";
import Pagination from "../../components/ui/Pagination";
import Select from "../../components/ui/Select";
import FormSubcategoria from "./FormSubcategoria";
import {
  listarSubcategoriasAdmin,
  actualizarSubcategoria,
  eliminarSubcategoria,
} from "../../api/clasificacion.api";
import { listarCategorias } from "../../api/catalogos.api";

export default function TabSubcategorias() {
  const [items, setItems] = useState([]);
  const [categorias, setCategorias] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 10, total: 0 });
  const [filtroCategoria, setFiltroCategoria] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editar, setEditar] = useState(null);

  useEffect(() => {
    listarCategorias().then((r) => setCategorias(r.data)).catch(() => {});
  }, []);

  const cargar = async (page = 1) => {
    setLoading(true);
    setError("");
    try {
      const params = { page, limit: pagination.limit, orderBy: "nombre", order: "ASC" };
      if (filtroCategoria) params.id_categoria = filtroCategoria;
      const data = await listarSubcategoriasAdmin(params);
      setItems(data.data);
      setPagination(data.pagination);
    } catch (err) {
      setError(err.response?.data?.message || "Error al cargar");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { cargar(1); /* eslint-disable-next-line */ }, [filtroCategoria]);

  const desactivar = async (item) => {
    if (!window.confirm(`¿Desactivar "${item.nombre}"?`)) return;
    try {
      await eliminarSubcategoria(item.id_subcategoria);
      cargar(pagination.page);
    } catch (err) {
      setError(err.response?.data?.message || "Error al desactivar");
    }
  };

  const activar = async (item) => {
    try {
      await actualizarSubcategoria(item.id_subcategoria, { activo: true });
      cargar(pagination.page);
    } catch (err) {
      setError(err.response?.data?.message || "Error al activar");
    }
  };

  const opcionesCategorias = categorias.map((c) => ({
    value: c.id_categoria,
    label: c.nombre,
  }));

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <Select
          value={filtroCategoria}
          onChange={(e) => setFiltroCategoria(e.target.value)}
          options={opcionesCategorias}
          placeholder="Todas las categorías"
          className="max-w-xs"
        />
        <button
          className="btn-primary"
          onClick={() => { setEditar(null); setFormOpen(true); }}
        >
          + Nueva subcategoría
        </button>
      </div>

      {error && <p className="text-sm text-red-600 bg-red-50 p-2 rounded mb-3">{error}</p>}

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left border-b border-gray-200 text-gray-500">
              <th className="py-2">Categoría</th>
              <th className="py-2">Nombre</th>
              <th className="py-2">Descripción</th>
              <th className="py-2">Estado</th>
              <th className="py-2 text-right">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan="5" className="py-6 text-center text-gray-500">Cargando...</td></tr>
            ) : items.length === 0 ? (
              <tr><td colSpan="5" className="py-6 text-center text-gray-500">No hay subcategorías</td></tr>
            ) : (
              items.map((s) => {
                const cat = categorias.find((c) => c.id_categoria === s.id_categoria);
                return (
                  <tr key={s.id_subcategoria} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="py-2 text-gray-600">{cat?.nombre || "-"}</td>
                    <td className="py-2 font-medium">{s.nombre}</td>
                    <td className="py-2 text-gray-600">{s.descripcion || "-"}</td>
                    <td className="py-2">
                      <span className={`px-2 py-1 rounded-full text-xs font-semibold ${
                        s.activo ? "bg-green-100 text-green-700" : "bg-gray-200 text-gray-700"
                      }`}>{s.activo ? "ACTIVA" : "INACTIVA"}</span>
                    </td>
                    <td className="py-2 text-right whitespace-nowrap">
                      <button
                        className="text-green-600 hover:underline text-sm font-medium mr-3"
                        onClick={() => { setEditar(s); setFormOpen(true); }}
                      >Editar</button>
                      {s.activo ? (
                        <button
                          className="text-gray-500 hover:underline text-sm font-medium"
                          onClick={() => desactivar(s)}
                        >Desactivar</button>
                      ) : (
                        <button
                          className="text-brand-red hover:underline text-sm font-medium"
                          onClick={() => activar(s)}
                        >Activar</button>
                      )}
                    </td>
                  </tr>
                );
              })
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
        <FormSubcategoria
          subcategoria={editar}
          onClose={() => setFormOpen(false)}
          onSaved={() => { setFormOpen(false); cargar(pagination.page); }}
        />
      )}
    </div>
  );
}