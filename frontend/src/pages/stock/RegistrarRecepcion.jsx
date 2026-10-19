import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import Layout from "../../components/layout/Layout";
import Select from "../../components/ui/Select";
import { listarAlmacenes } from "../../api/almacenes.api";
import { listarRecepciones, registrarRecepcion } from "../../api/entradas.api";
import { listarProductos } from "../../api/productos.api";

const crearDetalleVacio = () => ({
  id_producto: "",
  cantidad_solicitada: "",
  cantidad_recibida: "",
  observaciones: "",
});

function evaluarDetalle(detalle) {
  const esperadaTexto = String(detalle.cantidad_solicitada ?? "").trim();
  const recibidaTexto = String(detalle.cantidad_recibida ?? "").trim();
  if (!esperadaTexto || !recibidaTexto) return { estado: "" };

  const esperada = Number(esperadaTexto);
  const recibida = Number(recibidaTexto);
  if (!Number.isFinite(esperada) || !Number.isFinite(recibida)) {
    return { estado: "INVALIDA" };
  }
  if (esperada < 0 || recibida < 0) return { estado: "NEGATIVA" };
  if (esperada <= 0 || recibida <= 0) return { estado: "CERO" };
  if (esperada === recibida) return { estado: "CONFORME" };

  return { estado: "CON_DIFERENCIA", diferencia: recibida - esperada };
}

function formatearCantidad(valor) {
  return Number(Number(valor).toFixed(3)).toString();
}

function EtiquetaVerificacion({ detalle }) {
  const evaluacion = evaluarDetalle(detalle);

  if (evaluacion.estado === "NEGATIVA") {
    return <p className="text-sm font-medium text-red-600">Cantidad negativa</p>;
  }
  if (evaluacion.estado === "CERO") {
    return <p className="text-sm font-medium text-red-600">Debe ser mayor a cero</p>;
  }
  if (evaluacion.estado === "INVALIDA") {
    return <p className="text-sm font-medium text-red-600">Cantidad no válida</p>;
  }
  if (evaluacion.estado === "CONFORME") {
    return (
      <span className="inline-flex rounded-full bg-green-100 px-2 py-1 text-xs font-semibold text-green-700">
        Conforme
      </span>
    );
  }
  if (evaluacion.estado === "CON_DIFERENCIA") {
    const signo = evaluacion.diferencia > 0 ? "+" : "";
    return (
      <span className="inline-flex rounded-full bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-800">
        Con diferencia ({signo}
        {formatearCantidad(evaluacion.diferencia)})
      </span>
    );
  }

  return <p className="text-sm text-gray-400">Pendiente</p>;
}

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
  const [recepcionGuardada, setRecepcionGuardada] = useState(null);
  const [recepciones, setRecepciones] = useState([]);
  const [errorLista, setErrorLista] = useState("");

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

  useEffect(() => {
    listarRecepciones({ limit: 8, orderBy: "fecha_entrada", order: "DESC" })
      .then((respuesta) => {
        setRecepciones(respuesta.data || []);
        setErrorLista("");
      })
      .catch((err) => {
        setErrorLista(
          err.response?.data?.message || "No se pudieron cargar las recepciones",
        );
      });
  }, [recepcionGuardada]);

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
    if (detalles.some((detalle) => !detalle.id_producto)) {
      return setError("Seleccione un producto en cada línea");
    }
    if (detalles.some((detalle) => evaluarDetalle(detalle).estado === "NEGATIVA")) {
      return setError("No se permiten cantidades negativas");
    }
    if (detalles.some((detalle) => evaluarDetalle(detalle).estado === "CERO")) {
      return setError("La cantidad esperada y la recibida deben ser mayores a cero");
    }
    if (
      detalles.some((detalle) => {
        const estado = evaluarDetalle(detalle).estado;
        return !estado || estado === "INVALIDA";
      })
    ) {
      return setError(
        "Indique la cantidad esperada y la cantidad recibida de cada producto",
      );
    }

    setGuardando(true);
    try {
      const respuesta = await registrarRecepcion({
        ...form,
        proveedor: form.proveedor.trim(),
        detalles: detalles.map((detalle) => ({
          id_producto: detalle.id_producto,
          cantidad_solicitada: Number(detalle.cantidad_solicitada),
          cantidad_recibida: Number(detalle.cantidad_recibida),
          observaciones: detalle.observaciones.trim() || null,
        })),
      });
      const conDiferencia = (respuesta.data.detalles || []).filter(
        (detalle) => detalle.estado_verificacion === "CON_DIFERENCIA",
      ).length;
      const textoVerificacion =
        respuesta.data.resultado_verificacion === "CONFORME"
          ? "La verificación quedó conforme."
          : `La verificación quedó con diferencia en ${conDiferencia} ${
              conDiferencia === 1 ? "línea" : "líneas"
            }.`;
      setRecepcionGuardada({
        id_entrada: respuesta.data.id_entrada,
        numero_entrada: respuesta.data.numero_entrada,
      });
      setConfirmacion(
        `Recepción ${respuesta.data.numero_entrada} registrada. ${textoVerificacion} El stock fue actualizado.`,
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
            Compara la cantidad recibida con la esperada y guarda el resultado
            de la verificación
          </p>
        </div>

        <form className="space-y-6" noValidate onSubmit={enviarRecepcion}>
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
              <div>
                <h2 className="text-lg font-semibold">Verificación por producto</h2>
                <p className="text-sm text-gray-500">
                  Si las cantidades coinciden, la línea queda conforme. Si no,
                  queda con diferencia.
                </p>
              </div>
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
                    <div className="md:col-span-4">
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
                        htmlFor={`esperada-${indice}`}
                      >
                        Cantidad esperada *
                      </label>
                      <input
                        id={`esperada-${indice}`}
                        className="input-field"
                        type="number"
                        min="0.001"
                        step="any"
                        required
                        value={detalle.cantidad_solicitada}
                        onChange={(event) =>
                          actualizarDetalle(
                            indice,
                            "cantidad_solicitada",
                            event.target.value,
                          )
                        }
                        disabled={guardando}
                      />
                    </div>
                    <div className="md:col-span-2">
                      <label
                        className="mb-1 block text-sm font-medium"
                        htmlFor={`cantidad-${indice}`}
                      >
                        Cantidad recibida *
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
                    <div className="md:col-span-3">
                      <p className="mb-1 block text-sm font-medium">Verificación</p>
                      <div className="flex min-h-10 items-center">
                        <EtiquetaVerificacion detalle={detalle} />
                      </div>
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
                    <div className="md:col-span-12">
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
              {confirmacion}{" "}
              {recepcionGuardada?.id_entrada && (
                <Link
                  className="font-semibold underline"
                  to={`/recepciones/${recepcionGuardada.id_entrada}`}
                >
                  Registrar o consultar diferencias
                </Link>
              )}
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

        <section className="card space-y-3">
          <h2 className="text-lg font-semibold">Recepciones registradas</h2>
          <p className="text-sm text-gray-500">
            Abre una recepción para registrar faltantes, sobrantes o productos
            dañados y consultar las diferencias.
          </p>
          {errorLista && (
            <p className="rounded bg-red-50 p-3 text-sm text-red-600">{errorLista}</p>
          )}
          {recepciones.length === 0 ? (
            <p className="text-sm text-gray-500">Todavía no hay recepciones registradas.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 text-left text-gray-500">
                    <th className="py-2 pr-3">Número</th>
                    <th className="py-2 pr-3">Fecha</th>
                    <th className="py-2 pr-3">Proveedor</th>
                    <th className="py-2 pr-3">Verificación</th>
                    <th className="py-2">Detalle</th>
                  </tr>
                </thead>
                <tbody>
                  {recepciones.map((recepcion) => (
                    <tr key={recepcion.id_entrada} className="border-b border-gray-100">
                      <td className="py-2 pr-3 font-medium">{recepcion.numero_entrada}</td>
                      <td className="whitespace-nowrap py-2 pr-3">
                        {recepcion.fecha_entrada
                          ? new Date(recepcion.fecha_entrada).toLocaleString("es-BO")
                          : "-"}
                      </td>
                      <td className="py-2 pr-3">{recepcion.origen || "-"}</td>
                      <td className="py-2 pr-3">
                        {recepcion.resultado_verificacion === "CONFORME"
                          ? "Conforme"
                          : recepcion.resultado_verificacion === "CON_DIFERENCIA"
                            ? "Con diferencia"
                            : "Pendiente"}
                      </td>
                      <td className="py-2">
                        <Link
                          className="font-semibold text-brand-blue"
                          to={`/recepciones/${recepcion.id_entrada}`}
                        >
                          Ver detalle
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </Layout>
  );
}
