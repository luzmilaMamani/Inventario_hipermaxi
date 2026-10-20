import { useEffect, useState } from "react";
import Layout from "../../components/layout/Layout";
import Select from "../../components/ui/Select";
import { listarAlmacenes } from "../../api/almacenes.api";
import { registrarRecepcion } from "../../api/entradas.api";
import { listarProductos } from "../../api/productos.api";
import { registrarDiferencia } from "../../api/diferencias.api";

const crearDetalleVacio = () => ({
  id_producto: "",
  cantidad_solicitada: "",
  cantidad_recibida: "",
  observaciones: "",
});

// Lógica del Frontend de HIP-29
function evaluarDetalle(detalle) {
  const esp = String(detalle.cantidad_solicitada ?? "").trim();
  const rec = String(detalle.cantidad_recibida ?? "").trim();
  if (!esp || !rec) return { estado: "" };
  const nEsp = Number(esp);
  const nRec = Number(rec);
  if (nEsp <= 0 || nRec <= 0) return { estado: "CERO" };
  if (nEsp === nRec) return { estado: "CONFORME" };
  return { estado: "CON_DIFERENCIA", diferencia: nRec - nEsp };
}

function EtiquetaVerificacion({ detalle }) {
  const evalRes = evaluarDetalle(detalle);
  if (evalRes.estado === "CERO") return <span className="text-red-600 text-sm font-medium">Debe ser mayor a 0</span>;
  if (evalRes.estado === "CONFORME") return <span className="px-2 py-1 bg-green-100 text-green-700 rounded-full text-xs font-semibold">Conforme</span>;
  if (evalRes.estado === "CON_DIFERENCIA") return <span className="px-2 py-1 bg-amber-100 text-amber-700 rounded-full text-xs font-semibold">Diferencia: {evalRes.diferencia > 0 ? "+" : ""}{evalRes.diferencia}</span>;
  return <span className="text-gray-400 text-sm">Pendiente</span>;
}

export default function RegistrarRecepcion() {
  const [almacenes, setAlmacenes] = useState([]);
  const [productos, setProductos] = useState([]);
  const [form, setForm] = useState({ id_almacen: "", proveedor: "", referencia_externa: "", observaciones: "" });
  const [detalles, setDetalles] = useState([crearDetalleVacio()]);
  const [loadingCatalogos, setLoadingCatalogos] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");
  const [confirmacion, setConfirmacion] = useState("");

  useEffect(() => {
    Promise.all([
      listarAlmacenes({ limit: 200, activo: true, orderBy: "nombre", order: "ASC" }),
      listarProductos({ limit: 200, estado: "ACTIVO", orderBy: "nombre", order: "ASC" }),
    ])
      .then(([respAlmacenes, respProductos]) => {
        setAlmacenes(respAlmacenes.data);
        setProductos(respProductos.data);
      })
      .catch((err) => setError(err.response?.data?.message || "Error al cargar catálogos"))
      .finally(() => setLoadingCatalogos(false));
  }, []);

  const actualizarDetalle = (indice, campo, valor) => {
    setDetalles((actuales) =>
      actuales.map((detalle, pos) => (pos === indice ? { ...detalle, [campo]: valor } : detalle))
    );
  };

  const enviarRecepcion = async (event) => {
    event.preventDefault();
    setError("");
    setConfirmacion("");

    if (!form.id_almacen) return setError("Debe seleccionar un almacén");
    if (!form.proveedor.trim()) return setError("El proveedor es obligatorio");
    if (detalles.some((d) => !d.id_producto || !d.cantidad_solicitada || !d.cantidad_recibida)) {
      return setError("Complete los productos e indique la cantidad esperada y la recibida.");
    }

    setGuardando(true);
    try {
      // 1. Guardar la recepción (incluye la verificación del HIP-29 en el backend de RV)
      const respuesta = await registrarRecepcion({
        ...form,
        proveedor: form.proveedor.trim(),
        detalles: detalles.map((d) => ({
          ...d,
          cantidad_solicitada: Number(d.cantidad_solicitada),
          cantidad_recibida: Number(d.cantidad_recibida),
          observaciones: d.observaciones.trim() || null,
        })),
      });

      // 2. Guardar automáticamente las diferencias en la BD (HIP-30)
      for (const detalle of detalles) {
        const esp = Number(detalle.cantidad_solicitada);
        const rec = Number(detalle.cantidad_recibida);
        
        if (esp !== rec) {
          await registrarDiferencia({
            id_entrada: respuesta.data.id_entrada,
            id_producto: detalle.id_producto,
            tipo: rec < esp ? "FALTANTE" : "SOBRANTE",
            cantidad: Math.abs(esp - rec),
            observaciones: `Esperado: ${esp}, Recibido: ${rec}. ${detalle.observaciones || ""}`.trim(),
          });
        }
      }

      const conDiferencia = (respuesta.data.detalles || []).filter(
        (d) => d.estado_verificacion === "CON_DIFERENCIA"
      ).length;

      const mensajeVerificacion = respuesta.data.resultado_verificacion === "CONFORME"
        ? "La verificación quedó conforme."
        : `La verificación quedó con diferencia en ${conDiferencia} línea(s).`;

      setConfirmacion(`Recepción ${respuesta.data.numero_entrada} registrada y confirmada de forma atómica. ${mensajeVerificacion} El stock fue actualizado correctamente.`);
      
      setForm({ id_almacen: "", proveedor: "", referencia_externa: "", observaciones: "" });
      setDetalles([crearDetalleVacio()]);
    } catch (err) {
      setError(err.response?.data?.message || "No se pudo registrar la recepción");
    } finally {
      setGuardando(false);
    }
  };

  const opcionesAlmacenes = almacenes.map((a) => ({ value: a.id_almacen, label: `${a.codigo} - ${a.nombre}` }));
  const opcionesProductos = productos.map((p) => ({ value: p.id_producto, label: `${p.codigo} - ${p.nombre}` }));

  return (
    <Layout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Recepción de mercadería</h1>
          <p className="text-sm text-gray-500">Compara la cantidad recibida con la esperada (RF20) y registra diferencias (RF21)</p>
        </div>

        <form className="space-y-6" onSubmit={enviarRecepcion}>
          <section className="card space-y-4">
            <h2 className="text-lg font-semibold">Datos de la recepción</h2>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <Select label="Almacén *" value={form.id_almacen} onChange={(e) => setForm({ ...form, id_almacen: e.target.value })} options={opcionesAlmacenes} placeholder="Selecciona un almacén" disabled={loadingCatalogos || guardando} />
              <div>
                <label className="mb-1 block text-sm font-medium">Proveedor *</label>
                <input className="input-field" maxLength="150" required value={form.proveedor} onChange={(e) => setForm({ ...form, proveedor: e.target.value })} disabled={guardando} placeholder="Nombre del proveedor" />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">Referencia de factura o remisión</label>
                <input className="input-field" value={form.referencia_externa} onChange={(e) => setForm({ ...form, referencia_externa: e.target.value })} disabled={guardando} placeholder="Opcional" />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">Observaciones</label>
                <input className="input-field" value={form.observaciones} onChange={(e) => setForm({ ...form, observaciones: e.target.value })} disabled={guardando} placeholder="Opcional" />
              </div>
            </div>
          </section>

          <section className="card space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-lg font-semibold">Verificación por producto</h2>
              <button type="button" className="btn-secondary" disabled={guardando || detalles.length >= 100} onClick={() => setDetalles([...detalles, crearDetalleVacio()])}>
                + Agregar producto
              </button>
            </div>

            {loadingCatalogos ? (
              <p className="text-sm text-gray-500">Cargando catálogos...</p>
            ) : productos.length === 0 ? (
              <p className="text-sm text-amber-700">No hay productos activos disponibles.</p>
            ) : (
              <div className="space-y-3">
                {detalles.map((detalle, indice) => (
                  <div key={indice} className="grid grid-cols-1 items-end gap-3 rounded-lg border border-gray-200 p-3 md:grid-cols-12">
                    <div className="md:col-span-4">
                      <Select label="Producto *" value={detalle.id_producto} onChange={(e) => actualizarDetalle(indice, "id_producto", e.target.value)} options={opcionesProductos} placeholder="Selecciona un producto" disabled={guardando} />
                    </div>
                    <div className="md:col-span-2">
                      <label className="mb-1 block text-sm font-medium">Cant. Esperada *</label>
                      <input className="input-field" type="number" min="0.001" step="any" required value={detalle.cantidad_solicitada} onChange={(e) => actualizarDetalle(indice, "cantidad_solicitada", e.target.value)} disabled={guardando} />
                    </div>
                    <div className="md:col-span-2">
                      <label className="mb-1 block text-sm font-medium">Cant. Recibida *</label>
                      <input className="input-field" type="number" min="0.001" step="any" required value={detalle.cantidad_recibida} onChange={(e) => actualizarDetalle(indice, "cantidad_recibida", e.target.value)} disabled={guardando} />
                    </div>
                    <div className="md:col-span-3">
                      <p className="mb-1 block text-sm font-medium">Verificación</p>
                      <div className="flex min-h-10 items-center"><EtiquetaVerificacion detalle={detalle} /></div>
                    </div>
                    <div className="md:col-span-1">
                      <button type="button" className="btn-secondary w-full" disabled={guardando || detalles.length === 1} onClick={() => setDetalles((act) => act.filter((_, pos) => pos !== indice))}>×</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {error && <p className="rounded bg-red-50 p-3 text-sm text-red-600">{error}</p>}
          {confirmacion && <p className="rounded bg-green-50 p-3 text-sm text-green-700">{confirmacion}</p>}

          <div className="flex justify-end">
            <button type="submit" className="btn-primary" disabled={guardando || loadingCatalogos || productos.length === 0}>
              {guardando ? "Registrando..." : "Registrar recepción y verificar"}
            </button>
          </div>
        </form>
      </div>
    </Layout>
  );
}