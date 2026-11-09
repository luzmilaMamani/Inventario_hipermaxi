import { useEffect, useState } from "react";
import Modal from "../../components/ui/Modal";
import Select from "../../components/ui/Select";
import { listarAlmacenes } from "../../api/almacenes.api";
import { listarProductos } from "../../api/productos.api";
import { consultarStock } from "../../api/stock.api";
import {
  MOTIVOS_AJUSTE,
  crearAjuste,
  obtenerLimitesAprobacion,
} from "../../api/ajustes.api";

const FORM_INICIAL = {
  id_almacen: "",
  id_producto: "",
  cantidad_nueva: "",
  motivo: "",
  comentario: "",
  fecha_vencimiento: "",
};

export default function FormAjuste({ onClose, onSaved }) {
  const [form, setForm] = useState(FORM_INICIAL);
  const [almacenes, setAlmacenes] = useState([]);
  const [productos, setProductos] = useState([]);
  const [stockActual, setStockActual] = useState(null);
  const [reservado, setReservado] = useState(0);
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [limites, setLimites] = useState(null);

  useEffect(() => {
    listarAlmacenes({ limit: 200, activo: true, orderBy: "nombre", order: "ASC" })
      .then((respuesta) => setAlmacenes(respuesta.data || []))
      .catch(() => setAlmacenes([]));
    listarProductos({ limit: 200, estado: "ACTIVO", orderBy: "nombre", order: "ASC" })
      .then((respuesta) => setProductos(respuesta.data || []))
      .catch(() => setProductos([]));
    obtenerLimitesAprobacion()
      .then((respuesta) => setLimites(respuesta.data || null))
      .catch(() => setLimites(null));
  }, []);

  // RF53: anticipa si el ajuste quedará pendiente de aprobación.
  const productoElegido = productos.find(
    (producto) => String(producto.id_producto) === String(form.id_producto),
  );
  const diferencia =
    stockActual !== null && form.cantidad_nueva !== ""
      ? Math.abs(Number(form.cantidad_nueva) - stockActual)
      : null;
  const montoEstimado =
    diferencia !== null ? diferencia * Number(productoElegido?.precio || 0) : null;
  const requiereAprobacion =
    limites &&
    diferencia !== null &&
    (diferencia > Number(limites.limite_cantidad) ||
      montoEstimado > Number(limites.limite_monto));
  const agregaConVencimiento =
    productoElegido?.controla_vencimiento === true &&
    stockActual !== null &&
    form.cantidad_nueva !== "" &&
    Number(form.cantidad_nueva) > stockActual;

  useEffect(() => {
    if (!form.id_almacen || !form.id_producto) {
      setStockActual(null);
      setReservado(0);
      return;
    }
    consultarStock({ id_almacen: form.id_almacen, origen: "ALMACEN", limit: 200 })
      .then((respuesta) => {
        const fila = (respuesta.data || []).find(
          (item) =>
            String(item.id_producto) === String(form.id_producto) &&
            item.origen !== "UBICACION" &&
            (item.id_almacen == null || String(item.id_almacen) === String(form.id_almacen)),
        );
        setStockActual(fila ? Number(fila.cantidad) : 0);
        setReservado(fila ? Number(fila.cantidad_reservada || 0) : 0);
      })
      .catch(() => {
        setStockActual(null);
        setReservado(0);
      });
  }, [form.id_almacen, form.id_producto]);

  const enviar = async (event) => {
    event.preventDefault();
    setError("");
    if (!form.id_almacen) return setError("Debe seleccionar un almacén");
    if (!form.id_producto) return setError("Debe seleccionar un producto");
    if (!form.motivo) return setError("Selecciona un motivo del catálogo");
    if (form.comentario.trim().length < 5) {
      return setError("El comentario es obligatorio y debe tener al menos 5 caracteres");
    }
    const cantidadNueva = Number(form.cantidad_nueva);
    if (!Number.isInteger(cantidadNueva) || cantidadNueva < 0) {
      return setError("La cantidad nueva debe ser un número entero igual o mayor a 0");
    }
    if (stockActual !== null && cantidadNueva === stockActual) {
      return setError("La cantidad nueva es igual al stock actual; no hay un ajuste que registrar");
    }
    if (cantidadNueva < reservado) {
      return setError(`La cantidad nueva no puede ser menor que la cantidad reservada (${reservado})`);
    }

    setGuardando(true);
    try {
      const respuesta = await crearAjuste({
        id_almacen: Number(form.id_almacen),
        id_producto: Number(form.id_producto),
        cantidad_nueva: cantidadNueva,
        motivo: form.motivo,
        comentario: form.comentario.trim(),
        fecha_vencimiento: agregaConVencimiento && form.fecha_vencimiento ? form.fecha_vencimiento : null,
      });
      onSaved(respuesta?.message);
    } catch (err) {
      setError(err.response?.data?.message || "No se pudo aplicar el ajuste");
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Modal open onClose={onClose} title="Aplicar ajuste de inventario">
      <form className="space-y-4" onSubmit={enviar}>
        <Select
          label="Almacén *"
          value={form.id_almacen}
          onChange={(event) => setForm({ ...form, id_almacen: event.target.value })}
          options={almacenes.map((almacen) => ({
            value: almacen.id_almacen,
            label: `${almacen.codigo} - ${almacen.nombre}`,
          }))}
          placeholder="Selecciona un almacén"
        />
        <Select
          label="Producto *"
          value={form.id_producto}
          onChange={(event) => setForm({ ...form, id_producto: event.target.value })}
          options={productos.map((producto) => ({
            value: producto.id_producto,
            label: `${producto.codigo} - ${producto.nombre}`,
          }))}
          placeholder="Selecciona un producto"
        />
        <p className="text-sm text-gray-600">
          Stock actual:{" "}
          <span className="font-semibold">
            {stockActual === null ? "Selecciona almacén y producto" : stockActual.toLocaleString("es-BO")}
          </span>
          {reservado > 0 && ` · Reservado: ${reservado.toLocaleString("es-BO")}`}
        </p>
        <div>
          <label className="mb-1 block text-sm font-medium" htmlFor="cantidad-nueva">
            Cantidad nueva *
          </label>
          <input
            id="cantidad-nueva"
            className="input-field"
            type="number"
            min="0"
            step="1"
            required
            value={form.cantidad_nueva}
            onChange={(event) => setForm({ ...form, cantidad_nueva: event.target.value })}
          />
        </div>
        {agregaConVencimiento && (
          <div>
            <label className="mb-1 block text-sm font-medium" htmlFor="vencimiento-ajuste">
              Fecha de vencimiento
            </label>
            <input
              id="vencimiento-ajuste"
              className="input-field"
              type="date"
              value={form.fecha_vencimiento}
              onChange={(event) => setForm({ ...form, fecha_vencimiento: event.target.value })}
            />
            <p className="mt-1 text-xs text-gray-500">
              Solo es obligatoria si el producto no tiene lotes vigentes en este almacén. Si los
              tiene, las unidades se suman al lote que vence más tarde.
            </p>
          </div>
        )}
        <Select
          label="Motivo *"
          value={form.motivo}
          onChange={(event) => setForm({ ...form, motivo: event.target.value })}
          options={MOTIVOS_AJUSTE}
          placeholder="Selecciona un motivo"
        />
        <div>
          <label className="mb-1 block text-sm font-medium" htmlFor="comentario-ajuste">
            Comentario *
          </label>
          <textarea
            id="comentario-ajuste"
            className="input-field"
            rows="3"
            maxLength="500"
            required
            value={form.comentario}
            onChange={(event) => setForm({ ...form, comentario: event.target.value })}
            placeholder="Explica por qué se modifica el stock (mínimo 5 caracteres)"
          />
        </div>
        {limites && (
          <p
            className={`rounded p-2 text-xs ${
              requiereAprobacion ? "bg-amber-50 text-amber-800" : "text-gray-500"
            }`}
          >
            {requiereAprobacion
              ? `Este ajuste (${diferencia.toLocaleString("es-BO")} unid., Bs ${montoEstimado.toFixed(2)}) supera el límite y quedará pendiente de aprobación del supervisor. El stock no cambiará hasta entonces.`
              : `Los ajustes de más de ${Number(limites.limite_cantidad).toLocaleString("es-BO")} unidades o Bs ${Number(limites.limite_monto).toFixed(2)} requieren aprobación del supervisor.`}
          </p>
        )}
        <p className="text-xs text-gray-500">
          Al guardar, la justificación queda asociada a tu usuario y a la fecha. No se podrá editar ni eliminar.
        </p>
        {error && <p className="rounded bg-red-50 p-2 text-sm text-red-600">{error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-secondary" onClick={onClose} disabled={guardando}>
            Cancelar
          </button>
          <button type="submit" className="btn-primary" disabled={guardando}>
            {guardando
              ? "Guardando..."
              : requiereAprobacion
                ? "Enviar a aprobación"
                : "Aplicar ajuste"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
