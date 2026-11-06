import { useEffect, useState } from "react";
import Layout from "../../components/layout/Layout";
import { useAuth } from "../../context/AuthContext";
import { ROLES_ADMINISTRACION, tieneRol } from "../../utils/permissions";
import {
  actualizarParametroGeneral,
  eliminarParametroCategoria,
  guardarParametroCategoria,
  listarParametrosVencimiento,
} from "../../api/parametrosVencimiento.api";

const DIAS_MAXIMOS = 365;

// RF50: el valor debe ser un entero mayor a cero.
function validarDias(valor) {
  const texto = String(valor ?? "").trim();
  if (!/^\d+$/.test(texto)) return "Ingrese un número entero mayor a cero";
  const dias = Number(texto);
  if (dias <= 0) return "Ingrese un número entero mayor a cero";
  if (dias > DIAS_MAXIMOS) return `El máximo permitido es ${DIAS_MAXIMOS} días`;
  return "";
}

export default function ParametrosVencimiento() {
  const { user } = useAuth();
  const puedeEditar = tieneRol(user?.rol, ROLES_ADMINISTRACION);

  const [general, setGeneral] = useState(30);
  const [generalEditado, setGeneralEditado] = useState("30");
  const [categorias, setCategorias] = useState([]);
  const [valores, setValores] = useState({});
  const [errores, setErrores] = useState({});
  const [busqueda, setBusqueda] = useState("");
  const [guardando, setGuardando] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [mensaje, setMensaje] = useState("");

  const cargar = async () => {
    setLoading(true);
    setError("");
    try {
      const respuesta = await listarParametrosVencimiento();
      const datos = respuesta.data || {};
      const diasGeneral = datos.general?.dias_anticipacion ?? 30;
      setGeneral(diasGeneral);
      setGeneralEditado(String(diasGeneral));
      setCategorias(datos.categorias || []);
      setValores(
        Object.fromEntries(
          (datos.categorias || []).map((c) => [
            c.id_categoria,
            c.dias_anticipacion == null ? "" : String(c.dias_anticipacion),
          ]),
        ),
      );
      setErrores({});
    } catch (err) {
      setError(
        err.response?.data?.message ||
          "Error al cargar los parámetros de vencimiento",
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    cargar();
  }, []);

  const mostrarMensaje = (texto) => {
    setMensaje(texto);
    setError("");
    setTimeout(() => setMensaje(""), 3000);
  };

  const guardarGeneral = async () => {
    const problema = validarDias(generalEditado);
    if (problema) {
      setErrores({ ...errores, general: problema });
      return;
    }
    setGuardando("general");
    try {
      const respuesta = await actualizarParametroGeneral(Number(generalEditado));
      mostrarMensaje(respuesta.message || "Valor general actualizado");
      await cargar();
    } catch (err) {
      setError(err.response?.data?.message || "No se pudo guardar el valor general");
    } finally {
      setGuardando(null);
    }
  };

  const guardarCategoria = async (categoria) => {
    const valor = valores[categoria.id_categoria];
    const problema = validarDias(valor);
    if (problema) {
      setErrores({ ...errores, [categoria.id_categoria]: problema });
      return;
    }
    setGuardando(categoria.id_categoria);
    try {
      const respuesta = await guardarParametroCategoria(
        categoria.id_categoria,
        Number(valor),
      );
      mostrarMensaje(respuesta.message || "Parámetro guardado");
      await cargar();
    } catch (err) {
      setError(err.response?.data?.message || "No se pudo guardar el parámetro");
    } finally {
      setGuardando(null);
    }
  };

  const usarGeneral = async (categoria) => {
    setGuardando(categoria.id_categoria);
    try {
      const respuesta = await eliminarParametroCategoria(categoria.id_categoria);
      mostrarMensaje(respuesta.message || "La categoría usa el valor general");
      await cargar();
    } catch (err) {
      setError(err.response?.data?.message || "No se pudo restablecer el valor");
    } finally {
      setGuardando(null);
    }
  };

  const categoriasFiltradas = categorias.filter((c) =>
    c.categoria.toLowerCase().includes(busqueda.trim().toLowerCase()),
  );
  const personalizadas = categorias.filter((c) => !c.usa_general).length;

  return (
    <Layout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Parámetros de vencimiento</h1>
          <p className="text-sm text-gray-500">
            Días de anticipación con los que se generan las alertas de
            vencimiento según la categoría del producto
          </p>
        </div>

        {mensaje && (
          <p className="rounded bg-green-50 p-2 text-sm text-green-700">
            {mensaje}
          </p>
        )}
        {error && (
          <p className="rounded bg-red-50 p-2 text-sm text-red-600">{error}</p>
        )}

        <section className="card">
          <h2 className="mb-1 text-lg font-semibold">Valor general</h2>
          <p className="mb-3 text-sm text-gray-500">
            Se aplica a todas las categorías que no tienen un valor propio.
          </p>
          <div className="flex flex-wrap items-start gap-3">
            <div>
              <input
                type="number"
                min="1"
                max={DIAS_MAXIMOS}
                step="1"
                className="input-field w-32"
                value={generalEditado}
                disabled={!puedeEditar}
                onChange={(e) => {
                  setGeneralEditado(e.target.value);
                  setErrores({ ...errores, general: "" });
                }}
              />
              {errores.general && (
                <p className="mt-1 text-xs text-red-600">{errores.general}</p>
              )}
            </div>
            <span className="py-2 text-sm text-gray-600">días</span>
            {puedeEditar && (
              <button
                className="btn-primary"
                disabled={guardando === "general" || generalEditado === String(general)}
                onClick={guardarGeneral}
              >
                {guardando === "general" ? "Guardando..." : "Guardar"}
              </button>
            )}
          </div>
        </section>

        <section className="card">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">Por categoría</h2>
              <p className="text-sm text-gray-500">
                {personalizadas} de {categorias.length} categoría
                {categorias.length !== 1 && "s"} con valor propio
              </p>
            </div>
            <input
              className="input-field w-64"
              placeholder="Buscar categoría..."
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
            />
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-left text-gray-500">
                  <th className="py-2">Categoría</th>
                  <th className="py-2">Días de anticipación</th>
                  <th className="py-2">Valor aplicado</th>
                  {puedeEditar && <th className="py-2 text-right">Acciones</th>}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan="4" className="py-6 text-center text-gray-500">
                      Cargando parámetros...
                    </td>
                  </tr>
                ) : categoriasFiltradas.length === 0 ? (
                  <tr>
                    <td colSpan="4" className="py-6 text-center text-gray-500">
                      No hay categorías para mostrar.
                    </td>
                  </tr>
                ) : (
                  categoriasFiltradas.map((categoria) => {
                    const id = categoria.id_categoria;
                    const valor = valores[id] ?? "";
                    const original =
                      categoria.dias_anticipacion == null
                        ? ""
                        : String(categoria.dias_anticipacion);
                    return (
                      <tr key={id} className="border-b border-gray-100 hover:bg-gray-50">
                        <td className="py-2">
                          <div className="font-medium">{categoria.categoria}</div>
                          {categoria.activo === false && (
                            <div className="text-xs text-gray-400">Inactiva</div>
                          )}
                        </td>
                        <td className="py-2">
                          <input
                            type="number"
                            min="1"
                            max={DIAS_MAXIMOS}
                            step="1"
                            className="input-field w-28"
                            placeholder={`General (${general})`}
                            value={valor}
                            disabled={!puedeEditar}
                            onChange={(e) => {
                              setValores({ ...valores, [id]: e.target.value });
                              setErrores({ ...errores, [id]: "" });
                            }}
                          />
                          {errores[id] && (
                            <p className="mt-1 text-xs text-red-600">{errores[id]}</p>
                          )}
                        </td>
                        <td className="py-2">
                          <span
                            className={`rounded px-2 py-1 text-xs font-semibold ${
                              categoria.usa_general
                                ? "bg-gray-100 text-gray-600"
                                : "bg-blue-100 text-blue-700"
                            }`}
                          >
                            {categoria.dias_aplicados} días
                            {categoria.usa_general ? " (general)" : " (propio)"}
                          </span>
                        </td>
                        {puedeEditar && (
                          <td className="py-2 text-right">
                            <div className="flex justify-end gap-2">
                              <button
                                className="btn-primary text-xs"
                                disabled={guardando === id || valor === "" || valor === original}
                                onClick={() => guardarCategoria(categoria)}
                              >
                                Guardar
                              </button>
                              {!categoria.usa_general && (
                                <button
                                  className="btn-secondary text-xs"
                                  disabled={guardando === id}
                                  onClick={() => usarGeneral(categoria)}
                                >
                                  Usar general
                                </button>
                              )}
                            </div>
                          </td>
                        )}
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </Layout>
  );
}
