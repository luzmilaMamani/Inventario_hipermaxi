import { useEffect, useState } from "react";
import Modal from "../../components/ui/Modal";
import Select from "../../components/ui/Select";
import {
  crearProducto,
  actualizarProducto,
} from "../../api/productos.api";
import {
  listarCategorias,
  listarSubcategorias,
  listarMarcas,
  listarUnidadesMedida,
} from "../../api/catalogos.api";

const FORM_INICIAL = {
  codigo: "",
  codigo_barras: "",
  nombre: "",
  descripcion: "",
  id_categoria: "",
  id_subcategoria: "",
  id_marca: "",
  id_unidad: "",
  controla_vencimiento: false,
  stock_minimo: 0,
  stock_maximo: 0,
  punto_reposicion: 0,
};

export default function FormProducto({ producto, onClose, onSaved }) {
  const [form, setForm] = useState(FORM_INICIAL);
  const [categorias, setCategorias] = useState([]);
  const [subcategorias, setSubcategorias] = useState([]);
  const [marcas, setMarcas] = useState([]);
  const [unidades, setUnidades] = useState([]);

  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);

  const esEdicion = !!producto;

  // Cargar catálogos
  useEffect(() => {
    listarCategorias().then((r) => setCategorias(r.data)).catch(() => {});
    listarMarcas().then((r) => setMarcas(r.data)).catch(() => {});
    listarUnidadesMedida().then((r) => setUnidades(r.data)).catch(() => {});
  }, []);

  // Cargar subcategorías cuando cambia la categoría
  useEffect(() => {
    if (!form.id_categoria) {
      setSubcategorias([]);
      return;
    }
    listarSubcategorias(form.id_categoria)
      .then((r) => setSubcategorias(r.data))
      .catch(() => setSubcategorias([]));
  }, [form.id_categoria]);

  // Cargar datos si es edición
  useEffect(() => {
    if (producto) {
      setForm({
        codigo: producto.codigo || "",
        codigo_barras: producto.codigo_barras || "",
        nombre: producto.nombre || "",
        descripcion: producto.descripcion || "",
        id_categoria: producto.id_categoria || "",
        id_subcategoria: producto.id_subcategoria || "",
        id_marca: producto.id_marca || "",
        id_unidad: producto.id_unidad || "",
        controla_vencimiento: producto.controla_vencimiento ?? false,
        stock_minimo: producto.stock_minimo ?? 0,
        stock_maximo: producto.stock_maximo ?? 0,
        punto_reposicion: producto.punto_reposicion ?? 0,
      });
    } else {
      setForm(FORM_INICIAL);
    }
    setError("");
  }, [producto]);

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

    if (!form.codigo.trim()) return setError("El código es obligatorio");
    if (!form.nombre.trim()) return setError("El nombre es obligatorio");
    if (!form.id_categoria) return setError("La categoría es obligatoria");
    if (!form.id_unidad) return setError("La unidad es obligatoria");

    setGuardando(true);
    try {
      const payload = {
        codigo: form.codigo.trim(),
        codigo_barras: form.codigo_barras.trim() || null,
        nombre: form.nombre.trim(),
        descripcion: form.descripcion.trim() || null,
        id_categoria: Number(form.id_categoria),
        id_subcategoria: form.id_subcategoria
          ? Number(form.id_subcategoria)
          : null,
        id_marca: form.id_marca ? Number(form.id_marca) : null,
        id_unidad: Number(form.id_unidad),
        controla_vencimiento: form.controla_vencimiento,
        stock_minimo: Number(form.stock_minimo) || 0,
        stock_maximo: Number(form.stock_maximo) || 0,
        punto_reposicion: Number(form.punto_reposicion) || 0,
      };

      if (esEdicion) {
        await actualizarProducto(producto.id_producto, payload);
      } else {
        await crearProducto(payload);
      }
      onSaved();
    } catch (err) {
      setError(
        err.response?.data?.message ||
          `Error al ${esEdicion ? "actualizar" : "crear"} producto`
      );
    } finally {
      setGuardando(false);
    }
  };

  const opcionesCategorias = categorias.map((c) => ({
    value: c.id_categoria,
    label: c.nombre,
  }));
  const opcionesSubcategorias = subcategorias.map((s) => ({
    value: s.id_subcategoria,
    label: s.nombre,
  }));
  const opcionesMarcas = marcas.map((m) => ({
    value: m.id_marca,
    label: m.nombre,
  }));
  const opcionesUnidades = unidades.map((u) => ({
    value: u.id_unidad,
    label: `${u.nombre} (${u.abreviatura})`,
  }));

  return (
    <Modal
      open={true}
      onClose={onClose}
      title={esEdicion ? "Editar producto" : "Nuevo producto"}
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium mb-1">
              Código *
            </label>
            <input
              className="input-field"
              name="codigo"
              value={form.codigo}
              onChange={handleChange}
              placeholder="PROD-008"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">
              Código de barras
            </label>
            <input
              className="input-field"
              name="codigo_barras"
              value={form.codigo_barras}
              onChange={handleChange}
              placeholder="7501234567896"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Nombre *</label>
          <input
            className="input-field"
            name="nombre"
            value={form.nombre}
            onChange={handleChange}
            placeholder="Nombre del producto"
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">
            Descripción
          </label>
          <textarea
            className="input-field"
            name="descripcion"
            rows="2"
            value={form.descripcion}
            onChange={handleChange}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Select
            label="Categoría *"
            value={form.id_categoria}
            onChange={(e) =>
              setForm({
                ...form,
                id_categoria: e.target.value,
                id_subcategoria: "",
              })
            }
            options={opcionesCategorias}
            placeholder="Selecciona categoría"
          />
          <Select
            label="Subcategoría"
            value={form.id_subcategoria}
            onChange={(e) =>
              setForm({ ...form, id_subcategoria: e.target.value })
            }
            options={opcionesSubcategorias}
            placeholder="Selecciona subcategoría"
            disabled={!form.id_categoria}
          />
          <Select
            label="Marca"
            value={form.id_marca}
            onChange={(e) => setForm({ ...form, id_marca: e.target.value })}
            options={opcionesMarcas}
            placeholder="Selecciona marca"
          />
          <Select
            label="Unidad de medida *"
            value={form.id_unidad}
            onChange={(e) => setForm({ ...form, id_unidad: e.target.value })}
            options={opcionesUnidades}
            placeholder="Selecciona unidad"
          />
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="block text-sm font-medium mb-1">
              Stock mínimo
            </label>
            <input
              className="input-field"
              type="number"
              name="stock_minimo"
              value={form.stock_minimo}
              onChange={handleChange}
              min="0"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">
              Stock máximo
            </label>
            <input
              className="input-field"
              type="number"
              name="stock_maximo"
              value={form.stock_maximo}
              onChange={handleChange}
              min="0"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">
              Punto reposición
            </label>
            <input
              className="input-field"
              type="number"
              name="punto_reposicion"
              value={form.punto_reposicion}
              onChange={handleChange}
              min="0"
            />
          </div>
        </div>

        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id="controla_vencimiento"
            name="controla_vencimiento"
            checked={form.controla_vencimiento}
            onChange={handleChange}
            className="rounded"
          />
          <label htmlFor="controla_vencimiento" className="text-sm">
            Este producto controla fecha de vencimiento
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
              : "Crear producto"}
          </button>
        </div>
      </form>
    </Modal>
  );
}