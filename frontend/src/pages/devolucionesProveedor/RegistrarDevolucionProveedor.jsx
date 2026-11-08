import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import Layout from "../../components/layout/Layout";
import {
  buscarRecepcionesDevolvibles,
  crearDevolucionProveedor,
  obtenerRecepcionDevolvible,
} from "../../api/devolucionesProveedor.api";

function formatearFecha(fecha) {
  return fecha ? new Date(fecha).toLocaleDateString("es-BO") : "-";
}

// RF56: devolución a proveedor de mercadería defectuosa de una recepción confirmada.
export default function RegistrarDevolucionProveedor() {
  const navigate = useNavigate();
  const [busqueda, setBusqueda] = useState("");
  const [recepciones, setRecepciones] = useState(null);
  const [buscando, setBuscando] = useState(false);
  const [recepcion, setRecepcion] = useState(null);
  // Cantidad y observación por línea de la recepción (id_detalle_entrada).
  const [cantidades, setCantidades] = useState({});
  const [motivo, setMotivo] = useState("");
  const [observaciones, setObservaciones] = useState("");
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);

  const buscar = async (event) => {
    event.preventDefault();
    setError("");
    if (busqueda.trim().length < 2) {
      return setError("Ingresa al menos 2 caracteres del número, referencia o proveedor");
    }
    setBuscando(true);
    try {
      const respuesta = await buscarRecepcionesDevolvibles(busqueda.trim());
      setRecepciones(respuesta.data || []);
    } catch (err) {
      setError(err.response?.data?.message || "No se pudieron buscar las recepciones");
    } finally {
      setBuscando(false);
    }
  };

  const seleccionarRecepcion = async (id) => {
    setError("");
    try {
      const respuesta = await obtenerRecepcionDevolvible(id);
      setRecepcion(respuesta.data);
      setCantidades({});
    } catch (err) {
      setError(err.response?.data?.message || "No se pudo cargar la recepción");
    }
  };

  const actualizar = (idDetalle, cambios) =>
    setCantidades((actual) => ({
      ...actual,
      [idDetalle]: { cantidad: "", observacion: "", ...actual[idDetalle], ...cambios },
    }));

  const lineasElegidas = (recepcion?.lineas || []).filter(
    (linea) => String(cantidades[linea.id_detalle_entrada]?.cantidad || "").trim() !== "",
  );
  const totalDevolver = lineasElegidas.reduce(
    (total, linea) => total + (Number(cantidades[linea.id_detalle_entrada].cantidad) || 0),
    0,
  );

  const enviar = async (event) => {
    event.preventDefault();
    setError("");
    if (!recepcion) return setError("Selecciona la recepción de referencia");
    if (lineasElegidas.length === 0) return setError("Indica la cantidad de al menos un producto a devolver");
    for (const linea of lineasElegidas) {
      const cantidad = Number(cantidades[linea.id_detalle_entrada].cantidad);
      if (!Number.isInteger(cantidad) || cantidad <= 0) {
        return setError(`La cantidad de ${linea.producto} debe ser un número entero mayor a 0`);
      }
      if (cantidad > linea.cantidad_disponible) {
        return setError(
          `No se puede devolver más de lo recibido para ${linea.producto}: quedan ${linea.cantidad_disponible} por devolver`,
        );
      }
    }
    if (motivo.trim().length < 5) return setError("Indica el motivo de la devolución (mínimo 5 caracteres)");
    if (
      !window.confirm(
        `Se descontarán ${totalDevolver} unidad(es) del stock y se registrará la devolución a ${recepcion.proveedor}. ¿Confirmas?`,
      )
    ) {
      return;
    }

    setGuardando(true);
    try {
      const respuesta = await crearDevolucionProveedor({
        id_entrada: recepcion.id_entrada,
        motivo: motivo.trim(),
        observaciones: observaciones.trim() || null,
        detalles: lineasElegidas.map((linea) => ({
          id_detalle_entrada: linea.id_detalle_entrada,
          cantidad: Number(cantidades[linea.id_detalle_entrada].cantidad),
          observacion: cantidades[linea.id_detalle_entrada].observacion.trim() || null,
        })),
      });
      navigate("/devoluciones-proveedor", { state: { mensaje: respuesta.message } });
    } catch (err) {
      setError(err.response?.data?.message || "No se pudo registrar la devolución");
    } finally {
      setGuardando(false);
    }
  };

  const hayDevolvibles = (recepcion?.lineas || []).some((linea) => linea.cantidad_disponible > 0);

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">Registrar devolución a proveedor</h1>
            <p className="text-sm text-gray-500">
              Mercadería defectuosa de una recepción confirmada: se descuenta del stock y queda pendiente de reposición.
            </p>
          </div>
          <Link to="/devoluciones-proveedor" className="btn-secondary">
            Volver
          </Link>
        </div>

        <section className="card space-y-4">
          <h2 className="font-semibold">1. Recepción de referencia</h2>
          <form className="flex flex-wrap gap-3" onSubmit={buscar}>
            <input
              className="input-field flex-1"
              value={busqueda}
              onChange={(event) => setBusqueda(event.target.value)}
              placeholder="Número de recepción, factura/referencia o proveedor"
              aria-label="Recepción de referencia"
            />
            <button type="submit" className="btn-primary" disabled={buscando}>
              {buscando ? "Buscando..." : "Buscar recepción"}
            </button>
          </form>

          {recepciones && !recepcion && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 text-left text-gray-500">
                    <th className="py-2 pr-3">Recepción</th>
                    <th className="py-2 pr-3">Proveedor</th>
                    <th className="py-2 pr-3">Referencia</th>
                    <th className="py-2 pr-3">Fecha</th>
                    <th className="py-2 pr-3">Almacén</th>
                    <th className="py-2 pr-3 text-right">Recibido</th>
                    <th className="py-2 pr-3 text-right">Devuelto</th>
                    <th className="py-2" />
                  </tr>
                </thead>
                <tbody>
                  {recepciones.length === 0 ? (
                    <tr>
                      <td colSpan="8" className="py-6 text-center text-gray-500">
                        No se encontraron recepciones confirmadas con esa búsqueda.
                      </td>
                    </tr>
                  ) : (
                    recepciones.map((item) => (
                      <tr key={item.id_entrada} className="border-b border-gray-100">
                        <td className="py-2 pr-3 font-mono text-xs">{item.numero_entrada}</td>
                        <td className="py-2 pr-3">{item.proveedor || "-"}</td>
                        <td className="py-2 pr-3">{item.referencia_externa || "-"}</td>
                        <td className="whitespace-nowrap py-2 pr-3">{formatearFecha(item.fecha_entrada)}</td>
                        <td className="py-2 pr-3">{item.almacen}</td>
                        <td className="py-2 pr-3 text-right">{item.total_recibido}</td>
                        <td className="py-2 pr-3 text-right">{item.total_devuelto}</td>
                        <td className="py-2 text-right">
                          <button
                            type="button"
                            className="font-semibold text-blue-600 hover:underline disabled:text-gray-400 disabled:no-underline"
                            disabled={item.total_devuelto >= item.total_recibido}
                            onClick={() => seleccionarRecepcion(item.id_entrada)}
                          >
                            {item.total_devuelto >= item.total_recibido ? "Ya devuelta" : "Seleccionar"}
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}

          {recepcion && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded bg-gray-50 p-3 text-sm">
              <div>
                <span className="font-mono font-semibold">{recepcion.numero_entrada}</span>
                {` · Proveedor: ${recepcion.proveedor}`}
                {recepcion.referencia_externa && ` · Ref. ${recepcion.referencia_externa}`}
                {` · ${formatearFecha(recepcion.fecha_entrada)} · ${recepcion.almacen}`}
              </div>
              <button
                type="button"
                className="font-semibold text-blue-600 hover:underline"
                onClick={() => setRecepcion(null)}
              >
                Cambiar recepción
              </button>
            </div>
          )}
        </section>

        {recepcion && (
          <form className="card space-y-4" onSubmit={enviar}>
            <h2 className="font-semibold">2. Productos defectuosos a devolver</h2>
            {!hayDevolvibles ? (
              <p className="text-sm text-gray-500">Todo lo recibido en esta recepción ya fue devuelto.</p>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-200 text-left text-gray-500">
                        <th className="py-2 pr-3">Producto</th>
                        <th className="py-2 pr-3">Lote</th>
                        <th className="py-2 pr-3 text-right">Recibido</th>
                        <th className="py-2 pr-3 text-right">Ya devuelto</th>
                        <th className="py-2 pr-3 text-right">Puede devolverse</th>
                        <th className="w-28 py-2 pr-3">Devolver</th>
                        <th className="py-2">Detalle del defecto</th>
                      </tr>
                    </thead>
                    <tbody>
                      {recepcion.lineas.map((linea) => {
                        const valor = cantidades[linea.id_detalle_entrada] || { cantidad: "", observacion: "" };
                        const excedido = Number(valor.cantidad) > linea.cantidad_disponible;
                        const agotada = linea.cantidad_disponible === 0;
                        return (
                          <tr key={linea.id_detalle_entrada} className="border-b border-gray-100 align-top">
                            <td className="py-2 pr-3">
                              <div className="font-medium">{linea.producto}</div>
                              <div className="font-mono text-xs text-gray-500">{linea.producto_codigo}</div>
                            </td>
                            <td className="py-2 pr-3 text-xs">
                              <div>{linea.numero_lote || "-"}</div>
                              {linea.fecha_vencimiento && (
                                <div className="text-gray-500">Vence {linea.fecha_vencimiento}</div>
                              )}
                            </td>
                            <td className="py-2 pr-3 text-right">{linea.cantidad_recibida}</td>
                            <td className="py-2 pr-3 text-right">{linea.cantidad_devuelta}</td>
                            <td className="py-2 pr-3 text-right font-semibold">{linea.cantidad_disponible}</td>
                            <td className="py-2 pr-3">
                              <input
                                className={`input-field ${excedido ? "border-red-500" : ""}`}
                                type="number"
                                min="1"
                                step="1"
                                max={linea.cantidad_disponible}
                                disabled={agotada}
                                value={valor.cantidad}
                                onChange={(event) => actualizar(linea.id_detalle_entrada, { cantidad: event.target.value })}
                                aria-label={`Cantidad a devolver de ${linea.producto}`}
                              />
                              {excedido && (
                                <p className="mt-1 text-xs text-red-600">Máximo {linea.cantidad_disponible}</p>
                              )}
                            </td>
                            <td className="py-2">
                              <input
                                className="input-field"
                                maxLength="300"
                                disabled={agotada}
                                value={valor.observacion}
                                onChange={(event) =>
                                  actualizar(linea.id_detalle_entrada, { observacion: event.target.value })
                                }
                                placeholder="Opcional: ej. envase roto"
                                aria-label={`Detalle del defecto de ${linea.producto}`}
                              />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-sm font-medium" htmlFor="motivo-devolucion-proveedor">
                      Motivo de la devolución *
                    </label>
                    <textarea
                      id="motivo-devolucion-proveedor"
                      className="input-field"
                      rows="2"
                      maxLength="500"
                      value={motivo}
                      onChange={(event) => setMotivo(event.target.value)}
                      placeholder="Ej.: mercadería defectuosa, empaques dañados, producto fuera de especificación"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium" htmlFor="observaciones-devolucion-proveedor">
                      Observaciones
                    </label>
                    <textarea
                      id="observaciones-devolucion-proveedor"
                      className="input-field"
                      rows="2"
                      maxLength="500"
                      value={observaciones}
                      onChange={(event) => setObservaciones(event.target.value)}
                      placeholder="Opcional: ej. reclamo enviado al proveedor"
                    />
                  </div>
                </div>
              </>
            )}

            {error && <p className="rounded bg-red-50 p-3 text-sm text-red-600">{error}</p>}

            <div className="flex items-center justify-end gap-3">
              {totalDevolver > 0 && (
                <span className="text-sm text-gray-600">
                  Se descontarán <span className="font-semibold">{totalDevolver}</span> unidad(es) del stock
                </span>
              )}
              <Link to="/devoluciones-proveedor" className="btn-secondary">
                Cancelar
              </Link>
              <button type="submit" className="btn-primary" disabled={guardando || !hayDevolvibles}>
                {guardando ? "Registrando..." : "Confirmar devolución"}
              </button>
            </div>
          </form>
        )}

        {!recepcion && error && <p className="rounded bg-red-50 p-3 text-sm text-red-600">{error}</p>}
      </div>
    </Layout>
  );
}
