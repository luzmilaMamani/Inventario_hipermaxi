import { useEffect, useState } from "react";
import Modal from "../../components/ui/Modal";
import Select from "../../components/ui/Select";
import { crearAlmacen, actualizarAlmacen } from "../../api/almacenes.api";

const TIPOS = [
  { value: "CENTRAL", label: "Central" },
  { value: "SUCURSAL", label: "Sucursal" },
  { value: "DEPOSITO", label: "Depósito" },
];

const FORM_INICIAL = {
  codigo: "",
  nombre: "",
  tipo: "SUCURSAL",
  direccion: "",
  ciudad: "",
  superficie_m2: 7280,
  activo: true,
};

export default function FormAlmacen({ almacen, onClose, onSaved }) {
  const [form, setForm] = useState(FORM_INICIAL);
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);

  const esEdicion = !!almacen;

  useEffect(() => {
    if (almacen) {
      setForm({
        codigo: almacen.codigo || "",
        nombre: almacen.nombre || "",
        tipo: almacen.tipo || "SUCURSAL",
        direccion: almacen.direccion || "",
        ciudad: almacen.ciudad || "",
        superficie_m2: almacen.superficie_m2 ?? 7280,
        activo: almacen.activo ?? true,
      });
    } else {
      setForm(FORM_INICIAL);
    }
    setError("");
  }, [almacen]);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setForm({
      ...form,
      [name]: type === "checkbox" ? checked : value,
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (!form.codigo.trim()) {
      setError("El código es obligatorio");
      return;
    }
    if (!form.nombre.trim()) {
      setError("El nombre es obligatorio");
      return;
    }

    setGuardando(true);
    try {
      const payload = {
        ...form,
        superficie_m2: Number(form.superficie_m2),
      };

      if (esEdicion) {
        await actualizarAlmacen(almacen.id_almacen, payload);
      } else {
        await crearAlmacen(payload);
      }
      onSaved();
    } catch (err) {
      setError(
        err.response?.data?.message ||
          `Error al ${esEdicion ? "actualizar" : "crear"} almacén`
      );
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Modal
      open={true}
      onClose={onClose}
      title={esEdicion ? "Editar almacén" : "Nuevo almacén"}
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium mb-1">Código *</label>
            <input
              className="input-field"
              name="codigo"
              value={form.codigo}
              onChange={handleChange}
              placeholder="ALM-001"
              required
            />
          </div>
          <Select
            label="Tipo"
            value={form.tipo}
            onChange={(e) => setForm({ ...form, tipo: e.target.value })}
            options={TIPOS}
            placeholder="Selecciona tipo"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Nombre *</label>
          <input
            className="input-field"
            name="nombre"
            value={form.nombre}
            onChange={handleChange}
            placeholder="Almacén Central"
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Dirección</label>
          <input
            className="input-field"
            name="direccion"
            value={form.direccion}
            onChange={handleChange}
            placeholder="Av. Principal #100"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium mb-1">Ciudad</label>
            <input
              className="input-field"
              name="ciudad"
              value={form.ciudad}
              onChange={handleChange}
              placeholder="La Paz"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">
              Superficie del almacén (m²) *
            </label>
            <input
              className="input-field"
              type="number"
              name="superficie_m2"
              value={form.superficie_m2}
              onChange={handleChange}
              placeholder="7280"
              min="1"
              step="0.01"
              required
            />
            <p className="mt-1 text-xs text-gray-500">
              Superficie física del almacén; se muestra en m² y no se compara con el conteo de productos.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id="activo"
            name="activo"
            checked={form.activo}
            onChange={handleChange}
            className="rounded"
          />
          <label htmlFor="activo" className="text-sm">
            Almacén activo
          </label>
        </div>

        {error && (
          <p className="text-sm text-red-600 bg-red-50 p-2 rounded">
            {error}
          </p>
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
          <button
            type="submit"
            className="btn-primary"
            disabled={guardando}
          >
            {guardando
              ? "Guardando..."
              : esEdicion
              ? "Guardar cambios"
              : "Crear almacén"}
          </button>
        </div>
      </form>
    </Modal>
  );
}