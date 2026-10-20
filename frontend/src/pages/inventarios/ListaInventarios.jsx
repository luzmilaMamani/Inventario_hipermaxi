import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom"; // <-- NUEVO
import Layout from "../../components/layout/Layout";
import { listarInventarios, crearInventario } from "../../api/inventarios.api";
import { listarAlmacenes } from "../../api/almacenes.api";
import Select from "../../components/ui/Select";
import Modal from "../../components/ui/Modal";

export default function ListaInventarios() {
  const navigate = useNavigate(); // <-- NUEVO
  const [items, setItems] = useState([]);
  const [almacenes, setAlmacenes] = useState([]);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState({ id_almacen: "", fecha_programada: "", alcance: "TODO" });
  const [error, setError] = useState("");

  const cargar = () =>
    listarInventarios()
      .then((r) => setItems(r.data))
      .catch((err) => setError(err.response?.data?.message || "Error al cargar"));

  useEffect(() => {
    cargar();
    listarAlmacenes({ limit: 200 })
      .then((r) => setAlmacenes(r.data))
      .catch(() => setAlmacenes([]));
  }, []);

  const guardar = async (e) => {
    e.preventDefault();
    setError("");
    try {
      await crearInventario(form);
      setFormOpen(false);
      setForm({ id_almacen: "", fecha_programada: "", alcance: "TODO" });
      cargar();
    } catch (err) {
      setError(err.response?.data?.message || "Error al crear inventario");
    }
  };

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold">Inventarios Físicos</h1>
            <p className="text-sm text-gray-500">Planificación y control de conteos</p>
          </div>
          <button className="btn-primary" onClick={() => setFormOpen(true)}>
            + Planificar Inventario
          </button>
        </div>

        <div className="card">
          {error && <p className="text-sm text-red-600 bg-red-50 p-2 rounded mb-3">{error}</p>}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left border-b border-gray-200 text-gray-500">
                  <th className="py-2">Número</th>
                  <th className="py-2">Almacén</th>
                  <th className="py-2">Fecha Programada</th>
                  <th className="py-2">Estado</th>
                  <th className="py-2 text-right">Acciones</th> {/* <-- NUEVO */}
                </tr>
              </thead>
              <tbody>
                {items.length === 0 ? (
                  <tr>
                    <td colSpan="5" className="py-6 text-center text-gray-500">
                      No hay inventarios registrados
                    </td>
                  </tr>
                ) : (
                  items.map((i) => (
                    <tr key={i.id_inventario} className="border-b border-gray-100">
                      <td className="py-2 font-mono text-xs">{i.numero_inventario}</td>
                      <td className="py-2">{i.almacen}</td>
                      <td className="py-2">{new Date(i.fecha_programada).toLocaleDateString()}</td>
                      <td className="py-2">
                        <span className="px-2 py-1 rounded-full text-xs font-semibold bg-blue-100 text-blue-700">
                          {i.estado}
                        </span>
                      </td>
                      <td className="py-2 text-right"> {/* <-- NUEVO */}
                        <button
                          className="text-blue-600 hover:underline text-sm font-medium"
                          onClick={() => navigate(`/inventarios/${i.id_inventario}`)}
                        >
                          Ingresar Conteo
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {formOpen && (
        <Modal open onClose={() => setFormOpen(false)} title="Planificar Inventario Físico">
          <form onSubmit={guardar} className="space-y-4">
            <Select
              label="Almacén *"
              value={form.id_almacen}
              onChange={(e) => setForm({ ...form, id_almacen: e.target.value })}
              options={almacenes.map((a) => ({ value: a.id_almacen, label: a.nombre }))}
              placeholder="Selecciona un almacén"
            />
            <div>
              <label className="block text-sm font-medium mb-1">Fecha Programada *</label>
              <input
                type="date"
                className="input-field"
                value={form.fecha_programada}
                onChange={(e) => setForm({ ...form, fecha_programada: e.target.value })}
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Alcance</label>
              <input
                type="text"
                className="input-field"
                value={form.alcance}
                onChange={(e) => setForm({ ...form, alcance: e.target.value })}
                placeholder="Ej: Todo el almacén, Solo categoría Bebidas"
              />
            </div>
            {error && <p className="text-sm text-red-600 bg-red-50 p-2 rounded">{error}</p>}
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" className="btn-secondary" onClick={() => setFormOpen(false)}>
                Cancelar
              </button>
              <button type="submit" className="btn-primary">
                Guardar
              </button>
            </div>
          </form>
        </Modal>
      )}
    </Layout>
  );
}