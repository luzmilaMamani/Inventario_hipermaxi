import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import Layout from "../../components/layout/Layout";
import { obtenerComparativa, registrarConteo } from "../../api/inventarios.api";
import { listarProductos } from "../../api/productos.api";
import Select from "../../components/ui/Select";
import RoleGate from "../../components/ui/RoleGate";
import { ROLES_OPERACION } from "../../utils/permissions";

export default function ConteoInventario() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [comparativa, setComparativa] = useState([]);
  const [productos, setProductos] = useState([]);
  const [form, setForm] = useState({ id_producto: "", cantidad_fisica: "" });
  const [error, setError] = useState("");

  const cargar = () => {
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
            <p className="text-sm text-gray-500">Ingresa las cantidades y compara con el sistema</p>
          </div>
          <button className="btn-secondary" onClick={() => navigate("/inventarios")}>
            Volver a la lista
          </button>
        </div>

        <div className="card">
          <RoleGate roles={ROLES_OPERACION}>
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
          </RoleGate>
          {error && <p className="mt-2 text-sm text-red-600 bg-red-50 p-2 rounded">{error}</p>}
        </div>

        <div className="card">
          <h2 className="font-semibold mb-3">Comparativa de Conteo</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left border-b border-gray-200 text-gray-500">
                  <th className="py-2">Producto</th>
                  <th className="py-2 text-right">Sistema</th>
                  <th className="py-2 text-right">Físico</th>
                  <th className="py-2 text-right">Diferencia</th>
                </tr>
              </thead>
              <tbody>
                {comparativa.length === 0 ? (
                  <tr>
                    <td colSpan="4" className="py-6 text-center text-gray-500">
                      Aún no se han registrado conteos.
                    </td>
                  </tr>
                ) : (
                  comparativa.map((c) => (
                    <tr key={c.id_detalle} className="border-b border-gray-100">
                      <td className="py-2">
                        <div className="font-medium">{c.producto}</div>
                        <div className="text-xs text-gray-500 font-mono">{c.codigo}</div>
                      </td>
                      <td className="py-2 text-right">{c.cantidad_sistema}</td>
                      <td className="py-2 text-right">{c.cantidad_fisica}</td>
                      <td className={`py-2 text-right font-semibold ${c.diferencia !== 0 ? 'text-red-600' : 'text-green-600'}`}>
                        {c.diferencia > 0 ? `+${c.diferencia}` : c.diferencia}
                      </td>
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