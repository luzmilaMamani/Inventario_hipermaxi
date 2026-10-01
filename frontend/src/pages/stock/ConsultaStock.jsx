import { useEffect, useState } from "react";
import Layout from "../../components/layout/Layout";
import Pagination from "../../components/ui/Pagination";
import Select from "../../components/ui/Select";
import { consultarStock } from "../../api/stock.api";
import { listarAlmacenes } from "../../api/almacenes.api";

const FILTROS_INICIALES = {
  search: "",
  id_almacen: "",
  origen: "",
  disponible: "",
};

export default function ConsultaStock() {
  const [registros, setRegistros] = useState([]);
  const [almacenes, setAlmacenes] = useState([]);
  const [filtros, setFiltros] = useState(FILTROS_INICIALES);
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0 });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    listarAlmacenes({ limit: 200, orderBy: "nombre", order: "ASC" })
      .then((res) => setAlmacenes(res.data))
      .catch(() => setAlmacenes([]));
  }, []);

  const cargar = async (page = 1) => {
    setLoading(true);
    setError("");
    try {
      const params = { page, limit: pagination.limit };
      Object.entries(filtros).forEach(([clave, valor]) => {
        if (valor !== "") params[clave] = valor;
      });
      const respuesta = await consultarStock(params);
      setRegistros(respuesta.data);
      setPagination(respuesta.pagination);
    } catch (err) {
      setError(err.response?.data?.message || "Error al consultar stock");
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

  return (
    <Layout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Consulta de stock</h1>
          <p className="text-sm text-gray-500">
            Existencias por producto, almacén y ubicación
          </p>
        </div>

        <section className="card">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-5">
            <div className="md:col-span-2">
              <label className="mb-1 block text-sm font-medium" htmlFor="buscar-stock">
                Producto o ubicación
              </label>
              <input
                id="buscar-stock"
                className="input-field"
                value={filtros.search}
                onChange={(e) => setFiltros({ ...filtros, search: e.target.value })}
                placeholder="Nombre, código o dirección"
              />
            </div>
            <Select
              label="Almacén"
              value={filtros.id_almacen}
              onChange={(e) => setFiltros({ ...filtros, id_almacen: e.target.value })}
              options={opcionesAlmacenes}
              placeholder="Todos los almacenes"
            />
            <Select
              label="Origen"
              value={filtros.origen}
              onChange={(e) => setFiltros({ ...filtros, origen: e.target.value })}
              options={[
                { value: "ALMACEN", label: "Stock general" },
                { value: "UBICACION", label: "Por ubicación" },
              ]}
              placeholder="Todos los registros"
            />
            <Select
              label="Disponibilidad"
              value={filtros.disponible}
              onChange={(e) =>
                setFiltros({ ...filtros, disponible: e.target.value })
              }
              options={[
                { value: "true", label: "Con disponibilidad" },
                { value: "false", label: "Agotado" },
              ]}
              placeholder="Cualquiera"
            />
          </div>

          <div className="mb-3 mt-4 text-sm text-gray-600">
            {pagination.total} registro{pagination.total !== 1 && "s"}
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
                  <th className="py-2">Almacén</th>
                  <th className="py-2">Origen / ubicación</th>
                  <th className="py-2 text-right">Cantidad</th>
                  <th className="py-2 text-right">Reservada</th>
                  <th className="py-2 text-right">Disponible</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan="6" className="py-6 text-center text-gray-500">
                      Consultando stock...
                    </td>
                  </tr>
                ) : registros.length === 0 ? (
                  <tr>
                    <td colSpan="6" className="py-6 text-center text-gray-500">
                      No hay registros de stock para esos filtros.
                    </td>
                  </tr>
                ) : (
                  registros.map((registro) => (
                    <tr
                      key={`${registro.origen}-${registro.id_registro}`}
                      className="border-b border-gray-100 hover:bg-gray-50"
                    >
                      <td className="py-2">
                        <div className="font-medium">{registro.producto}</div>
                        <div className="font-mono text-xs text-gray-500">
                          {registro.producto_codigo}
                        </div>
                      </td>
                      <td className="py-2">
                        <div>{registro.almacen}</div>
                        <div className="font-mono text-xs text-gray-500">
                          {registro.almacen_codigo}
                        </div>
                      </td>
                      <td className="py-2">
                        {registro.origen === "ALMACEN" ? (
                          <span className="text-gray-600">Stock general</span>
                        ) : (
                          <span>{registro.ubicacion || "Ubicación"}</span>
                        )}
                      </td>
                      <td className="py-2 text-right">
                        {Number(registro.cantidad).toLocaleString("es-BO")} {registro.unidad}
                      </td>
                      <td className="py-2 text-right">
                        {registro.cantidad_reservada === null
                          ? "-"
                          : `${Number(registro.cantidad_reservada).toLocaleString("es-BO")} ${registro.unidad}`}
                      </td>
                      <td className="py-2 text-right font-semibold">
                        <div
                          className={
                            Number(registro.cantidad_disponible) > 0
                              ? "text-green-700"
                              : "text-red-600"
                          }
                        >
                          {Number(registro.cantidad_disponible).toLocaleString("es-BO")} {registro.unidad}
                        </div>
                        <span className="text-xs font-normal text-gray-500">
                          {Number(registro.cantidad_disponible) > 0
                            ? "Disponible"
                            : "Agotado"}
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