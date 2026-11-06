import { useEffect, useRef, useState } from "react";
import Layout from "../../components/layout/Layout";
import {
  buscarProductosEtiquetables,
  generarPdfEtiquetas,
} from "../../api/etiquetas.api";

const ETIQUETAS_POR_HOJA = 24;
const MAX_POR_PRODUCTO = 200;

function formatearPrecio(precio) {
  return `Bs ${Number(precio || 0).toLocaleString("es-BO", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export default function ImprimirEtiquetas() {
  const [busqueda, setBusqueda] = useState("");
  const [resultados, setResultados] = useState([]);
  const [buscando, setBuscando] = useState(false);
  const [seleccion, setSeleccion] = useState([]);
  const [posicionInicial, setPosicionInicial] = useState(1);
  const [pdfUrl, setPdfUrl] = useState("");
  const [generando, setGenerando] = useState(false);
  const [error, setError] = useState("");
  const iframeRef = useRef(null);

  // Búsqueda con espera para no consultar en cada tecla. Solo trae productos activos.
  useEffect(() => {
    const termino = busqueda.trim();
    if (termino.length < 2) {
      setResultados([]);
      return undefined;
    }
    const temporizador = setTimeout(() => {
      setBuscando(true);
      buscarProductosEtiquetables(termino)
        .then((respuesta) => setResultados(respuesta.data || []))
        .catch(() => setResultados([]))
        .finally(() => setBuscando(false));
    }, 300);
    return () => clearTimeout(temporizador);
  }, [busqueda]);

  // Libera la URL del PDF anterior.
  useEffect(() => () => pdfUrl && URL.revokeObjectURL(pdfUrl), [pdfUrl]);

  const invalidarVistaPrevia = () => setPdfUrl("");

  const agregar = (producto) => {
    invalidarVistaPrevia();
    setSeleccion((actual) =>
      actual.some((item) => item.id_producto === producto.id_producto)
        ? actual.map((item) =>
            item.id_producto === producto.id_producto
              ? { ...item, cantidad: Math.min(Number(item.cantidad) + 1, MAX_POR_PRODUCTO) }
              : item,
          )
        : [...actual, { ...producto, cantidad: 1 }],
    );
  };

  const cambiarCantidad = (id, valor) => {
    invalidarVistaPrevia();
    setSeleccion((actual) =>
      actual.map((item) => (item.id_producto === id ? { ...item, cantidad: valor } : item)),
    );
  };

  const quitar = (id) => {
    invalidarVistaPrevia();
    setSeleccion((actual) => actual.filter((item) => item.id_producto !== id));
  };

  const cantidadValida = (valor) => {
    const n = Number(valor);
    return Number.isInteger(n) && n >= 1 && n <= MAX_POR_PRODUCTO;
  };

  const total = seleccion.reduce((suma, item) => suma + (Number(item.cantidad) || 0), 0);
  const hojas = Math.ceil((total + (posicionInicial - 1)) / ETIQUETAS_POR_HOJA);
  const seleccionValida =
    seleccion.length > 0 && seleccion.every((item) => cantidadValida(item.cantidad));

  const generar = async () => {
    if (!seleccionValida) {
      setError(`Cada producto debe tener entre 1 y ${MAX_POR_PRODUCTO} etiquetas`);
      return null;
    }
    setGenerando(true);
    setError("");
    try {
      const pdf = await generarPdfEtiquetas(
        seleccion.map((item) => ({
          id_producto: item.id_producto,
          cantidad: Number(item.cantidad),
        })),
        posicionInicial - 1,
      );
      const url = URL.createObjectURL(new Blob([pdf], { type: "application/pdf" }));
      setPdfUrl(url);
      return url;
    } catch (err) {
      setError(err.response?.data?.message || "No se pudieron generar las etiquetas");
      return null;
    } finally {
      setGenerando(false);
    }
  };

  const imprimir = async () => {
    if (!pdfUrl) {
      // Genera la vista previa y, cuando el visor carga el PDF, abre la impresión.
      const url = await generar();
      if (!url) return;
      const iframe = iframeRef.current;
      if (iframe) {
        iframe.onload = () => {
          iframe.onload = null;
          iframe.contentWindow?.print();
        };
      }
      return;
    }
    iframeRef.current?.contentWindow?.print();
  };

  return (
    <Layout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Imprimir etiquetas</h1>
          <p className="text-sm text-gray-500">
            Etiquetas con código de barras, nombre y precio para identificar
            los productos en los estantes (hoja A4 de 24 etiquetas de 63,5 × 33,9 mm)
          </p>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <section className="card space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium" htmlFor="buscar-producto">
                Buscar producto
              </label>
              <input
                id="buscar-producto"
                className="input-field"
                placeholder="Nombre, código o código de barras..."
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
              />
              <p className="mt-1 text-xs text-gray-500">
                Solo se muestran productos activos.
              </p>
            </div>

            {buscando && <p className="text-sm text-gray-500">Buscando...</p>}
            {!buscando && busqueda.trim().length >= 2 && resultados.length === 0 && (
              <p className="text-sm text-gray-500">No se encontraron productos activos.</p>
            )}
            {resultados.length > 0 && (
              <ul className="max-h-56 divide-y divide-gray-100 overflow-y-auto rounded border border-gray-200">
                {resultados.map((producto) => (
                  <li
                    key={producto.id_producto}
                    className="flex items-center justify-between gap-3 px-3 py-2 text-sm"
                  >
                    <div>
                      <div className="font-medium">{producto.nombre}</div>
                      <div className="font-mono text-xs text-gray-500">
                        {producto.codigo_barras || `${producto.codigo} (sin código de barras)`}
                        {" · "}
                        {formatearPrecio(producto.precio)}
                      </div>
                    </div>
                    <button className="btn-secondary text-xs" onClick={() => agregar(producto)}>
                      Agregar
                    </button>
                  </li>
                ))}
              </ul>
            )}

            <div>
              <h2 className="mb-2 font-semibold">Productos seleccionados</h2>
              {seleccion.length === 0 ? (
                <p className="text-sm text-gray-500">
                  Agregue uno o varios productos para generar sus etiquetas.
                </p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 text-left text-gray-500">
                      <th className="py-2">Producto</th>
                      <th className="py-2">Etiquetas</th>
                      <th className="py-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {seleccion.map((item) => (
                      <tr key={item.id_producto} className="border-b border-gray-100">
                        <td className="py-2">
                          <div className="font-medium">{item.nombre}</div>
                          <div className="font-mono text-xs text-gray-500">
                            {item.codigo_barras || item.codigo}
                          </div>
                        </td>
                        <td className="py-2">
                          <input
                            type="number"
                            min="1"
                            max={MAX_POR_PRODUCTO}
                            step="1"
                            className={`input-field w-24 ${
                              cantidadValida(item.cantidad) ? "" : "border-red-400"
                            }`}
                            value={item.cantidad}
                            onChange={(e) => cambiarCantidad(item.id_producto, e.target.value)}
                          />
                        </td>
                        <td className="py-2 text-right">
                          <button
                            className="text-xs text-red-600 hover:underline"
                            onClick={() => quitar(item.id_producto)}
                          >
                            Quitar
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            <div className="flex flex-wrap items-end gap-4">
              <div>
                <label className="mb-1 block text-sm font-medium" htmlFor="posicion-inicial">
                  Empezar en la etiqueta N°
                </label>
                <input
                  id="posicion-inicial"
                  type="number"
                  min="1"
                  max={ETIQUETAS_POR_HOJA}
                  className="input-field w-24"
                  value={posicionInicial}
                  onChange={(e) => {
                    invalidarVistaPrevia();
                    const n = Math.min(Math.max(Number(e.target.value) || 1, 1), ETIQUETAS_POR_HOJA);
                    setPosicionInicial(n);
                  }}
                />
              </div>
              <p className="pb-2 text-sm text-gray-600">
                {total} etiqueta{total !== 1 && "s"}
                {total > 0 && ` · ${hojas} hoja${hojas !== 1 ? "s" : ""}`}
              </p>
            </div>

            {error && <p className="rounded bg-red-50 p-2 text-sm text-red-600">{error}</p>}

            <div className="flex flex-wrap gap-2">
              <button
                className="btn-secondary"
                disabled={generando || !seleccionValida}
                onClick={generar}
              >
                {generando ? "Generando..." : "Vista previa"}
              </button>
              <button
                className="btn-primary"
                disabled={generando || !seleccionValida}
                onClick={imprimir}
              >
                Imprimir
              </button>
              {pdfUrl && (
                <a className="btn-secondary" href={pdfUrl} download="etiquetas.pdf">
                  Descargar PDF
                </a>
              )}
            </div>
          </section>

          <section className="card">
            <h2 className="mb-3 font-semibold">Vista previa</h2>
            <iframe
              ref={iframeRef}
              title="Vista previa de etiquetas"
              src={pdfUrl || "about:blank"}
              className={`h-[640px] w-full rounded border border-gray-200 ${
                pdfUrl ? "" : "hidden"
              }`}
            />
            {!pdfUrl && (
              <div className="flex h-[640px] items-center justify-center rounded border border-dashed border-gray-300 text-sm text-gray-500">
                Pulse “Vista previa” para ver las etiquetas antes de imprimir.
              </div>
            )}
          </section>
        </div>
      </div>
    </Layout>
  );
}
