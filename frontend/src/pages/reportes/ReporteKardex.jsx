import { useEffect, useMemo, useState } from "react";
import Layout from "../../components/layout/Layout";
import Select from "../../components/ui/Select";
import BotonesExportar from "../../components/ui/BotonesExportar";
import { reporteKardex } from "../../api/reportes.api";
import { listarAlmacenes } from "../../api/catalogos.api";
import { buscarProductosRapido } from "../../api/productos.api";
import { formatearValor } from "../../utils/exportar";

const TIPOS = {
  SALDO_INICIAL: "Saldo inicial",
  SALDO_ANTERIOR: "Saldo anterior",
  ENTRADA: "Recepción",
  DEVOLUCION: "Devolución de cliente",
  ANULACION_VENTA: "Anulación de venta",
  SALIDA: "Salida",
  VENTA: "Venta",
  SALIDA_PERDIDA: "Pérdida",
  SALIDA_DANO: "Daño",
  SALIDA_VENCIMIENTO: "Vencimiento",
  DEVOLUCION_PROVEEDOR: "Devolución a proveedor",
  TRANSFERENCIA: "Transferencia",
  AJUSTE: "Ajuste",
};

const etiquetaTipo = (tipo) => TIPOS[tipo] || tipo || "—";

const COLUMNAS = [
  {
    key: "fecha_movimiento",
    label: "Fecha",
    valor: (f) => (f.fecha_movimiento ? new Date(f.fecha_movimiento).toLocaleString("es-BO") : f.fecha || ""),
  },
  { key: "tipo_movimiento", label: "Tipo", valor: (f) => etiquetaTipo(f.tipo_movimiento) },
  { key: "referencia", label: "Referencia" },
  { key: "entrada", label: "Entrada", tipo: "numero" },
  { key: "salida", label: "Salida", tipo: "numero" },
  { key: "saldo", label: "Saldo", tipo: "numero" },
  { key: "costo_unitario", label: "Costo unitario", tipo: "moneda" },
  { key: "saldo_valorizado", label: "Saldo valorizado", tipo: "moneda" },
];

function cantidadOVacio(valor) {
  return Number(valor) ? formatearValor(valor, "numero") : "—";
}

export default function ReporteKardex() {
  const [almacenes, setAlmacenes] = useState([]);
  const [idAlmacen, setIdAlmacen] = useState("");
  const [busqueda, setBusqueda] = useState("");
  const [sugerencias, setSugerencias] = useState([]);
  const [producto, setProducto] = useState(null);
  const [fechaDesde, setFechaDesde] = useState("");
  const [fechaHasta, setFechaHasta] = useState("");
  const [filas, setFilas] = useState([]);
  const [resumen, setResumen] = useState(null);
  const [almacen, setAlmacen] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    listarAlmacenes().then((r) => setAlmacenes(r.data || [])).catch(() => setAlmacenes([]));
  }, []);

  useEffect(() => {
    if (producto || busqueda.trim().length < 2) {
      setSugerencias([]);
      return undefined;
    }
    let vigente = true;
    const timer = setTimeout(() => {
      buscarProductosRapido(busqueda.trim(), 8)
        .then((r) => vigente && setSugerencias(r.data || []))
        .catch(() => vigente && setSugerencias([]));
    }, 300);
    return () => {
      vigente = false;
      clearTimeout(timer);
    };
  }, [busqueda, producto]);

  const fechasInvalidas = fechaDesde && fechaHasta && fechaDesde > fechaHasta;

  useEffect(() => {
    if (!producto || !idAlmacen || fechasInvalidas) {
      setFilas([]);
      setResumen(null);
      setAlmacen(null);
      return undefined;
    }
    let vigente = true;
    setLoading(true);
    setError("");
    const params = { id_producto: producto.id_producto, id_almacen: idAlmacen };
    if (fechaDesde) params.fecha_desde = fechaDesde;
    if (fechaHasta) params.fecha_hasta = fechaHasta;
    reporteKardex(params)
      .then((data) => {
        if (!vigente) return;
        setFilas(data.data || []);
        setResumen(data.resumen || null);
        setAlmacen(data.almacen || null);
      })
      .catch((err) => {
        if (!vigente) return;
        setFilas([]);
        setResumen(null);
        setError(err.response?.data?.message || "Error al cargar el kardex");
      })
      .finally(() => vigente && setLoading(false));
    return () => {
      vigente = false;
    };
  }, [producto, idAlmacen, fechaDesde, fechaHasta, fechasInvalidas]);

  const subtitulo = useMemo(() => {
    const partes = [];
    if (producto) partes.push(`${producto.codigo} - ${producto.nombre}`);
    if (almacen) partes.push(almacen.nombre);
    if (fechaDesde || fechaHasta) partes.push(`Del ${fechaDesde || "inicio"} al ${fechaHasta || "hoy"}`);
    return partes.join(" · ");
  }, [producto, almacen, fechaDesde, fechaHasta]);

  const tarjetas = resumen
    ? [
        { label: "Stock actual", valor: resumen.stock_actual, tipo: "numero" },
        { label: "Saldo final del kardex", valor: resumen.saldo_final, tipo: "numero" },
        { label: "Costo promedio", valor: resumen.costo_promedio, tipo: "moneda" },
        { label: "Saldo valorizado", valor: resumen.saldo_valorizado, tipo: "moneda" },
      ]
    : [];

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">Kardex valorizado</h1>
            <p className="text-sm text-gray-500">
              Cada movimiento del producto con su entrada, salida, saldo y costo promedio ponderado.
            </p>
          </div>
          <BotonesExportar
            titulo="Kardex valorizado"
            subtitulo={subtitulo}
            nombreArchivo="kardex"
            columnas={COLUMNAS}
            filas={filas}
            resumen={tarjetas}
          />
        </div>

        <div className="card">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
            <div className="relative">
              <label className="mb-1 block text-sm font-medium" htmlFor="kardex-producto">
                Producto
              </label>
              {producto ? (
                <div className="input-field flex items-center justify-between gap-2">
                  <span className="truncate">
                    <span className="font-mono text-xs text-gray-500">{producto.codigo}</span> {producto.nombre}
                  </span>
                  <button
                    type="button"
                    className="text-sm text-blue-700"
                    onClick={() => {
                      setProducto(null);
                      setBusqueda("");
                    }}
                  >
                    Cambiar
                  </button>
                </div>
              ) : (
                <input
                  id="kardex-producto"
                  className="input-field"
                  placeholder="Nombre o código"
                  value={busqueda}
                  onChange={(e) => setBusqueda(e.target.value)}
                />
              )}
              {sugerencias.length > 0 && (
                <ul className="absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded border border-gray-200 bg-white shadow">
                  {sugerencias.map((item) => (
                    <li key={item.id_producto}>
                      <button
                        type="button"
                        className="block w-full px-3 py-2 text-left text-sm hover:bg-gray-50"
                        onClick={() => {
                          setProducto(item);
                          setSugerencias([]);
                          setBusqueda("");
                        }}
                      >
                        <span className="font-mono text-xs text-gray-500">{item.codigo}</span> {item.nombre}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <Select
              label="Almacén"
              value={idAlmacen}
              onChange={(e) => setIdAlmacen(e.target.value)}
              options={almacenes.map((a) => ({ value: a.id_almacen, label: `${a.codigo} - ${a.nombre}` }))}
              placeholder="Elige un almacén"
            />
            <div>
              <label className="mb-1 block text-sm font-medium" htmlFor="kardex-desde">
                Desde
              </label>
              <input
                id="kardex-desde"
                type="date"
                className="input-field"
                value={fechaDesde}
                onChange={(e) => setFechaDesde(e.target.value)}
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium" htmlFor="kardex-hasta">
                Hasta
              </label>
              <input
                id="kardex-hasta"
                type="date"
                className="input-field"
                value={fechaHasta}
                onChange={(e) => setFechaHasta(e.target.value)}
              />
            </div>
          </div>
          <p className="mt-3 text-xs text-gray-500">
            El costo de cada recepción queda guardado con el movimiento. El saldo valorizado usa el costo promedio
            ponderado. Sin fechas se muestra todo el historial y la última fila cierra contra el stock actual.
          </p>
          {fechasInvalidas && (
            <p className="mt-2 text-sm text-red-600">La fecha inicial no puede ser posterior a la final.</p>
          )}
        </div>

        {resumen && (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {tarjetas.map((t) => (
              <div key={t.label} className="rounded border border-gray-200 bg-gray-50 p-3">
                <p className="text-xs text-gray-600">{t.label}</p>
                <p className="text-xl font-bold">
                  {formatearValor(t.valor || 0, t.tipo)}
                  {t.tipo === "numero" && resumen && producto?.unidad ? ` ${producto.unidad}` : ""}
                </p>
              </div>
            ))}
          </div>
        )}

        {resumen?.cuadra && (
          <p className="rounded bg-green-50 p-2 text-sm text-green-800">
            El saldo final del kardex ({formatearValor(resumen.saldo_final, "numero")}) coincide con el stock actual del
            almacén.
            {(fechaDesde || fechaHasta) &&
              ` La última fila es el cierre del período (${formatearValor(resumen.saldo_cierre_periodo, "numero")}).`}
          </p>
        )}

        {error && <p className="rounded bg-red-50 p-2 text-sm text-red-600">{error}</p>}

        <div className="card">
          <h2 className="mb-3 font-semibold">Movimientos</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-left text-gray-500">
                  <th className="py-2 pr-3">Fecha</th>
                  <th className="py-2 pr-3">Tipo</th>
                  <th className="py-2 pr-3 text-right">Entrada</th>
                  <th className="py-2 pr-3 text-right">Salida</th>
                  <th className="py-2 pr-3 text-right">Saldo</th>
                  <th className="py-2 pr-3 text-right">Costo unitario</th>
                  <th className="py-2 text-right">Saldo valorizado</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan="7" className="py-6 text-center text-gray-500">
                      Cargando...
                    </td>
                  </tr>
                ) : !producto || !idAlmacen ? (
                  <tr>
                    <td colSpan="7" className="py-6 text-center text-gray-500">
                      Elige un producto y un almacén para ver el kardex
                    </td>
                  </tr>
                ) : filas.length === 0 ? (
                  <tr>
                    <td colSpan="7" className="py-6 text-center text-gray-500">
                      No hay movimientos en ese período
                    </td>
                  </tr>
                ) : (
                  filas.map((fila, indice) => (
                    <tr
                      key={fila.id_movimiento || `${fila.tipo_movimiento}-${indice}`}
                      className="border-b border-gray-100 hover:bg-gray-50"
                    >
                      <td className="whitespace-nowrap py-2 pr-3">
                        {fila.fecha_movimiento ? new Date(fila.fecha_movimiento).toLocaleString("es-BO") : fila.fecha || "—"}
                      </td>
                      <td className="py-2 pr-3">
                        <div className="font-medium">{etiquetaTipo(fila.tipo_movimiento)}</div>
                        {fila.referencia && <div className="font-mono text-xs text-gray-500">{fila.referencia}</div>}
                      </td>
                      <td className="py-2 pr-3 text-right">{cantidadOVacio(fila.entrada)}</td>
                      <td className="py-2 pr-3 text-right">{cantidadOVacio(fila.salida)}</td>
                      <td className="py-2 pr-3 text-right font-semibold">{formatearValor(fila.saldo, "numero")}</td>
                      <td className="py-2 pr-3 text-right">{formatearValor(fila.costo_unitario, "moneda")}</td>
                      <td className="py-2 text-right font-semibold">{formatearValor(fila.saldo_valorizado, "moneda")}</td>
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
