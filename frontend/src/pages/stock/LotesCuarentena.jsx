import { useEffect, useState } from "react";
import Layout from "../../components/layout/Layout";
import Modal from "../../components/ui/Modal";
import Pagination from "../../components/ui/Pagination";
import Select from "../../components/ui/Select";
import { useAuth } from "../../context/AuthContext";
import { ROLES_CUARENTENA, tieneRol } from "../../utils/permissions";
import { listarAlmacenes } from "../../api/almacenes.api";
import {
  historialCuarentena,
  liberarCuarentena,
  listarLotes,
  ponerEnCuarentena,
} from "../../api/lotes.api";

const FILTROS_INICIALES = { id_almacen: "", estado: "", search: "" };
const ESTADOS = [
  { value: "DISPONIBLE", label: "Disponible" },
  { value: "CUARENTENA", label: "En cuarentena" },
  { value: "VENCIDO", label: "Vencido" },
];
const ESTILO_ESTADO = {
  DISPONIBLE: "bg-green-100 text-green-700",
  CUARENTENA: "bg-amber-100 text-amber-800",
  VENCIDO: "bg-red-100 text-red-700",
};

function formatearFecha(fecha) {
  if (!fecha) return "Sin vencimiento";
  const [anio, mes, dia] = String(fecha).slice(0, 10).split("-");
  return `${dia}/${mes}/${anio}`;
}

const formatearNumero = (valor) => Number(valor ?? 0).toLocaleString("es-BO");

function FormCuarentena({ accion, lote, onClose, onSaved }) {
  const liberar = accion === "liberar";
  const [motivo, setMotivo] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");

  const enviar = async (event) => {
    event.preventDefault();
    setError("");
    if (motivo.trim().length < 5) return setError("Indica el motivo (mínimo 5 caracteres)");

    setGuardando(true);
    try {
      const respuesta = await (liberar ? liberarCuarentena : ponerEnCuarentena)(
        lote.id_lote,
        motivo.trim(),
      );
      onSaved(respuesta.message);
    } catch (err) {
      setError(err.response?.data?.message || "No se pudo actualizar el lote");
      setGuardando(false);
    }
  };

  return (
    <Modal open onClose={onClose} title={liberar ? "Liberar lote" : "Poner lote en cuarentena"}>
      <form className="space-y-4" onSubmit={enviar}>
        <p className="rounded bg-gray-50 p-3 text-sm">
          <span className="font-medium">{lote.producto}</span>
          <br />
          Lote <span className="font-mono">{lote.numero_lote}</span> ·{" "}
          {formatearNumero(lote.cantidad)} {lote.unidad || "unid."} · {lote.almacen}
        </p>
        <p className="text-sm text-gray-600">
          {liberar
            ? "El lote volverá al stock disponible."
            : "El lote dejará de contar como disponible y no se podrá vender ni transferir hasta liberarlo."}
        </p>
        <div>
          <label className="mb-1 block text-sm font-medium" htmlFor="motivo-cuarentena">
            Motivo *
          </label>
          <textarea
            id="motivo-cuarentena"
            rows="3"
            maxLength={500}
            className="input-field"
            value={motivo}
            onChange={(event) => setMotivo(event.target.value)}
            placeholder="Explica el motivo (mínimo 5 caracteres)"
          />
        </div>
        {error && <p className="rounded bg-red-50 p-3 text-sm text-red-600">{error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-secondary" onClick={onClose} disabled={guardando}>
            Cancelar
          </button>
          <button type="submit" className="btn-primary" disabled={guardando}>
            {guardando ? "Guardando..." : liberar ? "Liberar lote" : "Poner en cuarentena"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function HistorialLote({ lote, onClose }) {
  const [registros, setRegistros] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    historialCuarentena(lote.id_lote)
      .then((respuesta) => setRegistros(respuesta.data || []))
      .catch((err) => setError(err.response?.data?.message || "No se pudo cargar el historial"));
  }, [lote.id_lote]);

  return (
    <Modal open onClose={onClose} title={`Historial del lote ${lote.numero_lote}`}>
      {error && <p className="rounded bg-red-50 p-3 text-sm text-red-600">{error}</p>}
      {!error && registros === null && <p className="text-sm text-gray-500">Cargando...</p>}
      {registros?.length === 0 && (
        <p className="text-sm text-gray-500">Este lote nunca estuvo en cuarentena.</p>
      )}
      {registros?.length > 0 && (
        <ul className="max-h-80 space-y-3 overflow-y-auto">
          {registros.map((registro) => (
            <li key={registro.id_historial} className="rounded border border-blue-100 p-3 text-sm">
              <p className="font-semibold">
                {registro.accion === "BLOQUEO" ? "Puesto en cuarentena" : "Liberado"}
              </p>
              <p className="text-gray-700">{registro.motivo}</p>
              <p className="mt-1 text-xs text-gray-500">
                {registro.usuario} · {new Date(registro.fecha).toLocaleString("es-BO")}
              </p>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}

export default function LotesCuarentena() {
  const { user } = useAuth();
  const puedeGestionar = tieneRol(user?.rol, ROLES_CUARENTENA);

  const [lotes, setLotes] = useState([]);
  const [almacenes, setAlmacenes] = useState([]);
  const [filtros, setFiltros] = useState(FILTROS_INICIALES);
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0 });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [mensaje, setMensaje] = useState("");
  const [cambio, setCambio] = useState(null);
  const [loteHistorial, setLoteHistorial] = useState(null);

  const cargar = async (page = 1) => {
    setLoading(true);
    setError("");
    try {
      const params = { page, limit: pagination.limit };
      if (filtros.id_almacen) params.id_almacen = filtros.id_almacen;
      if (filtros.estado) params.estado = filtros.estado;
      if (filtros.search.trim()) params.search = filtros.search.trim();
      const respuesta = await listarLotes(params);
      setLotes(respuesta.data || []);
      setPagination(respuesta.pagination || { page, limit: pagination.limit, total: 0 });
    } catch (err) {
      setError(err.response?.data?.message || "No se pudieron cargar los lotes");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    cargar(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtros]);

  useEffect(() => {
    listarAlmacenes({ limit: 200, activo: true, orderBy: "nombre", order: "ASC" })
      .then((respuesta) => setAlmacenes(respuesta.data || []))
      .catch(() => setAlmacenes([]));
  }, []);

  return (
    <Layout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Lotes y cuarentena</h1>
          <p className="text-sm text-gray-500">
            Un lote en cuarentena no cuenta como stock disponible y no se puede vender ni
            transferir mientras se revisa.
          </p>
        </div>

        {mensaje && <p className="rounded bg-green-50 p-3 text-sm text-green-700">{mensaje}</p>}

        <section className="card space-y-4">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
            <Select
              label="Almacén"
              value={filtros.id_almacen}
              onChange={(event) => setFiltros({ ...filtros, id_almacen: event.target.value })}
              options={almacenes.map((almacen) => ({
                value: almacen.id_almacen,
                label: `${almacen.codigo} - ${almacen.nombre}`,
              }))}
              placeholder="Todos los almacenes"
            />
            <Select
              label="Estado"
              value={filtros.estado}
              onChange={(event) => setFiltros({ ...filtros, estado: event.target.value })}
              options={ESTADOS}
              placeholder="Todos los estados"
            />
            <div>
              <label className="mb-1 block text-sm font-medium" htmlFor="buscar-lote">
                Buscar
              </label>
              <input
                id="buscar-lote"
                className="input-field"
                value={filtros.search}
                onChange={(event) => setFiltros({ ...filtros, search: event.target.value })}
                placeholder="Producto, código o lote"
              />
            </div>
            <div className="flex items-end">
              <button
                type="button"
                className="btn-secondary w-full"
                onClick={() => setFiltros(FILTROS_INICIALES)}
              >
                Limpiar filtros
              </button>
            </div>
          </div>

          {error && <p className="rounded bg-red-50 p-3 text-sm text-red-600">{error}</p>}

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-left text-gray-500">
                  <th className="py-2 pr-3">Producto</th>
                  <th className="py-2 pr-3">Lote</th>
                  <th className="py-2 pr-3">Almacén</th>
                  <th className="py-2 pr-3">Vencimiento</th>
                  <th className="py-2 pr-3 text-right">Cantidad</th>
                  <th className="py-2 pr-3">Estado</th>
                  <th className="py-2">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan="7" className="py-6 text-center text-gray-500">
                      Cargando lotes...
                    </td>
                  </tr>
                ) : lotes.length === 0 ? (
                  <tr>
                    <td colSpan="7" className="py-6 text-center text-gray-500">
                      No hay lotes con existencia para esos filtros.
                    </td>
                  </tr>
                ) : (
                  lotes.map((lote) => (
                    <tr key={lote.id_lote} className="border-b border-gray-100">
                      <td className="py-2 pr-3">
                        <div className="font-medium">{lote.producto}</div>
                        <div className="font-mono text-xs text-gray-500">{lote.producto_codigo}</div>
                      </td>
                      <td className="py-2 pr-3 font-mono text-xs">{lote.numero_lote}</td>
                      <td className="py-2 pr-3">{lote.almacen}</td>
                      <td className="whitespace-nowrap py-2 pr-3">
                        {formatearFecha(lote.fecha_vencimiento)}
                      </td>
                      <td className="py-2 pr-3 text-right">
                        {formatearNumero(lote.cantidad)} {lote.unidad || "unid."}
                      </td>
                      <td className="py-2 pr-3">
                        <span
                          className={`rounded-full px-2 py-1 text-xs font-semibold ${
                            ESTILO_ESTADO[lote.estado] || "bg-gray-100 text-gray-600"
                          }`}
                        >
                          {lote.estado}
                        </span>
                      </td>
                      <td className="space-x-3 whitespace-nowrap py-2">
                        {puedeGestionar && lote.estado === "DISPONIBLE" && (
                          <button
                            type="button"
                            className="font-semibold text-amber-700 hover:underline"
                            onClick={() => {
                              setMensaje("");
                              setCambio({ accion: "cuarentena", lote });
                            }}
                          >
                            Poner en cuarentena
                          </button>
                        )}
                        {puedeGestionar && lote.estado === "CUARENTENA" && (
                          <button
                            type="button"
                            className="font-semibold text-green-700 hover:underline"
                            onClick={() => {
                              setMensaje("");
                              setCambio({ accion: "liberar", lote });
                            }}
                          >
                            Liberar
                          </button>
                        )}
                        <button
                          type="button"
                          className="text-blue-600 hover:underline"
                          onClick={() => setLoteHistorial(lote)}
                        >
                          Historial
                        </button>
                      </td>
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
            onChange={cargar}
          />
        </section>
      </div>

      {cambio && (
        <FormCuarentena
          accion={cambio.accion}
          lote={cambio.lote}
          onClose={() => setCambio(null)}
          onSaved={(texto) => {
            setCambio(null);
            setMensaje(texto);
            cargar(pagination.page);
          }}
        />
      )}
      {loteHistorial && (
        <HistorialLote lote={loteHistorial} onClose={() => setLoteHistorial(null)} />
      )}
    </Layout>
  );
}
