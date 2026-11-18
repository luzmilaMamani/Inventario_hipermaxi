import { useEffect, useMemo, useState } from "react";
import Layout from "../../components/layout/Layout";
import Select from "../../components/ui/Select";
import BotonesExportar from "../../components/ui/BotonesExportar";
import { reportePerdidas } from "../../api/salidas.api";
import { listarAlmacenes, listarCategorias } from "../../api/catalogos.api";
import { formatearValor } from "../../utils/exportar";

// RF46: pérdidas, daños y vencimientos en un solo reporte valorizado.

const TIPOS = [
  { value: "PERDIDA", label: "Pérdida", color: "#2a78d6" },
  { value: "DANO", label: "Daño", color: "#eb6834" },
  { value: "VENCIMIENTO", label: "Vencimiento", color: "#1baf7a" },
];
const TIPO = Object.fromEntries(TIPOS.map((t) => [t.value, t]));

const MOTIVOS = {
  ROBO: "Robo",
  EXTRAVIO: "Extravío",
  DETERIORO: "Deterioro",
  ROTO: "Roto",
  INUTILIZABLE: "Inutilizable",
  VENCIMIENTO: "Vencimiento",
  LOTE_VENCIDO: "Lote vencido",
  OTRO: "Otro",
  SIN_DETALLE: "Sin detalle",
};
const textoMotivo = (m) => MOTIVOS[m] || m;

const FILTROS_INICIALES = {
  fecha_desde: "",
  fecha_hasta: "",
  id_almacen: "",
  id_categoria: "",
  tipo: "",
  motivo: "",
};

const RESUMEN_VACIO = { total_registros: 0, total_salidas: 0, total_unidades: 0, total_valorizado: 0 };

const COLUMNAS = [
  { key: "numero_salida", label: "Número" },
  { key: "fecha_salida", label: "Fecha", tipo: "fecha" },
  { key: "tipo_perdida", label: "Tipo", valor: (r) => TIPO[r.tipo_perdida]?.label || r.tipo_perdida },
  { key: "motivo", label: "Motivo", valor: (r) => textoMotivo(r.motivo) },
  { key: "almacen", label: "Almacén" },
  { key: "categoria", label: "Categoría" },
  { key: "producto_codigo", label: "Código" },
  { key: "producto", label: "Producto" },
  { key: "cantidad", label: "Cantidad", tipo: "numero" },
  { key: "precio_unitario", label: "Precio unit.", tipo: "moneda" },
  { key: "valor_total", label: "Valor perdido", tipo: "moneda" },
  { key: "usuario_registra", label: "Registró" },
];

export default function ReportePerdidas() {
  const [filtros, setFiltros] = useState(FILTROS_INICIALES);
  const [registros, setRegistros] = useState([]);
  const [resumen, setResumen] = useState(RESUMEN_VACIO);
  const [porTipo, setPorTipo] = useState([]);
  const [porMotivo, setPorMotivo] = useState([]);
  const [porProducto, setPorProducto] = useState([]);
  const [almacenes, setAlmacenes] = useState([]);
  const [categorias, setCategorias] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    listarAlmacenes().then((r) => setAlmacenes(r.data || [])).catch(() => setAlmacenes([]));
    listarCategorias().then((r) => setCategorias(r.data || [])).catch(() => setCategorias([]));
  }, []);

  useEffect(() => {
    if (filtros.fecha_desde && filtros.fecha_hasta && filtros.fecha_desde > filtros.fecha_hasta) return undefined;
    let vigente = true;
    setLoading(true);
    setError("");
    const params = Object.fromEntries(Object.entries(filtros).filter(([, v]) => v !== ""));
    reportePerdidas(params)
      .then((data) => {
        if (!vigente) return;
        setRegistros(data.data || []);
        setResumen(data.resumen || RESUMEN_VACIO);
        setPorTipo(data.por_tipo || []);
        setPorMotivo(data.por_motivo || []);
        setPorProducto(data.por_producto || []);
      })
      .catch((err) => vigente && setError(err.response?.data?.message || "Error al cargar el reporte"))
      .finally(() => vigente && setLoading(false));
    return () => {
      vigente = false;
    };
  }, [filtros]);

  const cambiar = (campo) => (e) => {
    const valor = e.target.value;
    // Al cambiar de tipo, el motivo elegido puede dejar de existir.
    setFiltros((f) => ({ ...f, [campo]: valor, ...(campo === "tipo" ? { motivo: "" } : {}) }));
  };

  const motivosDisponibles = useMemo(
    () =>
      [...new Set(porMotivo.filter((m) => !filtros.tipo || m.tipo_perdida === filtros.tipo).map((m) => m.motivo))].map(
        (m) => ({ value: m, label: textoMotivo(m) }),
      ),
    [porMotivo, filtros.tipo],
  );

  const maxTipo = Math.max(...porTipo.map((t) => Number(t.valor)), 1);
  const totalValor = Number(resumen.total_valorizado || 0);

  const subtitulo = [
    filtros.fecha_desde || filtros.fecha_hasta
      ? `Del ${filtros.fecha_desde || "inicio"} al ${filtros.fecha_hasta || "hoy"}`
      : "Todo el período",
    filtros.id_almacen && almacenes.find((a) => String(a.id_almacen) === filtros.id_almacen)?.nombre,
    filtros.id_categoria && categorias.find((c) => String(c.id_categoria) === filtros.id_categoria)?.nombre,
    filtros.tipo && TIPO[filtros.tipo]?.label,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">Reporte de pérdidas</h1>
            <p className="text-sm text-gray-500">
              Cuánta mercadería y dinero se pierde por pérdida, daño y vencimiento, y por qué (RF46)
            </p>
          </div>
          <BotonesExportar
            titulo="Reporte de pérdidas de inventario"
            subtitulo={subtitulo}
            nombreArchivo="perdidas"
            columnas={COLUMNAS}
            filas={registros}
            resumen={[
              { label: "Registros", valor: resumen.total_registros, tipo: "numero" },
              { label: "Unidades perdidas", valor: resumen.total_unidades, tipo: "numero" },
              { label: "Valor perdido", valor: resumen.total_valorizado, tipo: "moneda" },
            ]}
          />
        </div>

        <div className="card">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-4 xl:grid-cols-7">
            <div>
              <label className="mb-1 block text-sm font-medium">Desde</label>
              <input type="date" className="input-field" value={filtros.fecha_desde} onChange={cambiar("fecha_desde")} />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Hasta</label>
              <input type="date" className="input-field" value={filtros.fecha_hasta} onChange={cambiar("fecha_hasta")} />
            </div>
            <Select
              label="Almacén"
              value={filtros.id_almacen}
              onChange={cambiar("id_almacen")}
              options={almacenes.map((a) => ({ value: a.id_almacen, label: `${a.codigo} - ${a.nombre}` }))}
              placeholder="Todos"
            />
            <Select
              label="Categoría"
              value={filtros.id_categoria}
              onChange={cambiar("id_categoria")}
              options={categorias.map((c) => ({ value: c.id_categoria, label: c.nombre }))}
              placeholder="Todas"
            />
            <Select
              label="Tipo de pérdida"
              value={filtros.tipo}
              onChange={cambiar("tipo")}
              options={TIPOS}
              placeholder="Todos"
            />
            <Select
              label="Motivo"
              value={filtros.motivo}
              onChange={cambiar("motivo")}
              options={motivosDisponibles}
              placeholder="Todos"
            />
            <div className="flex items-end">
              <button className="btn-secondary w-full" onClick={() => setFiltros(FILTROS_INICIALES)}>
                Limpiar
              </button>
            </div>
          </div>
          {filtros.fecha_desde && filtros.fecha_hasta && filtros.fecha_desde > filtros.fecha_hasta && (
            <p className="mt-2 text-sm text-red-600">La fecha inicial no puede ser posterior a la final.</p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <div className="rounded border border-blue-100 bg-blue-50 p-3">
            <p className="text-xs text-gray-600">Salidas registradas</p>
            <p className="text-xl font-bold text-blue-700">{formatearValor(resumen.total_salidas, "numero")}</p>
          </div>
          <div className="rounded border border-amber-100 bg-amber-50 p-3">
            <p className="text-xs text-gray-600">Líneas</p>
            <p className="text-xl font-bold text-amber-700">{formatearValor(resumen.total_registros, "numero")}</p>
          </div>
          <div className="rounded border border-purple-100 bg-purple-50 p-3">
            <p className="text-xs text-gray-600">Unidades perdidas</p>
            <p className="text-xl font-bold text-purple-700">{formatearValor(resumen.total_unidades, "numero")}</p>
          </div>
          <div className="rounded border border-red-100 bg-red-50 p-3">
            <p className="text-xs text-gray-600">Valor total perdido</p>
            <p className="text-xl font-bold text-red-700">{formatearValor(resumen.total_valorizado, "moneda")}</p>
          </div>
        </div>

        {error && <p className="rounded bg-red-50 p-2 text-sm text-red-600">{error}</p>}

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
          <div className="card">
            <h2 className="mb-3 font-semibold">Valor perdido por tipo</h2>
            {porTipo.length === 0 ? (
              <p className="text-sm text-gray-500">Sin pérdidas con esos filtros</p>
            ) : (
              <div className="space-y-3">
                {porTipo.map((t) => (
                  <div key={t.tipo_perdida} title={`${formatearValor(t.unidades, "numero")} unidades`}>
                    <div className="mb-1 flex justify-between text-sm">
                      <span className="font-medium">{TIPO[t.tipo_perdida]?.label || t.tipo_perdida}</span>
                      <span className="text-gray-600">
                        {formatearValor(t.valor, "moneda")}
                        {totalValor > 0 && ` · ${formatearValor((Number(t.valor) / totalValor) * 100, "porcentaje")}`}
                      </span>
                    </div>
                    <div className="h-3 rounded bg-gray-100">
                      <div
                        className="h-3 rounded-r"
                        style={{
                          width: `${Math.max((Number(t.valor) / maxTipo) * 100, 0.5)}%`,
                          background: TIPO[t.tipo_perdida]?.color || "#6b7280",
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="card">
            <h2 className="mb-3 font-semibold">Por motivo</h2>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-gray-500">
                  <th className="py-1">Tipo / motivo</th>
                  <th className="py-1 text-right">Unid.</th>
                  <th className="py-1 text-right">Valor</th>
                </tr>
              </thead>
              <tbody>
                {porMotivo.map((m) => (
                  <tr key={`${m.tipo_perdida}-${m.motivo}`} className="border-b border-gray-100">
                    <td className="py-1">
                      <span
                        className="mr-2 inline-block h-2 w-2 rounded-sm"
                        style={{ background: TIPO[m.tipo_perdida]?.color }}
                      />
                      {TIPO[m.tipo_perdida]?.label} · {textoMotivo(m.motivo)}
                    </td>
                    <td className="py-1 text-right">{formatearValor(m.unidades, "numero")}</td>
                    <td className="py-1 text-right font-semibold">{formatearValor(m.valor, "moneda")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="card">
            <h2 className="mb-3 font-semibold">Productos con más pérdida</h2>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-gray-500">
                  <th className="py-1">Producto</th>
                  <th className="py-1 text-right">Unid.</th>
                  <th className="py-1 text-right">Valor</th>
                </tr>
              </thead>
              <tbody>
                {porProducto.map((p) => (
                  <tr key={p.id_producto} className="border-b border-gray-100">
                    <td className="py-1">
                      {p.producto} <span className="font-mono text-xs text-gray-500">{p.producto_codigo}</span>
                    </td>
                    <td className="py-1 text-right">{formatearValor(p.unidades, "numero")}</td>
                    <td className="py-1 text-right font-semibold">{formatearValor(p.valor, "moneda")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="card">
          <h2 className="mb-3 font-semibold">Detalle</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-left text-gray-500">
                  <th className="py-2">Número</th>
                  <th className="py-2">Fecha</th>
                  <th className="py-2">Tipo / motivo</th>
                  <th className="py-2">Almacén</th>
                  <th className="py-2">Producto</th>
                  <th className="py-2 text-right">Cantidad</th>
                  <th className="py-2 text-right">Precio unit.</th>
                  <th className="py-2 text-right">Valor</th>
                  <th className="py-2 pl-4">Registró</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan="9" className="py-6 text-center text-gray-500">Cargando...</td>
                  </tr>
                ) : registros.length === 0 ? (
                  <tr>
                    <td colSpan="9" className="py-6 text-center text-gray-500">No hay pérdidas registradas con esos filtros</td>
                  </tr>
                ) : (
                  registros.map((r, idx) => (
                    <tr key={`${r.id_salida}-${r.id_producto}-${idx}`} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="py-2 font-mono text-xs">{r.numero_salida}</td>
                      <td className="py-2">{formatearValor(r.fecha_salida, "fecha")}</td>
                      <td className="py-2">
                        <span className="flex items-center gap-2">
                          <span className="inline-block h-2 w-2 rounded-sm" style={{ background: TIPO[r.tipo_perdida]?.color }} />
                          {TIPO[r.tipo_perdida]?.label}
                        </span>
                        <span className="text-xs text-gray-500">{textoMotivo(r.motivo)}</span>
                      </td>
                      <td className="py-2">{r.almacen}</td>
                      <td className="py-2">
                        <div className="font-medium">{r.producto}</div>
                        <div className="font-mono text-xs text-gray-500">
                          {r.producto_codigo}
                          {r.numero_lote ? ` · lote ${r.numero_lote}` : ""}
                        </div>
                      </td>
                      <td className="py-2 text-right">{formatearValor(r.cantidad, "numero")} {r.unidad}</td>
                      <td className="py-2 text-right">{formatearValor(r.precio_unitario, "moneda")}</td>
                      <td className="py-2 text-right font-semibold">{formatearValor(r.valor_total, "moneda")}</td>
                      <td className="py-2 pl-4">{r.usuario_registra}</td>
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
