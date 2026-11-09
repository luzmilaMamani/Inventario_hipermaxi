import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import Layout from "../../components/layout/Layout";
import Modal from "../../components/ui/Modal";
import Select from "../../components/ui/Select";
import { useAuth } from "../../context/AuthContext";
import { ROLES_CANCELAN_TRANSFERENCIA } from "../../utils/permissions";
import DetalleTransferencia from "./DetalleTransferencia";
import FormTransferencia from "./FormTransferencia";
import {
  listarTransferencias,
  cambiarEstadoTransferencia,
  obtenerTransferencia,
} from "../../api/transferencias.api";

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
  const [errorRecepcion, setErrorRecepcion] = useState("");
  const [guardandoRecepcion, setGuardandoRecepcion] = useState(false);
  const [mensaje, setMensaje] = useState("");

  const puedeDecidir = ["ENCARGADO_ALMACEN", "ADMINISTRADOR"].includes(user?.rol);
  const puedeCancelar = ROLES_CANCELAN_TRANSFERENCIA.includes(user?.rol);

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

  // RF58: diferencia por línea (negativa = faltante, positiva = sobrante).
  const diferenciaLinea = (detalle) =>
    detalle.cantidad_recibida === ""
      ? null
      : Number(detalle.cantidad_recibida) - detalle.cantidad_enviada;

  const confirmarRecepcion = async (e) => {
    e.preventDefault();
    setErrorRecepcion("");
    for (const detalle of recepcionPendiente.detalles) {
      const cantidad = Number(detalle.cantidad_recibida);
      if (detalle.cantidad_recibida === "" || !Number.isInteger(cantidad) || cantidad < 0) {
        return setErrorRecepcion(`La cantidad recibida de ${detalle.producto} debe ser un número entero mayor o igual a 0`);
      }
      if (diferenciaLinea(detalle) !== 0 && detalle.observacion.trim().length < 5) {
        return setErrorRecepcion(`Explica la diferencia de ${detalle.producto} en la observación (mínimo 5 caracteres)`);
      }
    }
    const lineasConDiferencia = recepcionPendiente.detalles.filter((d) => diferenciaLinea(d) !== 0).length;
    const pregunta = lineasConDiferencia
      ? `Hay diferencias en ${lineasConDiferencia} producto(s). La transferencia quedará RECIBIDA CON DIFERENCIAS y solo ingresará al stock lo recibido. ¿Confirmas?`
      : "¿Confirmas registrar la entrada al almacén?";
    if (!window.confirm(pregunta)) return;

    setGuardandoRecepcion(true);
    try {
      const respuesta = await cambiarEstadoTransferencia(recepcionPendiente.id, "RECIBIDA", {
        observaciones_recepcion: recepcionPendiente.observaciones.trim() || null,
        detalles_recibidos: recepcionPendiente.detalles.map((detalle) => ({
          id_detalle_transferencia: detalle.id_detalle_transferencia,
          cantidad_recibida: Number(detalle.cantidad_recibida),
          observacion: detalle.observacion.trim() || null,
        })),
      });
      setRecepcionPendiente(null);
      setMensaje(respuesta.message || "Recepción registrada");
      cargar();
    } catch (err) {
      setErrorRecepcion(err.response?.data?.message || "Error al registrar la recepción");
    } finally {
      setGuardandoRecepcion(false);
    }
  };

  const actualizarLineaRecepcion = (indice, cambios) =>
    setRecepcionPendiente((actual) => ({
      ...actual,
      detalles: actual.detalles.map((linea, posicion) =>
        posicion === indice ? { ...linea, ...cambios } : linea,
      ),
    }));

  const abrirRecepcion = async (id) => {
    try {
      const respuesta = await obtenerTransferencia(id);
      setErrorRecepcion("");
      setRecepcionPendiente({
        id,
        numero: respuesta.data.numero_transferencia,
        origen: respuesta.data.almacen_origen,
        observaciones: "",
        detalles: respuesta.data.detalles.map((detalle) => ({
          id_detalle_transferencia: detalle.id_detalle_transferencia,
          producto: detalle.producto,
          producto_codigo: detalle.producto_codigo,
          cantidad_enviada: Number(detalle.cantidad_enviada),
          cantidad_recibida: String(Number(detalle.cantidad_enviada)),
          observacion: "",
        })),
      });
    } catch (err) {
      alert(err.response?.data?.message || "Error al cargar el detalle enviado");
    }
  };

  const getBadgeColor = (estado) => {
    switch (estado) {
      case "SOLICITADA": return "bg-blue-100 text-blue-700";
      case "APROBADA": return "bg-green-100 text-green-700";
      case "RECHAZADA": return "bg-red-100 text-red-700";
      case "ENVIADA": return "bg-amber-100 text-amber-700";
      case "RECIBIDA": return "bg-purple-100 text-purple-700";
      case "RECIBIDA_CON_DIFERENCIAS": return "bg-orange-100 text-orange-700";
      case "CANCELADA": return "bg-gray-200 text-gray-600";
      default: return "bg-gray-100 text-gray-700";
    }
  };

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold">Transferencias</h1>
            <p className="text-sm text-gray-500">Solicitudes y envíos entre almacenes (RF29, RF31, RF32, RF58)</p>
          </div>
          <div className="flex gap-2">
            <Link to="/transferencias/diferencias" className="btn-secondary">
              Diferencias en recepción
            </Link>
            <button className="btn-primary" onClick={() => setFormOpen(true)}>
              + Nueva transferencia
            </button>
          </div>
        </div>

        {mensaje && (
          <div className="flex items-start justify-between gap-3 rounded bg-green-50 p-3 text-sm text-green-700">
            <span>{mensaje}</span>
            <button type="button" className="font-semibold" onClick={() => setMensaje("")}>
              ×
            </button>
          </div>
        )}

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
                { value: "RECIBIDA_CON_DIFERENCIAS", label: "Recibida con diferencias" },
                { value: "RECHAZADA", label: "Rechazada" },
                { value: "CANCELADA", label: "Cancelada" },
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
                        <span className={`px-2 py-1 rounded-full text-xs font-semibold ${getBadgeColor(t.estado)}`}>{t.estado.replaceAll("_", " ")}</span>
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

                        {/* RF57: Cancelar solicitud no enviada (motivo en el detalle) */}
                        {["SOLICITADA", "APROBADA"].includes(t.estado) && puedeCancelar && (
                          <button onClick={() => setTransferenciaDetalleId(t.id_transferencia)} className="text-gray-600 hover:underline font-medium">Cancelar</button>
                        )}

                        {/* RF32: Registrar Recepción */}
                        {t.estado === "ENVIADA" && (
                          <button onClick={() => abrirRecepcion(t.id_transferencia)} className="text-purple-600 hover:underline font-medium">Registrar Recepción</button>
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
      {transferenciaDetalleId && <DetalleTransferencia transferenciaId={transferenciaDetalleId} onClose={() => setTransferenciaDetalleId(null)} onCancelada={cargar} />}

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
        <Modal open onClose={() => setRecepcionPendiente(null)} title={`Registrar Recepción ${recepcionPendiente.numero || ""}`}>
          <form onSubmit={confirmarRecepcion} className="max-h-[75vh] space-y-4 overflow-y-auto">
            <p className="text-sm text-gray-600">
              Registra lo realmente recibido de {recepcionPendiente.origen}. Solo esas cantidades ingresarán al stock del
              almacén de destino. Si hay faltante o sobrante, explica la diferencia: el almacén de origen podrá consultarla.
            </p>
            <div className="space-y-3">
              {recepcionPendiente.detalles.map((detalle, indice) => {
                const diferencia = diferenciaLinea(detalle);
                const conDiferencia = diferencia !== null && diferencia !== 0;
                return (
                  <div
                    key={detalle.id_detalle_transferencia}
                    className={`space-y-2 rounded border p-3 ${conDiferencia ? "border-orange-300 bg-orange-50" : "border-gray-200"}`}
                  >
                    <div className="grid grid-cols-[1fr_110px_130px] items-end gap-3">
                      <div className="text-sm">
                        <p className="font-medium">{detalle.producto}</p>
                        <p className="text-xs text-gray-500">
                          <span className="font-mono">{detalle.producto_codigo}</span> · Enviado: {detalle.cantidad_enviada}
                        </p>
                      </div>
                      <label className="text-sm">
                        Recibido
                        <input
                          type="number"
                          min="0"
                          step="1"
                          required
                          className="input-field mt-1"
                          value={detalle.cantidad_recibida}
                          onChange={(e) => actualizarLineaRecepcion(indice, { cantidad_recibida: e.target.value })}
                        />
                      </label>
                      <span
                        className={`pb-2 text-xs font-semibold ${
                          diferencia === null || diferencia === 0
                            ? "text-gray-500"
                            : diferencia < 0
                              ? "text-red-600"
                              : "text-blue-700"
                        }`}
                      >
                        {diferencia === null
                          ? "Diferencia: -"
                          : diferencia === 0
                            ? "Sin diferencia"
                            : diferencia < 0
                              ? `Faltante: ${-diferencia}`
                              : `Sobrante: +${diferencia}`}
                      </span>
                    </div>
                    {conDiferencia && (
                      <input
                        className="input-field"
                        maxLength="300"
                        value={detalle.observacion}
                        onChange={(e) => actualizarLineaRecepcion(indice, { observacion: e.target.value })}
                        placeholder="Observación obligatoria: ej. caja dañada en el viaje, llegó una unidad de más"
                        aria-label={`Observación de ${detalle.producto}`}
                      />
                    )}
                  </div>
                );
              })}
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium" htmlFor="observaciones-recepcion">
                Observación general
              </label>
              <textarea
                id="observaciones-recepcion"
                className="input-field"
                rows="2"
                maxLength="500"
                value={recepcionPendiente.observaciones}
                onChange={(e) => setRecepcionPendiente({ ...recepcionPendiente, observaciones: e.target.value })}
                placeholder="Opcional"
              />
            </div>
            {errorRecepcion && <p className="rounded bg-red-50 p-2 text-sm text-red-600">{errorRecepcion}</p>}
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" className="btn-secondary" onClick={() => setRecepcionPendiente(null)}>Cancelar</button>
              <button type="submit" className="btn-primary" disabled={guardandoRecepcion}>
                {guardandoRecepcion ? "Registrando..." : "Confirmar Recepción"}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </Layout>
  );
}