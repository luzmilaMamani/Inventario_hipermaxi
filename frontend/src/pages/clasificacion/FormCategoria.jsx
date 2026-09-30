import { useEffect, useState } from "react";
import Modal from "../../components/ui/Modal";
import { crearCategoria, actualizarCategoria } from "../../api/clasificacion.api";

export default function FormCategoria({ categoria, onClose, onSaved }) {
  const [form, setForm] = useState({ nombre: "", descripcion: "", activo: true });
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);
  const esEdicion = !!categoria;

  useEffect(() => {
    if (categoria) {
      setForm({
        nombre: categoria.nombre || "",
        descripcion: categoria.descripcion || "",
        activo: categoria.activo ?? true,
      });
    }
    setError("");
  }, [categoria]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    if (!form.nombre.trim()) return setError("El nombre es obligatorio");
    setGuardando(true);
    try {
      if (esEdicion) await actualizarCategoria(categoria.id_categoria, form);
      else await crearCategoria(form);
      onSaved();
    } catch (err) {
      setError(err.response?.data?.message || "Error al guardar");
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Modal open onClose={onClose} title={esEdicion ? "Editar categoría" : "Nueva categoría"}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1">Nombre *</label>
          <input
            className="input-field"
            value={form.nombre}
            onChange={(e) => setForm({ ...form, nombre: e.target.value })}
            required
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Descripción</label>
          <textarea
            className="input-field"
            rows="2"
            value={form.descripcion}
            onChange={(e) => setForm({ ...form, descripcion: e.target.value })}
          />
        </div>
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id="activo"
            checked={form.activo}
            onChange={(e) => setForm({ ...form, activo: e.target.checked })}
          />
          <label htmlFor="activo" className="text-sm">Activa</label>
        </div>
        {error && <p className="text-sm text-red-600 bg-red-50 p-2 rounded">{error}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" className="btn-secondary" onClick={onClose} disabled={guardando}>
            Cancelar
          </button>
          <button type="submit" className="btn-primary" disabled={guardando}>
            {guardando ? "Guardando..." : esEdicion ? "Guardar cambios" : "Crear"}
          </button>
        </div>
      </form>
    </Modal>
  );
}