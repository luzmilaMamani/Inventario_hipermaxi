import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import Layout from "../../components/layout/Layout";
import Modal from "../../components/ui/Modal";
import Pagination from "../../components/ui/Pagination";
import Select from "../../components/ui/Select";
import { listarAlmacenes } from "../../api/almacenes.api";
import { listarRecepciones, obtenerRecepcion } from "../../api/entradas.api";

const FILTROS_INICIALES = {
  id_almacen: "",
  fecha_desde: "",
  fecha_hasta: "",
};

export default function ListaRecepciones() {
  const navigate = useNavigate();
  const [recepciones, setRecepciones] = useState([]);
  const [almacenes, setAlmacenes] = useState([]);
  const [filtros, setFiltros] = useState(FILTROS_INICIALES);
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 20,
    total: 0,
  });
  const [detalle, setDetalle] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const cargar = async (page = 1) => {
    setLoading(true);
    setError("");
    try {
      const params = { page, limit: pagination.limit };
      for (const [key, value] of Object.entries(filtros)) {
        if (value) params[key] = value;
      }
      const respuesta = await listarRecepciones(params);
      setRecepciones(respuesta.data);
      setPagination(respuesta.pagination);
    } catch (err) {
      setError(err.response?.data?.message || "Error al cargar recepciones");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    cargar(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtros]);

  useEffect(() => {
    listarAlmacenes({ limit: 200, orderBy: "nombre", order: "ASC" })
      .then((respuesta) => setAlmacenes(respuesta.data || []))
      .catch((err) => {
        setError(err.response?.data?.message || "Error al cargar almacenes");
      });
  }, []);

  const verDetalle = async (id) => {
    setError("");
    try {
      const respuesta = await obtenerRecepcion(id);
      setDetalle(respuesta.data);
    } catch (err) {
      setError(err.response?.data?.message || "Error al consultar la recepción");
    }
  };

  const formatoFecha = (fecha) => {
    const fechaLocal = String(fecha).slice(0, 10);
    return new Date(`${fechaLocal}T00:00:00`).toLocaleDateString("es-BO");
  };

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">Recepciones de mercadería</h1>
            <p className="text-sm text-gray-500">
              Consulta de ingresos, verificación y diferencias registradas
            </p>
          </div>
          <button
            className="btn-primary"
            onClick={() => navigate("/recepciones/nueva")}
          >
            + Registrar recepción
          </button>
        </div>

        <section className="card">
          <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-4">
            <Select
              label="Almacén"
              value={filtros.id_almacen}
              onChange={(e) =>
                setFiltros({ ...filtros, id_almacen: e.target.value })
              }
              options={almacenes.map((almacen) => ({
                value: almacen.id_almacen,
                label: `${almacen.codigo} - ${almacen.nombre}`,
              }))}
              placeholder="Todos los almacenes"
            />
            <div>
              <label className="mb-1 block text-sm font-medium">Desde</label>
              <input
                type="date"
                className="input-field"
                value={filtros.fecha_desde}
                onChange={(e) =>
                  setFiltros({ ...filtros, fecha_desde: e.target.value })
                }
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Hasta</label>
              <input
                type="date"
                className="input-field"
                value={filtros.fecha_hasta}
                onChange={(e) =>
                  setFiltros({ ...filtros, fecha_hasta: e.target.value })
                }
              />
            </div>
            <div className="flex items-end">
              <button
                type="button"
                className="btn-secondary w-full"
                onClick={() => setFiltros(FILTROS_INICIALES)}
              >
                Limpiar filtros
              </button>
            </div>
          </div>

          <p className="mb-3 text-sm text-gray-600">
            {pagination.total} recepción{pagination.total !== 1 && "es"}
          </p>
          {error && (
            <p className="mb-3 rounded bg-red-50 p-2 text-sm text-red-600">
              {error}
            </p>
          )}

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-left text-gray-500">
                  <th className="py-2">Número</th>
                  <th className="py-2">Fecha</th>
                  <th className="py-2">Proveedor</th>
                  <th className="py-2">Almacén</th>
                  <th className="py-2">Usuario</th>
                  <th className="py-2 text-right">Productos</th>
                  <th className="py-2 text-right">Unidades recibidas</th>
                  <th className="py-2 text-right">Detalle</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan="8" className="py-6 text-center text-gray-500">
                      Cargando recepciones...
                    </td>
                  </tr>
                ) : recepciones.length === 0 ? (
                  <tr>
                    <td colSpan="8" className="py-6 text-center text-gray-500">
                      No hay recepciones para esos filtros.
                    </td>
                  </tr>
                ) : (
                  recepciones.map((recepcion) => (
                    <tr
                      key={recepcion.id_entrada}
                      className="border-b border-gray-100"
                    >
                      <td className="py-2 font-mono text-xs">
                        {recepcion.numero_entrada}
                      </td>
                      <td className="py-2 whitespace-nowrap">
                        {formatoFecha(recepcion.fecha_entrada)}
                      </td>
                      <td className="py-2">{recepcion.proveedor || "-"}</td>
                      <td className="py-2">{recepcion.almacen}</td>
                      <td className="py-2">{recepcion.usuario || "-"}</td>
                      <td className="py-2 text-right">
                        {recepcion.cantidad_productos}
                      </td>
                      <td className="py-2 text-right">
                        {Number(recepcion.unidades_recibidas).toLocaleString(
                          "es-BO",
                        )}
                      </td>
                      <td className="py-2 text-right">
                        <button
                          type="button"
                          className="font-medium text-blue-600 hover:underline"
                          onClick={() => verDetalle(recepcion.id_entrada)}
                        >
                          Ver
                        </button>
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

        {detalle && (
          <Modal
            open
            onClose={() => setDetalle(null)}
            title={`Recepción ${detalle.numero_entrada}`}
          >
            <div className="max-h-[75vh] space-y-4 overflow-y-auto">
              <dl className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <dt className="text-gray-500">Proveedor</dt>
                  <dd>{detalle.origen || "-"}</dd>
                </div>
                <div>
                  <dt className="text-gray-500">Almacén</dt>
                  <dd>{detalle.almacen}</dd>
                </div>
                <div>
                  <dt className="text-gray-500">Fecha</dt>
                  <dd>{formatoFecha(detalle.fecha_entrada)}</dd>
                </div>
                <div>
                  <dt className="text-gray-500">Usuario</dt>
                  <dd>{detalle.usuario || "-"}</dd>
                </div>
                <div>
                  <dt className="text-gray-500">Referencia</dt>
                  <dd>{detalle.referencia_externa || "-"}</dd>
                </div>
              </dl>
              <div className="overflow-x-auto rounded border">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-left text-gray-600">
                    <tr>
                      <th className="p-2">Producto</th>
                      <th className="p-2 text-right">Esperado</th>
                      <th className="p-2 text-right">Recibido</th>
                      <th className="p-2 text-right">Diferencia</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detalle.detalles.map((linea) => (
                      <tr key={linea.id_detalle_entrada} className="border-t">
                        <td className="p-2">
                          <div>{linea.producto}</div>
                          <div className="font-mono text-xs text-gray-500">
                            {linea.producto_codigo}
                          </div>
                        </td>
                        <td className="p-2 text-right">
                          {Number(linea.cantidad_solicitada).toLocaleString(
                            "es-BO",
                          )}
                        </td>
                        <td className="p-2 text-right">
                          {Number(linea.cantidad_recibida).toLocaleString(
                            "es-BO",
                          )}
                        </td>
                        <td className="p-2 text-right">
                          {Number(linea.diferencia).toLocaleString("es-BO")}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {detalle.diferencias.length > 0 && (
                <section>
                  <h3 className="mb-2 font-semibold">Diferencias registradas</h3>
                  <ul className="space-y-1 text-sm">
                    {detalle.diferencias.map((diferencia) => (
                      <li key={diferencia.id_diferencia}>
                        {diferencia.producto}: {diferencia.tipo} de{" "}
                        {Number(diferencia.cantidad).toLocaleString("es-BO")}{" "}
                        unidades
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </div>
          </Modal>
        )}
      </div>
    </Layout>
  );
}
