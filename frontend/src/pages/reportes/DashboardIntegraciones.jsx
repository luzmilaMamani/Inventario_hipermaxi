import { useCallback, useEffect, useMemo, useState } from "react";
import Layout from "../../components/layout/Layout";
import { consultarMetricasIntegracion, reprocesarMensajeIntegracion } from "../../api/integraciones.api";
import { useAuth } from "../../context/AuthContext";
import { ROLES_ADMINISTRACION, tieneRol } from "../../utils/permissions";
import { formatearValor } from "../../utils/exportar";

// RF75: estado de las integraciones asíncronas (Compras, Producción y
// Logística, Ventas): mensajes procesados, con error y latencia.

// Color fijo por sistema (validado: azul / naranja / aqua).
const SISTEMAS = {
  COMPRAS: { color: "#2a78d6", corto: "Compras" },
  PRODUCCION_LOGISTICA: { color: "#eb6834", corto: "Producción" },
  VENTAS: { color: "#1baf7a", corto: "Ventas" },
};
const ORDEN_SISTEMAS = Object.keys(SISTEMAS);

const fechaIso = (d) => d.toISOString().slice(0, 10);
const haceDias = (n) => fechaIso(new Date(Date.now() - n * 86400000));

function latencia(ms) {
  if (ms === null || ms === undefined) return "—";
  return ms >= 1000 ? `${formatearValor(ms / 1000, "numero")} s` : `${ms} ms`;
}

function estadoSalud(tasa) {
  if (tasa === null || tasa === undefined) return { texto: "Sin tráfico", clase: "bg-gray-100 text-gray-600", icono: "○" };
  if (tasa >= 95) return { texto: "Saludable", clase: "bg-green-100 text-green-700", icono: "✓" };
  if (tasa >= 85) return { texto: "Con errores", clase: "bg-amber-100 text-amber-800", icono: "!" };
  return { texto: "Crítico", clase: "bg-red-100 text-red-700", icono: "✕" };
}

// Columnas apiladas por día (un segmento por sistema) con tooltip.
function GraficoDiario({ porDia, desde, hasta }) {
  const [hover, setHover] = useState(null);
  const dias = useMemo(() => {
    const mapa = new Map();
    for (const f of porDia) {
      if (!mapa.has(f.dia)) mapa.set(f.dia, { dia: f.dia, total: 0, errores: 0, sistemas: {} });
      const d = mapa.get(f.dia);
      d.sistemas[f.sistema] = f;
      d.total += f.total;
      d.errores += f.con_error;
    }
    const lista = [];
    for (let d = new Date(`${desde}T00:00:00Z`); fechaIso(d) <= hasta; d.setUTCDate(d.getUTCDate() + 1)) {
      const dia = fechaIso(d);
      lista.push(mapa.get(dia) || { dia, total: 0, errores: 0, sistemas: {} });
    }
    return lista;
  }, [porDia, desde, hasta]);

  const ancho = 720;
  const alto = 200;
  const izq = 36;
  const base = alto - 22;
  const sup = 10;
  const maximo = Math.max(...dias.map((d) => d.total), 1);
  const paso = (ancho - izq) / Math.max(dias.length, 1);
  const barra = Math.max(Math.min(paso - 3, 18), 1);
  const y = (v) => ((base - sup) * v) / maximo;
  const cada = Math.ceil(dias.length / 8);

  if (dias.every((d) => d.total === 0)) {
    return <p className="py-8 text-center text-sm text-gray-500">Sin mensajes en el período</p>;
  }

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${ancho} ${alto}`} className="h-auto w-full" role="img" aria-label="Mensajes por día y sistema">
        {[0, 0.5, 1].map((t) => (
          <g key={t}>
            <line x1={izq} x2={ancho} y1={base - y(maximo * t)} y2={base - y(maximo * t)} stroke="#e5e7eb" />
            <text x={izq - 6} y={base - y(maximo * t) + 4} textAnchor="end" fontSize="10" fill="#6b7280">
              {Math.round(maximo * t)}
            </text>
          </g>
        ))}
        {dias.map((d, i) => {
          const x = izq + i * paso + (paso - barra) / 2;
          let acumulado = 0;
          return (
            <g key={d.dia} onMouseEnter={() => setHover({ ...d, x: ((izq + i * paso + paso / 2) / ancho) * 100 })} onMouseLeave={() => setHover(null)}>
              <rect x={izq + i * paso} y={0} width={paso} height={base} fill={hover?.dia === d.dia ? "#f3f4f6" : "transparent"} />
              {ORDEN_SISTEMAS.map((s) => {
                const total = d.sistemas[s]?.total || 0;
                if (!total) return null;
                const alturaSegmento = y(total);
                const yTop = base - y(acumulado) - alturaSegmento;
                acumulado += total;
                // 2px de separación entre segmentos apilados.
                return <rect key={s} x={x} y={yTop + 1} width={barra} height={Math.max(alturaSegmento - 2, 1)} fill={SISTEMAS[s].color} rx="1.5" />;
              })}
              {d.errores > 0 && (
                <circle cx={x + barra / 2} cy={base - y(d.total) - 6} r="3" fill="#dc2626" stroke="#fff" strokeWidth="1" />
              )}
              {i % cada === 0 && (
                <text x={x + barra / 2} y={alto - 6} textAnchor="middle" fontSize="10" fill="#6b7280">
                  {d.dia.slice(8, 10)}/{d.dia.slice(5, 7)}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      {hover && (
        <div
          className="pointer-events-none absolute top-2 z-10 -translate-x-1/2 rounded border border-gray-200 bg-white px-3 py-2 text-xs shadow"
          style={{ left: `${Math.min(Math.max(hover.x, 14), 86)}%` }}
        >
          <p className="mb-1 font-semibold">{new Date(`${hover.dia}T00:00:00`).toLocaleDateString("es-BO")}</p>
          {ORDEN_SISTEMAS.map((s) => (
            <p key={s}>
              <span className="mr-1 inline-block h-2 w-2 rounded-sm" style={{ background: SISTEMAS[s].color }} />
              {SISTEMAS[s].corto}: {hover.sistemas[s]?.total || 0}
              {hover.sistemas[s]?.con_error ? ` (${hover.sistemas[s].con_error} con error)` : ""}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

export default function DashboardIntegraciones() {
  const { user } = useAuth();
  const puedeReprocesar = tieneRol(user?.rol, ROLES_ADMINISTRACION);
  const [rango, setRango] = useState([haceDias(29), fechaIso(new Date())]);
  const [datos, setDatos] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [mensaje, setMensaje] = useState(null);
  const [reprocesando, setReprocesando] = useState(null);
  const [filtroSistema, setFiltroSistema] = useState("");
  const [abierto, setAbierto] = useState(null);

  const cargar = useCallback(async () => {
    if (rango[0] > rango[1]) return;
    setLoading(true);
    setError("");
    try {
      const r = await consultarMetricasIntegracion({ fecha_desde: rango[0], fecha_hasta: rango[1] });
      setDatos(r.data);
    } catch (err) {
      setError(err.response?.data?.message || "Error al cargar las métricas");
    } finally {
      setLoading(false);
    }
  }, [rango]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const reprocesar = async (m) => {
    setReprocesando(m.id_mensaje);
    setMensaje(null);
    try {
      const r = await reprocesarMensajeIntegracion(m.tipo_mensaje, m.id_mensaje);
      setMensaje({ ok: r.ok, texto: r.message });
    } catch (err) {
      setMensaje({ ok: false, texto: err.response?.data?.message || "No se pudo reprocesar el mensaje" });
    } finally {
      setReprocesando(null);
      cargar();
    }
  };

  const errores = (datos?.mensajes_con_error || []).filter((m) => !filtroSistema || m.sistema === filtroSistema);
  const resumen = datos?.resumen || {};

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">Integraciones</h1>
            <p className="text-sm text-gray-500">
              Mensajes con Compras, Producción y Logística y Ventas: procesados, con error y latencia (RF75)
            </p>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <div>
              <label className="mb-1 block text-xs font-medium">Desde</label>
              <input type="date" className="input-field" value={rango[0]} onChange={(e) => setRango([e.target.value, rango[1]])} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium">Hasta</label>
              <input type="date" className="input-field" value={rango[1]} onChange={(e) => setRango([rango[0], e.target.value])} />
            </div>
            <button className="btn-secondary" onClick={cargar} disabled={loading}>
              {loading ? "Actualizando..." : "Actualizar"}
            </button>
          </div>
        </div>
        {rango[0] > rango[1] && <p className="text-sm text-red-600">La fecha inicial no puede ser posterior a la final.</p>}
        {error && <p className="rounded bg-red-50 p-2 text-sm text-red-600">{error}</p>}
        {mensaje && (
          <p className={`rounded p-2 text-sm ${mensaje.ok ? "bg-green-50 text-green-700" : "bg-amber-50 text-amber-800"}`}>{mensaje.texto}</p>
        )}

        <div className="card flex flex-wrap items-center gap-6">
          <div>
            <p className="text-sm text-gray-500">Tasa de éxito de integración</p>
            <p className="text-4xl font-bold text-brand-dark">
              {resumen.tasa_exito === null || resumen.tasa_exito === undefined ? "—" : formatearValor(resumen.tasa_exito, "porcentaje")}
            </p>
          </div>
          <p className="text-sm text-gray-600">
            {formatearValor(resumen.exitosos || 0, "numero")} de {formatearValor(resumen.total || 0, "numero")} mensajes sin error ·{" "}
            <span className={resumen.con_error ? "font-semibold text-red-700" : ""}>
              {formatearValor(resumen.con_error || 0, "numero")} con error o inválidos
            </span>
          </p>
        </div>

        <div className={`grid grid-cols-1 gap-4 md:grid-cols-3 ${loading ? "opacity-60" : ""}`}>
          {ORDEN_SISTEMAS.map((codigo) => {
            const s = datos?.por_sistema.find((x) => x.sistema === codigo);
            const salud = estadoSalud(s?.tasa_exito);
            return (
              <div key={codigo} className="card !p-4" style={{ borderTop: `4px solid ${SISTEMAS[codigo].color}` }}>
                <div className="flex items-start justify-between gap-2">
                  <h2 className="font-semibold">{s?.nombre || SISTEMAS[codigo].corto}</h2>
                  <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold ${salud.clase}`}>
                    {salud.icono} {salud.texto}
                  </span>
                </div>
                <dl className="mt-3 grid grid-cols-2 gap-y-2 text-sm">
                  <dt className="text-gray-500">Mensajes</dt>
                  <dd className="text-right font-semibold">{formatearValor(s?.total || 0, "numero")}</dd>
                  <dt className="text-gray-500">Con error</dt>
                  <dd className={`text-right font-semibold ${s?.con_error + s?.invalidos ? "text-red-700" : ""}`}>
                    {formatearValor((s?.con_error || 0) + (s?.invalidos || 0), "numero")}
                  </dd>
                  <dt className="text-gray-500">% éxito</dt>
                  <dd className="text-right font-semibold">
                    {s?.tasa_exito === null || s?.tasa_exito === undefined ? "—" : formatearValor(s.tasa_exito, "porcentaje")}
                  </dd>
                  <dt className="text-gray-500">Latencia promedio</dt>
                  <dd className="text-right font-semibold">{latencia(s?.latencia_promedio_ms)}</dd>
                </dl>
                {s?.direcciones?.length > 0 && (
                  <p className="mt-3 border-t pt-2 text-xs text-gray-500">
                    {s.direcciones
                      .map((d) => `${d.direccion === "ENTRANTE" ? "Recibidos" : "Enviados"}: ${d.total}${d.pendientes ? ` (${d.pendientes} pendientes)` : ""}`)
                      .join(" · ")}
                  </p>
                )}
              </div>
            );
          })}
        </div>

        <div className="card">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-semibold">Mensajes por día</h2>
            <div className="flex flex-wrap items-center gap-4 text-xs text-gray-600">
              {ORDEN_SISTEMAS.map((s) => (
                <span key={s} className="flex items-center gap-1">
                  <span className="inline-block h-3 w-3 rounded-sm" style={{ background: SISTEMAS[s].color }} /> {SISTEMAS[s].corto}
                </span>
              ))}
              <span className="flex items-center gap-1">
                <span className="inline-block h-2.5 w-2.5 rounded-full bg-red-600" /> Día con errores
              </span>
            </div>
          </div>
          {datos && <GraficoDiario porDia={datos.por_dia} desde={datos.periodo.desde} hasta={datos.periodo.hasta} />}
        </div>

        <div className="card">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-semibold">Mensajes con error ({errores.length})</h2>
            <select className="input-field !w-auto" value={filtroSistema} onChange={(e) => setFiltroSistema(e.target.value)}>
              <option value="">Todos los sistemas</option>
              {ORDEN_SISTEMAS.map((s) => (
                <option key={s} value={s}>
                  {SISTEMAS[s].corto}
                </option>
              ))}
            </select>
          </div>
          {!puedeReprocesar && (
            <p className="mb-2 text-xs text-gray-500">Solo un administrador puede reprocesar mensajes.</p>
          )}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-left text-gray-500">
                  <th className="py-2">Recibido</th>
                  <th className="py-2">Sistema</th>
                  <th className="py-2">Tipo</th>
                  <th className="py-2">Estado</th>
                  <th className="py-2">Motivo</th>
                  <th className="py-2 text-right">Intentos</th>
                  {puedeReprocesar && <th className="py-2 text-right">Acción</th>}
                </tr>
              </thead>
              <tbody>
                {errores.length === 0 ? (
                  <tr>
                    <td colSpan="7" className="py-6 text-center text-gray-500">No hay mensajes con error en el período 🎉</td>
                  </tr>
                ) : (
                  errores.map((m) => (
                    <tr
                      key={`${m.tipo_mensaje}-${m.id_mensaje}`}
                      className="cursor-pointer border-b border-gray-100 align-top hover:bg-gray-50"
                      onClick={() => setAbierto(abierto === m.id_mensaje ? null : m.id_mensaje)}
                    >
                      <td className="whitespace-nowrap py-2">{new Date(m.fecha_recepcion).toLocaleString("es-BO", { dateStyle: "short", timeStyle: "short" })}</td>
                      <td className="py-2">
                        <span className="mr-1 inline-block h-2 w-2 rounded-sm" style={{ background: SISTEMAS[m.sistema]?.color }} />
                        {SISTEMAS[m.sistema]?.corto || m.sistema}
                      </td>
                      <td className="py-2 font-mono text-xs">{m.tipo_mensaje}</td>
                      <td className="py-2">
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                            m.estado === "ERROR" ? "bg-red-100 text-red-700" : "bg-gray-200 text-gray-700"
                          }`}
                          title={m.estado === "ERROR" ? "Falla de negocio: se puede reprocesar" : "Formato inválido"}
                        >
                          {m.estado === "ERROR" ? "Error" : "Inválido"}
                        </span>
                      </td>
                      <td className="max-w-md py-2 text-xs">
                        {m.error}
                        {abierto === m.id_mensaje && (
                          <pre className="mt-2 max-h-48 overflow-auto rounded bg-gray-900 p-2 text-[11px] text-gray-100">
                            {JSON.stringify(m.payload, null, 2)}
                          </pre>
                        )}
                      </td>
                      <td className="py-2 text-right">{m.intentos}</td>
                      {puedeReprocesar && (
                        <td className="py-2 text-right">
                          <button
                            className="rounded bg-brand-blue px-2 py-1 text-xs font-semibold text-white hover:bg-brand-blueDark disabled:opacity-50"
                            disabled={reprocesando === m.id_mensaje}
                            onClick={(e) => {
                              e.stopPropagation();
                              reprocesar(m);
                            }}
                          >
                            {reprocesando === m.id_mensaje ? "Reprocesando..." : "Reprocesar"}
                          </button>
                        </td>
                      )}
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
