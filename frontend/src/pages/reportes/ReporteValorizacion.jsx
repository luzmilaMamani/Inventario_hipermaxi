import { Fragment, useEffect, useState } from "react";
import Layout from "../../components/layout/Layout";
import Select from "../../components/ui/Select";
import BotonesExportar from "../../components/ui/BotonesExportar";
import { reporteValorizacion } from "../../api/reportes.api";
import { listarAlmacenes, listarCategorias } from "../../api/catalogos.api";
import { formatearValor } from "../../utils/exportar";

// RF71: capital invertido en mercadería por sucursal, almacén y categoría.

const PARTES = [
  { key: "valor_disponible", label: "Disponible", color: "#2a78d6" },
  { key: "valor_reservado", label: "Reservado", color: "#1baf7a" },
  { key: "valor_no_disponible", label: "Vencido / cuarentena", color: "#eb6834" },
];

const FILTROS_INICIALES = { id_almacen: "", id_categoria: "" };
const TIPOS_ALMACEN = { CENTRAL: "Central", SUCURSAL: "Sucursal", DEPOSITO: "Depósito" };

// Barra apilada con 2px de separación entre segmentos.
function BarraComposicion({ fila }) {
  const total = Number(fila.valor_total) || 0;
  return (
    <div className="flex h-3 w-full gap-[2px] overflow-hidden rounded bg-gray-100">
      {PARTES.map((p) => {
        const valor = Number(fila[p.key]) || 0;
        if (total <= 0 || valor <= 0) return null;
        return (
          <div
            key={p.key}
            style={{ width: `${(valor / total) * 100}%`, background: p.color }}
            title={`${p.label}: ${formatearValor(valor, "moneda")} (${formatearValor((valor / total) * 100, "porcentaje")})`}
          />
        );
      })}
    </div>
  );
}

const COLUMNAS = [
  { key: "almacen", label: "Almacén" },
  { key: "categoria", label: "Categoría" },
  { key: "productos", label: "Productos", tipo: "numero" },
  { key: "unidades", label: "Unidades", tipo: "numero" },
  { key: "valor_disponible", label: "Disponible", tipo: "moneda" },
  { key: "valor_reservado", label: "Reservado", tipo: "moneda" },
  { key: "valor_no_disponible", label: "Vencido / cuarentena", tipo: "moneda" },
  { key: "valor_total", label: "Valor total", tipo: "moneda" },
];

export default function ReporteValorizacion() {
  const [filtros, setFiltros] = useState(FILTROS_INICIALES);
  const [datos, setDatos] = useState(null);
  const [almacenes, setAlmacenes] = useState([]);
  const [categorias, setCategorias] = useState([]);
  const [abiertos, setAbiertos] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    listarAlmacenes().then((r) => setAlmacenes(r.data || [])).catch(() => setAlmacenes([]));
    listarCategorias().then((r) => setCategorias(r.data || [])).catch(() => setCategorias([]));
  }, []);

  useEffect(() => {
    let vigente = true;
    setLoading(true);
    setError("");
    const params = Object.fromEntries(Object.entries(filtros).filter(([, v]) => v !== ""));
    reporteValorizacion(params)
      .then((r) => vigente && setDatos(r))
      .catch((err) => vigente && setError(err.response?.data?.message || "Error al cargar la valorización"))
      .finally(() => vigente && setLoading(false));
    return () => {
      vigente = false;
    };
  }, [filtros]);

  const cambiar = (campo) => (e) => setFiltros({ ...filtros, [campo]: e.target.value });
  const total = datos?.total || {};
  const porAlmacen = datos?.por_almacen || [];
  const filasExportar = porAlmacen.flatMap((a) => a.categorias.map((c) => ({ ...c, almacen: a.almacen })));

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">Valorización del inventario</h1>
            <p className="text-sm text-gray-500">
              Capital invertido en mercadería por sucursal, almacén y categoría (RF71)
            </p>
          </div>
          <BotonesExportar
            titulo="Valorización del inventario"
            subtitulo="Por almacén y categoría"
            nombreArchivo="valorizacion_inventario"
            columnas={COLUMNAS}
            filas={filasExportar}
            resumen={[
              { label: "Valor total", valor: total.valor_total, tipo: "moneda" },
              { label: "Disponible", valor: total.valor_disponible, tipo: "moneda" },
            ]}
          />
        </div>

        <div className="card">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
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
            <div className="flex items-end">
              <button className="btn-secondary w-full" onClick={() => setFiltros(FILTROS_INICIALES)}>
                Limpiar filtros
              </button>
            </div>
          </div>
        </div>

        {error && <p className="rounded bg-red-50 p-2 text-sm text-red-600">{error}</p>}

        <div className={`card ${loading ? "opacity-60" : ""}`}>
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-sm text-gray-500">Total general</p>
              <p className="text-4xl font-bold text-brand-dark">{formatearValor(total.valor_total || 0, "moneda")}</p>
              <p className="text-xs text-gray-500">{formatearValor(total.unidades || 0, "numero")} unidades en stock</p>
            </div>
            <div className="flex flex-wrap gap-4 text-sm">
              {PARTES.map((p) => (
                <div key={p.key}>
                  <span className="mr-1 inline-block h-3 w-3 rounded-sm align-middle" style={{ background: p.color }} />
                  <span className="text-gray-600">{p.label}:</span>{" "}
                  <span className="font-semibold">{formatearValor(total[p.key] || 0, "moneda")}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="mt-4">
            <BarraComposicion fila={total} />
          </div>
        </div>

        <div className="card">
          <h2 className="mb-1 font-semibold">Por sucursal y almacén</h2>
          <p className="mb-3 text-xs text-gray-500">Haz clic en un almacén para ver su desglose por categoría.</p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-left text-gray-500">
                  <th className="py-2">Almacén</th>
                  <th className="w-1/3 py-2">Composición</th>
                  <th className="py-2 text-right">Unidades</th>
                  <th className="py-2 text-right">Valor</th>
                  <th className="py-2 text-right">% del total</th>
                </tr>
              </thead>
              <tbody>
                {porAlmacen.length === 0 ? (
                  <tr>
                    <td colSpan="5" className="py-6 text-center text-gray-500">
                      {loading ? "Cargando..." : "No hay stock con esos filtros"}
                    </td>
                  </tr>
                ) : (
                  porAlmacen.map((a) => {
                    const abierto = abiertos[a.id_almacen];
                    return (
                      <Fragment key={a.id_almacen}>
                        <tr
                          className="cursor-pointer border-b border-gray-100 hover:bg-gray-50"
                          onClick={() => setAbiertos({ ...abiertos, [a.id_almacen]: !abierto })}
                        >
                          <td className="py-2">
                            <span className="mr-2 inline-block w-3 text-gray-400">{abierto ? "▾" : "▸"}</span>
                            <span className="font-medium">{a.almacen}</span>
                            <span className="ml-2 text-xs text-gray-500">
                              {TIPOS_ALMACEN[a.tipo_almacen] || a.tipo_almacen} · {a.ciudad}
                            </span>
                          </td>
                          <td className="py-2 pr-4">
                            <BarraComposicion fila={a} />
                          </td>
                          <td className="py-2 text-right">{formatearValor(a.unidades, "numero")}</td>
                          <td className="py-2 text-right font-semibold">{formatearValor(a.valor_total, "moneda")}</td>
                          <td className="py-2 text-right">
                            {Number(total.valor_total) > 0
                              ? formatearValor((Number(a.valor_total) / Number(total.valor_total)) * 100, "porcentaje")
                              : "—"}
                          </td>
                        </tr>
                        {abierto &&
                          a.categorias.map((c) => (
                            <tr key={`${a.id_almacen}-${c.id_categoria}`} className="border-b border-gray-50 bg-blue-50/40 text-gray-700">
                              <td className="py-1.5 pl-10">{c.categoria}</td>
                              <td className="py-1.5 pr-4">
                                <BarraComposicion fila={c} />
                              </td>
                              <td className="py-1.5 text-right">{formatearValor(c.unidades, "numero")}</td>
                              <td className="py-1.5 text-right">{formatearValor(c.valor_total, "moneda")}</td>
                              <td className="py-1.5 text-right text-xs">
                                {Number(a.valor_total) > 0
                                  ? `${formatearValor((Number(c.valor_total) / Number(a.valor_total)) * 100, "porcentaje")} del almacén`
                                  : ""}
                              </td>
                            </tr>
                          ))}
                      </Fragment>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="card">
          <h2 className="mb-3 font-semibold">Por categoría (todas las sucursales seleccionadas)</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-left text-gray-500">
                  <th className="py-2">Categoría</th>
                  <th className="py-2 text-right">Unidades</th>
                  <th className="py-2 text-right">Disponible</th>
                  <th className="py-2 text-right">Reservado</th>
                  <th className="py-2 text-right">Vencido / cuarentena</th>
                  <th className="py-2 text-right">Valor total</th>
                </tr>
              </thead>
              <tbody>
                {(datos?.por_categoria || []).map((c) => (
                  <tr key={c.id_categoria} className="border-b border-gray-100">
                    <td className="py-2 font-medium">{c.categoria}</td>
                    <td className="py-2 text-right">{formatearValor(c.unidades, "numero")}</td>
                    <td className="py-2 text-right">{formatearValor(c.valor_disponible, "moneda")}</td>
                    <td className="py-2 text-right">{formatearValor(c.valor_reservado, "moneda")}</td>
                    <td className="py-2 text-right">{formatearValor(c.valor_no_disponible, "moneda")}</td>
                    <td className="py-2 text-right font-semibold">{formatearValor(c.valor_total, "moneda")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-xs text-gray-500">
            Valor = stock × valor unitario del producto, el mismo criterio del reporte de existencias y del kardex.
          </p>
        </div>
      </div>
    </Layout>
  );
}
