import { useEffect, useState } from "react";
import Modal from "../../components/ui/Modal";
import Select from "../../components/ui/Select";
import {
  obtenerStockUbicacion,
} from "../../api/ubicaciones.api";
import {
  asignarProductoAUbicacion,
  actualizarCantidadUbicacion,
  quitarProductoDeUbicacion,
} from "../../api/stockUbicaciones.api";
import { listarProductos } from "../../api/productos.api";

export default function StockUbicacion({ ubicacion, onClose, onChanged }) {
  const [stock, setStock] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [mostrarForm, setMostrarForm] = useState(false);
  const [productos, setProductos] = useState([]);
  const [form, setForm] = useState({ id_producto: "", cantidad: "" });
  const [guardando, setGuardando] = useState(false);

  const cargarStock = () => {
    if (!ubicacion) return;
    setLoading(true);
    setError("");
    obtenerStockUbicacion(ubicacion.id_ubicacion)
      .then((res) => setStock(res.data))
      .catch((err) =>
        setError(err.response?.data?.message || "Error al cargar stock")
      )
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    cargarStock();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ubicacion]);

  const abrirForm = async () => {
    setMostrarForm(true);
    setForm({ id_producto: "", cantidad: "" });
    try {
      const res = await listarProductos({ limit: 200, estado: "ACTIVO" });
      setProductos(res.data);
    } catch {
      setProductos([]);
    }
  };

  const asignar = async (e) => {
    e.preventDefault();
    setError("");

    if (!form.id_producto || !form.cantidad) {
      setError("Producto y cantidad son obligatorios");
      return;
    }
    if (Number(form.cantidad) <= 0) {
      setError("La cantidad debe ser mayor a 0");
      return;
    }

    setGuardando(true);
    try {
      await asignarProductoAUbicacion({
        id_producto: Number(form.id_producto),
        id_ubicacion: ubicacion.id_ubicacion,
        cantidad: Number(form.cantidad),
      });
      setMostrarForm(false);
      cargarStock();
      if (onChanged) onChanged();
    } catch (err) {
      setError(err.response?.data?.message || "Error al asignar producto");
    } finally {
      setGuardando(false);
    }
  };

  const cambiarCantidad = async (item, nuevaCantidad) => {
    if (Number(nuevaCantidad) < 0) return;
    try {
      await actualizarCantidadUbicacion(item.id_stock_ubicacion, Number(nuevaCantidad));
      cargarStock();
      if (onChanged) onChanged();
    } catch (err) {
      setError(err.response?.data?.message || "Error al actualizar");
    }
  };

  const quitar = async (item) => {
    if (!window.confirm(`¿Quitar "${item.producto}" de esta ubicación?`)) return;
    try {
      await quitarProductoDeUbicacion(item.id_stock_ubicacion);
      cargarStock();
      if (onChanged) onChanged();
    } catch (err) {
      setError(err.response?.data?.message || "Error al quitar");
    }
  };

  const opcionesProductos = productos.map((p) => ({
    value: p.id_producto,
    label: `${p.codigo} - ${p.nombre}`,
  }));

  return (
    <Modal
      open={!!ubicacion}
      onClose={onClose}
      title={`Stock en ${ubicacion?.zona || ""} ${ubicacion?.pasillo || ""} ${ubicacion?.estante || ""}`}
    >
      {ubicacion && (
        <div className="space-y-4">
          <div className="flex justify-between items-start">
            <div className="text-sm text-gray-600">
              <p>
                <strong>Almacén:</strong> {ubicacion.almacen}
              </p>
              <p>
                <strong>Ubicación:</strong>{" "}
                {[ubicacion.zona, ubicacion.pasillo, ubicacion.estante, ubicacion.nivel]
                  .filter(Boolean)
                  .join(" / ")}
              </p>
            </div>
            <button className="btn-primary text-sm" onClick={abrirForm}>
              + Asignar producto
            </button>
          </div>

          <hr />

          {error && (
            <p className="text-sm text-red-600 bg-red-50 p-2 rounded">
              {error}
            </p>
          )}

          {loading && (
            <p className="text-gray-500 text-sm">Cargando stock...</p>
          )}

          {!loading && stock.length === 0 && (
            <p className="text-gray-500 text-sm">
              No hay productos en esta ubicación.
            </p>
          )}

          {!loading && stock.length > 0 && (
            <div className="max-h-72 overflow-y-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left border-b border-gray-200 text-gray-500">
                    <th className="py-2">Producto</th>
                    <th className="py-2 text-right">Cantidad</th>
                    <th className="py-2 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {stock.map((s) => (
                    <tr
                      key={s.id_stock_ubicacion}
                      className="border-b border-gray-100"
                    >
                      <td className="py-2">
                        <div className="font-medium">{s.producto}</div>
                        <div className="text-xs text-gray-500 font-mono">
                          {s.producto_codigo}
                        </div>
                      </td>
                      <td className="py-2 text-right">
                        <input
                          type="number"
                          min="0"
                          step="1"
                          className="input-field text-right w-24 inline-block"
                          defaultValue={s.cantidad}
                          onBlur={(e) => {
                            if (Number(e.target.value) !== Number(s.cantidad)) {
                              cambiarCantidad(s, e.target.value);
                            }
                          }}
                        />
                      </td>
                      <td className="py-2 text-right">
                        <button
                          className="text-red-600 hover:underline text-sm font-medium"
                          onClick={() => quitar(s)}
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

          {mostrarForm && (
            <form
              onSubmit={asignar}
              className="border-t pt-4 space-y-3"
            >
              <Select
                label="Producto"
                value={form.id_producto}
                onChange={(e) =>
                  setForm({ ...form, id_producto: e.target.value })
                }
                options={opcionesProductos}
                placeholder="Selecciona un producto"
              />
              <div>
                <label className="block text-sm font-medium mb-1">
                  Cantidad
                </label>
                <input
                  type="number"
                  min="1"
                  className="input-field"
                  value={form.cantidad}
                  onChange={(e) =>
                    setForm({ ...form, cantidad: e.target.value })
                  }
                  placeholder="10"
                />
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  className="btn-secondary text-sm"
                  onClick={() => setMostrarForm(false)}
                  disabled={guardando}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="btn-primary text-sm"
                  disabled={guardando}
                >
                  {guardando ? "Guardando..." : "Asignar"}
                </button>
              </div>
            </form>
          )}

          <div className="flex justify-end pt-2">
            <button className="btn-secondary" onClick={onClose}>
              Cerrar
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}