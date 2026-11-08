import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import Layout from "../../components/layout/Layout";
import Select from "../../components/ui/Select";
import DetalleTransferencia from "./DetalleTransferencia";
import { listarAlmacenes } from "../../api/almacenes.api";
import { listarDiferenciasTransferencias } from "../../api/transferencias.api";

const FILTROS_INICIALES = {
  id_almacen_origen: "",
  id_almacen_destino: "",
  tipo: "",
  fecha_desde: "",
  fecha_hasta: "",
};

const RESUMEN_INICIAL = { total_faltante: 0, total_sobrante: 0, transferencias: 0, lineas: 0 };

function formatearFecha(fecha) {
  return fecha ? new Date(fecha).toLocaleString("es-BO") : "-";
}

function formatearCantidad(valor) {
  return Number(valor ?? 0).toLocaleString("es-BO");
}

// RF58: el almacén de origen consulta faltantes y sobrantes de lo que envió.
export default function DiferenciasTransferencias() {
  const [filtros, setFiltros] = useState(FILTROS_INICIALES);
  const [lineas, setLineas] = useState([]);
  const [resumen, setResumen] = useState(RESUMEN_INICIAL);
  const [almacenes, setAlmacenes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [transferenciaId, setTransferenciaId] = useState(null);

  useEffect(() => {
    listarAlmacenes({ limit: 200, activo: true, orderBy: "nombre", order: "ASC" })
      .then((respuesta) => setAlmacenes(respuesta.data || []))
      .catch(() => setAlmacenes([]));
  }, []);

  useEffect(() => {
    if (filtros.fecha_desde && filtros.fecha_hasta && filtros.fecha_desde > filtros.fecha_hasta) {
      setLineas([]);
      setResumen(RESUMEN_INICIAL);
      setError("La fecha inicial no puede ser posterior a la final");
      return;
    }
    let activo = true;
    setLoading(true);
    setError("");
    const params = Object.fromEntries(Object.entries(filtros).filter(([, valor]) => valor !== ""));
    listarDiferenciasTransferencias(params)
      .then((respuesta) => {
        if (!activo) return;
        setLineas(respuesta.data || []);
        setResumen(respuesta.resumen || RESUMEN_INICIAL);
      })
      .catch((err) => {
        if (activo) setError(err.response?.data?.message || "No se pudieron cargar las diferencias");
      })
      .finally(() => {
        if (activo) setLoading(false);
      });
    return () => {
      activo = false;
    };
  }, [filtros]);

  const opcionesAlmacen = almacenes.map((almacen) => ({
    value: almacen.id_almacen,
    label: `${almacen.codigo} - ${almacen.nombre}`,
  }));

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">Diferencias en recepción de transferencias</h1>
            <p className="text-sm text-gray-500">
              Faltantes y sobrantes registrados por el almacén de destino al recibir (RF58).
            </p>
          </div>
          <Link to="/transferencias" className="btn-secondary">
            Volver a transferencias
          </Link>
        </div>

        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <div className="card">
            <p className="text-xs text-gray-500">Transferencias con diferencias</p>
            <p className="text-2xl font-bold">{resumen.transferencias}</p>
          </div>
          <div className="card">
            <p className="text-xs text-gray-500">Productos con diferencia</p>
            <p className="text-2xl font-bold">{resumen.lineas}</p>
          </div>
          <div className="card">
            <p className="text-xs text-gray-500">Unidades faltantes</p>
            <p className="text-2xl font-bold text-red-600">{formatearCantidad(resumen.total_faltante)}</p>
          </div>
          <div className="card">
            <p className="text-xs text-gray-500">Unidades sobrantes</p>
            <p className="text-2xl font-bold text-blue-700">{formatearCantidad(resumen.total_sobrante)}</p>
          </div>
        </div>

        <section className="card space-y-4">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-6">
            <Select
              label="Almacén de origen"
              value={filtros.id_almacen_origen}
              onChange={(event) => setFiltros({ ...filtros, id_almacen_origen: event.target.value })}
              options={opcionesAlmacen}
              placeholder="Todos"
            />
            <Select
              label="Almacén de destino"
              value={filtros.id_almacen_destino}
              onChange={(event) => setFiltros({ ...filtros, id_almacen_destino: event.target.value })}
              options={opcionesAlmacen}
              placeholder="Todos"
            />
            <Select
              label="Tipo"
              value={filtros.tipo}
              onChange={(event) => setFiltros({ ...filtros, tipo: event.target.value })}
              options={[
                { value: "FALTANTE", label: "Faltantes" },
                { value: "SOBRANTE", label: "Sobrantes" },
              ]}
              placeholder="Todos"
            />
            <div>
              <label className="mb-1 block text-sm font-medium" htmlFor="diferencias-desde">
                Recibida desde
              </label>
              <input
                id="diferencias-desde"
                type="date"
                className="input-field"
                value={filtros.fecha_desde}
                onChange={(event) => setFiltros({ ...filtros, fecha_desde: event.target.value })}
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium" htmlFor="diferencias-hasta">
                Hasta
              </label>
              <input
                id="diferencias-hasta"
                type="date"
                className="input-field"
                value={filtros.fecha_hasta}
                onChange={(event) => setFiltros({ ...filtros, fecha_hasta: event.target.value })}
              />
            </div>
            <div className="flex items-end">
              <button type="button" className="btn-secondary w-full" onClick={() => setFiltros(FILTROS_INICIALES)}>
                Limpiar filtros
              </button>
            </div>
          </div>

          {error && <p className="rounded bg-red-50 p-3 text-sm text-red-600">{error}</p>}

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-left text-gray-500">
                  <th className="py-2 pr-3">Transferencia</th>
                  <th className="py-2 pr-3">Recibida</th>
                  <th className="py-2 pr-3">Origen → Destino</th>
                  <th className="py-2 pr-3">Producto</th>
                  <th className="py-2 pr-3 text-right">Enviado</th>
                  <th className="py-2 pr-3 text-right">Recibido</th>
                  <th className="py-2 pr-3 text-right">Diferencia</th>
                  <th className="py-2 pr-3">Observación</th>
                  <th className="py-2" />
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan="9" className="py-6 text-center text-gray-500">
                      Cargando diferencias...
                    </td>
                  </tr>
                ) : lineas.length === 0 ? (
                  <tr>
                    <td colSpan="9" className="py-6 text-center text-gray-500">
                      No hay transferencias recibidas con diferencias para esos filtros.
                    </td>
                  </tr>
                ) : (
                  lineas.map((linea) => {
                    const diferencia = Number(linea.diferencia);
                    return (
                      <tr key={linea.id_detalle_transferencia} className="border-b border-gray-100 align-top">
                        <td className="py-2 pr-3 font-mono text-xs">{linea.numero_transferencia}</td>
                        <td className="whitespace-nowrap py-2 pr-3">
                          <div>{formatearFecha(linea.fecha_recepcion)}</div>
                          {linea.usuario_recibe && (
                            <div className="text-xs text-gray-500">{linea.usuario_recibe}</div>
                          )}
                        </td>
                        <td className="py-2 pr-3">
                          {linea.almacen_origen} → {linea.almacen_destino}
                        </td>
                        <td className="py-2 pr-3">
                          <div className="font-medium">{linea.producto}</div>
                          <div className="font-mono text-xs text-gray-500">{linea.producto_codigo}</div>
                        </td>
                        <td className="py-2 pr-3 text-right">{formatearCantidad(linea.cantidad_enviada)}</td>
                        <td className="py-2 pr-3 text-right">{formatearCantidad(linea.cantidad_recibida)}</td>
                        <td
                          className={`py-2 pr-3 text-right font-semibold ${
                            diferencia < 0 ? "text-red-600" : "text-blue-700"
                          }`}
                        >
                          {diferencia > 0 ? "+" : ""}
                          {formatearCantidad(diferencia)}
                          <div className="text-xs font-normal">{diferencia < 0 ? "Faltante" : "Sobrante"}</div>
                        </td>
                        <td className="max-w-xs py-2 pr-3 text-gray-700">{linea.observacion || "-"}</td>
                        <td className="py-2 text-right">
                          <button
                            type="button"
                            className="font-semibold text-blue-600 hover:underline"
                            onClick={() => setTransferenciaId(linea.id_transferencia)}
                          >
                            Ver
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      {transferenciaId && (
        <DetalleTransferencia transferenciaId={transferenciaId} onClose={() => setTransferenciaId(null)} />
      )}
    </Layout>
  );
}
