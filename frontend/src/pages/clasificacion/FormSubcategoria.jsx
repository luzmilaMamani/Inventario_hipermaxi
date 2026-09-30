import { useEffect, useState } from "react";
import Modal from "../../components/ui/Modal";
import Select from "../../components/ui/Select";
import { crearSubcategoria, actualizarSubcategoria } from "../../api/clasificacion.api";
import { listarCategorias } from "../../api/catalogos.api";

export default function FormSubcategoria({ subcategoria, onClose, onSaved }) {
  const [form, setForm] = useState({ id_categoria: "", nombre: "", descripcion: "", activo: true });
  const [categorias, setCategorias] = useState([]);
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);
  const esEdicion = !!subcategoria;

  useEffect(() => {
    listarCategorias().then((r) => setCategorias(r.data)).catch(() => {});
  }, []);

  useEffect(() => {
    if (subcategoria) {
      setForm({
        id_categoria: subcategoria.id_categoria || "",
        nombre: subcategoria.nombre || "",
        descripcion: subcategoria.descripcion || "",
        activo: subcategoria.activo ?? true,
      });
    }
    setError("");
  }, [subcategoria]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    if (!form.id_categoria) return setError("La categoría es obligatoria");
    if (!form.nombre.trim()) return setError("El nombre es obligatorio");
    setGuardando(true);
    try {
      const payload = { ...form, id_categoria: Number(form.id_categoria) };
      if (esEdicion) await actualizarSubcategoria(subcategoria.id_subcategoria, payload);
      else await crearSubcategoria(payload);
      onSaved();
    } catch (err) {
      setError(err.response?.data?.message || "Error al guardar");
    } finally {
      setGuardando(false);
    }
  };

  const opcionesCategorias = categorias.map((c) => ({
    value: c.id_categoria,
    label: c.nombre,
  }));

  return (
    <Modal open onClose={onClose} title={esEdicion ? "Editar subcategoría" : "Nueva subcategoría"}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <Select
          label="Categoría *"
          value={form.id_categoria}
          onChange={(e) => setForm({ ...form, id_categoria: e.target.value })}
          options={opcionesCategorias}
          placeholder="Selecciona categoría"
        />
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