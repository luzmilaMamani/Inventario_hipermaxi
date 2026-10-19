import { useEffect, useState } from "react";
import Modal from "../../components/ui/Modal";
import Select from "../../components/ui/Select";
import { crearSalida } from "../../api/salidas.api";
import { listarAlmacenes } from "../../api/almacenes.api";
import { listarProductos } from "../../api/productos.api";

const MOTIVOS = [
  { value: "VENTA", label: "Venta" },
  { value: "PERDIDA", label: "Pérdida" },
  { value: "DANO", label: "Daño" },
  { value: "VENCIMIENTO", label: "Vencimiento" },
  { value: "AJUSTE", label: "Ajuste" },
  { value: "TRANSFERENCIA", label: "Transferencia" },
  { value: "OTRO", label: "Otro" },
];

const SUBTIPOS_PERDIDA = [
  { value: "ROBO", label: "Robo" },
  { value: "EXTRAVIO", label: "Extravío" },
  { value: "OTRO", label: "Otro" },
];

const SUBTIPOS_DANO = [
  { value: "ROTO", label: "Roto" },
  { value: "DETERIORO", label: "Deteriorado" },
  { value: "INUTILIZABLE", label: "Inutilizable" },
  { value: "OTRO", label: "Otro" },
];

const FORM_INICIAL = {
  id_almacen: "",
  motivo: "PERDIDA",
  subtipo_perdida: "",
  observaciones: "",
  referencia_externa: "",
};

export default function FormSalida({ onClose, onSaved }) {
  const [form, setForm] = useState(FORM_INICIAL);
  const [detalles, setDetalles] = useState([]);
  const [productoActual, setProductoActual] = useState({
    id_producto: "",
    cantidad: "",
  });

  const [almacenes, setAlmacenes] = useState([]);
  const [productos, setProductos] = useState([]);
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);

  const esPerdida = form.motivo === "PERDIDA";
  const esDano = form.motivo === "DANO";
  const esVencimiento = form.motivo === "VENCIMIENTO";
  const esOtro = form.motivo === "OTRO";

  const requiereSubtipo = esPerdida || esDano;
  const requiereObservacion = esPerdida || esDano || esVencimiento || esOtro;

  useEffect(() => {
    listarAlmacenes({
      limit: 200,
      activo: "true",
      orderBy: "nombre",
      order: "ASC",
    })
      .then((res) => setAlmacenes(res.data || []))
      .catch(() => setAlmacenes([]));

    listarProductos({ limit: 200, estado: "ACTIVO" })
      .then((res) => setProductos(res.data || []))
      .catch(() => setProductos([]));
  }, []);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm({ ...form, [name]: value });
  };

  const handleMotivoChange = (e) => {
    const nuevoMotivo = e.target.value;
    setForm({
      ...form,
      motivo: nuevoMotivo,
      subtipo_perdida: "",
    });
  };

  const agregarDetalle = () => {
    setError("");
    if (!productoActual.id_producto) {
      setError("Selecciona un producto");
      return;
    }
    if (!productoActual.cantidad || Number(productoActual.cantidad) <= 0) {
      setError("La cantidad debe ser mayor a 0");
      return;
    }
    if (detalles.some((d) => d.id_producto === productoActual.id_producto)) {
      setError("El producto ya está en la lista");
      return;
    }
    setDetalles([
      ...detalles,
      {
        id_producto: productoActual.id_producto,
        cantidad: Number(productoActual.cantidad),
      },
    ]);
    setProductoActual({ id_producto: "", cantidad: "" });
  };

  const quitarDetalle = (id_producto) => {
    setDetalles(detalles.filter((d) => d.id_producto !== id_producto));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (!form.id_almacen) return setError("El almacén es obligatorio");
    if (detalles.length === 0) return setError("Agrega al menos un producto");

    if (requiereObservacion) {
      if (!form.observaciones || form.observaciones.trim().length < 5) {
        return setError(
          `Para este tipo de salida (${form.motivo}) la observación es obligatoria (mínimo 5 caracteres)`,
        );
      }
    }

    setGuardando(true);
    try {
      const payload = {
        id_almacen: Number(form.id_almacen),
        motivo: form.motivo,
        subtipo_perdida: requiereSubtipo ? form.subtipo_perdida || null : null,
        observaciones: form.observaciones.trim() || null,
        referencia_externa: form.referencia_externa.trim() || null,
        detalles: detalles.map((d) => ({
          id_producto: Number(d.id_producto),
          cantidad: Number(d.cantidad),
        })),
      };
      await crearSalida(payload);
      onSaved();
    } catch (err) {
      setError(err.response?.data?.message || "Error al registrar la salida");
    } finally {
      setGuardando(false);
    }
  };

  const opcionesAlmacenes = almacenes.map((a) => ({
    value: a.id_almacen,
    label: `${a.codigo} - ${a.nombre}`,
  }));

  const opcionesProductos = productos.map((p) => ({
    value: p.id_producto,
    label: `${p.codigo} - ${p.nombre}`,
  }));

  const nombreProducto = (id) => {
    const p = productos.find((x) => Number(x.id_producto) === Number(id));
    return p ? `${p.codigo} - ${p.nombre}` : `Producto #${id}`;
  };

  let titulo = "Registrar salida";
  if (esPerdida) titulo = "Registrar pérdida";
  else if (esDano) titulo = "Registrar daño";
  else if (esVencimiento) titulo = "Registrar vencimiento";

  return (
    <Modal open={true} onClose={onClose} title={titulo}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Select
            label="Almacén *"
            value={form.id_almacen}
            onChange={(e) => setForm({ ...form, id_almacen: e.target.value })}
            options={opcionesAlmacenes}
            placeholder="Selecciona almacén"
          />
          <Select
            label="Motivo *"
            value={form.motivo}
            onChange={handleMotivoChange}
            options={MOTIVOS}
            placeholder="Selecciona motivo"
          />
        </div>

        {esPerdida && (
          <Select
            label="Subtipo de pérdida"
            value={form.subtipo_perdida}
            onChange={(e) =>
              setForm({ ...form, subtipo_perdida: e.target.value })
            }
            options={SUBTIPOS_PERDIDA}
            placeholder="Selecciona subtipo (opcional)"
          />
        )}

        {esDano && (
          <Select
            label="Subtipo de daño"
            value={form.subtipo_perdida}
            onChange={(e) =>
              setForm({ ...form, subtipo_perdida: e.target.value })
            }
            options={SUBTIPOS_DANO}
            placeholder="Selecciona subtipo (opcional)"
          />
        )}

        <div>
          <label className="block text-sm font-medium mb-1">
            Observaciones {requiereObservacion && "*"}
          </label>
          <textarea
            className="input-field"
            name="observaciones"
            rows="3"
            value={form.observaciones}
            onChange={handleChange}
            placeholder={
              esDano
                ? "Describe el daño (obligatorio)"
                : esPerdida
                  ? "Describe el motivo de la pérdida (obligatorio)"
                  : esVencimiento
                    ? "Describe el lote vencido (obligatorio)"
                    : esOtro
                      ? "Explica el motivo de la salida (obligatorio)"
                      : "Observaciones (opcional)"
            }
            required={requiereObservacion}
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">
            Referencia externa
          </label>
          <input
            className="input-field"
            name="referencia_externa"
            value={form.referencia_externa}
            onChange={handleChange}
            placeholder="Ej. acta, ticket, etc. (opcional)"
          />
        </div>

        <hr />

        <div>
          <p className="text-sm font-semibold mb-2">Productos de la salida</p>

          <div className="grid grid-cols-1 md:grid-cols-[1fr_100px_auto] gap-2 items-end">
            <Select
              label="Producto"
              value={productoActual.id_producto}
              onChange={(e) =>
                setProductoActual({
                  ...productoActual,
                  id_producto: e.target.value,
                })
              }
              options={opcionesProductos}
              placeholder="Selecciona producto"
            />
            <div>
              <label className="block text-sm font-medium mb-1">Cantidad</label>
              <input
                type="number"
                min="1"
                className="input-field"
                value={productoActual.cantidad}
                onChange={(e) =>
                  setProductoActual({
                    ...productoActual,
                    cantidad: e.target.value,
                  })
                }
                placeholder="0"
              />
            </div>
            <button
              type="button"
              className="btn-secondary whitespace-nowrap"
              onClick={agregarDetalle}
            >
              + Agregar
            </button>
          </div>

          {detalles.length > 0 && (
            <div className="mt-3 border rounded overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-gray-600">
                  <tr>
                    <th className="text-left py-2 px-3">Producto</th>
                    <th className="text-right py-2 px-3">Cantidad</th>
                    <th className="text-right py-2 px-3">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {detalles.map((d) => (
                    <tr key={d.id_producto} className="border-t">
                      <td className="py-2 px-3">
                        {nombreProducto(d.id_producto)}
                      </td>
                      <td className="py-2 px-3 text-right">{d.cantidad}</td>
                      <td className="py-2 px-3 text-right">
                        <button
                          type="button"
                          className="text-red-600 hover:underline text-sm font-medium"
                          onClick={() => quitarDetalle(d.id_producto)}
                        >
                          Quitar
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {error && (
          <p className="text-sm text-red-600 bg-red-50 p-2 rounded">{error}</p>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            className="btn-secondary"
            onClick={onClose}
            disabled={guardando}
          >
            Cancelar
          </button>
          <button type="submit" className="btn-primary" disabled={guardando}>
            {guardando
              ? "Guardando..."
              : esDano
                ? "Registrar daño"
                : esPerdida
                  ? "Registrar pérdida"
                  : esVencimiento
                    ? "Registrar vencimiento"
                    : "Registrar salida"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
