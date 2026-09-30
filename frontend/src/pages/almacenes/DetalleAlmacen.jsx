import { useEffect, useState } from "react";
import Modal from "../../components/ui/Modal";
import { obtenerStockAlmacen } from "../../api/almacenes.api";

export default function DetalleAlmacen({ almacen, onClose }) {
  const [stock, setStock] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!almacen) return;

    let activo = true;
    setLoading(true);
    setError("");
    setStock([]);

    obtenerStockAlmacen(almacen.id_almacen)
      .then((res) => {
        if (activo) setStock(res.data);
      })
      .catch((err) => {
        if (activo)
          setError(
            err.response?.data?.message || "Error al cargar el stock"
          );
      })
      .finally(() => {
        if (activo) setLoading(false);
      });

    return () => {
      activo = false;
    };
  }, [almacen]);

  return (
    <Modal
      open={!!almacen}
      onClose={onClose}
      title={`Stock en ${almacen?.nombre || ""}`}
    >
      {almacen && (
        <div className="space-y-4">
          <div className="text-sm text-gray-600">
            <p>
              <strong>Código:</strong> {almacen.codigo}
            </p>
            <p>
              <strong>Tipo:</strong> {almacen.tipo}
            </p>
            {almacen.ciudad && (
              <p>
                <strong>Ciudad:</strong> {almacen.ciudad}
              </p>
            )}
          </div>

          <hr />

          {loading && (
            <p className="text-gray-500 text-sm">Cargando stock...</p>
          )}

          {error && (
            <p className="text-sm text-red-600 bg-red-50 p-2 rounded">
              {error}
            </p>
          )}

          {!loading && !error && stock.length === 0 && (
            <p className="text-gray-500 text-sm">
              Este almacén no tiene stock registrado.
            </p>
          )}

          {!loading && !error && stock.length > 0 && (
            <div className="max-h-80 overflow-y-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left border-b border-gray-200 text-gray-500">
                    <th className="py-2">Producto</th>
                    <th className="py-2 text-right">Cantidad</th>
                    <th className="py-2 text-right">Reservado</th>
                    <th className="py-2 text-right">Disponible</th>
                  </tr>
                </thead>
                <tbody>
                  {stock.map((s) => (
                    <tr
                      key={s.id_stock}
                      className="border-b border-gray-100"
                    >
                      <td className="py-2">
                        <div className="font-medium">{s.producto}</div>
                        <div className="text-xs text-gray-500 font-mono">
                          {s.producto_codigo}
                        </div>
                      </td>
                      <td className="py-2 text-right">
                        {Number(s.cantidad).toFixed(2)} {s.unidad}
                      </td>
                      <td className="py-2 text-right text-gray-500">
                        {Number(s.cantidad_reservada).toFixed(2)}
                      </td>
                      <td className="py-2 text-right font-semibold">
                        {Number(s.cantidad_disponible).toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="flex justify-end pt-2">
            <button className="btn-secondary" onClick={onClose}>
              Cerrar
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}