import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import Layout from "../../components/layout/Layout";
import Modal from "../../components/ui/Modal";
import Pagination from "../../components/ui/Pagination";
import Select from "../../components/ui/Select";
import { useAuth } from "../../context/AuthContext";
import { ROLES_OPERACION, tieneRol } from "../../utils/permissions";
import { consultarLotesVencidos } from "../../api/stock.api";
import { listarAlmacenes } from "../../api/almacenes.api";
import { listarCategorias } from "../../api/catalogos.api";
import { crearSalida } from "../../api/salidas.api";
import { notificarCambioAlertas } from "../../api/alertasVencimiento.api";

const FILTROS_INICIALES = { id_almacen: "", id_categoria: "", search: "" };
const RESUMEN_VACIO = { total_lotes: 0, total_unidades: 0, total_valor: 0 };

function formatearFecha(fecha) {
  const [anio, mes, dia] = String(fecha).slice(0, 10).split("-");
  return `${dia}/${mes}/${anio}`;
}

function textoDiasVencido(dias) {
  if (dias === 0) return "Venció hoy";
  return `Hace ${dias} día${dias !== 1 ? "s" : ""}`;
}

const formatearNumero = (valor) => Number(valor ?? 0).toLocaleString("es-BO");
const formatearBs = (valor) =>
  `Bs ${Number(valor ?? 0).toLocaleString("es-BO", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// RF43: registro de la salida por vencimiento (RF27) de un lote vencido.
function FormBajaVencido({ lote, onClose, onSaved }) {
  const maximo = Number(lote.cantidad);
  const [cantidad, setCantidad] = useState(String(maximo));
  const [observaciones, setObservaciones] = useState(
    `Baja por vencimiento del lote ${lote.numero_lote}`,
  );
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");

  const enviar = async (event) => {
    event.preventDefault();
    setError("");
    const valor = Number(cantidad);
    if (!Number.isInteger(valor) || valor <= 0) {
      return setError("La cantidad debe ser un número entero mayor a 0");
    }
    if (valor > maximo) {
      return setError(`El lote solo tiene ${formatearNumero(maximo)} unidades vencidas`);
    }
    if (observaciones.trim().length < 5) {
      return setError("La observación es obligatoria (mínimo 5 caracteres)");
    }

    setGuardando(true);
    try {
      const respuesta = await crearSalida({
        id_almacen: Number(lote.id_almacen),
        motivo: "VENCIMIENTO",
        observaciones: observaciones.trim(),
        detalles: [
          {
            id_producto: Number(lote.id_producto),
            id_lote: Number(lote.id_lote),
            cantidad: valor,
          },
        ],
      });
      onSaved(
        `${respuesta.message || "Vencimiento registrado"} (${respuesta.data?.numero_salida || "salida registrada"})`,
      );
    } catch (err) {
      setError(err.response?.data?.message || "No se pudo registrar la baja del lote");
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Modal open onClose={onClose} title="Registrar salida por vencimiento">
      <form className="space-y-4" onSubmit={enviar}>
        <dl className="grid grid-cols-2 gap-3 rounded bg-gray-50 p-3 text-sm">
          <div className="col-span-2">
            <dt className="text-gray-500">Producto</dt>
            <dd className="font-medium">
              {lote.producto_codigo} - {lote.producto}
            </dd>
          </div>
          <div>
            <dt className="text-gray-500">Lote</dt>
            <dd className="font-mono font-medium">{lote.numero_lote}</dd>
          </div>
          <div>
            <dt className="text-gray-500">Venció el</dt>
            <dd className="font-medium text-red-600">{formatearFecha(lote.fecha_vencimiento)}</dd>
          </div>
          <div>
            <dt className="text-gray-500">Almacén</dt>
            <dd className="font-medium">{lote.almacen}</dd>
          </div>
          <div>
            <dt className="text-gray-500">Cantidad vencida</dt>
            <dd className="font-medium">
              {formatearNumero(maximo)} {lote.unidad || "unid."}
            </dd>
          </div>
        </dl>

        <div>
          <label className="mb-1 block text-sm font-medium" htmlFor="cantidad-baja">
            Cantidad a dar de baja *
          </label>
          <input
            id="cantidad-baja"
            type="number"
            min="1"
            max={maximo}
            step="1"
            className="input-field"
            value={cantidad}
            onChange={(event) => setCantidad(event.target.value)}
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium" htmlFor="observacion-baja">
            Observación *
          </label>
          <textarea
            id="observacion-baja"
            rows="3"
            maxLength={500}
            className="input-field"
            value={observaciones}
            onChange={(event) => setObservaciones(event.target.value)}
          />
        </div>

        {error && <p className="rounded bg-red-50 p-3 text-sm text-red-600">{error}</p>}

        <div className="flex justify-end gap-2">
          <button type="button" className="btn-secondary" onClick={onClose} disabled={guardando}>
            Cancelar
          </button>
          <button type="submit" className="btn-primary" disabled={guardando}>
            {guardando ? "Registrando..." : "Registrar baja"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

export default function LotesVencidos() {
  const { user } = useAuth();
  const puedeDarDeBaja = tieneRol(user?.rol, ROLES_OPERACION);

  const [lotes, setLotes] = useState([]);
  const [resumen, setResumen] = useState(RESUMEN_VACIO);
  const [almacenes, setAlmacenes] = useState([]);
  const [categorias, setCategorias] = useState([]);
  const [filtros, setFiltros] = useState(FILTROS_INICIALES);
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0 });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [mensaje, setMensaje] = useState("");
  const [loteBaja, setLoteBaja] = useState(null);

  const cargar = async (page = 1) => {
    setLoading(true);
    setError("");
    try {
      const params = { page, limit: pagination.limit };
      if (filtros.id_almacen) params.id_almacen = filtros.id_almacen;
      if (filtros.id_categoria) params.id_categoria = filtros.id_categoria;
      if (filtros.search.trim()) params.search = filtros.search.trim();
      const respuesta = await consultarLotesVencidos(params);
      setLotes(respuesta.data || []);
      setResumen(respuesta.resumen || RESUMEN_VACIO);
      setPagination(respuesta.pagination || { page, limit: pagination.limit, total: 0 });
    } catch (err) {
      setError(err.response?.data?.message || "No se pudieron cargar los lotes vencidos");
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
    listarCategorias()
      .then((respuesta) => setCategorias(respuesta.data || []))
      .catch(() => setCategorias([]));
  }, []);

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">Productos vencidos</h1>
            <p className="text-sm text-gray-500">
              Lotes vencidos separados del stock disponible. No se pueden vender ni
              transferir; regístralos como salida por vencimiento para darlos de baja.
            </p>
          </div>
          <Link to="/reportes/vencimientos" className="btn-secondary">
            Ver bajas registradas
          </Link>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div className="card border-l-4 border-red-500">
            <p className="text-sm text-gray-500">Lotes vencidos</p>
            <p className="text-3xl font-bold text-red-600">{formatearNumero(resumen.total_lotes)}</p>
          </div>
          <div className="card border-l-4 border-amber-500">
            <p className="text-sm text-gray-500">Unidades fuera del stock disponible</p>
            <p className="text-3xl font-bold text-amber-600">
              {formatearNumero(resumen.total_unidades)}
            </p>
          </div>
          <div className="card border-l-4 border-gray-400">
            <p className="text-sm text-gray-500">Valor inmovilizado</p>
            <p className="text-3xl font-bold">{formatearBs(resumen.total_valor)}</p>
          </div>
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
              label="Categoría"
              value={filtros.id_categoria}
              onChange={(event) => setFiltros({ ...filtros, id_categoria: event.target.value })}
              options={categorias.map((categoria) => ({
                value: categoria.id_categoria,
                label: categoria.nombre,
              }))}
              placeholder="Todas las categorías"
            />
            <div>
              <label className="mb-1 block text-sm font-medium" htmlFor="buscar-vencido">
                Buscar
              </label>
              <input
                id="buscar-vencido"
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
                  <th className="py-2 pr-3 text-right">Valor</th>
                  <th className="py-2 pr-3">Estado</th>
                  {puedeDarDeBaja && <th className="py-2">Acción</th>}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan="8" className="py-6 text-center text-gray-500">
                      Cargando lotes vencidos...
                    </td>
                  </tr>
                ) : lotes.length === 0 ? (
                  <tr>
                    <td colSpan="8" className="py-6 text-center text-gray-500">
                      No hay lotes vencidos pendientes de baja.
                    </td>
                  </tr>
                ) : (
                  lotes.map((lote) => (
                    <tr key={lote.id_lote} className="border-b border-gray-100">
                      <td className="py-2 pr-3">
                        <div className="font-medium">{lote.producto}</div>
                        <div className="font-mono text-xs text-gray-500">
                          {lote.producto_codigo}
                          {lote.categoria ? ` · ${lote.categoria}` : ""}
                        </div>
                      </td>
                      <td className="py-2 pr-3 font-mono text-xs">{lote.numero_lote}</td>
                      <td className="py-2 pr-3">{lote.almacen}</td>
                      <td className="whitespace-nowrap py-2 pr-3">
                        <div>{formatearFecha(lote.fecha_vencimiento)}</div>
                        <div className="text-xs text-red-600">{textoDiasVencido(lote.dias_vencido)}</div>
                      </td>
                      <td className="py-2 pr-3 text-right">
                        {formatearNumero(lote.cantidad)} {lote.unidad || "unid."}
                      </td>
                      <td className="py-2 pr-3 text-right">{formatearBs(lote.valor)}</td>
                      <td className="py-2 pr-3">
                        <span className="rounded-full bg-red-100 px-2 py-1 text-xs font-semibold text-red-700">
                          VENCIDO
                        </span>
                      </td>
                      {puedeDarDeBaja && (
                        <td className="py-2">
                          <button
                            type="button"
                            className="font-semibold text-red-600 hover:underline"
                            onClick={() => {
                              setMensaje("");
                              setLoteBaja(lote);
                            }}
                          >
                            Dar de baja
                          </button>
                        </td>
                      )}
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

      {loteBaja && (
        <FormBajaVencido
          lote={loteBaja}
          onClose={() => setLoteBaja(null)}
          onSaved={(texto) => {
            setLoteBaja(null);
            setMensaje(texto);
            notificarCambioAlertas();
            cargar(pagination.page);
          }}
        />
      )}
    </Layout>
  );
}
