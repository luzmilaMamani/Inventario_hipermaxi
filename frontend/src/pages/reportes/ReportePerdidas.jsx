import { useEffect, useState } from "react";
import Layout from "../../components/layout/Layout";
import Select from "../../components/ui/Select";
import { reportePerdidas } from "../../api/salidas.api";
import { listarAlmacenes } from "../../api/almacenes.api";

const FILTROS_INICIALES = {
  fecha_desde: "",
  fecha_hasta: "",
  id_almacen: "",
  subtipo_perdida: "",
};

const SUBTIPOS_PERDIDA = [
  { value: "ROBO", label: "Robo" },
  { value: "EXTRAVIO", label: "Extravío" },
  { value: "DETERIORO", label: "Deterioro" },
  { value: "VENCIMIENTO", label: "Vencimiento" },
  { value: "OTRO", label: "Otro" },
];

export default function ReportePerdidas() {
  const [registros, setRegistros] = useState([]);
  const [resumen, setResumen] = useState({
    total_registros: 0,
    total_salidas: 0,
    total_unidades: 0,
  });
  const [almacenes, setAlmacenes] = useState([]);
  const [filtros, setFiltros] = useState(FILTROS_INICIALES);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    listarAlmacenes({ limit: 200, orderBy: "nombre", order: "ASC" })
      .then((res) => setAlmacenes(res.data || []))
      .catch(() => setAlmacenes([]));
  }, []);

  const cargar = async () => {
    setLoading(true);
    setError("");
    try {
      const params = {};
      Object.entries(filtros).forEach(([k, v]) => {
        if (v !== "") params[k] = v;
      });
      const data = await reportePerdidas(params);
      setRegistros(data.data || []);
      setResumen(
        data.resumen || {
          total_registros: 0,
          total_salidas: 0,
          total_unidades: 0,
        },
      );
    } catch (err) {
      setError(err.response?.data?.message || "Error al cargar el reporte");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtros]);

  const limpiarFiltros = () => setFiltros(FILTROS_INICIALES);

  const opcionesAlmacenes = almacenes.map((a) => ({
    value: a.id_almacen,
    label: `${a.codigo} - ${a.nombre}`,
  }));

  return (
    <Layout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Reporte de pérdidas</h1>
          <p className="text-sm text-gray-500">
            Pérdidas registradas en el inventario (RF46)
          </p>
        </div>

        <div className="card">
          <div className="grid grid-cols-1 md:grid-cols-5 gap-3 mb-4">
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
            <Select
              label="Almacén"
              value={filtros.id_almacen}
              onChange={(e) =>
                setFiltros({ ...filtros, id_almacen: e.target.value })
              }
              options={opcionesAlmacenes}
              placeholder="Todos los almacenes"
            />
            <Select
              label="Subtipo"
              value={filtros.subtipo_perdida}
              onChange={(e) =>
                setFiltros({ ...filtros, subtipo_perdida: e.target.value })
              }
              options={SUBTIPOS_PERDIDA}
              placeholder="Todos los subtipos"
            />
            <div className="flex items-end">
              <button className="btn-secondary w-full" onClick={limpiarFiltros}>
                Limpiar filtros
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
            <div className="bg-blue-50 p-3 rounded border border-blue-100">
              <p className="text-xs text-gray-600">Salidas registradas</p>
              <p className="text-xl font-bold text-blue-700">
                {Number(resumen.total_salidas || 0).toLocaleString("es-BO")}
              </p>
            </div>
            <div className="bg-amber-50 p-3 rounded border border-amber-100">
              <p className="text-xs text-gray-600">Registros (líneas)</p>
              <p className="text-xl font-bold text-amber-700">
                {Number(resumen.total_registros || 0).toLocaleString("es-BO")}
              </p>
            </div>
            <div className="bg-purple-50 p-3 rounded border border-purple-100">
              <p className="text-xs text-gray-600">Unidades perdidas</p>
              <p className="text-xl font-bold text-purple-700">
                {Number(resumen.total_unidades || 0).toLocaleString("es-BO")}
              </p>
            </div>
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
                  <th className="py-2">Subtipo</th>
                  <th className="py-2">Almacén</th>
                  <th className="py-2">Producto</th>
                  <th className="py-2 text-right">Cantidad</th>
                  <th className="py-2">Usuario</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan="7" className="py-6 text-center text-gray-500">
                      Cargando...
                    </td>
                  </tr>
                ) : registros.length === 0 ? (
                  <tr>
                    <td colSpan="7" className="py-6 text-center text-gray-500">
                      No hay pérdidas registradas con esos filtros
                    </td>
                  </tr>
                ) : (
                  registros.map((r, idx) => (
                    <tr
                      key={`${r.id_salida}-${r.id_producto}-${idx}`}
                      className="border-b border-gray-100 hover:bg-gray-50"
                    >
                      <td className="py-2 font-mono text-xs">
                        {r.numero_salida}
                      </td>
                      <td className="py-2">
                        {new Date(r.fecha_salida).toLocaleDateString("es-BO")}
                      </td>
                      <td className="py-2">
                        <span className="px-2 py-1 rounded-full text-xs font-semibold bg-red-100 text-red-700">
                          {r.subtipo_perdida || "-"}
                        </span>
                      </td>
                      <td className="py-2">{r.almacen}</td>
                      <td className="py-2">
                        <div className="font-medium">{r.producto}</div>
                        <div className="text-xs text-gray-500 font-mono">
                          {r.producto_codigo}
                        </div>
                      </td>
                      <td className="py-2 text-right">
                        {Number(r.cantidad).toLocaleString("es-BO")} {r.unidad}
                      </td>
                      <td className="py-2">{r.usuario_registra}</td>
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
