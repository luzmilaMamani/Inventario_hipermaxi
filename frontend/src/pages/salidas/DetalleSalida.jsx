import { useEffect, useState } from "react";
import Modal from "../../components/ui/Modal";
import { obtenerSalida } from "../../api/salidas.api";

export default function DetalleSalida({ salidaId, onClose }) {
  const [salida, setSalida] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!salidaId) return;
    let activo = true;
    setLoading(true);
    setError("");
    setSalida(null);

    obtenerSalida(salidaId)
      .then((res) => {
        if (activo) setSalida(res.data);
      })
      .catch((err) => {
        if (activo)
          setError(err.response?.data?.message || "Error al cargar el detalle");
      })
      .finally(() => {
        if (activo) setLoading(false);
      });

    return () => {
      activo = false;
    };
  }, [salidaId]);

  const totalGeneral = salida?.detalles?.reduce(
    (acc, d) => acc + Number(d.cantidad) * Number(d.precio_unitario || 0),
    0,
  );

  return (
    <Modal
      open={!!salidaId}
      onClose={onClose}
      title={`Detalle de salida ${salida?.numero_salida || ""}`}
    >
      {loading && <p className="text-gray-500">Cargando...</p>}

      {error && (
        <p className="text-sm text-red-600 bg-red-50 p-2 rounded">{error}</p>
      )}

      {salida && (
        <div className="space-y-4 text-sm">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-gray-500">Número</p>
              <p className="font-mono font-semibold">{salida.numero_salida}</p>
            </div>
            <div>
              <p className="text-gray-500">Fecha</p>
              <p>{new Date(salida.fecha_salida).toLocaleString("es-BO")}</p>
            </div>
            <div>
              <p className="text-gray-500">Motivo</p>
              <p className="font-semibold">{salida.motivo}</p>
              {salida.subtipo_perdida && (
                <p className="text-xs text-gray-500">
                  Subtipo: {salida.subtipo_perdida}
                </p>
              )}
            </div>
            <div>
              <p className="text-gray-500">Almacén</p>
              <p>{salida.almacen}</p>
            </div>
            <div>
              <p className="text-gray-500">Usuario</p>
              <p>{salida.usuario_registra}</p>
            </div>
            {salida.referencia_externa && (
              <div>
                <p className="text-gray-500">Referencia externa</p>
                <p>{salida.referencia_externa}</p>
              </div>
            )}
          </div>

          {salida.observaciones && (
            <div>
              <p className="text-gray-500">Observaciones</p>
              <p className="bg-gray-50 p-2 rounded">{salida.observaciones}</p>
            </div>
          )}

          <hr />

          <div>
            <p className="font-semibold mb-2">Productos</p>
            <div className="border rounded overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-gray-600">
                  <tr>
                    <th className="text-left py-2 px-3">Producto</th>
                    <th className="text-left py-2 px-3">Lote</th>
                    <th className="text-right py-2 px-3">Cantidad</th>
                    <th className="text-right py-2 px-3">Precio unit.</th>
                    <th className="text-right py-2 px-3">Valor total</th>
                  </tr>
                </thead>
                <tbody>
                  {salida.detalles.map((d) => {
                    const valor =
                      Number(d.cantidad) * Number(d.precio_unitario || 0);
                    return (
                      <tr key={d.id_detalle_salida} className="border-t">
                        <td className="py-2 px-3">
                          <div className="font-medium">{d.producto}</div>
                          <div className="text-xs text-gray-500 font-mono">
                            {d.producto_codigo}
                          </div>
                        </td>
                        <td className="py-2 px-3 font-mono text-xs">
                          {d.numero_lote || "-"}
                        </td>
                        <td className="py-2 px-3 text-right">
                          {Number(d.cantidad).toLocaleString("es-BO")}{" "}
                          unid.
                        </td>
                        <td className="py-2 px-3 text-right">
                          Bs {Number(d.precio_unitario || 0).toFixed(2)}
                        </td>
                        <td className="py-2 px-3 text-right font-semibold">
                          Bs {valor.toFixed(2)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t bg-gray-50">
                    <td
                      colSpan="4"
                      className="py-2 px-3 text-right font-semibold"
                    >
                      Total
                    </td>
                    <td className="py-2 px-3 text-right font-bold">
                      Bs {Number(totalGeneral || 0).toFixed(2)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

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
