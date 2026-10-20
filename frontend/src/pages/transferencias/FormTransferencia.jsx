import { useEffect, useState } from "react";
import Modal from "../../components/ui/Modal";
import Select from "../../components/ui/Select";
import { crearTransferencia } from "../../api/transferencias.api";
import { listarAlmacenes } from "../../api/almacenes.api";
import { listarProductos } from "../../api/productos.api";

const FORM_INICIAL = {
  almacen_origen: "",
  almacen_destino: "",
  observaciones: "",
};

export default function FormTransferencia({ onClose, onSaved }) {
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

  const agregarDetalle = () => {
    setError("");
    if (!productoActual.id_producto) return setError("Selecciona un producto");
    if (!productoActual.cantidad || Number(productoActual.cantidad) <= 0)
      return setError("Cantidad inválida");
    if (detalles.some((d) => d.id_producto === productoActual.id_producto))
      return setError("Producto ya agregado");

    setDetalles([
      ...detalles,
      {
        id_producto: productoActual.id_producto,
        cantidad: Number(productoActual.cantidad),
      },
    ]);
    setProductoActual({ id_producto: "", cantidad: "" });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (!form.almacen_origen) return setError("Selecciona almacén de origen");
    if (!form.almacen_destino) return setError("Selecciona almacén de destino");
    if (form.almacen_origen === form.almacen_destino)
      return setError("El origen y destino deben ser diferentes");
    if (detalles.length === 0) return setError("Agrega al menos un producto");

    setGuardando(true);
    try {
      await crearTransferencia({
        almacen_origen: Number(form.almacen_origen),
        almacen_destino: Number(form.almacen_destino),
        observaciones: form.observaciones.trim() || null,
        detalles: detalles.map((d) => ({
          id_producto: Number(d.id_producto),
          cantidad: Number(d.cantidad),
        })),
      });
      onSaved();
    } catch (err) {
      setError(err.response?.data?.message || "Error al crear transferencia");
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

  return (
    <Modal open={true} onClose={onClose} title="Solicitar Transferencia">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Select
            label="Almacén Origen *"
            value={form.almacen_origen}
            onChange={(e) =>
              setForm({ ...form, almacen_origen: e.target.value })
            }
            options={opcionesAlmacenes}
            placeholder="Selecciona origen"
          />
          <Select
            label="Almacén Destino *"
            value={form.almacen_destino}
            onChange={(e) =>
              setForm({ ...form, almacen_destino: e.target.value })
            }
            options={opcionesAlmacenes}
            placeholder="Selecciona destino"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">
            Observaciones
          </label>
          <textarea
            className="input-field"
            rows="2"
            value={form.observaciones}
            onChange={(e) =>
              setForm({ ...form, observaciones: e.target.value })
            }
            placeholder="Motivo de la transferencia..."
          />
        </div>
        <hr />
        <div>
          <p className="text-sm font-semibold mb-2">Productos a transferir</p>
          <div className="grid grid-cols-[1fr_100px_auto] gap-2 items-end">
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
              />
            </div>
            <button
              type="button"
              className="btn-secondary"
              onClick={agregarDetalle}
            >
              + Agregar
            </button>
          </div>
          {detalles.length > 0 && (
            <ul className="mt-3 border rounded p-2 space-y-1 text-sm">
              {detalles.map((d) => (
                <li key={d.id_producto} className="flex justify-between">
                  <span>
                    {
                      opcionesProductos.find((p) => p.value === d.id_producto)
                        ?.label
                    }
                  </span>
                  <span>{d.cantidad} uds.</span>
                </li>
              ))}
            </ul>
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
            {guardando ? "Solicitando..." : "Solicitar Transferencia"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
