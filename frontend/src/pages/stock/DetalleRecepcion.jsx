import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import Layout from "../../components/layout/Layout";
import Select from "../../components/ui/Select";
import { obtenerRecepcion, registrarDiferencia } from "../../api/entradas.api";

const TIPOS = [
  { value: "FALTANTE", label: "Faltante" },
  { value: "SOBRANTE", label: "Sobrante" },
  { value: "DANADO", label: "Dañado" },
];

const ETIQUETAS_TIPO = {
  FALTANTE: "Faltante",
  SOBRANTE: "Sobrante",
  DANADO: "Dañado",
};

function tipoSugerido(linea) {
  const esperada = Number(linea.cantidad_solicitada);
  const recibida = Number(linea.cantidad_recibida);
  if (!Number.isFinite(esperada) || !Number.isFinite(recibida) || esperada === recibida) {
    return "";
  }
  return recibida < esperada ? "FALTANTE" : "SOBRANTE";
}

function cantidadSugerida(linea) {
  const esperada = Number(linea.cantidad_solicitada);
  const recibida = Number(linea.cantidad_recibida);
  if (!Number.isFinite(esperada) || !Number.isFinite(recibida)) return "";
  const diferencia = Math.abs(recibida - esperada);
  return diferencia > 0 ? String(diferencia) : "";
}

function formularioInicial(linea) {
  return {
    tipo: tipoSugerido(linea),
    cantidad: cantidadSugerida(linea),
    observacion: "",
  };
}

function textoVerificacion(estado) {
  if (estado === "CONFORME") return "Conforme";
  if (estado === "CON_DIFERENCIA") return "Con diferencia";
  return "Pendiente";
}

export default function DetalleRecepcion() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [recepcion, setRecepcion] = useState(null);
  const [formularios, setFormularios] = useState({});
  const [guardandoId, setGuardandoId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [erroresLinea, setErroresLinea] = useState({});
  const [avisosLinea, setAvisosLinea] = useState({});

  const cargar = async () => {
    setLoading(true);
    setError("");
    try {
      const respuesta = await obtenerRecepcion(id);
      setRecepcion(respuesta.data);
      setFormularios((actuales) => {
        const siguientes = { ...actuales };
        for (const linea of respuesta.data.detalles || []) {
          if (!siguientes[linea.id_detalle_entrada]) {
            siguientes[linea.id_detalle_entrada] = formularioInicial(linea);
          }
        }
        return siguientes;
      });
    } catch (err) {
      setError(err.response?.data?.message || "No se pudo cargar la recepción");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const actualizarFormulario = (idDetalle, campo, valor) => {
    setFormularios((actuales) => ({
      ...actuales,
      [idDetalle]: {
        ...(actuales[idDetalle] || { tipo: "", cantidad: "", observacion: "" }),
        [campo]: valor,
      },
    }));
  };

  const enviarDiferencia = async (event, linea) => {
    event.preventDefault();
    const formulario = formularios[linea.id_detalle_entrada] || formularioInicial(linea);
    const cantidad = Number(formulario.cantidad);

    setErroresLinea((actuales) => ({ ...actuales, [linea.id_detalle_entrada]: "" }));
    setAvisosLinea((actuales) => ({ ...actuales, [linea.id_detalle_entrada]: "" }));

    if (!formulario.tipo) {
      return setErroresLinea((actuales) => ({
        ...actuales,
        [linea.id_detalle_entrada]: "Seleccione el tipo de diferencia",
      }));
    }
    if (!Number.isFinite(cantidad) || cantidad < 0) {
      return setErroresLinea((actuales) => ({
        ...actuales,
        [linea.id_detalle_entrada]: "No se permiten cantidades negativas",
      }));
    }
    if (cantidad <= 0) {
      return setErroresLinea((actuales) => ({
        ...actuales,
        [linea.id_detalle_entrada]: "La cantidad de la diferencia debe ser mayor a cero",
      }));
    }
    if (!formulario.observacion.trim()) {
      return setErroresLinea((actuales) => ({
        ...actuales,
        [linea.id_detalle_entrada]: "La observación es obligatoria",
      }));
    }

    setGuardandoId(linea.id_detalle_entrada);
    try {
      await registrarDiferencia(id, {
        id_producto: linea.id_producto,
        tipo: formulario.tipo,
        cantidad,
        observacion: formulario.observacion.trim(),
      });
      setAvisosLinea((actuales) => ({
        ...actuales,
        [linea.id_detalle_entrada]: "Diferencia registrada",
      }));
      actualizarFormulario(linea.id_detalle_entrada, "observacion", "");
      const respuesta = await obtenerRecepcion(id);
      setRecepcion(respuesta.data);
    } catch (err) {
      setErroresLinea((actuales) => ({
        ...actuales,
        [linea.id_detalle_entrada]:
          err.response?.data?.message || "No se pudo registrar la diferencia",
      }));
    } finally {
      setGuardandoId(null);
    }
  };

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">Detalle de la recepción</h1>
            <p className="text-sm text-gray-500">
              Registra faltantes, sobrantes o productos dañados para dejar
              constancia y reclamar al proveedor
            </p>
          </div>
          <button className="btn-secondary" type="button" onClick={() => navigate("/recepciones")}>
            Volver a recepciones
          </button>
        </div>

        {loading && <p className="text-sm text-gray-500">Cargando recepción...</p>}
        {error && <p className="rounded bg-red-50 p-3 text-sm text-red-600">{error}</p>}

        {recepcion && (
          <>
            <section className="card space-y-2 text-sm">
              <h2 className="text-lg font-semibold">{recepcion.numero_entrada}</h2>
              <p>
                <span className="font-medium">Proveedor:</span> {recepcion.proveedor || "-"}
              </p>
              <p>
                <span className="font-medium">Almacén:</span>{" "}
                {recepcion.almacen_codigo
                  ? `${recepcion.almacen_codigo} - ${recepcion.almacen}`
                  : recepcion.almacen || "-"}
              </p>
              <p>
                <span className="font-medium">Fecha:</span>{" "}
                {recepcion.fecha_entrada
                  ? new Date(recepcion.fecha_entrada).toLocaleString("es-BO")
                  : "-"}
              </p>
              <p>
                <span className="font-medium">Verificación:</span>{" "}
                {textoVerificacion(recepcion.resultado_verificacion)}
              </p>
              {recepcion.referencia_externa && (
                <p>
                  <span className="font-medium">Referencia:</span> {recepcion.referencia_externa}
                </p>
              )}
            </section>

            <section className="space-y-3">
              <h2 className="text-lg font-semibold">Productos de la recepción</h2>
              {(recepcion.detalles || []).length === 0 ? (
                <p className="text-sm text-gray-500">Esta recepción no tiene productos.</p>
              ) : (
                (recepcion.detalles || []).map((linea) => {
                  const formulario = formularios[linea.id_detalle_entrada] || formularioInicial(linea);
                  const guardando = guardandoId === linea.id_detalle_entrada;
                  return (
                    <form
                      key={linea.id_detalle_entrada}
                      className="card space-y-4"
                      noValidate
                      onSubmit={(event) => enviarDiferencia(event, linea)}
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="font-semibold">{linea.producto}</p>
                          <p className="font-mono text-sm text-gray-500">{linea.producto_codigo}</p>
                        </div>
                        <span className="rounded-full bg-gray-100 px-2 py-1 text-xs font-semibold text-gray-700">
                          {textoVerificacion(linea.estado_verificacion)}
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
                        <p>
                          <span className="block text-gray-500">Esperada</span>
                          <span className="font-medium">{linea.cantidad_solicitada}</span>
                        </p>
                        <p>
                          <span className="block text-gray-500">Recibida</span>
                          <span className="font-medium">{linea.cantidad_recibida}</span>
                        </p>
                      </div>
                      <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
                        <Select
                          label="Tipo *"
                          value={formulario.tipo}
                          onChange={(event) =>
                            actualizarFormulario(
                              linea.id_detalle_entrada,
                              "tipo",
                              event.target.value,
                            )
                          }
                          options={TIPOS}
                          placeholder="Selecciona el tipo"
                          disabled={guardando}
                        />
                        <div>
                          <label
                            className="mb-1 block text-sm font-medium"
                            htmlFor={`cantidad-diferencia-${linea.id_detalle_entrada}`}
                          >
                            Cantidad *
                          </label>
                          <input
                            id={`cantidad-diferencia-${linea.id_detalle_entrada}`}
                            className="input-field"
                            type="number"
                            min="0.001"
                            step="any"
                            value={formulario.cantidad}
                            onChange={(event) =>
                              actualizarFormulario(
                                linea.id_detalle_entrada,
                                "cantidad",
                                event.target.value,
                              )
                            }
                            disabled={guardando}
                          />
                        </div>
                        <div className="md:col-span-2">
                          <label
                            className="mb-1 block text-sm font-medium"
                            htmlFor={`observacion-diferencia-${linea.id_detalle_entrada}`}
                          >
                            Observación *
                          </label>
                          <input
                            id={`observacion-diferencia-${linea.id_detalle_entrada}`}
                            className="input-field"
                            maxLength="500"
                            value={formulario.observacion}
                            onChange={(event) =>
                              actualizarFormulario(
                                linea.id_detalle_entrada,
                                "observacion",
                                event.target.value,
                              )
                            }
                            disabled={guardando}
                            placeholder="Detalle para el reclamo al proveedor"
                          />
                        </div>
                      </div>
                      {erroresLinea[linea.id_detalle_entrada] && (
                        <p className="rounded bg-red-50 p-3 text-sm text-red-600">
                          {erroresLinea[linea.id_detalle_entrada]}
                        </p>
                      )}
                      {avisosLinea[linea.id_detalle_entrada] && (
                        <p className="rounded bg-green-50 p-3 text-sm text-green-700">
                          {avisosLinea[linea.id_detalle_entrada]}
                        </p>
                      )}
                      <div className="flex justify-end">
                        <button className="btn-primary" type="submit" disabled={guardando}>
                          {guardando ? "Registrando diferencia..." : "Registrar diferencia"}
                        </button>
                      </div>
                    </form>
                  );
                })
              )}
            </section>

            <section className="card space-y-3">
              <h2 className="text-lg font-semibold">Diferencias registradas</h2>
              {(recepcion.diferencias || []).length === 0 ? (
                <p className="text-sm text-gray-500">
                  Esta recepción todavía no tiene diferencias registradas.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-200 text-left text-gray-500">
                        <th className="py-2 pr-3">Fecha</th>
                        <th className="py-2 pr-3">Producto</th>
                        <th className="py-2 pr-3">Tipo</th>
                        <th className="py-2 pr-3 text-right">Cantidad</th>
                        <th className="py-2 pr-3">Observación</th>
                        <th className="py-2">Usuario</th>
                      </tr>
                    </thead>
                    <tbody>
                      {recepcion.diferencias.map((diferencia) => (
                        <tr key={diferencia.id_diferencia} className="border-b border-gray-100">
                          <td className="whitespace-nowrap py-2 pr-3">
                            {diferencia.fecha_registro
                              ? new Date(diferencia.fecha_registro).toLocaleString("es-BO")
                              : "-"}
                          </td>
                          <td className="py-2 pr-3">
                            <span className="font-medium">{diferencia.producto}</span>
                            <span className="ml-2 font-mono text-gray-500">
                              {diferencia.producto_codigo}
                            </span>
                          </td>
                          <td className="py-2 pr-3">
                            {ETIQUETAS_TIPO[diferencia.tipo] || diferencia.tipo}
                          </td>
                          <td className="py-2 pr-3 text-right">{diferencia.cantidad}</td>
                          <td className="py-2 pr-3">{diferencia.observacion}</td>
                          <td className="py-2">{diferencia.usuario || "-"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </Layout>
  );
}
