import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import Layout from "../../components/layout/Layout";
import { obtenerDiferencias } from "../../api/inventarios.api";

export default function DiferenciasInventario() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setLoading(true);
    obtenerDiferencias(id)
      .then((r) => setItems(r.data))
      .catch((err) => setError(err.response?.data?.message || "Error al cargar diferencias"))
      .finally(() => setLoading(false));
  }, [id]);

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold">Diferencias del Inventario #{id}</h1>
            <p className="text-sm text-gray-500">Productos con faltantes o sobrantes</p>
          </div>
          <button className="btn-secondary" onClick={() => navigate("/inventarios")}>
            Volver a la lista
          </button>
        </div>

        <div className="card">
          {error && <p className="text-sm text-red-600 bg-red-50 p-2 rounded mb-3">{error}</p>}
          
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left border-b border-gray-200 text-gray-500">
                  <th className="py-2">Producto</th>
                  <th className="py-2 text-right">Sistema</th>
                  <th className="py-2 text-right">Físico</th>
                  <th className="py-2 text-right">Diferencia</th>
                  <th className="py-2 text-right">Clasificación</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan="5" className="py-6 text-center text-gray-500">Cargando...</td>
                  </tr>
                ) : items.length === 0 ? (
                  <tr>
                    <td colSpan="5" className="py-6 text-center text-gray-500">
                      No hay diferencias registradas en este inventario.
                    </td>
                  </tr>
                ) : (
                  items.map((i) => (
                    <tr key={i.id_detalle} className="border-b border-gray-100">
                      <td className="py-2">
                        <div className="font-medium">{i.producto}</div>
                        <div className="text-xs text-gray-500 font-mono">{i.codigo}</div>
                      </td>
                      <td className="py-2 text-right">{i.cantidad_sistema}</td>
                      <td className="py-2 text-right">{i.cantidad_fisica}</td>
                      <td className={`py-2 text-right font-semibold ${i.diferencia > 0 ? "text-blue-600" : "text-red-600"}`}>
                        {i.diferencia > 0 ? `+${i.diferencia}` : i.diferencia}
                      </td>
                      <td className="py-2 text-right">
                        <span className={`px-2 py-1 rounded-full text-xs font-semibold ${
                          i.tipo_diferencia === 'SOBRANTE' ? 'bg-blue-100 text-blue-700' : 'bg-red-100 text-red-700'
                        }`}>
                          {i.tipo_diferencia}
                        </span>
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