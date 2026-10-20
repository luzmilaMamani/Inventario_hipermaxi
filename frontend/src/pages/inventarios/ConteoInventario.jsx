import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import Layout from "../../components/layout/Layout";
import { obtenerComparativa, registrarConteo } from "../../api/inventarios.api";
import { listarProductos } from "../../api/productos.api";
import Select from "../../components/ui/Select";

export default function ConteoInventario() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [comparativa, setComparativa] = useState([]);
  const [productos, setProductos] = useState([]);
  const [form, setForm] = useState({ id_producto: "", cantidad_fisica: "" });
  const [error, setError] = useState("");

  const cargar = () => {
    // La comparativa aún no existe en backend (se hace en HIP-46), 
    // pero intentamos cargarla para que no falle la vista.
    obtenerComparativa(id)
      .then((r) => setComparativa(r.data))
      .catch(() => setComparativa([]));
  };

  useEffect(() => {
    cargar();
    listarProductos({ limit: 200 })
      .then((r) => setProductos(r.data))
      .catch(() => setProductos([]));
  }, [id]);

  const guardarConteo = async (e) => {
    e.preventDefault();
    setError("");
    try {
      await registrarConteo(id, form);
      setForm({ id_producto: "", cantidad_fisica: "" });
      cargar();
    } catch (err) {
      setError(err.response?.data?.message || "Error al registrar conteo");
    }
  };

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold">Conteo de Inventario #{id}</h1>
            <p className="text-sm text-gray-500">Ingresa las cantidades físicas encontradas</p>
          </div>
          <button className="btn-secondary" onClick={() => navigate("/inventarios")}>
            Volver a la lista
          </button>
        </div>

        <div className="card">
          <h2 className="font-semibold mb-3">Registrar Conteo</h2>
          <form onSubmit={guardarConteo} className="flex flex-col md:flex-row gap-3 items-end">
            <Select
              label="Producto *"
              value={form.id_producto}
              onChange={(e) => setForm({ ...form, id_producto: e.target.value })}
              options={productos.map((p) => ({ value: p.id_producto, label: `${p.codigo} - ${p.nombre}` }))}
              className="flex-1 w-full"
              placeholder="Selecciona un producto"
            />
            <div className="w-full md:w-48">
              <label className="block text-sm font-medium mb-1">Cantidad Física *</label>
              <input
                type="number"
                min="0"
                className="input-field"
                value={form.cantidad_fisica}
                onChange={(e) => setForm({ ...form, cantidad_fisica: e.target.value })}
                required
              />
            </div>
            <button type="submit" className="btn-primary whitespace-nowrap w-full md:w-auto">
              + Agregar
            </button>
          </form>
          {error && <p className="mt-2 text-sm text-red-600 bg-red-50 p-2 rounded">{error}</p>}
        </div>

        <div className="card">
          <h2 className="font-semibold mb-3">Productos Contados</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left border-b border-gray-200 text-gray-500">
                  <th className="py-2">Producto</th>
                  <th className="py-2 text-right">Cant. Física</th>
                </tr>
              </thead>
              <tbody>
                {comparativa.length === 0 ? (
                  <tr>
                    <td colSpan="2" className="py-6 text-center text-gray-500">
                      Aún no se han registrado conteos.
                    </td>
                  </tr>
                ) : (
                  comparativa.map((c) => (
                    <tr key={c.id_detalle} className="border-b border-gray-100">
                      <td className="py-2">{c.producto || `Producto #${c.id_producto}`}</td>
                      <td className="py-2 text-right">{c.cantidad_fisica}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </Layout>
  );
}