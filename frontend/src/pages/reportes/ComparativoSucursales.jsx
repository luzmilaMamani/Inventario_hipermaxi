import { useEffect, useState } from "react";
import Layout from "../../components/layout/Layout";
import Select from "../../components/ui/Select";
import BotonesExportar from "../../components/ui/BotonesExportar";
import FormTransferencia from "../transferencias/FormTransferencia";
import { reporteComparativoSucursales } from "../../api/reportes.api";
import { listarCategorias } from "../../api/catalogos.api";
import { useAuth } from "../../context/AuthContext";
import { ROLES_SOLICITAN_TRANSFERENCIA, tieneRol } from "../../utils/permissions";
import { formatearValor } from "../../utils/exportar";

const FILTROS_INICIALES = { search: "", id_categoria: "", solo_faltantes: "true" };

export default function ComparativoSucursales() {
  const { user } = useAuth();
  const puedeTransferir = tieneRol(user?.rol, ROLES_SOLICITAN_TRANSFERENCIA);

  const [filtros, setFiltros] = useState(FILTROS_INICIALES);
  const [busqueda, setBusqueda] = useState("");
  const [categorias, setCategorias] = useState([]);
  const [almacenes, setAlmacenes] = useState([]);
  const [productos, setProductos] = useState([]);
  const [resumen, setResumen] = useState({ productos: 0, con_faltantes: 0, sugerencias: 0 });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [mensaje, setMensaje] = useState("");
  const [solicitud, setSolicitud] = useState(null);
  const [recarga, setRecarga] = useState(0);

  useEffect(() => {
    listarCategorias().then((r) => setCategorias(r.data || [])).catch(() => setCategorias([]));
  }, []);

  // La búsqueda por texto espera a que se deje de escribir.
  useEffect(() => {
    const t = setTimeout(() => setFiltros((f) => ({ ...f, search: busqueda.trim() })), 400);
    return () => clearTimeout(t);
  }, [busqueda]);

  const sinFiltro = !filtros.search && !filtros.id_categoria && filtros.solo_faltantes !== "true";

  useEffect(() => {
    if (sinFiltro) {
      setProductos([]);
      setError("");
      return undefined;
    }
    let vigente = true;
    setLoading(true);
    setError("");
    const params = Object.fromEntries(Object.entries(filtros).filter(([, v]) => v !== ""));
    reporteComparativoSucursales(params)
      .then((data) => {
        if (!vigente) return;
        setAlmacenes(data.almacenes || []);
        setProductos(data.data || []);
        setResumen(data.resumen || { productos: 0, con_faltantes: 0, sugerencias: 0 });
      })
      .catch((err) => {
        if (vigente) setError(err.response?.data?.message || "Error al cargar el comparativo");
      })
      .finally(() => {
        if (vigente) setLoading(false);
      });
    return () => {
      vigente = false;
    };
  }, [filtros, sinFiltro, recarga]);

  const solicitar = (producto, sugerencia) =>
    setSolicitud({
      almacen_origen: sugerencia?.id_almacen_origen,
      almacen_destino: sugerencia?.id_almacen_destino,
      observaciones: `Reposición sugerida desde el comparativo entre sucursales (${producto.codigo})`,
      detalles: sugerencia ? [{ id_producto: producto.id_producto, cantidad: sugerencia.cantidad }] : [],
    });

  // Una fila por producto con una columna por sucursal, para exportar.
  const columnasExportar = [
    { key: "codigo", label: "Código" },
    { key: "nombre", label: "Producto" },
    { key: "stock_minimo", label: "Mínimo", tipo: "numero" },
    ...almacenes.map((a) => ({
      key: `alm_${a.id_almacen}`,
      label: a.nombre,
      tipo: "numero",
      valor: (p) => p.sucursales.find((s) => s.id_almacen === a.id_almacen)?.disponible ?? 0,
    })),
    { key: "total_disponible", label: "Total", tipo: "numero" },
    {
      key: "sugerencia",
      label: "Sugerencia",
      valor: (p) =>
        p.sugerencias.map((s) => `${s.cantidad} de ${s.almacen_origen} a ${s.almacen_destino}`).join("; "),
    },
  ];

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">Comparativo entre sucursales</h1>
            <p className="text-sm text-gray-500">
              Stock disponible de cada producto por sucursal, para decidir transferencias (RF67)
            </p>
          </div>
          <BotonesExportar
            titulo="Comparativo de stock entre sucursales"
            subtitulo={filtros.solo_faltantes === "true" ? "Productos con sucursales bajo mínimo" : "Productos seleccionados"}
            nombreArchivo="comparativo_sucursales"
            columnas={columnasExportar}
            filas={productos}
            resumen={[
              { label: "Productos", valor: resumen.productos, tipo: "numero" },
              { label: "Con faltantes", valor: resumen.con_faltantes, tipo: "numero" },
            ]}
          />
        </div>

        <div className="card">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
            <div className="md:col-span-2">
              <label className="mb-1 block text-sm font-medium">Producto</label>
              <input
                className="input-field"
                placeholder="Buscar por nombre o código"
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
              />
            </div>
            <Select
              label="Categoría"
              value={filtros.id_categoria}
              onChange={(e) => setFiltros({ ...filtros, id_categoria: e.target.value })}
              options={categorias.map((c) => ({ value: c.id_categoria, label: c.nombre }))}
              placeholder="Todas"
            />
            <label className="flex items-end gap-2 pb-2 text-sm">
              <input
                type="checkbox"
                checked={filtros.solo_faltantes === "true"}
                onChange={(e) => setFiltros({ ...filtros, solo_faltantes: e.target.checked ? "true" : "" })}
              />
              Solo productos con sucursales bajo mínimo
            </label>
          </div>
        </div>

        {mensaje && <p className="rounded bg-green-50 p-2 text-sm text-green-700">{mensaje}</p>}
        {error && <p className="rounded bg-red-50 p-2 text-sm text-red-600">{error}</p>}

        <div className="grid grid-cols-3 gap-3">
          <div className="rounded border border-blue-100 bg-blue-50 p-3">
            <p className="text-xs text-gray-600">Productos</p>
            <p className="text-xl font-bold text-blue-700">{resumen.productos}</p>
          </div>
          <div className="rounded border border-red-100 bg-red-50 p-3">
            <p className="text-xs text-gray-600">Con sucursales bajo mínimo</p>
            <p className="text-xl font-bold text-red-700">{resumen.con_faltantes}</p>
          </div>
          <div className="rounded border border-green-100 bg-green-50 p-3">
            <p className="text-xs text-gray-600">Transferencias sugeridas</p>
            <p className="text-xl font-bold text-green-700">{resumen.sugerencias}</p>
          </div>
        </div>

        <div className="card">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-left text-gray-500">
                  <th className="py-2">Producto</th>
                  <th className="py-2 text-right">Mínimo</th>
                  {almacenes.map((a) => (
                    <th key={a.id_almacen} className="py-2 text-right">
                      {a.nombre}
                    </th>
                  ))}
                  <th className="py-2 text-right">Total</th>
                  <th className="py-2 pl-6">Sugerencia</th>
                </tr>
              </thead>
              <tbody>
                {sinFiltro ? (
                  <tr>
                    <td colSpan={almacenes.length + 4} className="py-6 text-center text-gray-500">
                      Busca un producto, elige una categoría o marca “Solo productos con sucursales bajo mínimo”
                    </td>
                  </tr>
                ) : loading ? (
                  <tr>
                    <td colSpan={almacenes.length + 4} className="py-6 text-center text-gray-500">
                      Cargando...
                    </td>
                  </tr>
                ) : productos.length === 0 ? (
                  <tr>
                    <td colSpan={almacenes.length + 4} className="py-6 text-center text-gray-500">
                      No hay productos con esos filtros
                    </td>
                  </tr>
                ) : (
                  productos.map((p) => (
                    <tr key={p.id_producto} className="border-b border-gray-100 align-top hover:bg-gray-50">
                      <td className="py-2">
                        <div className="font-medium">{p.nombre}</div>
                        <div className="font-mono text-xs text-gray-500">
                          {p.codigo} · {p.categoria}
                        </div>
                      </td>
                      <td className="py-2 text-right text-gray-600">{formatearValor(p.stock_minimo, "numero")}</td>
                      {almacenes.map((a) => {
                        const s = p.sucursales.find((x) => x.id_almacen === a.id_almacen);
                        return (
                          <td key={a.id_almacen} className="py-2 text-right">
                            <span
                              className={
                                s?.bajo_minimo
                                  ? "rounded bg-red-100 px-2 py-1 font-semibold text-red-700"
                                  : "font-semibold"
                              }
                              title={s?.bajo_minimo ? "Bajo el stock mínimo" : undefined}
                            >
                              {formatearValor(s?.disponible ?? 0, "numero")}
                            </span>
                          </td>
                        );
                      })}
                      <td className="py-2 text-right font-semibold">
                        {formatearValor(p.total_disponible, "numero")} {p.unidad}
                      </td>
                      <td className="py-2 pl-6">
                        {p.sugerencias.length === 0 ? (
                          <span className="text-xs text-gray-500">
                            {p.sucursales_bajo_minimo > 0 ? "Ninguna sucursal tiene excedente" : "Sin faltantes"}
                          </span>
                        ) : (
                          <ul className="space-y-1">
                            {p.sugerencias.map((s) => (
                              <li
                                key={`${s.id_almacen_origen}-${s.id_almacen_destino}`}
                                className="flex flex-wrap items-center gap-2"
                              >
                                <span className="text-xs">
                                  {s.cantidad} de <strong>{s.almacen_origen}</strong> a{" "}
                                  <strong>{s.almacen_destino}</strong>
                                </span>
                                {puedeTransferir && (
                                  <button
                                    type="button"
                                    className="rounded bg-brand-blue px-2 py-1 text-xs font-semibold text-white hover:bg-brand-blueDark"
                                    onClick={() => solicitar(p, s)}
                                  >
                                    Solicitar
                                  </button>
                                )}
                              </li>
                            ))}
                          </ul>
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

      {solicitud && (
        <FormTransferencia
          inicial={solicitud}
          onClose={() => setSolicitud(null)}
          onSaved={() => {
            setSolicitud(null);
            setMensaje("Solicitud de transferencia registrada. Puedes seguirla en Movimientos › Transferencias.");
            setRecarga((n) => n + 1);
          }}
        />
      )}
    </Layout>
  );
}
