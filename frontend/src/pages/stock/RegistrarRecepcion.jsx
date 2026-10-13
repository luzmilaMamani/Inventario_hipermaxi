import { useEffect, useState } from "react";
import Layout from "../../components/layout/Layout";
import Select from "../../components/ui/Select";
import { listarAlmacenes } from "../../api/almacenes.api";
import { registrarRecepcion } from "../../api/entradas.api";
import { listarProductos } from "../../api/productos.api";

const crearDetalleVacio = () => ({
  id_producto: "",
  cantidad_recibida: "",
  observaciones: "",
});

export default function RegistrarRecepcion() {
  const [almacenes, setAlmacenes] = useState([]);
  const [productos, setProductos] = useState([]);
  const [form, setForm] = useState({
    id_almacen: "",
    proveedor: "",
    referencia_externa: "",
    observaciones: "",
  });
  const [detalles, setDetalles] = useState([crearDetalleVacio()]);
  const [loadingCatalogos, setLoadingCatalogos] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");
  const [confirmacion, setConfirmacion] = useState("");

  useEffect(() => {
    Promise.all([
      listarAlmacenes({
        limit: 200,
        activo: true,
        orderBy: "nombre",
        order: "ASC",
      }),
      listarProductos({
        limit: 200,
        estado: "ACTIVO",
        orderBy: "nombre",
        order: "ASC",
      }),
    ])
      .then(([respuestaAlmacenes, respuestaProductos]) => {
        setAlmacenes(respuestaAlmacenes.data);
        setProductos(respuestaProductos.data);
      })
      .catch((err) => {
        setError(
          err.response?.data?.message ||
            "No se pudieron cargar los almacenes y productos",
        );
      })
      .finally(() => setLoadingCatalogos(false));
  }, []);

  const actualizarDetalle = (indice, campo, valor) => {
    setDetalles((actuales) =>
      actuales.map((detalle, posicion) =>
        posicion === indice ? { ...detalle, [campo]: valor } : detalle,
      ),
    );
  };

  const enviarRecepcion = async (event) => {
    event.preventDefault();
    setError("");
    setConfirmacion("");

    if (!form.id_almacen) return setError("Debe seleccionar un almacén");
    if (!form.proveedor.trim()) return setError("El proveedor es obligatorio");
    if (
      detalles.some(
        (detalle) =>
          !detalle.id_producto ||
          !Number.isFinite(Number(detalle.cantidad_recibida)) ||
          Number(detalle.cantidad_recibida) <= 0,
      )
    ) {
      return setError(
        "Seleccione un producto e indique una cantidad mayor a cero en cada línea",
      );
    }

    setGuardando(true);
    try {
      const respuesta = await registrarRecepcion({
        ...form,
        proveedor: form.proveedor.trim(),
        detalles: detalles.map((detalle) => ({
          ...detalle,
          cantidad_recibida: Number(detalle.cantidad_recibida),
          observaciones: detalle.observaciones.trim() || null,
        })),
      });
      setConfirmacion(
        `Recepción ${respuesta.data.numero_entrada} registrada correctamente. El stock fue actualizado.`,
      );
      setForm({
        id_almacen: "",
        proveedor: "",
        referencia_externa: "",
        observaciones: "",
      });
      setDetalles([crearDetalleVacio()]);
    } catch (err) {
      setError(
        err.response?.data?.message || "No se pudo registrar la recepción",
      );
    } finally {
      setGuardando(false);
    }
  };

  const opcionesAlmacenes = almacenes.map((almacen) => ({
    value: almacen.id_almacen,
    label: `${almacen.codigo} - ${almacen.nombre}`,
  }));
  const opcionesProductos = productos.map((producto) => ({
    value: producto.id_producto,
    label: `${producto.codigo} - ${producto.nombre}`,
  }));

  return (
    <Layout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Recepción de mercadería</h1>
          <p className="text-sm text-gray-500">
            Registra los productos recibidos de un proveedor y actualiza el
            stock del almacén
          </p>
        </div>

        <form className="space-y-6" onSubmit={enviarRecepcion}>
          <section className="card space-y-4">
            <h2 className="text-lg font-semibold">Datos de la recepción</h2>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <Select
                label="Almacén *"
                value={form.id_almacen}
                onChange={(event) =>
                  setForm({ ...form, id_almacen: event.target.value })
                }
                options={opcionesAlmacenes}
                placeholder="Selecciona un almacén"
                disabled={loadingCatalogos || guardando}
              />
              <div>
                <label
                  className="mb-1 block text-sm font-medium"
                  htmlFor="proveedor"
                >
                  Proveedor *
                </label>
                <input
                  id="proveedor"
                  className="input-field"
                  maxLength="150"
                  required
                  value={form.proveedor}
                  onChange={(event) =>
                    setForm({ ...form, proveedor: event.target.value })
                  }
                  disabled={guardando}
                  placeholder="Nombre del proveedor"
                />
              </div>
              <div>
                <label
                  className="mb-1 block text-sm font-medium"
                  htmlFor="referencia-externa"
                >
                  Referencia de factura o remisión
                </label>
                <input
                  id="referencia-externa"
                  className="input-field"
                  value={form.referencia_externa}
                  onChange={(event) =>
                    setForm({ ...form, referencia_externa: event.target.value })
                  }
                  disabled={guardando}
                  placeholder="Opcional"
                />
              </div>
              <div>
                <label
                  className="mb-1 block text-sm font-medium"
                  htmlFor="observaciones-recepcion"
                >
                  Observaciones
                </label>
                <input
                  id="observaciones-recepcion"
                  className="input-field"
                  value={form.observaciones}
                  onChange={(event) =>
                    setForm({ ...form, observaciones: event.target.value })
                  }
                  disabled={guardando}
                  placeholder="Opcional"
                />
              </div>
            </div>
          </section>

          <section className="card space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-lg font-semibold">Productos recibidos</h2>
              <button
                type="button"
                className="btn-secondary"
                disabled={guardando || detalles.length >= 100}
                onClick={() => setDetalles([...detalles, crearDetalleVacio()])}
              >
                + Agregar producto
              </button>
            </div>

            {loadingCatalogos ? (
              <p className="text-sm text-gray-500">Cargando catálogos...</p>
            ) : productos.length === 0 ? (
              <p className="text-sm text-amber-700">
                No hay productos activos disponibles para recibir.
              </p>
            ) : (
              <div className="space-y-3">
                {detalles.map((detalle, indice) => (
                  <div
                    key={indice}
                    className="grid grid-cols-1 items-end gap-3 rounded-lg border border-gray-200 p-3 md:grid-cols-12"
                  >
                    <div className="md:col-span-5">
                      <Select
                        label="Producto *"
                        value={detalle.id_producto}
                        onChange={(event) =>
                          actualizarDetalle(
                            indice,
                            "id_producto",
                            event.target.value,
                          )
                        }
                        options={opcionesProductos}
                        placeholder="Selecciona un producto"
                        disabled={guardando}
                      />
                    </div>
                    <div className="md:col-span-2">
                      <label
                        className="mb-1 block text-sm font-medium"
                        htmlFor={`cantidad-${indice}`}
                      >
                        Cantidad *
                      </label>
                      <input
                        id={`cantidad-${indice}`}
                        className="input-field"
                        type="number"
                        min="0.001"
                        step="any"
                        required
                        value={detalle.cantidad_recibida}
                        onChange={(event) =>
                          actualizarDetalle(
                            indice,
                            "cantidad_recibida",
                            event.target.value,
                          )
                        }
                        disabled={guardando}
                      />
                    </div>
                    <div className="md:col-span-4">
                      <label
                        className="mb-1 block text-sm font-medium"
                        htmlFor={`observacion-${indice}`}
                      >
                        Observaciones de línea
                      </label>
                      <input
                        id={`observacion-${indice}`}
                        className="input-field"
                        value={detalle.observaciones}
                        onChange={(event) =>
                          actualizarDetalle(
                            indice,
                            "observaciones",
                            event.target.value,
                          )
                        }
                        disabled={guardando}
                        placeholder="Opcional"
                      />
                    </div>
                    <div className="md:col-span-1">
                      <button
                        type="button"
                        className="btn-secondary w-full"
                        aria-label={`Quitar producto ${indice + 1}`}
                        disabled={guardando || detalles.length === 1}
                        onClick={() =>
                          setDetalles((actuales) =>
                            actuales.filter((_, posicion) => posicion !== indice),
                          )
                        }
                      >
                        ×
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {error && (
            <p className="rounded bg-red-50 p-3 text-sm text-red-600">
              {error}
            </p>
          )}
          {confirmacion && (
            <p className="rounded bg-green-50 p-3 text-sm text-green-700">
              {confirmacion}
            </p>
          )}

          <div className="flex justify-end">
            <button
              type="submit"
              className="btn-primary"
              disabled={guardando || loadingCatalogos || productos.length === 0}
            >
              {guardando ? "Registrando recepción..." : "Registrar recepción"}
            </button>
          </div>
        </form>
      </div>
    </Layout>
  );
}
