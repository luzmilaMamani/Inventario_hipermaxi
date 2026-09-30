import { useEffect, useState } from "react";
import Modal from "../../components/ui/Modal";
import Select from "../../components/ui/Select";
import { crearUbicacion, actualizarUbicacion } from "../../api/ubicaciones.api";
import { listarAlmacenes } from "../../api/almacenes.api";

const FORM_INICIAL = {
  id_almacen: "",
  zona: "",
  pasillo: "",
  estante: "",
  nivel: "",
  descripcion: "",
  activo: true,
};

export default function FormUbicacion({ ubicacion, onClose, onSaved }) {
  const [form, setForm] = useState(FORM_INICIAL);
  const [almacenes, setAlmacenes] = useState([]);
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);

  const esEdicion = !!ubicacion;

  useEffect(() => {
    listarAlmacenes({ limit: 200, activo: "true", orderBy: "nombre", order: "ASC" })
      .then((res) => setAlmacenes(res.data))
      .catch(() => setAlmacenes([]));
  }, []);

  useEffect(() => {
    if (ubicacion) {
      setForm({
        id_almacen: ubicacion.id_almacen || "",
        zona: ubicacion.zona || "",
        pasillo: ubicacion.pasillo || "",
        estante: ubicacion.estante || "",
        nivel: ubicacion.nivel || "",
        descripcion: ubicacion.descripcion || "",
        activo: ubicacion.activo ?? true,
      });
    } else {
      setForm(FORM_INICIAL);
    }
    setError("");
  }, [ubicacion]);

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

    if (!form.id_almacen) {
      setError("El almacén es obligatorio");
      return;
    }
    if (!form.zona && !form.pasillo && !form.estante && !form.nivel) {
      setError("Debes especificar al menos zona, pasillo, estante o nivel");
      return;
    }

    setGuardando(true);
    try {
      const payload = {
        ...form,
        id_almacen: Number(form.id_almacen),
      };
      if (esEdicion) {
        await actualizarUbicacion(ubicacion.id_ubicacion, payload);
      } else {
        await crearUbicacion(payload);
      }
      onSaved();
    } catch (err) {
      setError(
        err.response?.data?.message ||
          `Error al ${esEdicion ? "actualizar" : "crear"} ubicación`
      );
    } finally {
      setGuardando(false);
    }
  };

  const opcionesAlmacenes = almacenes.map((a) => ({
    value: a.id_almacen,
    label: `${a.codigo} - ${a.nombre}`,
  }));

  return (
    <Modal
      open={true}
      onClose={onClose}
      title={esEdicion ? "Editar ubicación" : "Nueva ubicación"}
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <Select
          label="Almacén *"
          value={form.id_almacen}
          onChange={(e) => setForm({ ...form, id_almacen: e.target.value })}
          options={opcionesAlmacenes}
          placeholder="Selecciona un almacén"
        />

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium mb-1">Zona</label>
            <input
              className="input-field"
              name="zona"
              value={form.zona}
              onChange={handleChange}
              placeholder="Zona A"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Pasillo</label>
            <input
              className="input-field"
              name="pasillo"
              value={form.pasillo}
              onChange={handleChange}
              placeholder="P1"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Estante</label>
            <input
              className="input-field"
              name="estante"
              value={form.estante}
              onChange={handleChange}
              placeholder="E1"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Nivel</label>
            <input
              className="input-field"
              name="nivel"
              value={form.nivel}
              onChange={handleChange}
              placeholder="N1"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Descripción</label>
          <textarea
            className="input-field"
            name="descripcion"
            rows="2"
            value={form.descripcion}
            onChange={handleChange}
            placeholder="Descripción de la ubicación"
          />
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
            Ubicación activa
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
          <button type="submit" className="btn-primary" disabled={guardando}>
            {guardando
              ? "Guardando..."
              : esEdicion
              ? "Guardar cambios"
              : "Crear ubicación"}
          </button>
        </div>
      </form>
    </Modal>
  );
}