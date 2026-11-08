import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import Layout from "../../components/layout/Layout";
import Modal from "../../components/ui/Modal";
import Pagination from "../../components/ui/Pagination";
import Select from "../../components/ui/Select";
import { useAuth } from "../../context/AuthContext";
import {
  ROLES_ADMINISTRACION,
  ROLES_APROBACION_AJUSTES,
  tieneRol,
} from "../../utils/permissions";
import { listarAlmacenes } from "../../api/almacenes.api";
import {
  actualizarLimitesAprobacion,
  aprobarAjuste,
  etiquetaMotivo,
  listarAjustes,
  notificarCambioAjustesPendientes,
  obtenerLimitesAprobacion,
  rechazarAjuste,
} from "../../api/ajustes.api";

const formatearNumero = (valor) => Number(valor ?? 0).toLocaleString("es-BO");
const formatearBs = (valor) =>
  `Bs ${Number(valor ?? 0).toLocaleString("es-BO", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const formatearFecha = (fecha) => (fecha ? new Date(fecha).toLocaleString("es-BO") : "-");

function formatearDiferencia(ajuste) {
  const diferencia = Number(ajuste.cantidad_nueva ?? 0) - Number(ajuste.cantidad_anterior ?? 0);
  const texto = Math.abs(diferencia).toLocaleString("es-BO");
  if (diferencia > 0) return `+${texto}`;
  if (diferencia < 0) return `-${texto}`;
  return texto;
}

function razonesLimite(ajuste, limites) {
  if (!limites) return [];
  const diferencia = Math.abs(Number(ajuste.cantidad_nueva) - Number(ajuste.cantidad_anterior));
  const razones = [];
  if (diferencia > Number(limites.limite_cantidad)) razones.push("Cantidad");
  if (Number(ajuste.valor_ajuste) > Number(limites.limite_monto)) razones.push("Monto");
  return razones;
}

function FormLimites({ limites, onSaved }) {
  const [form, setForm] = useState({
    limite_cantidad: String(limites.limite_cantidad),
    limite_monto: String(limites.limite_monto),
  });
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");

  const enviar = async (event) => {
    event.preventDefault();
    setError("");
    const limiteCantidad = Number(form.limite_cantidad);
    const limiteMonto = Number(form.limite_monto);
    if (!(limiteCantidad > 0) || !(limiteMonto > 0)) {
      return setError("Ambos límites deben ser números mayores a 0");
    }
    setGuardando(true);
    try {
      const respuesta = await actualizarLimitesAprobacion({
        limite_cantidad: limiteCantidad,
        limite_monto: limiteMonto,
      });
      onSaved(respuesta.data, respuesta.message);
    } catch (err) {
      setError(err.response?.data?.message || "No se pudieron guardar los límites");
    } finally {
      setGuardando(false);
    }
  };

  return (
    <form className="grid grid-cols-1 gap-3 md:grid-cols-4" onSubmit={enviar}>
      <div>
        <label className="mb-1 block text-sm font-medium" htmlFor="limite-cantidad">
          Límite de cantidad (unidades)
        </label>
        <input
          id="limite-cantidad"
          type="number"
          min="1"
          step="1"
          className="input-field"
          value={form.limite_cantidad}
          onChange={(event) => setForm({ ...form, limite_cantidad: event.target.value })}
        />
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium" htmlFor="limite-monto">
          Límite de monto (Bs)
        </label>
        <input
          id="limite-monto"
          type="number"
          min="0.01"
          step="0.01"
          className="input-field"
          value={form.limite_monto}
          onChange={(event) => setForm({ ...form, limite_monto: event.target.value })}
        />
      </div>
      <div className="flex items-end">
        <button type="submit" className="btn-primary w-full" disabled={guardando}>
          {guardando ? "Guardando..." : "Guardar límites"}
        </button>
      </div>
      {error && (
        <p className="rounded bg-red-50 p-2 text-sm text-red-600 md:col-span-4">{error}</p>
      )}
    </form>
  );
}

export default function BandejaAprobacionAjustes() {
  const { user } = useAuth();
  const puedeDecidir = tieneRol(user?.rol, ROLES_APROBACION_AJUSTES);
  const puedeConfigurar = tieneRol(user?.rol, ROLES_ADMINISTRACION);

  const [ajustes, setAjustes] = useState([]);
  const [limites, setLimites] = useState(null);
  const [almacenes, setAlmacenes] = useState([]);
  const [idAlmacen, setIdAlmacen] = useState("");
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0 });
  const [loading, setLoading] = useState(false);
  const [procesando, setProcesando] = useState(null);
  const [error, setError] = useState("");
  const [mensaje, setMensaje] = useState("");
  const [rechazo, setRechazo] = useState(null);
  const [motivoRechazo, setMotivoRechazo] = useState("");
  const [errorRechazo, setErrorRechazo] = useState("");

  const cargar = async (page = 1) => {
    setLoading(true);
    setError("");
    try {
      const params = { page, limit: pagination.limit, estado: "PENDIENTE" };
      if (idAlmacen) params.id_almacen = idAlmacen;
      const respuesta = await listarAjustes(params);
      setAjustes(respuesta.data || []);
      setPagination(respuesta.pagination || { page, limit: pagination.limit, total: 0 });
    } catch (err) {
      setError(err.response?.data?.message || "No se pudieron cargar los ajustes pendientes");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    cargar(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idAlmacen]);

  useEffect(() => {
    obtenerLimitesAprobacion()
      .then((respuesta) => setLimites(respuesta.data))
      .catch(() => setLimites(null));
    listarAlmacenes({ limit: 200, activo: true, orderBy: "nombre", order: "ASC" })
      .then((respuesta) => setAlmacenes(respuesta.data || []))
      .catch(() => setAlmacenes([]));
  }, []);

  const despuesDeDecidir = async (texto) => {
    setMensaje(texto);
    notificarCambioAjustesPendientes();
    await cargar(pagination.page);
  };

  const aprobar = async (ajuste) => {
    if (
      !window.confirm(
        `¿Aprobar el ajuste ${ajuste.numero_ajuste}? El stock de ${ajuste.producto} pasará de ${formatearNumero(ajuste.cantidad_anterior)} a ${formatearNumero(ajuste.cantidad_nueva)}.`,
      )
    ) {
      return;
    }
    setProcesando(ajuste.id_ajuste);
    setError("");
    setMensaje("");
    try {
      const respuesta = await aprobarAjuste(ajuste.id_ajuste);
      await despuesDeDecidir(respuesta.message || "Ajuste aprobado");
    } catch (err) {
      setError(err.response?.data?.message || "No se pudo aprobar el ajuste");
    } finally {
      setProcesando(null);
    }
  };

  const confirmarRechazo = async (event) => {
    event.preventDefault();
    setErrorRechazo("");
    if (motivoRechazo.trim().length < 5) {
      return setErrorRechazo("Indica el motivo del rechazo (mínimo 5 caracteres)");
    }
    setProcesando(rechazo.id_ajuste);
    try {
      const respuesta = await rechazarAjuste(rechazo.id_ajuste, motivoRechazo.trim());
      setRechazo(null);
      setMotivoRechazo("");
      await despuesDeDecidir(respuesta.message || "Ajuste rechazado");
    } catch (err) {
      setErrorRechazo(err.response?.data?.message || "No se pudo rechazar el ajuste");
    } finally {
      setProcesando(null);
    }
  };

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">Aprobación de ajustes</h1>
            <p className="text-sm text-gray-500">
              Ajustes que superan el límite de cantidad o monto. No modifican el stock hasta
              que un supervisor los aprueba.
            </p>
          </div>
          <Link to="/ajustes" className="btn-secondary">
            Ver historial de ajustes
          </Link>
        </div>

        <section className="card space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-semibold">Límites de aprobación</h2>
            {limites?.fecha_actualizacion && (
              <p className="text-xs text-gray-500">
                Actualizado el {formatearFecha(limites.fecha_actualizacion)}
                {limites.usuario_actualiza ? ` por ${limites.usuario_actualiza}` : ""}
              </p>
            )}
          </div>
          {!limites ? (
            <p className="text-sm text-gray-500">No se pudieron cargar los límites.</p>
          ) : puedeConfigurar ? (
            <FormLimites
              key={`${limites.limite_cantidad}-${limites.limite_monto}`}
              limites={limites}
              onSaved={(data, texto) => {
                setLimites(data);
                setMensaje(texto || "Límites actualizados");
              }}
            />
          ) : (
            <p className="text-sm text-gray-700">
              Requieren aprobación los ajustes con una diferencia mayor a{" "}
              <strong>{formatearNumero(limites.limite_cantidad)} unidades</strong> o un valor
              mayor a <strong>{formatearBs(limites.limite_monto)}</strong>.
            </p>
          )}
        </section>

        {mensaje && <p className="rounded bg-green-50 p-3 text-sm text-green-700">{mensaje}</p>}
        {!puedeDecidir && (
          <p className="rounded bg-amber-50 p-3 text-sm text-amber-800">
            Solo un supervisor de inventario puede aprobar o rechazar estos ajustes.
          </p>
        )}

        <section className="card space-y-4">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
            <Select
              label="Almacén"
              value={idAlmacen}
              onChange={(event) => setIdAlmacen(event.target.value)}
              options={almacenes.map((almacen) => ({
                value: almacen.id_almacen,
                label: `${almacen.codigo} - ${almacen.nombre}`,
              }))}
              placeholder="Todos los almacenes"
            />
            <div className="flex items-end md:col-span-3">
              <p className="text-sm text-gray-500">
                {formatearNumero(pagination.total)} ajuste(s) pendiente(s), del más antiguo al más reciente.
              </p>
            </div>
          </div>

          {error && <p className="rounded bg-red-50 p-3 text-sm text-red-600">{error}</p>}

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-left text-gray-500">
                  <th className="py-2 pr-3">Número</th>
                  <th className="py-2 pr-3">Registrado</th>
                  <th className="py-2 pr-3">Producto</th>
                  <th className="py-2 pr-3">Almacén</th>
                  <th className="py-2 pr-3 text-right">Anterior</th>
                  <th className="py-2 pr-3 text-right">Nueva</th>
                  <th className="py-2 pr-3 text-right">Diferencia</th>
                  <th className="py-2 pr-3 text-right">Monto</th>
                  <th className="py-2 pr-3">Supera</th>
                  <th className="py-2 pr-3">Justificación</th>
                  {puedeDecidir && <th className="py-2">Acciones</th>}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan="11" className="py-6 text-center text-gray-500">
                      Cargando ajustes pendientes...
                    </td>
                  </tr>
                ) : ajustes.length === 0 ? (
                  <tr>
                    <td colSpan="11" className="py-6 text-center text-gray-500">
                      No hay ajustes pendientes de aprobación.
                    </td>
                  </tr>
                ) : (
                  ajustes.map((ajuste) => {
                    const propio = Number(ajuste.id_usuario) === Number(user?.id_usuario);
                    return (
                      <tr key={ajuste.id_ajuste} className="border-b border-gray-100 align-top">
                        <td className="py-2 pr-3 font-mono text-xs">{ajuste.numero_ajuste}</td>
                        <td className="whitespace-nowrap py-2 pr-3">
                          <div>{formatearFecha(ajuste.fecha_ajuste)}</div>
                          <div className="text-xs text-gray-500">{ajuste.usuario || "-"}</div>
                        </td>
                        <td className="py-2 pr-3">
                          <div className="font-medium">{ajuste.producto}</div>
                          <div className="font-mono text-xs text-gray-500">{ajuste.producto_codigo}</div>
                        </td>
                        <td className="py-2 pr-3">{ajuste.almacen}</td>
                        <td className="py-2 pr-3 text-right">{formatearNumero(ajuste.cantidad_anterior)}</td>
                        <td className="py-2 pr-3 text-right">{formatearNumero(ajuste.cantidad_nueva)}</td>
                        <td className="py-2 pr-3 text-right font-medium">{formatearDiferencia(ajuste)}</td>
                        <td className="py-2 pr-3 text-right">{formatearBs(ajuste.valor_ajuste)}</td>
                        <td className="py-2 pr-3">
                          <div className="flex flex-wrap gap-1">
                            {razonesLimite(ajuste, limites).map((razon) => (
                              <span
                                key={razon}
                                className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800"
                              >
                                {razon}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td className="max-w-xs py-2 pr-3">
                          <div className="font-medium">{etiquetaMotivo(ajuste.motivo)}</div>
                          <div className="text-xs text-gray-600">{ajuste.comentario}</div>
                        </td>
                        {puedeDecidir && (
                          <td className="whitespace-nowrap py-2">
                            {propio ? (
                              <span className="text-xs text-gray-500">Registrado por ti</span>
                            ) : (
                              <div className="flex gap-3">
                                <button
                                  type="button"
                                  className="font-semibold text-green-700 hover:underline disabled:opacity-50"
                                  disabled={procesando !== null}
                                  onClick={() => aprobar(ajuste)}
                                >
                                  Aprobar
                                </button>
                                <button
                                  type="button"
                                  className="font-semibold text-red-600 hover:underline disabled:opacity-50"
                                  disabled={procesando !== null}
                                  onClick={() => {
                                    setErrorRechazo("");
                                    setMotivoRechazo("");
                                    setRechazo(ajuste);
                                  }}
                                >
                                  Rechazar
                                </button>
                              </div>
                            )}
                          </td>
                        )}
                      </tr>
                    );
                  })
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

      {rechazo && (
        <Modal open onClose={() => setRechazo(null)} title={`Rechazar ajuste ${rechazo.numero_ajuste}`}>
          <form className="space-y-4" onSubmit={confirmarRechazo}>
            <p className="text-sm text-gray-600">
              {rechazo.producto} en {rechazo.almacen}: {formatearNumero(rechazo.cantidad_anterior)} →{" "}
              {formatearNumero(rechazo.cantidad_nueva)}. El stock no se modificará.
            </p>
            <div>
              <label className="mb-1 block text-sm font-medium" htmlFor="motivo-rechazo">
                Motivo del rechazo *
              </label>
              <textarea
                id="motivo-rechazo"
                rows="3"
                maxLength={500}
                className="input-field"
                value={motivoRechazo}
                onChange={(event) => setMotivoRechazo(event.target.value)}
                placeholder="Ej.: recontar el producto antes de ajustar"
              />
            </div>
            {errorRechazo && (
              <p className="rounded bg-red-50 p-3 text-sm text-red-600">{errorRechazo}</p>
            )}
            <div className="flex justify-end gap-2">
              <button type="button" className="btn-secondary" onClick={() => setRechazo(null)}>
                Cancelar
              </button>
              <button type="submit" className="btn-primary" disabled={procesando !== null}>
                Rechazar ajuste
              </button>
            </div>
          </form>
        </Modal>
      )}
    </Layout>
  );
}
