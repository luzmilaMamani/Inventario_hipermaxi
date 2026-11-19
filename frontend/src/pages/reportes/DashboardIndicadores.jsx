import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import Layout from "../../components/layout/Layout";
import Select from "../../components/ui/Select";
import { consultarIndicadores } from "../../api/reportes.api";
import { listarAlmacenes } from "../../api/catalogos.api";
import { formatearValor } from "../../utils/exportar";

// Colores de serie validados (azul / naranja, ΔE CVD 24.7).
const SERIE_ENTRADAS = "#2a78d6";
const SERIE_SALIDAS = "#eb6834";

const fechaIso = (d) => d.toISOString().slice(0, 10);
const restarDias = (dias) => {
  const d = new Date();
  d.setDate(d.getDate() - dias);
  return fechaIso(d);
};

const PERIODOS = [
  { value: "mes", label: "Mes en curso", rango: () => [`${fechaIso(new Date()).slice(0, 8)}01`, fechaIso(new Date())] },
  { value: "30", label: "Últimos 30 días", rango: () => [restarDias(29), fechaIso(new Date())] },
  { value: "90", label: "Últimos 90 días", rango: () => [restarDias(89), fechaIso(new Date())] },
  { value: "180", label: "Últimos 6 meses", rango: () => [restarDias(179), fechaIso(new Date())] },
  { value: "otro", label: "Personalizado" },
];

const ICONOS = {
  VALOR_INVENTARIO: "💰",
  ROTACION: "🔁",
  QUIEBRE_STOCK: "📉",
  MERMA: "🗑️",
  EXACTITUD: "🎯",
  VALOR_RIESGO_VENCIMIENTO: "⏳",
  CUMPLIMIENTO_PROVEEDORES: "🚚",
};

function valorKpi(kpi) {
  if (kpi.valor === null || kpi.valor === undefined) return "Sin datos";
  if (kpi.unidad === "Bs") return formatearValor(kpi.valor, "moneda");
  if (kpi.unidad === "%") return formatearValor(kpi.valor, "porcentaje");
  return `${formatearValor(kpi.valor, "numero")} ${kpi.unidad}`;
}

function detalleKpi(kpi) {
  const d = kpi.detalle || {};
  switch (kpi.codigo) {
    case "VALOR_INVENTARIO":
      return `Al inicio del período: ${formatearValor(d.valor_inicio_periodo, "moneda")}`;
    case "ROTACION":
      return d.dias_inventario
        ? `${formatearValor(d.dias_inventario, "numero")} días de inventario · vendido ${formatearValor(d.costo_vendido, "moneda")}`
        : `Vendido ${formatearValor(d.costo_vendido || 0, "moneda")}`;
    case "QUIEBRE_STOCK":
      return `${d.en_quiebre} de ${d.productos} productos por sucursal`;
    case "MERMA":
      return `${formatearValor(d.valor_merma, "moneda")} en ${formatearValor(d.unidades_merma, "numero")} unidades`;
    case "EXACTITUD":
      return d.lineas_contadas
        ? `${d.lineas_exactas} de ${d.lineas_contadas} líneas en ${d.inventarios} conteo(s)`
        : "No hubo conteos finalizados en el período";
    case "VALOR_RIESGO_VENCIMIENTO":
      return `${d.lotes} lotes · ${formatearValor(d.unidades, "numero")} unidades`;
    case "CUMPLIMIENTO_PROVEEDORES":
      return d.recepciones
        ? `${d.sin_diferencia} de ${d.recepciones} recepciones sin diferencia`
        : "No hubo recepciones en el período";
    default:
      return kpi.descripcion;
  }
}

// Barras horizontales de una sola serie: el valor va escrito al final de cada barra.
function ValorPorSucursal({ filas, seleccionado }) {
  const maximo = Math.max(...filas.map((f) => f.valor), 1);
  return (
    <div className="space-y-3">
      {filas.map((f) => {
        const activo = !seleccionado || String(seleccionado) === String(f.id_almacen);
        return (
          <div key={f.id_almacen} title={`${f.almacen}: ${formatearValor(f.valor, "moneda")}`}>
            <div className="mb-1 flex justify-between text-sm">
              <span className={activo ? "font-medium" : "text-gray-400"}>{f.almacen}</span>
              <span className="text-gray-600">{formatearValor(f.valor, "moneda")}</span>
            </div>
            <div className="h-3 rounded bg-gray-100">
              <div
                className="h-3 rounded-r"
                style={{
                  width: `${Math.max((f.valor / maximo) * 100, 0.5)}%`,
                  background: SERIE_ENTRADAS,
                  opacity: activo ? 1 : 0.35,
                }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

// Completa los días sin movimientos con cero y, en períodos largos, agrupa por
// semana para que las columnas sigan siendo legibles.
function prepararSerie(filas, desde, hasta) {
  const porDia = new Map(filas.map((f) => [f.dia, f]));
  const dias = [];
  for (let d = new Date(`${desde}T00:00:00Z`); fechaIso(d) <= hasta; d.setUTCDate(d.getUTCDate() + 1)) {
    const dia = fechaIso(d);
    dias.push(porDia.get(dia) || { dia, entradas: 0, salidas: 0 });
  }
  if (dias.length <= 45) return { filas: dias, agrupado: false };
  const semanas = [];
  for (let i = 0; i < dias.length; i += 7) {
    const tramo = dias.slice(i, i + 7);
    semanas.push({
      dia: tramo[0].dia,
      hastaDia: tramo[tramo.length - 1].dia,
      entradas: tramo.reduce((s, f) => s + f.entradas, 0),
      salidas: tramo.reduce((s, f) => s + f.salidas, 0),
    });
  }
  return { filas: semanas, agrupado: true };
}

const fechaCorta = (dia) => `${dia.slice(8, 10)}/${dia.slice(5, 7)}`;

// Columnas de entradas y salidas lado a lado, con tooltip al pasar el mouse.
function MovimientosPorDia({ filas, agrupado }) {
  const [hover, setHover] = useState(null);
  const ancho = 720;
  const alto = 210;
  const margenSup = 12;
  const margenIzq = 44;
  const margenInf = 22;
  const base = alto - margenInf;
  const maximo = Math.max(...filas.flatMap((f) => [f.entradas, f.salidas]), 1);
  const paso = (ancho - margenIzq) / Math.max(filas.length, 1);
  const barra = Math.max(Math.min(paso / 2 - 2, 14), 1);
  const y = (v) => ((base - margenSup) * v) / maximo;
  const marcas = [0, 0.5, 1].map((t) => Math.round(maximo * t));
  const cadaEtiqueta = Math.ceil(filas.length / 8);
  const sinDatos = filas.every((f) => f.entradas === 0 && f.salidas === 0);

  if (sinDatos) {
    return <p className="py-8 text-center text-sm text-gray-500">Sin movimientos en el período</p>;
  }

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${ancho} ${alto}`} className="h-auto w-full" role="img" aria-label={`Unidades que entraron y salieron por ${agrupado ? "semana" : "día"}`}>
        {marcas.map((m) => (
          <g key={m}>
            <line x1={margenIzq} x2={ancho} y1={base - y(m)} y2={base - y(m)} stroke="#e5e7eb" />
            <text x={margenIzq - 6} y={base - y(m) + 4} textAnchor="end" fontSize="10" fill="#6b7280">
              {formatearValor(m, "numero")}
            </text>
          </g>
        ))}
        {filas.map((f, i) => {
          const x = margenIzq + i * paso + paso / 2;
          return (
            <g key={f.dia} onMouseEnter={() => setHover({ ...f, x: (x / ancho) * 100 })} onMouseLeave={() => setHover(null)}>
              <rect x={margenIzq + i * paso} y={0} width={paso} height={base} fill={hover?.dia === f.dia ? "#f3f4f6" : "transparent"} />
              <rect x={x - barra - 1} y={base - y(f.entradas)} width={barra} height={y(f.entradas)} rx="2" fill={SERIE_ENTRADAS} />
              <rect x={x + 1} y={base - y(f.salidas)} width={barra} height={y(f.salidas)} rx="2" fill={SERIE_SALIDAS} />
              {i % cadaEtiqueta === 0 && (
                <text x={x} y={alto - 6} textAnchor="middle" fontSize="10" fill="#6b7280">
                  {fechaCorta(f.dia)}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      {hover && (
        <div
          className="pointer-events-none absolute top-2 z-10 -translate-x-1/2 rounded border border-gray-200 bg-white px-3 py-2 text-xs shadow"
          style={{ left: `${Math.min(Math.max(hover.x, 12), 88)}%` }}
        >
          <p className="font-semibold">
            {hover.hastaDia ? `Semana del ${fechaCorta(hover.dia)} al ${fechaCorta(hover.hastaDia)}` : new Date(`${hover.dia}T00:00:00`).toLocaleDateString("es-BO")}
          </p>
          <p>
            <span className="mr-1 inline-block h-2 w-2 rounded-sm" style={{ background: SERIE_ENTRADAS }} />
            Entradas: {formatearValor(hover.entradas, "numero")}
          </p>
          <p>
            <span className="mr-1 inline-block h-2 w-2 rounded-sm" style={{ background: SERIE_SALIDAS }} />
            Salidas: {formatearValor(hover.salidas, "numero")}
          </p>
        </div>
      )}
    </div>
  );
}

export default function DashboardIndicadores() {
  const [almacenes, setAlmacenes] = useState([]);
  const [idAlmacen, setIdAlmacen] = useState("");
  const [periodo, setPeriodo] = useState("mes");
  const [rango, setRango] = useState(() => PERIODOS[0].rango());
  const [datos, setDatos] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [verTabla, setVerTabla] = useState(false);

  useEffect(() => {
    listarAlmacenes().then((r) => setAlmacenes(r.data || [])).catch(() => setAlmacenes([]));
  }, []);

  const cambiarPeriodo = (valor) => {
    setPeriodo(valor);
    const opcion = PERIODOS.find((p) => p.value === valor);
    if (opcion?.rango) setRango(opcion.rango());
  };

  useEffect(() => {
    const [desde, hasta] = rango;
    if (!desde || !hasta || desde > hasta) return undefined;
    let vigente = true;
    setLoading(true);
    setError("");
    consultarIndicadores({ fecha_desde: desde, fecha_hasta: hasta, ...(idAlmacen ? { id_almacen: idAlmacen } : {}) })
      .then((r) => vigente && setDatos(r.data))
      .catch((err) => vigente && setError(err.response?.data?.message || "Error al cargar los indicadores"))
      .finally(() => vigente && setLoading(false));
    return () => {
      vigente = false;
    };
  }, [rango, idAlmacen]);

  const serie = useMemo(
    () =>
      datos ? prepararSerie(datos.graficos.movimientos_por_dia, datos.periodo.desde, datos.periodo.hasta) : null,
    [datos],
  );

  const nombreAlmacen = useMemo(
    () => almacenes.find((a) => String(a.id_almacen) === String(idAlmacen))?.nombre || "Todas las sucursales",
    [almacenes, idAlmacen],
  );

  return (
    <Layout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Indicadores del inventario</h1>
          <p className="text-sm text-gray-500">
            Estado del inventario de un vistazo · {nombreAlmacen} (RF62)
          </p>
        </div>

        <div className="card">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
            <Select
              label="Almacén o sucursal"
              value={idAlmacen}
              onChange={(e) => setIdAlmacen(e.target.value)}
              options={almacenes.map((a) => ({ value: a.id_almacen, label: `${a.codigo} - ${a.nombre}` }))}
              placeholder="Todas las sucursales"
            />
            <Select
              label="Período"
              value={periodo}
              onChange={(e) => cambiarPeriodo(e.target.value)}
              options={PERIODOS.map((p) => ({ value: p.value, label: p.label }))}
              placeholder="Elige un período"
            />
            <div>
              <label className="mb-1 block text-sm font-medium">Desde</label>
              <input
                type="date"
                className="input-field"
                value={rango[0]}
                onChange={(e) => {
                  setPeriodo("otro");
                  setRango([e.target.value, rango[1]]);
                }}
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Hasta</label>
              <input
                type="date"
                className="input-field"
                value={rango[1]}
                onChange={(e) => {
                  setPeriodo("otro");
                  setRango([rango[0], e.target.value]);
                }}
              />
            </div>
          </div>
          {rango[0] > rango[1] && (
            <p className="mt-2 text-sm text-red-600">La fecha inicial no puede ser posterior a la final.</p>
          )}
        </div>

        {error && <p className="rounded bg-red-50 p-2 text-sm text-red-600">{error}</p>}

        <div className={`grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4 ${loading ? "opacity-60" : ""}`}>
          {(datos?.kpis || []).map((kpi) => (
            <Link
              key={kpi.codigo}
              to={kpi.enlace}
              className="card group block !p-4 transition hover:border-brand-blue hover:shadow-md"
              title={`${kpi.descripcion}. Clic para ver el reporte.`}
            >
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-medium text-gray-600">{kpi.nombre}</p>
                <span aria-hidden="true">{ICONOS[kpi.codigo]}</span>
              </div>
              <p className="mt-2 text-2xl font-bold text-brand-dark">{valorKpi(kpi)}</p>
              <p className="mt-1 text-xs text-gray-500">{detalleKpi(kpi)}</p>
              <p className="mt-2 text-xs font-semibold text-brand-blue opacity-0 transition group-hover:opacity-100">
                Ver reporte →
              </p>
            </Link>
          ))}
          {!datos && loading && <p className="text-sm text-gray-500">Calculando indicadores...</p>}
        </div>

        {datos && (
          <>
            <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
              <div className="card xl:col-span-2">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <h2 className="font-semibold">
                    Unidades que entran y salen por {serie?.agrupado ? "semana" : "día"}
                  </h2>
                  <div className="flex items-center gap-4 text-xs text-gray-600">
                    <span className="flex items-center gap-1">
                      <span className="inline-block h-3 w-3 rounded-sm" style={{ background: SERIE_ENTRADAS }} /> Entradas
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="inline-block h-3 w-3 rounded-sm" style={{ background: SERIE_SALIDAS }} /> Salidas
                    </span>
                    <button type="button" className="text-brand-blue underline" onClick={() => setVerTabla(!verTabla)}>
                      {verTabla ? "Ver gráfico" : "Ver tabla"}
                    </button>
                  </div>
                </div>
                {verTabla ? (
                  <div className="max-h-64 overflow-y-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b text-left text-gray-500">
                          <th className="py-1">Día</th>
                          <th className="py-1 text-right">Entradas</th>
                          <th className="py-1 text-right">Salidas</th>
                        </tr>
                      </thead>
                      <tbody>
                        {datos.graficos.movimientos_por_dia.map((f) => (
                          <tr key={f.dia} className="border-b border-gray-100">
                            <td className="py-1">{new Date(`${f.dia}T00:00:00`).toLocaleDateString("es-BO")}</td>
                            <td className="py-1 text-right">{formatearValor(f.entradas, "numero")}</td>
                            <td className="py-1 text-right">{formatearValor(f.salidas, "numero")}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <MovimientosPorDia filas={serie.filas} agrupado={serie.agrupado} />
                )}
              </div>

              <div className="card">
                <h2 className="mb-3 font-semibold">Valor del inventario por sucursal</h2>
                <ValorPorSucursal filas={datos.graficos.valor_por_sucursal} seleccionado={idAlmacen} />
              </div>
            </div>

            <div className="card">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="font-semibold">Productos en quiebre de stock</h2>
                <Link to="/reportes/comparativo-sucursales" className="text-sm text-brand-blue hover:underline">
                  Ver comparativo →
                </Link>
              </div>
              {datos.graficos.top_quiebre.length === 0 ? (
                <p className="text-sm text-gray-500">Ningún producto está por debajo de su mínimo.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-gray-500">
                      <th className="py-2">Producto</th>
                      <th className="py-2">Sucursal</th>
                      <th className="py-2 text-right">Disponible</th>
                      <th className="py-2 text-right">Mínimo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {datos.graficos.top_quiebre.map((f) => (
                      <tr key={`${f.id_producto}-${f.id_almacen}`} className="border-b border-gray-100">
                        <td className="py-2">
                          <span className="font-medium">{f.producto}</span>{" "}
                          <span className="font-mono text-xs text-gray-500">{f.producto_codigo}</span>
                        </td>
                        <td className="py-2">{f.almacen}</td>
                        <td className="py-2 text-right font-semibold text-red-700">
                          {formatearValor(f.cantidad_disponible, "numero")} {f.unidad}
                        </td>
                        <td className="py-2 text-right">{formatearValor(f.stock_minimo, "numero")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </>
        )}
      </div>
    </Layout>
  );
}
