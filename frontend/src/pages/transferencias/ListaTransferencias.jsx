import { useEffect, useState } from "react";
import Layout from "../../components/layout/Layout";
import Select from "../../components/ui/Select";
import { useAuth } from "../../context/AuthContext";
import FormTransferencia from "./FormTransferencia";
import {
  listarTransferencias,
  cambiarEstadoTransferencia,
} from "../../api/transferencias.api";

export default function ListaTransferencias() {
  const { user } = useAuth();
  const [transferencias, setTransferencias] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [filtroEstado, setFiltroEstado] = useState("");
  const puedeDecidirTransferencias = [
    "ENCARGADO_ALMACEN",
    "ADMINISTRADOR",
  ].includes(user?.rol);

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

  const handleCambiarEstado = async (id, nuevoEstado) => {
    if (!window.confirm(`¿Cambiar estado a ${nuevoEstado}?`)) return;
    try {
      await cambiarEstadoTransferencia(id, nuevoEstado);
      cargar();
    } catch (err) {
      alert(err.response?.data?.message || "Error al cambiar estado");
    }
  };

  const getBadgeColor = (estado) => {
    switch (estado) {
      case "SOLICITADA":
        return "bg-blue-100 text-blue-700";
      case "APROBADA":
        return "bg-green-100 text-green-700";
      case "RECHAZADA":
        return "bg-red-100 text-red-700";
      case "ENVIADA":
        return "bg-amber-100 text-amber-700";
      case "RECIBIDA":
        return "bg-purple-100 text-purple-700";
      default:
        return "bg-gray-100 text-gray-700";
    }
  };

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold">Transferencias</h1>
            <p className="text-sm text-gray-500">
              Solicitudes de reposición entre almacenes (RF29)
            </p>
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
                { value: "ENVIADA", label: "Enviada" },
                { value: "RECIBIDA", label: "Recibida" },
                { value: "RECHAZADA", label: "Rechazada" },
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
                  <th className="py-2">Fecha</th>
                  <th className="py-2">Origen</th>
                  <th className="py-2">Destino</th>
                  <th className="py-2">Solicitante</th>
                  <th className="py-2">Estado</th>
                  <th className="py-2 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan="7" className="text-center py-4">
                      Cargando...
                    </td>
                  </tr>
                ) : transferencias.length === 0 ? (
                  <tr>
                    <td colSpan="7" className="text-center py-4">
                      No hay transferencias registradas
                    </td>
                  </tr>
                ) : (
                  transferencias.map((t) => (
                    <tr
                      key={t.id_transferencia}
                      className="border-b border-gray-100"
                    >
                      <td className="py-2 font-mono text-xs">
                        {t.numero_transferencia}
                      </td>
                      <td className="py-2">
                        {new Date(t.fecha_solicitud).toLocaleDateString(
                          "es-BO",
                        )}
                      </td>
                      <td className="py-2">{t.almacen_origen}</td>
                      <td className="py-2">{t.almacen_destino}</td>
                      <td className="py-2">{t.solicitante}</td>
                      <td className="py-2">
                        <span
                          className={`px-2 py-1 rounded-full text-xs font-semibold ${getBadgeColor(t.estado)}`}
                        >
                          {t.estado}
                        </span>
                      </td>
                      <td className="py-2 text-right space-x-2 whitespace-nowrap">
                        {t.estado === "SOLICITADA" &&
                          puedeDecidirTransferencias && (
                          <>
                            <button
                              onClick={() =>
                                handleCambiarEstado(
                                  t.id_transferencia,
                                  "APROBADA",
                                )
                              }
                              className="text-green-600 hover:underline font-medium"
                            >
                              Aprobar
                            </button>
                            <button
                              onClick={() =>
                                handleCambiarEstado(
                                  t.id_transferencia,
                                  "RECHAZADA",
                                )
                              }
                              className="text-red-600 hover:underline font-medium"
                            >
                              Rechazar
                            </button>
                          </>
                        )}
                        {t.estado === "APROBADA" && (
                          <button
                            onClick={() =>
                              handleCambiarEstado(t.id_transferencia, "ENVIADA")
                            }
                            className="text-amber-600 hover:underline font-medium"
                          >
                            Marcar Enviada
                          </button>
                        )}
                        {t.estado === "ENVIADA" && (
                          <button
                            onClick={() =>
                              handleCambiarEstado(
                                t.id_transferencia,
                                "RECIBIDA",
                              )
                            }
                            className="text-purple-600 hover:underline font-medium"
                          >
                            Marcar Recibida
                          </button>
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

      {formOpen && (
        <FormTransferencia
          onClose={() => setFormOpen(false)}
          onSaved={() => {
            setFormOpen(false);
            cargar();
          }}
        />
      )}
    </Layout>
  );
}
