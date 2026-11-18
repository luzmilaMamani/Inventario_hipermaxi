import { useEffect, useMemo, useState } from "react";
import Layout from "../../components/layout/Layout";
import Select from "../../components/ui/Select";
import BotonesExportar from "../../components/ui/BotonesExportar";
import { reporteExistencias } from "../../api/reportes.api";
import { listarAlmacenes, listarCategorias, listarMarcas } from "../../api/catalogos.api";
import { formatearValor } from "../../utils/exportar";

const FILTROS_INICIALES = {
  id_almacen: "",
  id_categoria: "",
  id_marca: "",
  estado: "ACTIVO",
  solo_con_stock: "true",
};

const ESTADOS = [
  { value: "ACTIVO", label: "Activos" },
  { value: "INACTIVO", label: "Inactivos" },
  { value: "DESCONTINUADO", label: "Descontinuados" },
];

const COLUMNAS = [
  { key: "producto_codigo", label: "Código" },
  { key: "producto", label: "Producto" },
  { key: "categoria", label: "Categoría" },
  { key: "marca", label: "Marca" },
  { key: "almacen", label: "Almacén" },
  { key: "cantidad_total", label: "Total", tipo: "numero" },
  { key: "cantidad_reservada", label: "Reservada", tipo: "numero" },
  {
    key: "no_disponible",
    label: "Vencida/cuarentena",
    tipo: "numero",
    valor: (f) => Number(f.cantidad_vencida || 0) + Number(f.cantidad_cuarentena || 0),
  },
  { key: "cantidad_disponible", label: "Disponible", tipo: "numero" },
  { key: "precio_unitario", label: "Precio unit.", tipo: "moneda" },
  { key: "valor_total", label: "Valor", tipo: "moneda" },
];

const RESUMEN_VACIO = {
  productos: 0,
  cantidad_total: 0,
  cantidad_reservada: 0,
  cantidad_disponible: 0,
  valor_total: 0,
};

function TablaTotales({ titulo, filas, etiqueta }) {
  return (
    <div className="card">
      <h2 className="mb-3 font-semibold">{titulo}</h2>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-left text-gray-500">
              <th className="py-2">{etiqueta}</th>
              <th className="py-2 text-right">Productos</th>
              <th className="py-2 text-right">Total</th>
              <th className="py-2 text-right">Reservada</th>
              <th className="py-2 text-right">Disponible</th>
              <th className="py-2 text-right">Valor</th>
            </tr>
          </thead>
          <tbody>
            {filas.length === 0 ? (
              <tr>
                <td colSpan="6" className="py-4 text-center text-gray-500">
                  Sin datos
                </td>
              </tr>
            ) : (
              filas.map((f) => (
                <tr key={f.nombre} className="border-b border-gray-100">
                  <td className="py-2 font-medium">{f.nombre}</td>
                  <td className="py-2 text-right">{formatearValor(f.productos, "numero")}</td>
                  <td className="py-2 text-right">{formatearValor(f.cantidad_total, "numero")}</td>
                  <td className="py-2 text-right">{formatearValor(f.cantidad_reservada, "numero")}</td>
                  <td className="py-2 text-right">{formatearValor(f.cantidad_disponible, "numero")}</td>
                  <td className="py-2 text-right font-semibold">{formatearValor(f.valor_total, "moneda")}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function ReporteExistencias() {
  const [filtros, setFiltros] = useState(FILTROS_INICIALES);
  const [registros, setRegistros] = useState([]);
  const [resumen, setResumen] = useState(RESUMEN_VACIO);
  const [porAlmacen, setPorAlmacen] = useState([]);
  const [porCategoria, setPorCategoria] = useState([]);
  const [almacenes, setAlmacenes] = useState([]);
  const [categorias, setCategorias] = useState([]);
  const [marcas, setMarcas] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    listarAlmacenes().then((r) => setAlmacenes(r.data || [])).catch(() => setAlmacenes([]));
    listarCategorias().then((r) => setCategorias(r.data || [])).catch(() => setCategorias([]));
    listarMarcas().then((r) => setMarcas(r.data || [])).catch(() => setMarcas([]));
  }, []);

  useEffect(() => {
    let vigente = true;
    setLoading(true);
    setError("");
    const params = Object.fromEntries(Object.entries(filtros).filter(([, v]) => v !== ""));
    reporteExistencias(params)
      .then((data) => {
        if (!vigente) return;
        setRegistros(data.data || []);
        setResumen(data.resumen || RESUMEN_VACIO);
        setPorAlmacen(data.por_almacen || []);
        setPorCategoria(data.por_categoria || []);
      })
      .catch((err) => {
        if (vigente) setError(err.response?.data?.message || "Error al cargar el reporte");
      })
      .finally(() => {
        if (vigente) setLoading(false);
      });
    return () => {
      vigente = false;
    };
  }, [filtros]);

  const cambiar = (campo) => (e) => setFiltros({ ...filtros, [campo]: e.target.value });

  const subtitulo = useMemo(() => {
    const partes = [];
    const nombre = (lista, id, campo) =>
      lista.find((x) => String(x[campo]) === String(id))?.nombre;
    if (filtros.id_almacen) partes.push(`Almacén: ${nombre(almacenes, filtros.id_almacen, "id_almacen")}`);
    if (filtros.id_categoria) partes.push(`Categoría: ${nombre(categorias, filtros.id_categoria, "id_categoria")}`);
    if (filtros.id_marca) partes.push(`Marca: ${nombre(marcas, filtros.id_marca, "id_marca")}`);
    if (filtros.estado) partes.push(`Productos ${filtros.estado.toLowerCase()}s`);
    return partes.length ? partes.join(" · ") : "Todos los almacenes";
  }, [filtros, almacenes, categorias, marcas]);

  const tarjetas = [
    { label: "Productos", valor: resumen.productos, tipo: "numero", color: "blue" },
    { label: "Cantidad total", valor: resumen.cantidad_total, tipo: "numero", color: "amber" },
    { label: "Reservada", valor: resumen.cantidad_reservada, tipo: "numero", color: "purple" },
    { label: "Disponible", valor: resumen.cantidad_disponible, tipo: "numero", color: "green" },
    { label: "Valor del stock", valor: resumen.valor_total, tipo: "moneda", color: "red" },
  ];
  const COLORES = {
    blue: "bg-blue-50 border-blue-100 text-blue-700",
    amber: "bg-amber-50 border-amber-100 text-amber-700",
    purple: "bg-purple-50 border-purple-100 text-purple-700",
    green: "bg-green-50 border-green-100 text-green-700",
    red: "bg-red-50 border-red-100 text-red-700",
  };

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">Reporte de existencias</h1>
            <p className="text-sm text-gray-500">
              Cuánto stock hay y cuánto vale, por almacén, categoría o marca (RF44)
            </p>
          </div>
          <BotonesExportar
            titulo="Reporte de existencias"
            subtitulo={subtitulo}
            nombreArchivo="existencias"
            columnas={COLUMNAS}
            filas={registros}
            resumen={tarjetas}
          />
        </div>

        <div className="card">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-6">
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
              label="Marca"
              value={filtros.id_marca}
              onChange={cambiar("id_marca")}
              options={marcas.map((m) => ({ value: m.id_marca, label: m.nombre }))}
              placeholder="Todas"
            />
            <Select
              label="Estado del producto"
              value={filtros.estado}
              onChange={cambiar("estado")}
              options={ESTADOS}
              placeholder="Todos"
            />
            <label className="flex items-end gap-2 pb-2 text-sm">
              <input
                type="checkbox"
                checked={filtros.solo_con_stock === "true"}
                onChange={(e) =>
                  setFiltros({ ...filtros, solo_con_stock: e.target.checked ? "true" : "" })
                }
              />
              Solo con stock
            </label>
            <div className="flex items-end">
              <button className="btn-secondary w-full" onClick={() => setFiltros(FILTROS_INICIALES)}>
                Limpiar filtros
              </button>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          {tarjetas.map((t) => (
            <div key={t.label} className={`rounded border p-3 ${COLORES[t.color]}`}>
              <p className="text-xs text-gray-600">{t.label}</p>
              <p className="text-xl font-bold">{formatearValor(t.valor || 0, t.tipo)}</p>
            </div>
          ))}
        </div>

        {error && <p className="rounded bg-red-50 p-2 text-sm text-red-600">{error}</p>}

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
          <TablaTotales
            titulo="Totales por almacén"
            etiqueta="Almacén"
            filas={porAlmacen.map((f) => ({ ...f, nombre: f.almacen }))}
          />
          <TablaTotales
            titulo="Totales por categoría"
            etiqueta="Categoría"
            filas={porCategoria.map((f) => ({ ...f, nombre: f.categoria }))}
          />
        </div>

        <div className="card">
          <h2 className="mb-3 font-semibold">Detalle por producto y almacén</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-left text-gray-500">
                  <th className="py-2">Producto</th>
                  <th className="py-2">Categoría / marca</th>
                  <th className="py-2">Almacén</th>
                  <th className="py-2 text-right">Total</th>
                  <th className="py-2 text-right">Reservada</th>
                  <th className="py-2 text-right">Vencida / cuarentena</th>
                  <th className="py-2 text-right">Disponible</th>
                  <th className="py-2 text-right">Valor</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan="8" className="py-6 text-center text-gray-500">
                      Cargando...
                    </td>
                  </tr>
                ) : registros.length === 0 ? (
                  <tr>
                    <td colSpan="8" className="py-6 text-center text-gray-500">
                      No hay existencias con esos filtros
                    </td>
                  </tr>
                ) : (
                  registros.map((r) => {
                    const noDisponible = Number(r.cantidad_vencida || 0) + Number(r.cantidad_cuarentena || 0);
                    const bajoMinimo = Number(r.cantidad_disponible) <= Number(r.stock_minimo);
                    return (
                      <tr key={r.id_stock} className="border-b border-gray-100 hover:bg-gray-50">
                        <td className="py-2">
                          <div className="font-medium">{r.producto}</div>
                          <div className="font-mono text-xs text-gray-500">{r.producto_codigo}</div>
                        </td>
                        <td className="py-2">
                          <div>{r.categoria}</div>
                          <div className="text-xs text-gray-500">{r.marca || "Sin marca"}</div>
                        </td>
                        <td className="py-2">{r.almacen}</td>
                        <td className="py-2 text-right">{formatearValor(r.cantidad_total, "numero")}</td>
                        <td className="py-2 text-right">{formatearValor(r.cantidad_reservada, "numero")}</td>
                        <td className="py-2 text-right">
                          {noDisponible > 0 ? (
                            <span className="text-red-600">{formatearValor(noDisponible, "numero")}</span>
                          ) : (
                            "0"
                          )}
                        </td>
                        <td className={`py-2 text-right font-semibold ${bajoMinimo ? "text-amber-700" : ""}`}>
                          {formatearValor(r.cantidad_disponible, "numero")} {r.unidad}
                        </td>
                        <td className="py-2 text-right font-semibold">{formatearValor(r.valor_total, "moneda")}</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </Layout>
  );
}
