import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import Layout from "../../components/layout/Layout";
import Pagination from "../../components/ui/Pagination";
import { consultarHistorialStock } from "../../api/stock.api";

export default function HistorialStock() {
  const { productoId } = useParams();
  const navigate = useNavigate();
  const [producto, setProducto] = useState(null);
  const [movimientos, setMovimientos] = useState([]);
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 20,
    total: 0,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const cargar = async (page = 1) => {
    setLoading(true);
    setError("");
    try {
      const respuesta = await consultarHistorialStock(productoId, {
        page,
        limit: pagination.limit,
      });
      setProducto(respuesta.producto);
      setMovimientos(respuesta.data);
      setPagination(respuesta.pagination);
    } catch (err) {
      setError(
        err.response?.data?.message || "Error al consultar el historial",
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    cargar(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productoId]);

  const formatoCantidad = (cantidad) =>
    `${Number(cantidad ?? 0).toLocaleString("es-BO")} ${producto?.unidad || ""}`;

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">Historial de existencias</h1>
            <p className="text-sm text-gray-500">
              Movimientos registrados y variación de stock del producto
            </p>
            {producto && (
              <p className="mt-2 text-sm">
                <span className="font-semibold">{producto.nombre}</span>
                <span className="ml-2 font-mono text-gray-500">
                  {producto.codigo}
                </span>
              </p>
            )}
          </div>
          <button
            className="btn-secondary"
            onClick={() => navigate("/stock")}
          >
            Volver a consulta de stock
          </button>
        </div>

        <section className="card">
          <div className="mb-3 text-sm text-gray-600">
            {pagination.total} movimiento
            {pagination.total !== 1 && "s"}
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
                  <th className="py-2 pr-3">Fecha</th>
                  <th className="py-2 pr-3">Movimiento</th>
                  <th className="py-2 pr-3">Almacén</th>
                  <th className="py-2 pr-3 text-right">Cantidad</th>
                  <th className="py-2 pr-3 text-right">Stock anterior</th>
                  <th className="py-2 pr-3 text-right">Stock nuevo</th>
                  <th className="py-2 pr-3">Referencia</th>
                  <th className="py-2 pr-3">Usuario</th>
                  <th className="py-2">Observaciones</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td
                      colSpan="9"
                      className="py-6 text-center text-gray-500"
                    >
                      Consultando historial...
                    </td>
                  </tr>
                ) : movimientos.length === 0 ? (
                  <tr>
                    <td
                      colSpan="9"
                      className="py-6 text-center text-gray-500"
                    >
                      Este producto todavía no tiene movimientos registrados.
                    </td>
                  </tr>
                ) : (
                  movimientos.map((movimiento) => (
                    <tr
                      key={movimiento.id_movimiento}
                      className="border-b border-gray-100"
                    >
                      <td className="whitespace-nowrap py-2 pr-3">
                        {new Date(movimiento.fecha_movimiento).toLocaleString(
                          "es-BO",
                        )}
                      </td>
                      <td className="py-2 pr-3">
                        {movimiento.tipo_movimiento}
                      </td>
                      <td className="py-2 pr-3">{movimiento.almacen}</td>
                      <td className="py-2 pr-3 text-right">
                        {formatoCantidad(movimiento.cantidad)}
                      </td>
                      <td className="py-2 pr-3 text-right">
                        {formatoCantidad(movimiento.stock_anterior)}
                      </td>
                      <td className="py-2 pr-3 text-right font-semibold">
                        {formatoCantidad(movimiento.stock_nuevo)}
                      </td>
                      <td className="py-2 pr-3">
                        {movimiento.referencia || "-"}
                      </td>
                      <td className="py-2 pr-3">{movimiento.usuario || "-"}</td>
                      <td className="py-2">
                        {movimiento.observaciones || "-"}
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
