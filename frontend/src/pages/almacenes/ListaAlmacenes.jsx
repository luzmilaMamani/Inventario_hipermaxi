import { useEffect, useState } from "react";
import Layout from "../../components/layout/Layout";
import Pagination from "../../components/ui/Pagination";
import Select from "../../components/ui/Select";
import FormAlmacen from "./FormAlmacen";
import DetalleAlmacen from "./DetalleAlmacen";
import {
  listarAlmacenes,
  eliminarAlmacen,
  actualizarAlmacen,
} from "../../api/almacenes.api";

const TIPOS = [
  { value: "CENTRAL", label: "Central" },
  { value: "SUCURSAL", label: "Sucursal" },
  { value: "DEPOSITO", label: "Depósito" },
];

const FILTROS_INICIALES = {
  search: "",
  tipo: "",
  ciudad: "",
  activo: "",
  orderBy: "fecha_creacion",
  order: "DESC",
};

export default function ListaAlmacenes() {
  const [almacenes, setAlmacenes] = useState([]);
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 10,
    total: 0,
  });
  const [filtros, setFiltros] = useState(FILTROS_INICIALES);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [formOpen, setFormOpen] = useState(false);
  const [almacenEditar, setAlmacenEditar] = useState(null);
  const [almacenDetalle, setAlmacenDetalle] = useState(null);

  const cargar = async (page = 1) => {
    setLoading(true);
    setError("");
    try {
      const params = {
        page,
        limit: pagination.limit,
        orderBy: filtros.orderBy,
        order: filtros.order,
      };
      for (const [key, value] of Object.entries(filtros)) {
        if (value !== "" && key !== "orderBy" && key !== "order") {
          params[key] = value;
        }
      }
      const data = await listarAlmacenes(params);
      setAlmacenes(data.data);
      setPagination(data.pagination);
    } catch (err) {
      setError(err.response?.data?.message || "Error al cargar almacenes");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    cargar(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtros]);

  const abrirCrear = () => {
    setAlmacenEditar(null);
    setFormOpen(true);
  };

  const abrirEditar = (almacen) => {
    setAlmacenEditar(almacen);
    setFormOpen(true);
  };

  const desactivar = async (almacen) => {
    if (!window.confirm(`¿Desactivar el almacén "${almacen.nombre}"?`)) return;
    try {
      await eliminarAlmacen(almacen.id_almacen);
      cargar(pagination.page);
    } catch (err) {
      setError(err.response?.data?.message || "Error al desactivar");
    }
  };

  const activar = async (almacen) => {
    if (!window.confirm(`¿Activar el almacén "${almacen.nombre}"?`)) return;
    try {
      await actualizarAlmacen(almacen.id_almacen, { activo: true });
      cargar(pagination.page);
    } catch (err) {
      setError(err.response?.data?.message || "Error al activar");
    }
  };

  const limpiarFiltros = () => setFiltros(FILTROS_INICIALES);

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold">Almacenes</h1>
            <p className="text-sm text-gray-500">
              Registro y gestión de almacenes y sucursales (RF07)
            </p>
          </div>
          <button className="btn-primary" onClick={abrirCrear}>
            + Nuevo almacén
          </button>
        </div>

        <div className="card">
          {/* Filtros */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-4">
            <div className="md:col-span-2">
              <label className="block text-sm font-medium mb-1">Buscar</label>
              <input
                className="input-field"
                placeholder="Nombre, código o ciudad"
                value={filtros.search}
                onChange={(e) =>
                  setFiltros({ ...filtros, search: e.target.value })
                }
              />
            </div>
            <Select
              label="Tipo"
              value={filtros.tipo}
              onChange={(e) =>
                setFiltros({ ...filtros, tipo: e.target.value })
              }
              options={TIPOS}
              placeholder="Todos los tipos"
            />
            <Select
              label="Activo"
              value={filtros.activo}
              onChange={(e) =>
                setFiltros({ ...filtros, activo: e.target.value })
              }
              options={[
                { value: "true", label: "Sí" },
                { value: "false", label: "No" },
              ]}
              placeholder="Todos"
            />
            <div className="flex items-end">
              <button
                className="btn-secondary w-full"
                onClick={limpiarFiltros}
              >
                Limpiar filtros
              </button>
            </div>
          </div>

          <div className="flex justify-between items-center mb-3 text-sm text-gray-600">
            <span>
              {pagination.total} resultado{pagination.total !== 1 && "s"}
            </span>
          </div>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 p-2 rounded mb-3">
              {error}
            </p>
          )}

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left border-b border-gray-200 text-gray-500">
                  <th className="py-2">Código</th>
                  <th className="py-2">Nombre</th>
                  <th className="py-2">Tipo</th>
                  <th className="py-2">Ciudad</th>
                  <th className="py-2 text-right">Stock / capacidad</th>
                  <th className="py-2">Estado</th>
                  <th className="py-2 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan="7" className="py-6 text-center text-gray-500">
                      Cargando...
                    </td>
                  </tr>
                ) : almacenes.length === 0 ? (
                  <tr>
                    <td colSpan="7" className="py-6 text-center text-gray-500">
                      No hay almacenes registrados
                    </td>
                  </tr>
                ) : (
                  almacenes.map((a) => (
                    <tr
                      key={a.id_almacen}
                      className="border-b border-gray-100 hover:bg-gray-50"
                    >
                      {(() => {
                        const capacidad = a.capacidad === null || a.capacidad === ""
                          ? null
                          : Number(a.capacidad);
                        const ocupacion = Number(a.ocupacion || 0);
                        const porcentaje = capacidad === 0 && ocupacion > 0
                          ? 100
                          : capacidad > 0
                            ? Math.round((ocupacion / capacidad) * 100)
                            : 0;
                        const excedida = capacidad !== null && ocupacion > capacidad;

                        return (
                          <>
                      <td className="py-2 font-mono text-xs">{a.codigo}</td>
                      <td className="py-2 font-medium">{a.nombre}</td>
                      <td className="py-2">
                        <span className="px-2 py-1 rounded-full text-xs font-semibold bg-blue-50 text-blue-700">
                          {a.tipo}
                        </span>
                      </td>
                      <td className="py-2">{a.ciudad || "-"}</td>
                      <td className="py-2 text-right">
                        {capacidad === null ? (
                          <span className="text-gray-500">
                            {ocupacion.toLocaleString("es-BO")} registradas · sin límite
                          </span>
                        ) : (
                          <div className="inline-flex min-w-36 flex-col items-end gap-1">
                            <span>
                              {ocupacion.toLocaleString("es-BO")} / {capacidad.toLocaleString("es-BO")}
                            </span>
                            <div
                              className="h-1.5 w-full overflow-hidden rounded bg-gray-200"
                              role="progressbar"
                              aria-label={`Ocupación de ${a.nombre}`}
                              aria-valuemin="0"
                              aria-valuemax={capacidad}
                              aria-valuenow={Math.min(ocupacion, capacidad)}
                            >
                              <div
                                className={`h-full ${excedida ? "bg-red-600" : "bg-green-600"}`}
                                style={{ width: `${Math.min(porcentaje, 100)}%` }}
                              />
                            </div>
                            <span className={excedida ? "text-red-600" : "text-gray-500"}>
                              {excedida ? "Capacidad superada" : `${porcentaje}% ocupado`}
                            </span>
                          </div>
                        )}
                      </td>
                      <td className="py-2">
                        <span
                          className={`px-2 py-1 rounded-full text-xs font-semibold ${
                            a.activo
                              ? "bg-green-100 text-green-700"
                              : "bg-gray-200 text-gray-700"
                          }`}
                        >
                          {a.activo ? "ACTIVO" : "INACTIVO"}
                        </span>
                      </td>
                      <td className="py-2 text-right whitespace-nowrap">
                        <button
                          className="text-blue-600 hover:underline text-sm font-medium mr-3"
                          onClick={() => setAlmacenDetalle(a)}
                        >
                          Ver stock
                        </button>
                        <button
                          className="text-brand-red hover:underline text-sm font-medium mr-3"
                          onClick={() => abrirEditar(a)}
                        >
                          Editar
                        </button>
                        {a.activo ? (
                          <button
                            className="text-gray-500 hover:underline text-sm font-medium"
                            onClick={() => desactivar(a)}
                          >
                            Desactivar
                          </button>
                        ) : (
                          <button
                            className="text-green-600 hover:underline text-sm font-medium"
                            onClick={() => activar(a)}
                          >
                            Activar
                          </button>
                        )}
                      </td>
                          </>
                        );
                      })()}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <Pagination
            page={pagination.page}
            limit={pagination.limit}
            total={pagination.total}
            onChange={(page) => cargar(page)}
          />
        </div>
      </div>

      {formOpen && (
        <FormAlmacen
          almacen={almacenEditar}
          onClose={() => setFormOpen(false)}
          onSaved={() => {
            setFormOpen(false);
            cargar(pagination.page);
          }}
        />
      )}

      {almacenDetalle && (
        <DetalleAlmacen
          almacen={almacenDetalle}
          onClose={() => setAlmacenDetalle(null)}
        />
      )}
    </Layout>
  );
}