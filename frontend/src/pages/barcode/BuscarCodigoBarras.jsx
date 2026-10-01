import { useState } from "react";
import Layout from "../../components/layout/Layout";
import Badge from "../../components/ui/Badge";
import { buscarPorCodigoBarras } from "../../api/productos.api";

export default function BuscarCodigoBarras() {
  const [codigo, setCodigo] = useState("");
  const [producto, setProducto] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const buscar = async (e) => {
    e.preventDefault();
    if (!codigo.trim()) {
      setError("Ingresa un código de barras");
      return;
    }

    setLoading(true);
    setError("");
    setProducto(null);

    try {
      const res = await buscarPorCodigoBarras(codigo.trim());
      setProducto(res.data);
    } catch (err) {
      setError(
        err.response?.data?.message ||
          "No se encontró producto con ese código de barras"
      );
    } finally {
      setLoading(false);
    }
  };

  const limpiar = () => {
    setCodigo("");
    setProducto(null);
    setError("");
  };

  return (
    <Layout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Buscar por código de barras</h1>
          <p className="text-sm text-gray-500">
            Identifica productos rápidamente con su código de barras (RF05)
          </p>
        </div>

        <div className="card max-w-2xl">
          <form onSubmit={buscar} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">
                Código de barras
              </label>
              <div className="flex gap-2">
                <input
                  className="input-field font-mono"
                  placeholder="Ej: 7501234567890"
                  value={codigo}
                  onChange={(e) => setCodigo(e.target.value)}
                  autoFocus
                />
                <button
                  type="submit"
                  className="btn-primary whitespace-nowrap"
                  disabled={loading}
                >
                  {loading ? "Buscando..." : "Buscar"}
                </button>
                {(codigo || producto) && (
                  <button
                    type="button"
                    className="btn-secondary whitespace-nowrap"
                    onClick={limpiar}
                  >
                    Limpiar
                  </button>
                )}
              </div>
            </div>
          </form>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 p-3 rounded mt-4">
              {error}
            </p>
          )}

          {producto && (
            <div className="mt-6 border-t pt-6">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <p className="text-xs text-gray-500 font-mono">
                    {producto.codigo}
                  </p>
                  <h2 className="text-xl font-bold">{producto.nombre}</h2>
                  <p className="font-mono text-sm text-gray-600">
                    {producto.codigo_barras}
                  </p>
                </div>
                <Badge estado={producto.estado} />
              </div>

              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-gray-500">Categoría</p>
                  <p className="font-medium">{producto.categoria}</p>
                </div>
                <div>
                  <p className="text-gray-500">Marca</p>
                  <p className="font-medium">{producto.marca || "-"}</p>
                </div>
                <div>
                  <p className="text-gray-500">Unidad</p>
                  <p className="font-medium">{producto.unidad}</p>
                </div>
                <div>
                  <p className="text-gray-500">Controla vencimiento</p>
                  <p className="font-medium">
                    {producto.controla_vencimiento ? "Sí" : "No"}
                  </p>
                </div>
                <div>
                  <p className="text-gray-500">Stock mínimo</p>
                  <p className="font-medium">
                    {Number(producto.stock_minimo ?? 0).toLocaleString("es-BO")}
                  </p>
                </div>
                <div>
                  <p className="text-gray-500">Stock máximo</p>
                  <p className="font-medium">
                    {Number(producto.stock_maximo ?? 0).toLocaleString("es-BO")}
                  </p>
                </div>
                <div>
                  <p className="text-gray-500">Punto de reposición</p>
                  <p className="font-medium">
                    {Number(producto.punto_reposicion ?? 0).toLocaleString("es-BO")}
                  </p>
                </div>
                <div>
                  <p className="text-gray-500">Stock reservado</p>
                  <p className="font-medium">
                    {Number(producto.cantidad_reservada ?? 0).toLocaleString("es-BO")}
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}