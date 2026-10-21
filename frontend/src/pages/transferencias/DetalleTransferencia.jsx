import { useEffect, useState } from "react";
import Modal from "../../components/ui/Modal";
import { obtenerTransferencia } from "../../api/transferencias.api";

function mostrarFecha(fecha, soloFecha = false) {
  if (!fecha) return "Pendiente";
  const valor = soloFecha ? new Date(`${fecha}T00:00:00`) : new Date(fecha);
  return valor.toLocaleString("es-BO", soloFecha ? { dateStyle: "long" } : {});
}

export default function DetalleTransferencia({ transferenciaId, onClose }) {
  const [transferencia, setTransferencia] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let activo = true;
    setLoading(true);
    setError("");
    setTransferencia(null);

    obtenerTransferencia(transferenciaId)
      .then((respuesta) => {
        if (activo) setTransferencia(respuesta.data);
      })
      .catch((err) => {
        if (activo) {
          setError(
            err.response?.data?.message || "Error al cargar el recorrido",
          );
        }
      })
      .finally(() => {
        if (activo) setLoading(false);
      });

    return () => {
      activo = false;
    };
  }, [transferenciaId]);

  const estado = transferencia?.estado;
  const etapas = [
    {
      nombre: "Solicitud creada",
      fecha: transferencia?.fecha_solicitud,
      completada: Boolean(transferencia?.fecha_solicitud),
    },
    {
      nombre:
        estado === "RECHAZADA"
          ? "Solicitud rechazada"
          : estado === "CANCELADA"
            ? "Transferencia cancelada"
            : "Solicitud aprobada",
      fecha:
        estado === "RECHAZADA"
          ? transferencia?.fecha_rechazo_trazabilidad
          : estado === "CANCELADA"
            ? transferencia?.fecha_cancelacion_trazabilidad
            : transferencia?.fecha_aprobacion_trazabilidad,
      completada:
        estado === "RECHAZADA" ||
        estado === "CANCELADA" ||
        Boolean(transferencia?.fecha_aprobacion_trazabilidad),
    },
    {
      nombre: "Mercadería enviada",
      fecha: transferencia?.fecha_envio_trazabilidad,
      completada: Boolean(transferencia?.fecha_envio_trazabilidad),
    },
    {
      nombre: "Recibida en destino",
      fecha: transferencia?.fecha_recepcion_trazabilidad,
      completada: Boolean(transferencia?.fecha_recepcion_trazabilidad),
    },
  ];
  const etapasVisibles =
    estado === "RECHAZADA" || estado === "CANCELADA"
      ? etapas.slice(0, 2)
      : etapas;

  return (
    <Modal
      open={Boolean(transferenciaId)}
      onClose={onClose}
      title={`Recorrido ${transferencia?.numero_transferencia || ""}`}
    >
      {loading && <p className="text-sm text-gray-500">Cargando recorrido...</p>}
      {error && (
        <p className="rounded bg-red-50 p-2 text-sm text-red-600">{error}</p>
      )}
      {transferencia && (
        <div className="max-h-[75vh] space-y-5 overflow-y-auto text-sm">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-gray-500">Estado actual</p>
              <p className="font-semibold">{transferencia.estado}</p>
            </div>
            <div>
              <p className="text-gray-500">Solicitante</p>
              <p>{transferencia.solicitante || "-"}</p>
            </div>
            <div>
              <p className="text-gray-500">Origen</p>
              <p>{transferencia.almacen_origen}</p>
            </div>
            <div>
              <p className="text-gray-500">Destino</p>
              <p>{transferencia.almacen_destino}</p>
            </div>
            {transferencia.aprobador && (
              <div className="col-span-2">
                <p className="text-gray-500">Aprobado por</p>
                <p>{transferencia.aprobador}</p>
              </div>
            )}
          </div>

          <section>
            <h4 className="mb-3 font-semibold">Seguimiento</h4>
            <ol className="space-y-3 border-l-2 border-gray-200 pl-4">
              {etapasVisibles.map((etapa) => (
                <li key={etapa.nombre} className="relative">
                  <span
                    className={`absolute -left-[21px] top-1 h-3 w-3 rounded-full ${
                      etapa.completada ? "bg-green-500" : "bg-gray-300"
                    }`}
                  />
                  <p className="font-medium">{etapa.nombre}</p>
                  <p className="text-xs text-gray-500">
                    {mostrarFecha(etapa.fecha)}
                  </p>
                </li>
              ))}
            </ol>
          </section>

          <div className="rounded bg-blue-50 p-3">
            <p className="text-gray-600">Llegada estimada</p>
            <p className="font-semibold text-blue-800">
              {mostrarFecha(transferencia.fecha_llegada_estimada, true)}
            </p>
          </div>

          {transferencia.observaciones && (
            <div>
              <p className="text-gray-500">Observaciones</p>
              <p>{transferencia.observaciones}</p>
            </div>
          )}

          <section>
            <h4 className="mb-2 font-semibold">Mercadería</h4>
            <div className="overflow-x-auto rounded border">
              <table className="w-full text-left">
                <thead className="bg-gray-50 text-gray-600">
                  <tr>
                    <th className="p-2">Producto</th>
                    <th className="p-2 text-right">Solicitada</th>
                    <th className="p-2 text-right">Enviada</th>
                    <th className="p-2 text-right">Recibida</th>
                  </tr>
                </thead>
                <tbody>
                  {transferencia.detalles.map((detalle) => (
                    <tr
                      key={detalle.id_detalle_transferencia}
                      className="border-t"
                    >
                      <td className="p-2">
                        <p>{detalle.producto}</p>
                        <p className="font-mono text-xs text-gray-500">
                          {detalle.producto_codigo}
                        </p>
                      </td>
                      <td className="p-2 text-right">
                        {Number(detalle.cantidad_solicitada).toLocaleString(
                          "es-BO",
                        )}
                      </td>
                      <td className="p-2 text-right">
                        {Number(detalle.cantidad_enviada).toLocaleString(
                          "es-BO",
                        )}
                      </td>
                      <td className="p-2 text-right">
                        {Number(detalle.cantidad_recibida).toLocaleString(
                          "es-BO",
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <div className="flex justify-end">
            <button className="btn-secondary" onClick={onClose}>
              Cerrar
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
