import { useEffect, useState } from "react";
import Layout from "../../components/layout/Layout";
import Select from "../../components/ui/Select";
import Pagination from "../../components/ui/Pagination";
import BotonesExportar from "../../components/ui/BotonesExportar";
import { reporteMovimientos } from "../../api/reportes.api";
import { listarAlmacenes } from "../../api/catalogos.api";
import { formatearValor } from "../../utils/exportar";

// RF45: movimientos de inventario de un período para auditar qué pasó con el stock.

const TIPOS = [
  { value: "ENTRADA", label: "Entradas" },
  { value: "SALIDA", label: "Salidas" },
  { value: "TRANSFERENCIA", label: "Transferencias" },
  { value: "AJUSTE", label: "Ajustes" },
];
const ETIQUETA_TIPO = {
  ENTRADA: "Entrada",
  SALIDA: "Salida",
  TRANSFERENCIA: "Transferencia",
  AJUSTE: "Ajuste",
};
const DETALLE_TIPO = {
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

const hoy = () => new Date().toISOString().slice(0, 10);
const inicioMes = () => `${hoy().slice(0, 8)}01`;
const FILTROS_INICIALES = { fecha_desde: inicioMes(), fecha_hasta: hoy(), tipo: "", id_almacen: "", search: "" };

const COLUMNAS = [
  { key: "fecha_movimiento", label: "Fecha", valor: (r) => new Date(r.fecha_movimiento).toLocaleString("es-BO") },
  { key: "grupo", label: "Tipo", valor: (r) => ETIQUETA_TIPO[r.grupo] || r.grupo },
  { key: "tipo_movimiento", label: "Detalle", valor: (r) => DETALLE_TIPO[r.tipo_movimiento] || r.tipo_movimiento },
  { key: "producto_codigo", label: "Código" },
  { key: "producto", label: "Producto" },
  { key: "almacen", label: "Almacén" },
  { key: "cantidad_neta", label: "Cantidad (+/-)", tipo: "numero" },
  { key: "stock_anterior", label: "Stock anterior", tipo: "numero" },
  { key: "stock_nuevo", label: "Stock nuevo", tipo: "numero" },
  { key: "referencia", label: "Referencia" },
  { key: "usuario", label: "Usuario" },
  { key: "motivo", label: "Motivo" },
];

export default function ReporteMovimientos() {
  const [filtros, setFiltros] = useState(FILTROS_INICIALES);
  const [busqueda, setBusqueda] = useState("");
  const [page, setPage] = useState(1);
  const [datos, setDatos] = useState({ data: [], totales_por_tipo: [], pagination: { page: 1, limit: 50, total: 0 } });
  const [almacenes, setAlmacenes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    listarAlmacenes().then((r) => setAlmacenes(r.data || [])).catch(() => setAlmacenes([]));
  }, []);

  useEffect(() => {
    const t = setTimeout(() => {
      setFiltros((f) => ({ ...f, search: busqueda.trim() }));
      setPage(1);
    }, 400);
    return () => clearTimeout(t);
  }, [busqueda]);

  const params = Object.fromEntries(Object.entries(filtros).filter(([, v]) => v !== ""));
  const rangoInvalido = filtros.fecha_desde && filtros.fecha_hasta && filtros.fecha_desde > filtros.fecha_hasta;

  useEffect(() => {
    if (rangoInvalido) return undefined;
    let vigente = true;
    setLoading(true);
    setError("");
    reporteMovimientos({ ...Object.fromEntries(Object.entries(filtros).filter(([, v]) => v !== "")), page, limit: 50 })
      .then((r) => vigente && setDatos(r))
      .catch((err) => vigente && setError(err.response?.data?.message || "Error al cargar los movimientos"))
      .finally(() => vigente && setLoading(false));
    return () => {
      vigente = false;
    };
  }, [filtros, page, rangoInvalido]);

  const cambiar = (campo) => (e) => {
    setFiltros({ ...filtros, [campo]: e.target.value });
    setPage(1);
  };

  const totalMovimientos = datos.totales_por_tipo.reduce((s, t) => s + t.movimientos, 0);

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">Reporte de movimientos</h1>
            <p className="text-sm text-gray-500">
              Entradas, salidas, transferencias y ajustes de un período, para auditar el stock (RF45)
            </p>
          </div>
          <BotonesExportar
            titulo="Reporte de movimientos de inventario"
            subtitulo={`Del ${filtros.fecha_desde || "inicio"} al ${filtros.fecha_hasta || "hoy"}`}
            nombreArchivo="movimientos"
            columnas={COLUMNAS}
            filas={datos.data}
            cargarFilas={() => reporteMovimientos({ ...params, todos: "true" }).then((r) => r.data)}
            resumen={datos.totales_por_tipo.map((t) => ({
              label: ETIQUETA_TIPO[t.grupo] || t.grupo,
              valor: t.movimientos,
              tipo: "numero",
            }))}
          />
        </div>

        <div className="card">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3 xl:grid-cols-6">
            <div>
              <label className="mb-1 block text-sm font-medium">Desde</label>
              <input type="date" className="input-field" value={filtros.fecha_desde} onChange={cambiar("fecha_desde")} />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Hasta</label>
              <input type="date" className="input-field" value={filtros.fecha_hasta} onChange={cambiar("fecha_hasta")} />
            </div>
            <Select label="Tipo" value={filtros.tipo} onChange={cambiar("tipo")} options={TIPOS} placeholder="Todos" />
            <Select
              label="Almacén"
              value={filtros.id_almacen}
              onChange={cambiar("id_almacen")}
              options={almacenes.map((a) => ({ value: a.id_almacen, label: `${a.codigo} - ${a.nombre}` }))}
              placeholder="Todos"
            />
            <div>
              <label className="mb-1 block text-sm font-medium">Producto o referencia</label>
              <input
                className="input-field"
                placeholder="Nombre, código o N.º"
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
              />
            </div>
            <div className="flex items-end">
              <button
                className="btn-secondary w-full"
                onClick={() => {
                  setBusqueda("");
                  setFiltros(FILTROS_INICIALES);
                  setPage(1);
                }}
              >
                Limpiar filtros
              </button>
            </div>
          </div>
          {rangoInvalido && <p className="mt-2 text-sm text-red-600">La fecha inicial no puede ser posterior a la final.</p>}
        </div>

        {error && <p className="rounded bg-red-50 p-2 text-sm text-red-600">{error}</p>}

        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          <div className="rounded border border-gray-200 bg-white p-3">
            <p className="text-xs text-gray-600">Movimientos</p>
            <p className="text-xl font-bold">{formatearValor(totalMovimientos, "numero")}</p>
          </div>
          {TIPOS.map(({ value }) => {
            const t = datos.totales_por_tipo.find((x) => x.grupo === value);
            return (
              <button
                key={value}
                type="button"
                className={`rounded border p-3 text-left transition hover:border-brand-blue ${
                  filtros.tipo === value ? "border-brand-blue bg-blue-50" : "border-gray-200 bg-white"
                }`}
                onClick={() => {
                  setFiltros({ ...filtros, tipo: filtros.tipo === value ? "" : value });
                  setPage(1);
                }}
                title="Filtrar por este tipo"
              >
                <p className="text-xs text-gray-600">{ETIQUETA_TIPO[value]}s</p>
                <p className="text-xl font-bold">{formatearValor(t?.movimientos || 0, "numero")}</p>
                <p className="text-xs text-gray-500">
                  {Number(t?.unidades_ingreso) > 0 && `+${formatearValor(t.unidades_ingreso, "numero")}`}
                  {Number(t?.unidades_ingreso) > 0 && Number(t?.unidades_egreso) > 0 && " / "}
                  {Number(t?.unidades_egreso) > 0 && `−${formatearValor(t.unidades_egreso, "numero")}`}
                  {!t && "Sin movimientos"}
                  {t && " unid."}
                </p>
              </button>
            );
          })}
        </div>

        <div className="card">
          <div className="overflow-x-auto">
            <table className="w-full text-sm [&_td]:px-2 [&_th]:px-2">
              <thead>
                <tr className="border-b border-gray-200 text-left text-gray-500">
                  <th className="py-2">Fecha</th>
                  <th className="py-2">Tipo</th>
                  <th className="py-2">Producto</th>
                  <th className="py-2">Almacén</th>
                  <th className="py-2 text-right">Cantidad</th>
                  <th className="py-2 text-right">Stock</th>
                  <th className="py-2">Referencia</th>
                  <th className="py-2">Usuario</th>
                  <th className="py-2">Motivo</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan="9" className="py-6 text-center text-gray-500">Cargando...</td>
                  </tr>
                ) : datos.data.length === 0 ? (
                  <tr>
                    <td colSpan="9" className="py-6 text-center text-gray-500">No hay movimientos con esos filtros</td>
                  </tr>
                ) : (
                  datos.data.map((m) => {
                    const ingreso = Number(m.cantidad_neta) > 0;
                    return (
                      <tr key={m.id_movimiento} className="border-b border-gray-100 align-top hover:bg-gray-50">
                        <td className="whitespace-nowrap py-2">
                          {new Date(m.fecha_movimiento).toLocaleString("es-BO", { dateStyle: "short", timeStyle: "short" })}
                        </td>
                        <td className="py-2">
                          <div className="font-medium">{ETIQUETA_TIPO[m.grupo]}</div>
                          <div className="text-xs text-gray-500">{DETALLE_TIPO[m.tipo_movimiento] || m.tipo_movimiento}</div>
                        </td>
                        <td className="py-2">
                          <div>{m.producto}</div>
                          <div className="font-mono text-xs text-gray-500">
                            {m.producto_codigo}
                            {m.numero_lote ? ` · lote ${m.numero_lote}` : ""}
                          </div>
                        </td>
                        <td className="py-2">{m.almacen}</td>
                        <td className={`whitespace-nowrap py-2 text-right font-semibold ${ingreso ? "text-green-700" : "text-red-700"}`}>
                          {ingreso ? "+" : "−"}
                          {formatearValor(m.cantidad, "numero")} {m.unidad}
                        </td>
                        <td className="whitespace-nowrap py-2 text-right text-xs text-gray-600">
                          {m.stock_anterior !== null && m.stock_nuevo !== null
                            ? `${formatearValor(m.stock_anterior, "numero")} → ${formatearValor(m.stock_nuevo, "numero")}`
                            : "—"}
                        </td>
                        <td className="py-2 font-mono text-xs">{m.referencia || "—"}</td>
                        <td className="py-2 text-xs">{m.usuario}</td>
                        <td className="max-w-xs py-2 text-xs text-gray-600">{m.motivo || "—"}</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
          <Pagination
            page={datos.pagination.page}
            limit={datos.pagination.limit}
            total={datos.pagination.total}
            onChange={setPage}
          />
        </div>
      </div>
    </Layout>
  );
}
