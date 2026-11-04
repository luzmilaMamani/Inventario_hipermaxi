import { useEffect, useRef, useState } from "react";
import Layout from "../../components/layout/Layout";
import Badge from "../../components/ui/Badge";
import { buscarPorCodigoBarras } from "../../api/productos.api";

function formatearCantidad(valor) {
  return Number(valor ?? 0).toLocaleString("es-BO");
}

export default function BuscarCodigoBarras() {
  const inputRef = useRef(null);
  const ultimoCambio = useRef(0);
  const temporizador = useRef(null);
  const enCurso = useRef("");
  const [codigo, setCodigo] = useState("");
  const [producto, setProducto] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    inputRef.current?.focus();
    return () => clearTimeout(temporizador.current);
  }, []);

  const prepararSiguienteLectura = () => {
    inputRef.current?.focus();
    inputRef.current?.select();
  };

  const buscarCodigo = async (valor) => {
    const limpio = String(valor || "").trim();
    clearTimeout(temporizador.current);
    if (!limpio) {
      setError("Ingresa un código de barras");
      setProducto(null);
      return;
    }
    if (enCurso.current === limpio) return;

    enCurso.current = limpio;
    setLoading(true);
    setError("");
    setProducto(null);

    try {
      const res = await buscarPorCodigoBarras(limpio);
      setProducto(res.data);
    } catch (err) {
      setError(
        err.response?.data?.message ||
          `No existe un producto con el código de barras ${limpio}`,
      );
    } finally {
      enCurso.current = "";
      setLoading(false);
      prepararSiguienteLectura();
    }
  };

  const buscar = (event) => {
    event.preventDefault();
    buscarCodigo(codigo);
  };

  const alEscribir = (valor) => {
    setCodigo(valor);
    const ahora = Date.now();
    const intervalo = ahora - ultimoCambio.current;
    ultimoCambio.current = ahora;
    clearTimeout(temporizador.current);
    if (intervalo > 0 && intervalo < 50 && valor.trim().length >= 4) {
      temporizador.current = setTimeout(() => buscarCodigo(valor), 80);
    }
  };

  const limpiar = () => {
    clearTimeout(temporizador.current);
    setCodigo("");
    setProducto(null);
    setError("");
    inputRef.current?.focus();
  };

  return (
    <Layout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Buscar por código de barras</h1>
          <p className="text-sm text-gray-500">
            Escanea el código para ver el stock disponible y la ubicación en cada almacén
          </p>
        </div>

        <div className="card max-w-3xl">
          <form onSubmit={buscar} className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium" htmlFor="codigo-barras">
                Código de barras
              </label>
              <div className="flex gap-2">
                <input
                  id="codigo-barras"
                  ref={inputRef}
                  className="input-field font-mono"
                  placeholder="Escanea o escribe el código"
                  value={codigo}
                  onChange={(event) => alEscribir(event.target.value)}
                  autoFocus
                  autoComplete="off"
                />
                <button
                  type="submit"
                  className="btn-primary whitespace-nowrap"
                  disabled={loading}
                >
                  {loading ? "Buscando..." : "Buscar"}
                </button>
                {(codigo || producto || error) && (
                  <button
                    type="button"
                    className="btn-secondary whitespace-nowrap"
                    onClick={limpiar}
                  >
                    Limpiar
                  </button>
                )}
              </div>
              <p className="mt-2 text-xs text-gray-500">
                El lector puede enviar el código y confirmar con Enter. El campo queda listo para el siguiente escaneo.
              </p>
            </div>
          </form>

          {error && (
            <p className="mt-4 rounded bg-red-50 p-3 text-sm text-red-600">{error}</p>
          )}

          {producto && (
            <div className="mt-6 border-t pt-6">
              <div className="mb-4 flex items-start justify-between gap-3">
                <div>
                  <p className="font-mono text-xs text-gray-500">{producto.codigo}</p>
                  <h2 className="text-xl font-bold">{producto.nombre}</h2>
                  <p className="font-mono text-sm text-gray-600">{producto.codigo_barras}</p>
                </div>
                <Badge estado={producto.estado} />
              </div>

              <div className="mb-4 grid grid-cols-2 gap-3 rounded-lg bg-slate-50 p-4 text-sm">
                <div>
                  <p className="text-gray-500">Stock disponible</p>
                  <p className="text-2xl font-bold">
                    {formatearCantidad(producto.cantidad_disponible)}
                  </p>
                </div>
                <div>
                  <p className="text-gray-500">Stock reservado</p>
                  <p className="text-2xl font-bold">
                    {formatearCantidad(producto.cantidad_reservada)}
                  </p>
                </div>
              </div>

              <div className="mb-6 grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-gray-500">Categoría</p>
                  <p className="font-medium">{producto.categoria}</p>
                </div>
                <div>
                  <p className="text-gray-500">Marca</p>
                  <p className="font-medium">{producto.marca || "-"}</p>
                </div>
                <div>
                  <p className="text-gray-500">Perecible</p>
                  <p className="font-medium">{producto.perecible ? "Sí" : "No"}</p>
                </div>
                <div>
                  <p className="text-gray-500">Requiere refrigeración</p>
                  <p className="font-medium">
                    {producto.requiere_refrigeracion ? "Sí" : "No"}
                  </p>
                </div>
              </div>

              <h3 className="mb-3 text-lg font-semibold">Stock y ubicación por almacén</h3>
              {(producto.almacenes || []).length === 0 ? (
                <p className="text-sm text-gray-500">
                  Este producto no tiene stock registrado en ningún almacén.
                </p>
              ) : (
                <div className="space-y-3">
                  {producto.almacenes.map((almacen) => (
                    <section key={almacen.id_almacen} className="rounded-lg border border-gray-200 p-3">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <p className="font-semibold">{almacen.almacen}</p>
                          <p className="font-mono text-xs text-gray-500">{almacen.almacen_codigo}</p>
                        </div>
                        <div className="text-right text-sm">
                          <p>
                            Disponible:{" "}
                            <span className="font-semibold">
                              {formatearCantidad(almacen.cantidad_disponible)}
                            </span>
                          </p>
                          <p className="text-gray-500">
                            Reservado: {formatearCantidad(almacen.cantidad_reservada)}
                          </p>
                        </div>
                      </div>
                      {almacen.ubicaciones.length === 0 ? (
                        <p className="mt-2 text-sm text-gray-500">Sin ubicación asignada</p>
                      ) : (
                        <ul className="mt-2 space-y-1 text-sm">
                          {almacen.ubicaciones.map((ubicacion) => (
                            <li
                              key={ubicacion.id_ubicacion}
                              className="flex items-center justify-between gap-3"
                            >
                              <span>
                                {ubicacion.direccion}
                                {ubicacion.tipo_ubicacion === "FRIO" ? " · Frío" : ""}
                              </span>
                              <span className="font-medium">
                                {formatearCantidad(ubicacion.cantidad)}
                              </span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </section>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}
