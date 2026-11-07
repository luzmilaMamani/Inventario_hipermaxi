import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import Layout from "../../components/layout/Layout";
import {
  ESTADOS_PRODUCTO,
  buscarVentas,
  crearDevolucion,
  obtenerVentaDevolvible,
} from "../../api/devoluciones.api";

const LINEA_VACIA = { id_producto: "", cantidad: "", estado_producto: "APTO", motivo: "" };

function formatearFecha(fecha) {
  return fecha ? new Date(fecha).toLocaleString("es-BO") : "-";
}

export default function RegistrarDevolucion() {
  const navigate = useNavigate();
  const [busqueda, setBusqueda] = useState("");
  const [ventas, setVentas] = useState(null);
  const [buscando, setBuscando] = useState(false);
  const [venta, setVenta] = useState(null);
  const [lineas, setLineas] = useState([{ ...LINEA_VACIA }]);
  const [observaciones, setObservaciones] = useState("");
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);

  const productosDevolvibles = useMemo(
    () => (venta?.productos || []).filter((producto) => producto.cantidad_disponible > 0),
    [venta],
  );

  const solicitadoPorProducto = useMemo(() => {
    const totales = {};
    for (const linea of lineas) {
      if (!linea.id_producto) continue;
      totales[linea.id_producto] = (totales[linea.id_producto] || 0) + (Number(linea.cantidad) || 0);
    }
    return totales;
  }, [lineas]);

  const buscar = async (event) => {
    event.preventDefault();
    setError("");
    if (busqueda.trim().length < 2) {
      return setError("Ingresa al menos 2 caracteres del número o referencia de la venta");
    }
    setBuscando(true);
    try {
      const respuesta = await buscarVentas(busqueda.trim());
      setVentas(respuesta.data || []);
    } catch (err) {
      setError(err.response?.data?.message || "No se pudieron buscar las ventas");
    } finally {
      setBuscando(false);
    }
  };

  const seleccionarVenta = async (id) => {
    setError("");
    try {
      const respuesta = await obtenerVentaDevolvible(id);
      setVenta(respuesta.data);
      setLineas([{ ...LINEA_VACIA }]);
    } catch (err) {
      setError(err.response?.data?.message || "No se pudo cargar la venta");
    }
  };

  const actualizarLinea = (index, cambios) => {
    setLineas((actuales) =>
      actuales.map((linea, i) => (i === index ? { ...linea, ...cambios } : linea)),
    );
  };

  const enviar = async (event) => {
    event.preventDefault();
    setError("");
    if (!venta) return setError("Selecciona la venta de referencia");

    for (const [index, linea] of lineas.entries()) {
      const posicion = index + 1;
      if (!linea.id_producto) return setError(`Selecciona el producto de la línea ${posicion}`);
      const cantidad = Number(linea.cantidad);
      if (!Number.isInteger(cantidad) || cantidad <= 0) {
        return setError(`La cantidad de la línea ${posicion} debe ser un número entero mayor a 0`);
      }
      if (linea.estado_producto === "NO_APTO" && linea.motivo.trim().length < 5) {
        return setError(`Indica el motivo del producto no apto en la línea ${posicion} (mínimo 5 caracteres)`);
      }
    }
    for (const producto of venta.productos) {
      const solicitado = solicitadoPorProducto[producto.id_producto] || 0;
      if (solicitado > producto.cantidad_disponible) {
        return setError(
          `No se puede devolver más de lo vendido para ${producto.producto}: quedan ${producto.cantidad_disponible} por devolver y se indicaron ${solicitado}`,
        );
      }
    }

    setGuardando(true);
    try {
      const respuesta = await crearDevolucion({
        id_salida_venta: venta.id_salida,
        observaciones: observaciones.trim() || null,
        detalles: lineas.map((linea) => ({
          id_producto: Number(linea.id_producto),
          cantidad: Number(linea.cantidad),
          estado_producto: linea.estado_producto,
          motivo: linea.estado_producto === "NO_APTO" ? linea.motivo.trim() : null,
        })),
      });
      navigate("/devoluciones", { state: { mensaje: respuesta.message } });
    } catch (err) {
      setError(err.response?.data?.message || "No se pudo registrar la devolución");
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">Registrar devolución de cliente</h1>
            <p className="text-sm text-gray-500">
              Los productos aptos vuelven al stock disponible. Los no aptos se registran como salida por daño con su motivo.
            </p>
          </div>
          <Link to="/devoluciones" className="btn-secondary">
            Volver
          </Link>
        </div>

        <section className="card space-y-4">
          <h2 className="font-semibold">1. Venta de referencia</h2>
          <form className="flex flex-wrap gap-3" onSubmit={buscar}>
            <input
              className="input-field flex-1"
              value={busqueda}
              onChange={(event) => setBusqueda(event.target.value)}
              placeholder="Número de venta o referencia externa"
              aria-label="Referencia de venta"
            />
            <button type="submit" className="btn-primary" disabled={buscando}>
              {buscando ? "Buscando..." : "Buscar venta"}
            </button>
          </form>

          {ventas && !venta && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 text-left text-gray-500">
                    <th className="py-2 pr-3">Venta</th>
                    <th className="py-2 pr-3">Referencia</th>
                    <th className="py-2 pr-3">Fecha</th>
                    <th className="py-2 pr-3">Almacén</th>
                    <th className="py-2 pr-3 text-right">Vendido</th>
                    <th className="py-2 pr-3 text-right">Devuelto</th>
                    <th className="py-2" />
                  </tr>
                </thead>
                <tbody>
                  {ventas.length === 0 ? (
                    <tr>
                      <td colSpan="7" className="py-6 text-center text-gray-500">
                        No se encontraron ventas confirmadas con esa referencia.
                      </td>
                    </tr>
                  ) : (
                    ventas.map((item) => (
                      <tr key={item.id_salida} className="border-b border-gray-100">
                        <td className="py-2 pr-3 font-mono text-xs">{item.numero_salida}</td>
                        <td className="py-2 pr-3">{item.referencia_externa || "-"}</td>
                        <td className="whitespace-nowrap py-2 pr-3">{formatearFecha(item.fecha_salida)}</td>
                        <td className="py-2 pr-3">{item.almacen}</td>
                        <td className="py-2 pr-3 text-right">{item.total_vendido}</td>
                        <td className="py-2 pr-3 text-right">{item.total_devuelto}</td>
                        <td className="py-2 text-right">
                          <button
                            type="button"
                            className="font-semibold text-blue-600 hover:underline disabled:text-gray-400 disabled:no-underline"
                            disabled={item.total_devuelto >= item.total_vendido}
                            onClick={() => seleccionarVenta(item.id_salida)}
                          >
                            {item.total_devuelto >= item.total_vendido ? "Ya devuelta" : "Seleccionar"}
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}

          {venta && (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2 rounded bg-gray-50 p-3 text-sm">
                <div>
                  <span className="font-mono font-semibold">{venta.numero_salida}</span>
                  {venta.referencia_externa && ` · Ref. ${venta.referencia_externa}`}
                  {` · ${formatearFecha(venta.fecha_salida)} · ${venta.almacen}`}
                </div>
                <button
                  type="button"
                  className="font-semibold text-blue-600 hover:underline"
                  onClick={() => setVenta(null)}
                >
                  Cambiar venta
                </button>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 text-left text-gray-500">
                    <th className="py-2 pr-3">Producto</th>
                    <th className="py-2 pr-3 text-right">Vendido</th>
                    <th className="py-2 pr-3 text-right">Ya devuelto</th>
                    <th className="py-2 text-right">Puede devolverse</th>
                  </tr>
                </thead>
                <tbody>
                  {venta.productos.map((producto) => (
                    <tr key={producto.id_producto} className="border-b border-gray-100">
                      <td className="py-2 pr-3">
                        <div className="font-medium">{producto.producto}</div>
                        <div className="font-mono text-xs text-gray-500">{producto.producto_codigo}</div>
                      </td>
                      <td className="py-2 pr-3 text-right">{producto.cantidad_vendida}</td>
                      <td className="py-2 pr-3 text-right">{producto.cantidad_devuelta}</td>
                      <td className="py-2 text-right font-semibold">{producto.cantidad_disponible}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {venta && (
          <form className="card space-y-4" onSubmit={enviar}>
            <h2 className="font-semibold">2. Productos devueltos</h2>
            {productosDevolvibles.length === 0 ? (
              <p className="text-sm text-gray-500">Todos los productos de esta venta ya fueron devueltos.</p>
            ) : (
              <>
                <div className="space-y-3">
                  {lineas.map((linea, index) => {
                    const producto = venta.productos.find(
                      (item) => String(item.id_producto) === String(linea.id_producto),
                    );
                    const excedido =
                      producto && (solicitadoPorProducto[producto.id_producto] || 0) > producto.cantidad_disponible;
                    return (
                      <div
                        key={index}
                        className="grid grid-cols-1 gap-3 rounded border border-gray-200 p-3 md:grid-cols-12"
                      >
                        <div className="md:col-span-4">
                          <label className="mb-1 block text-sm font-medium">Producto *</label>
                          <select
                            className="input-field"
                            value={linea.id_producto}
                            onChange={(event) => actualizarLinea(index, { id_producto: event.target.value })}
                          >
                            <option value="">Selecciona un producto</option>
                            {productosDevolvibles.map((item) => (
                              <option key={item.id_producto} value={item.id_producto}>
                                {item.producto_codigo} - {item.producto}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="md:col-span-2">
                          <label className="mb-1 block text-sm font-medium">Cantidad *</label>
                          <input
                            className={`input-field ${excedido ? "border-red-500" : ""}`}
                            type="number"
                            min="1"
                            step="1"
                            max={producto?.cantidad_disponible}
                            value={linea.cantidad}
                            onChange={(event) => actualizarLinea(index, { cantidad: event.target.value })}
                          />
                          {excedido && (
                            <p className="mt-1 text-xs text-red-600">
                              Máximo {producto.cantidad_disponible} en total
                            </p>
                          )}
                        </div>
                        <div className="md:col-span-3">
                          <label className="mb-1 block text-sm font-medium">Estado del producto *</label>
                          <select
                            className="input-field"
                            value={linea.estado_producto}
                            onChange={(event) => actualizarLinea(index, { estado_producto: event.target.value })}
                          >
                            {ESTADOS_PRODUCTO.map((estado) => (
                              <option key={estado.value} value={estado.value}>
                                {estado.label}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="flex items-end justify-end md:col-span-3">
                          <button
                            type="button"
                            className="btn-secondary"
                            disabled={lineas.length === 1}
                            onClick={() => setLineas((actuales) => actuales.filter((_, i) => i !== index))}
                          >
                            Quitar
                          </button>
                        </div>
                        {linea.estado_producto === "NO_APTO" && (
                          <div className="md:col-span-12">
                            <label className="mb-1 block text-sm font-medium">Motivo (no apto) *</label>
                            <input
                              className="input-field"
                              maxLength="300"
                              value={linea.motivo}
                              onChange={(event) => actualizarLinea(index, { motivo: event.target.value })}
                              placeholder="Ej.: envase roto, producto abierto, cadena de frío interrumpida"
                            />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setLineas((actuales) => [...actuales, { ...LINEA_VACIA }])}
                >
                  Agregar producto
                </button>

                <div>
                  <label className="mb-1 block text-sm font-medium" htmlFor="observaciones-devolucion">
                    Observaciones
                  </label>
                  <textarea
                    id="observaciones-devolucion"
                    className="input-field"
                    rows="2"
                    maxLength="500"
                    value={observaciones}
                    onChange={(event) => setObservaciones(event.target.value)}
                    placeholder="Opcional"
                  />
                </div>
              </>
            )}

            {error && <p className="rounded bg-red-50 p-3 text-sm text-red-600">{error}</p>}

            <div className="flex justify-end gap-2">
              <Link to="/devoluciones" className="btn-secondary">
                Cancelar
              </Link>
              <button
                type="submit"
                className="btn-primary"
                disabled={guardando || productosDevolvibles.length === 0}
              >
                {guardando ? "Registrando..." : "Registrar devolución"}
              </button>
            </div>
          </form>
        )}

        {!venta && error && <p className="rounded bg-red-50 p-3 text-sm text-red-600">{error}</p>}
      </div>
    </Layout>
  );
}
