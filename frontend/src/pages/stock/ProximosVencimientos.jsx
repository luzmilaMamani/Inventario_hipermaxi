import { useEffect, useState } from "react";
import Layout from "../../components/layout/Layout";
import Pagination from "../../components/ui/Pagination";
import Select from "../../components/ui/Select";
import { consultarProximosVencer } from "../../api/stock.api";
import { listarAlmacenes } from "../../api/almacenes.api";
import { listarCategorias } from "../../api/catalogos.api";

const OPCIONES_DIAS = [7, 15, 30, 60, 90];

// RF50: "parametro" aplica los días de anticipación configurados por categoría.
const DIAS_PARAMETRO = "parametro";

const FILTROS_INICIALES = {
  dias: DIAS_PARAMETRO,
  id_almacen: "",
  id_categoria: "",
};

function claseDiasRestantes(dias) {
  if (dias <= 7) return "bg-red-100 text-red-700";
  if (dias <= 15) return "bg-amber-100 text-amber-700";
  return "bg-green-100 text-green-700";
}

function formatearFecha(fecha) {
  // La fecha llega como YYYY-MM-DD; se formatea sin pasar por Date para evitar desfases.
  const [anio, mes, dia] = String(fecha).slice(0, 10).split("-");
  return `${dia}/${mes}/${anio}`;
}

export default function ProximosVencimientos() {
  const [registros, setRegistros] = useState([]);
  const [almacenes, setAlmacenes] = useState([]);
  const [categorias, setCategorias] = useState([]);
  const [filtros, setFiltros] = useState(FILTROS_INICIALES);
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0 });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    listarAlmacenes({ limit: 200, orderBy: "nombre", order: "ASC" })
      .then((res) => setAlmacenes(res.data || []))
      .catch(() => setAlmacenes([]));
    listarCategorias()
      .then((res) => setCategorias(res.data || []))
      .catch(() => setCategorias([]));
  }, []);

  const cargar = async (page = 1) => {
    setLoading(true);
    setError("");
    try {
      const params = { page, limit: pagination.limit };
      Object.entries(filtros).forEach(([clave, valor]) => {
        if (valor !== "") params[clave] = valor;
      });
      const respuesta = await consultarProximosVencer(params);
      setRegistros(respuesta.data || []);
      setPagination(respuesta.pagination);
    } catch (err) {
      setError(
        err.response?.data?.message || "Error al consultar próximos vencimientos",
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    cargar(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtros]);

  const opcionesAlmacenes = almacenes.map((almacen) => ({
    value: almacen.id_almacen,
    label: `${almacen.codigo} - ${almacen.nombre}`,
  }));

  const opcionesCategorias = categorias.map((categoria) => ({
    value: categoria.id_categoria,
    label: categoria.nombre,
  }));

  return (
    <Layout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Próximos vencimientos</h1>
          <p className="text-sm text-gray-500">
            Lotes con existencia que vencen dentro del plazo elegido, para
            venderlos o moverlos antes de que se pierdan
          </p>
        </div>

        <section className="card">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
            <div>
              <span className="mb-1 block text-sm font-medium">
                Vencen en los próximos
              </span>
              <div className="flex flex-wrap gap-2">
                {OPCIONES_DIAS.map((dias) => (
                  <button
                    key={dias}
                    type="button"
                    className={
                      filtros.dias === String(dias)
                        ? "btn-primary text-xs"
                        : "btn-secondary text-xs"
                    }
                    onClick={() =>
                      setFiltros({ ...filtros, dias: String(dias) })
                    }
                  >
                    {dias} días
                  </button>
                ))}
                <button
                  type="button"
                  title="Usa los días de anticipación configurados para cada categoría"
                  className={
                    filtros.dias === DIAS_PARAMETRO
                      ? "btn-primary text-xs"
                      : "btn-secondary text-xs"
                  }
                  onClick={() =>
                    setFiltros({ ...filtros, dias: DIAS_PARAMETRO })
                  }
                >
                  Según parámetro
                </button>
              </div>
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
              label="Categoría"
              value={filtros.id_categoria}
              onChange={(e) =>
                setFiltros({ ...filtros, id_categoria: e.target.value })
              }
              options={opcionesCategorias}
              placeholder="Todas las categorías"
            />
            <div className="flex items-end">
              <button
                className="btn-secondary w-full"
                onClick={() => setFiltros(FILTROS_INICIALES)}
              >
                Limpiar filtros
              </button>
            </div>
          </div>

          <div className="mb-3 mt-4 text-sm text-gray-600">
            {pagination.total} lote{pagination.total !== 1 && "s"} vence
            {pagination.total !== 1 && "n"}{" "}
            {filtros.dias === DIAS_PARAMETRO
              ? "dentro de la anticipación configurada para su categoría"
              : `en los próximos ${filtros.dias} días`}
          </div>

          {error && (
            <p className="mb-3 rounded bg-red-50 p-2 text-sm text-red-600">
              {error}
            </p>
          )}

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-left text-gray-500">
                  <th className="py-2">Producto</th>
                  <th className="py-2">Lote</th>
                  <th className="py-2">Almacén</th>
                  <th className="py-2 text-right">Cantidad</th>
                  <th className="py-2">Fecha de vencimiento</th>
                  <th className="py-2 text-right">Días restantes</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan="6" className="py-6 text-center text-gray-500">
                      Consultando lotes...
                    </td>
                  </tr>
                ) : registros.length === 0 ? (
                  <tr>
                    <td colSpan="6" className="py-6 text-center text-gray-500">
                      No hay lotes que venzan en el plazo elegido.
                    </td>
                  </tr>
                ) : (
                  registros.map((registro) => (
                    <tr
                      key={registro.id_lote}
                      className="border-b border-gray-100 hover:bg-gray-50"
                    >
                      <td className="py-2">
                        <div className="font-medium">{registro.producto}</div>
                        <div className="font-mono text-xs text-gray-500">
                          {registro.producto_codigo}
                          {registro.categoria && ` · ${registro.categoria}`}
                          {registro.dias_anticipacion != null &&
                            ` · alerta ${registro.dias_anticipacion} días antes`}
                        </div>
                      </td>
                      <td className="py-2 font-mono text-xs">
                        {registro.numero_lote}
                      </td>
                      <td className="py-2">
                        <div>{registro.almacen}</div>
                        <div className="font-mono text-xs text-gray-500">
                          {registro.almacen_codigo}
                        </div>
                      </td>
                      <td className="py-2 text-right">
                        {Number(registro.cantidad).toLocaleString("es-BO")}{" "}
                        {registro.unidad || "unid."}
                      </td>
                      <td className="py-2">
                        {formatearFecha(registro.fecha_vencimiento)}
                      </td>
                      <td className="py-2 text-right">
                        <span
                          className={`rounded px-2 py-1 text-xs font-semibold ${claseDiasRestantes(
                            registro.dias_restantes,
                          )}`}
                        >
                          {registro.dias_restantes === 0
                            ? "Vence hoy"
                            : `${registro.dias_restantes} día${
                                registro.dias_restantes !== 1 ? "s" : ""
                              }`}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <Pagination
            page={pagination.page}
            limit={pagination.limit}
            total={pagination.total}
            onChange={cargar}
          />
        </section>
      </div>
    </Layout>
  );
}
