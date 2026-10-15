import { useEffect, useState } from "react";
import Layout from "../../components/layout/Layout";
import Pagination from "../../components/ui/Pagination";
import Select from "../../components/ui/Select";
import FormSalida from "./FormSalida";
import DetalleSalida from "./DetalleSalida";
import { listarSalidas } from "../../api/salidas.api";
import { listarAlmacenes } from "../../api/almacenes.api";

const FILTROS_INICIALES = {
  search: "",
  motivo: "",
  id_almacen: "",
  fecha_desde: "",
  fecha_hasta: "",
};

const MOTIVOS = [
  { value: "VENTA", label: "Venta" },
  { value: "PERDIDA", label: "Pérdida" },
  { value: "DANO", label: "Daño" },
  { value: "VENCIMIENTO", label: "Vencimiento" },
  { value: "AJUSTE", label: "Ajuste" },
  { value: "TRANSFERENCIA", label: "Transferencia" },
  { value: "OTRO", label: "Otro" },
];

export default function ListaSalidas() {
  const [salidas, setSalidas] = useState([]);
  const [almacenes, setAlmacenes] = useState([]);
  const [filtros, setFiltros] = useState(FILTROS_INICIALES);
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 20,
    total: 0,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [formOpen, setFormOpen] = useState(false);
  const [salidaDetalleId, setSalidaDetalleId] = useState(null);

  useEffect(() => {
    listarAlmacenes({ limit: 200, orderBy: "nombre", order: "ASC" })
      .then((res) => setAlmacenes(res.data || []))
      .catch(() => setAlmacenes([]));
  }, []);

  const cargar = async (page = 1) => {
    setLoading(true);
    setError("");
    try {
      const params = { page, limit: pagination.limit };
      Object.entries(filtros).forEach(([k, v]) => {
        if (v !== "") params[k] = v;
      });
      const data = await listarSalidas(params);
      setSalidas(data.data || []);
      setPagination(data.pagination);
    } catch (err) {
      setError(err.response?.data?.message || "Error al cargar salidas");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    cargar(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtros]);

  const limpiarFiltros = () => setFiltros(FILTROS_INICIALES);

  const opcionesAlmacenes = almacenes.map((a) => ({
    value: a.id_almacen,
    label: `${a.codigo} - ${a.nombre}`,
  }));

  const badgeMotivo = (motivo) => {
    const colores = {
      VENTA: "bg-blue-100 text-blue-700",
      PERDIDA: "bg-red-100 text-red-700",
      DANO: "bg-orange-100 text-orange-700",
      VENCIMIENTO: "bg-amber-100 text-amber-700",
      AJUSTE: "bg-amber-100 text-amber-700",
      TRANSFERENCIA: "bg-green-100 text-green-700",
      OTRO: "bg-gray-100 text-gray-700",
    };
    return colores[motivo] || "bg-gray-100 text-gray-700";
  };

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold">Salidas de inventario</h1>
            <p className="text-sm text-gray-500">
              Registro de salidas incluyendo pérdidas (RF25)
            </p>
          </div>
          <button className="btn-primary" onClick={() => setFormOpen(true)}>
            + Registrar salida
          </button>
        </div>

        <div className="card">
          <div className="grid grid-cols-1 md:grid-cols-6 gap-3 mb-4">
            <div className="md:col-span-2">
              <label className="block text-sm font-medium mb-1">Buscar</label>
              <input
                className="input-field"
                placeholder="Número o descripción"
                value={filtros.search}
                onChange={(e) =>
                  setFiltros({ ...filtros, search: e.target.value })
                }
              />
            </div>
            <Select
              label="Motivo"
              value={filtros.motivo}
              onChange={(e) =>
                setFiltros({ ...filtros, motivo: e.target.value })
              }
              options={MOTIVOS}
              placeholder="Todos los motivos"
            />
            <Select
              label="Almacén"
              value={filtros.id_almacen}
              onChange={(e) =>
                setFiltros({ ...filtros, id_almacen: e.target.value })
              }
              options={opcionesAlmacenes}
              placeholder="Todos los almacenes"
            />
            <div>
              <label className="block text-sm font-medium mb-1">Desde</label>
              <input
                type="date"
                className="input-field"
                value={filtros.fecha_desde}
                onChange={(e) =>
                  setFiltros({ ...filtros, fecha_desde: e.target.value })
                }
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Hasta</label>
              <input
                type="date"
                className="input-field"
                value={filtros.fecha_hasta}
                onChange={(e) =>
                  setFiltros({ ...filtros, fecha_hasta: e.target.value })
                }
              />
            </div>
            <div className="flex items-end md:col-span-6">
              <button className="btn-secondary" onClick={limpiarFiltros}>
                Limpiar filtros
              </button>
            </div>
          </div>

          <div className="flex justify-between items-center mb-3 text-sm text-gray-600">
            <span>
              {pagination.total} resultado{pagination.total !== 1 && "s"}
            </span>
          </div>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 p-2 rounded mb-3">
              {error}
            </p>
          )}

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left border-b border-gray-200 text-gray-500">
                  <th className="py-2">Número</th>
                  <th className="py-2">Fecha</th>
                  <th className="py-2">Motivo</th>
                  <th className="py-2">Almacén</th>
                  <th className="py-2">Usuario</th>
                  <th className="py-2 text-right">Items</th>
                  <th className="py-2 text-right">Valor total</th>
                  <th className="py-2 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan="8" className="py-6 text-center text-gray-500">
                      Cargando...
                    </td>
                  </tr>
                ) : salidas.length === 0 ? (
                  <tr>
                    <td colSpan="8" className="py-6 text-center text-gray-500">
                      No hay salidas registradas
                    </td>
                  </tr>
                ) : (
                  salidas.map((s) => (
                    <tr
                      key={s.id_salida}
                      className="border-b border-gray-100 hover:bg-gray-50"
                    >
                      <td className="py-2 font-mono text-xs">
                        {s.numero_salida}
                      </td>
                      <td className="py-2">
                        {new Date(s.fecha_salida).toLocaleString("es-BO")}
                      </td>
                      <td className="py-2">
                        <span
                          className={`px-2 py-1 rounded-full text-xs font-semibold ${badgeMotivo(
                            s.motivo,
                          )}`}
                        >
                          {s.motivo}
                        </span>
                        {s.subtipo_perdida && (
                          <span className="ml-1 text-xs text-gray-500">
                            ({s.subtipo_perdida})
                          </span>
                        )}
                      </td>
                      <td className="py-2">{s.almacen}</td>
                      <td className="py-2">{s.usuario_registra}</td>
                      <td className="py-2 text-right">{s.total_items}</td>
                      <td className="py-2 text-right">
                        Bs {Number(s.valor_total || 0).toFixed(2)}
                      </td>
                      <td className="py-2 text-right whitespace-nowrap">
                        <button
                          className="text-blue-600 hover:underline text-sm font-medium"
                          onClick={() => setSalidaDetalleId(s.id_salida)}
                        >
                          Ver detalle
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <Pagination
            page={pagination.page}
            limit={pagination.limit}
            total={pagination.total}
            onChange={(p) => cargar(p)}
          />
        </div>
      </div>

      {formOpen && (
        <FormSalida
          onClose={() => setFormOpen(false)}
          onSaved={() => {
            setFormOpen(false);
            cargar(1);
          }}
        />
      )}

      {salidaDetalleId && (
        <DetalleSalida
          salidaId={salidaDetalleId}
          onClose={() => setSalidaDetalleId(null)}
        />
      )}
    </Layout>
  );
}
