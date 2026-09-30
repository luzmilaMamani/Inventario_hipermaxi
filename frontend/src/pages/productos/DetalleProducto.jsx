import { useEffect, useState } from "react";
import Modal from "../../components/ui/Modal";
import Badge from "../../components/ui/Badge";
import { obtenerProducto } from "../../api/productos.api";

export default function DetalleProducto({ productoId, onClose }) {
  const [producto, setProducto] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!productoId) return;

    let activo = true;
    setLoading(true);
    setError("");
    setProducto(null);

    obtenerProducto(productoId)
      .then((res) => {
        if (activo) setProducto(res.data);
      })
      .catch((err) => {
        if (activo)
          setError(err.response?.data?.message || "Error al cargar producto");
      })
      .finally(() => {
        if (activo) setLoading(false);
      });

    return () => {
      activo = false;
    };
  }, [productoId]);

  return (
    <Modal
      open={!!productoId}
      onClose={onClose}
      title="Detalle del producto"
    >
      {loading && <p className="text-gray-500">Cargando...</p>}

      {error && (
        <p className="text-sm text-red-600 bg-red-50 p-2 rounded">{error}</p>
      )}

      {producto && (
        <div className="space-y-3 text-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-500">Código</p>
              <p className="font-mono font-semibold">{producto.codigo}</p>
            </div>
            <Badge estado={producto.estado} />
          </div>

          <div>
            <p className="text-gray-500">Nombre</p>
            <p className="font-semibold">{producto.nombre}</p>
          </div>

          {producto.descripcion && (
            <div>
              <p className="text-gray-500">Descripción</p>
              <p>{producto.descripcion}</p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-gray-500">Categoría</p>
              <p>{producto.categoria || "-"}</p>
            </div>
            <div>
              <p className="text-gray-500">Subcategoría</p>
              <p>{producto.subcategoria || "-"}</p>
            </div>
            <div>
              <p className="text-gray-500">Marca</p>
              <p>{producto.marca || "-"}</p>
            </div>
            <div>
              <p className="text-gray-500">Unidad</p>
              <p>
                {producto.unidad} ({producto.abreviatura})
              </p>
            </div>
          </div>

          <div>
            <p className="text-gray-500">Código de barras</p>
            <p className="font-mono">
              {producto.codigo_barras || "No registrado"}
            </p>
          </div>

          <div className="grid grid-cols-3 gap-3 border-t pt-3">
            <div>
              <p className="text-gray-500">Stock mínimo</p>
              <p className="font-semibold">{producto.stock_minimo}</p>
            </div>
            <div>
              <p className="text-gray-500">Stock máximo</p>
              <p className="font-semibold">{producto.stock_maximo}</p>
            </div>
            <div>
              <p className="text-gray-500">Punto reposición</p>
              <p className="font-semibold">{producto.punto_reposicion}</p>
            </div>
          </div>

          <div className="flex items-center gap-2 text-xs">
            <span className="text-gray-500">Controla vencimiento:</span>
            <span className="font-semibold">
              {producto.controla_vencimiento ? "Sí" : "No"}
            </span>
          </div>

          <div className="flex justify-end pt-3">
            <button className="btn-secondary" onClick={onClose}>
              Cerrar
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}