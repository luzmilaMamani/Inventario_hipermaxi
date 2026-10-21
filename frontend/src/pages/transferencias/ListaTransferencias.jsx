import { useEffect, useState } from "react";
import Layout from "../../components/layout/Layout";
import Modal from "../../components/ui/Modal";
import Select from "../../components/ui/Select";
import { useAuth } from "../../context/AuthContext";
import DetalleTransferencia from "./DetalleTransferencia";
import FormTransferencia from "./FormTransferencia";
import { listarTransferencias, cambiarEstadoTransferencia } from "../../api/transferencias.api";

export default function ListaTransferencias() {
  const { user } = useAuth();
  const [transferencias, setTransferencias] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [filtroEstado, setFiltroEstado] = useState("");
  const [transferenciaDetalleId, setTransferenciaDetalleId] = useState(null);
  
  // Estados para los modales de RF31 y RF32
  const [envioPendiente, setEnvioPendiente] = useState(null);
  const [recepcionPendiente, setRecepcionPendiente] = useState(null);

  const puedeDecidir = ["ENCARGADO_ALMACEN", "ADMINISTRADOR"].includes(user?.rol);

  const cargar = async () => {
    setLoading(true);
    setError("");
    try {
      const params = filtroEstado ? { estado: filtroEstado } : {};
      const data = await listarTransferencias(params);
      setTransferencias(data.data || []);
    } catch (err) {
      setError(err.response?.data?.message || "Error al cargar transferencias");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtroEstado]);

  const handleCambiarEstado = async (id, nuevoEstado, payloadExtra = {}) => {
    if (!window.confirm(`¿Confirmas registrar la ${nuevoEstado === "ENVIADA" ? "salida del almacén" : "entrada al almacén"}?`)) return false;
    try {
      await cambiarEstadoTransferencia(id, nuevoEstado, payloadExtra);
      cargar();
      return true;
    } catch (err) {
      alert(err.response?.data?.message || "Error al cambiar estado");
      return false;
    }
  };

  const confirmarEnvio = async (e) => {
    e.preventDefault();
    if (!envioPendiente?.fecha) return;
    const exito = await handleCambiarEstado(envioPendiente.id, "ENVIADA", { fecha_llegada_estimada: envioPendiente.fecha });
    if (exito) setEnvioPendiente(null);
  };

  const confirmarRecepcion = async (e) => {
    e.preventDefault();
    // Aquí podrías enviar detalles_recibidos si quisieras controlar diferencias exactas por producto
    const exito = await handleCambiarEstado(recepcionPendiente.id, "RECIBIDA", {});
    if (exito) setRecepcionPendiente(null);
  };

  const getBadgeColor = (estado) => {
    switch (estado) {
      case "SOLICITADA": return "bg-blue-100 text-blue-700";
      case "APROBADA": return "bg-green-100 text-green-700";
      case "RECHAZADA": return "bg-red-100 text-red-700";
      case "ENVIADA": return "bg-amber-100 text-amber-700";
      case "RECIBIDA": return "bg-purple-100 text-purple-700";
      default: return "bg-gray-100 text-gray-700";
    }
  };

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold">Transferencias</h1>
            <p className="text-sm text-gray-500">Solicitudes y envíos entre almacenes (RF29, RF31, RF32)</p>
          </div>
          <button className="btn-primary" onClick={() => setFormOpen(true)}>
            + Nueva transferencia
          </button>
        </div>

        <div className="card">
          <div className="mb-4 flex gap-3">
            <Select
              label="Filtrar por Estado"
              value={filtroEstado}
              onChange={(e) => setFiltroEstado(e.target.value)}
              options={[
                { value: "SOLICITADA", label: "Solicitada" },
                { value: "APROBADA", label: "Aprobada" },
                { value: "ENVIADA", label: "Enviada (En Tránsito)" },
                { value: "RECIBIDA", label: "Recibida" },
              ]}
              placeholder="Todos los estados"
              className="w-64"
            />
          </div>

          {error && <p className="text-red-500 mb-3">{error}</p>}

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left border-b border-gray-200 text-gray-500">
                  <th className="py-2">Número</th>
                  <th className="py-2">Origen</th>
                  <th className="py-2">Destino</th>
                  <th className="py-2">Estado</th>
                  <th className="py-2">Llegada Est.</th>
                  <th className="py-2 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan="6" className="text-center py-4">Cargando...</td></tr>
                ) : (
                  transferencias.map((t) => (
                    <tr key={t.id_transferencia} className="border-b border-gray-100">
                      <td className="py-2 font-mono text-xs">{t.numero_transferencia}</td>
                      <td className="py-2">{t.almacen_origen}</td>
                      <td className="py-2">{t.almacen_destino}</td>
                      <td className="py-2">
                        <span className={`px-2 py-1 rounded-full text-xs font-semibold ${getBadgeColor(t.estado)}`}>{t.estado}</span>
                      </td>
                      <td className="py-2">
                        {t.fecha_llegada_estimada ? new Date(`${t.fecha_llegada_estimada}T00:00:00`).toLocaleDateString("es-BO") : "-"}
                      </td>
                      <td className="py-2 text-right space-x-2 whitespace-nowrap">
                        <button onClick={() => setTransferenciaDetalleId(t.id_transferencia)} className="text-blue-600 hover:underline font-medium">Ver</button>
                        
                        {/* RF29: Aprobar / Rechazar */}
                        {t.estado === "SOLICITADA" && puedeDecidir && (
                          <>
                            <button onClick={() => handleCambiarEstado(t.id_transferencia, "APROBADA")} className="text-green-600 hover:underline font-medium">Aprobar</button>
                            <button onClick={() => handleCambiarEstado(t.id_transferencia, "RECHAZADA")} className="text-red-600 hover:underline font-medium">Rechazar</button>
                          </>
                        )}

                        {/* RF31: Registrar Envío */}
                        {t.estado === "APROBADA" && puedeDecidir && (
                          <button onClick={() => setEnvioPendiente({ id: t.id_transferencia, fecha: "" })} className="text-amber-600 hover:underline font-medium">Registrar Envío</button>
                        )}

                        {/* RF32: Registrar Recepción */}
                        {t.estado === "ENVIADA" && (
                          <button onClick={() => setRecepcionPendiente({ id: t.id_transferencia })} className="text-purple-600 hover:underline font-medium">Registrar Recepción</button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {formOpen && <FormTransferencia onClose={() => setFormOpen(false)} onSaved={() => { setFormOpen(false); cargar(); }} />}
      {transferenciaDetalleId && <DetalleTransferencia transferenciaId={transferenciaDetalleId} onClose={() => setTransferenciaDetalleId(null)} />}

      {/* Modal RF31 */}
      {envioPendiente && (
        <Modal open onClose={() => setEnvioPendiente(null)} title="Registrar Envío (Sale del Almacén)">
          <form onSubmit={confirmarEnvio} className="space-y-4">
            <p className="text-sm text-gray-600">El stock se descontará del almacén de origen y la mercadería quedará en tránsito.</p>
            <div>
              <label className="block text-sm font-medium mb-1">Fecha Estimada de Llegada *</label>
              <input type="date" required className="input-field" value={envioPendiente.fecha} onChange={(e) => setEnvioPendiente({ ...envioPendiente, fecha: e.target.value })} />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" className="btn-secondary" onClick={() => setEnvioPendiente(null)}>Cancelar</button>
              <button type="submit" className="btn-primary">Confirmar Envío</button>
            </div>
          </form>
        </Modal>
      )}

      {/* Modal RF32 */}
      {recepcionPendiente && (
        <Modal open onClose={() => setRecepcionPendiente(null)} title="Registrar Recepción (Ingresa al Almacén)">
          <form onSubmit={confirmarRecepcion} className="space-y-4">
            <p className="text-sm text-gray-600">Al confirmar, el stock ingresará al almacén de destino y se cerrará la transferencia.</p>
            <div>
              <label className="block text-sm font-medium mb-1">Observaciones de recepción</label>
              <textarea className="input-field" rows="2" placeholder="Ej: Llegó todo en buen estado, o detallar faltantes..." />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" className="btn-secondary" onClick={() => setRecepcionPendiente(null)}>Cancelar</button>
              <button type="submit" className="btn-primary">Confirmar Recepción</button>
            </div>
          </form>
        </Modal>
      )}
    </Layout>
  );
}