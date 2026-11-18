import { useCallback, useEffect, useState } from "react";
import Layout from "../../components/layout/Layout";
import Modal from "../../components/ui/Modal";
import Select from "../../components/ui/Select";
import { listarAlmacenes } from "../../api/catalogos.api";
import {
  actualizarProgramacion,
  cambiarEstadoProgramacion,
  crearProgramacion,
  enviarProgramacionAhora,
  listarEnviosReporte,
  listarProgramaciones,
  listarTiposReporte,
} from "../../api/programacionesReporte.api";
import { useAuth } from "../../context/AuthContext";
import { ROLES_PROGRAMAN_REPORTES, tieneRol } from "../../utils/permissions";

const DIAS_SEMANA = [
  { value: 1, label: "Lunes" },
  { value: 2, label: "Martes" },
  { value: 3, label: "Miércoles" },
  { value: 4, label: "Jueves" },
  { value: 5, label: "Viernes" },
  { value: 6, label: "Sábado" },
  { value: 7, label: "Domingo" },
];
const FRECUENCIAS = [
  { value: "DIARIA", label: "Diaria" },
  { value: "SEMANAL", label: "Semanal" },
  { value: "MENSUAL", label: "Mensual" },
];
const FORM_VACIO = {
  nombre: "",
  tipo_reporte: "",
  frecuencia: "SEMANAL",
  dia_semana: "1",
  dia_mes: "1",
  hora: "07:00",
  id_almacen: "",
  destinatarios: "",
};

const fechaHora = (v) => (v ? new Date(v).toLocaleString("es-BO", { dateStyle: "short", timeStyle: "short" }) : "—");

function describirFrecuencia(p) {
  if (p.frecuencia === "DIARIA") return `Todos los días a las ${p.hora}`;
  if (p.frecuencia === "SEMANAL") {
    const dia = DIAS_SEMANA.find((d) => d.value === p.dia_semana)?.label.toLowerCase();
    return `Cada ${dia} a las ${p.hora}`;
  }
  return `El día ${p.dia_mes} de cada mes a las ${p.hora}`;
}

function FormProgramacion({ inicial, tipos, almacenes, onClose, onSaved }) {
  const [form, setForm] = useState(() =>
    inicial
      ? {
          nombre: inicial.nombre,
          tipo_reporte: inicial.tipo_reporte,
          frecuencia: inicial.frecuencia,
          dia_semana: String(inicial.dia_semana || 1),
          dia_mes: String(inicial.dia_mes || 1),
          hora: inicial.hora,
          id_almacen: inicial.parametros?.id_almacen ? String(inicial.parametros.id_almacen) : "",
          destinatarios: inicial.destinatarios.join(", "),
        }
      : FORM_VACIO,
  );
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);
  const cambiar = (campo) => (e) => setForm({ ...form, [campo]: e.target.value });

  const guardar = async (e) => {
    e.preventDefault();
    setError("");
    if (!form.tipo_reporte) return setError("Elige el reporte a enviar");
    setGuardando(true);
    const datos = {
      nombre: form.nombre.trim(),
      tipo_reporte: form.tipo_reporte,
      frecuencia: form.frecuencia,
      dia_semana: form.frecuencia === "SEMANAL" ? Number(form.dia_semana) : null,
      dia_mes: form.frecuencia === "MENSUAL" ? Number(form.dia_mes) : null,
      hora: form.hora,
      destinatarios: form.destinatarios,
      parametros: form.id_almacen ? { id_almacen: Number(form.id_almacen) } : {},
      activo: inicial ? inicial.activo : true,
    };
    try {
      if (inicial) await actualizarProgramacion(inicial.id_programacion, datos);
      else await crearProgramacion(datos);
      onSaved(inicial ? "Programación actualizada" : "Programación creada");
    } catch (err) {
      setError(err.response?.data?.message || "No se pudo guardar la programación");
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Modal open onClose={onClose} title={inicial ? "Editar programación" : "Programar envío de reporte"}>
      <form onSubmit={guardar} className="space-y-3">
        <div>
          <label className="mb-1 block text-sm font-medium">Nombre *</label>
          <input className="input-field" value={form.nombre} onChange={cambiar("nombre")} placeholder="Ej.: KPIs de la semana" />
        </div>
        <Select
          label="Reporte *"
          value={form.tipo_reporte}
          onChange={cambiar("tipo_reporte")}
          options={tipos.map((t) => ({ value: t.codigo, label: t.nombre }))}
          placeholder="Elige un reporte"
        />
        <Select
          label="Almacén"
          value={form.id_almacen}
          onChange={cambiar("id_almacen")}
          options={almacenes.map((a) => ({ value: a.id_almacen, label: `${a.codigo} - ${a.nombre}` }))}
          placeholder="Todas las sucursales"
        />
        <div className="grid grid-cols-3 gap-2">
          <Select label="Frecuencia *" value={form.frecuencia} onChange={cambiar("frecuencia")} options={FRECUENCIAS} placeholder="Elige" />
          {form.frecuencia === "SEMANAL" && (
            <Select label="Día" value={form.dia_semana} onChange={cambiar("dia_semana")} options={DIAS_SEMANA} placeholder="Elige" />
          )}
          {form.frecuencia === "MENSUAL" && (
            <div>
              <label className="mb-1 block text-sm font-medium">Día del mes</label>
              <input type="number" min="1" max="28" className="input-field" value={form.dia_mes} onChange={cambiar("dia_mes")} />
            </div>
          )}
          <div className={form.frecuencia === "DIARIA" ? "col-span-2" : ""}>
            <label className="mb-1 block text-sm font-medium">Hora *</label>
            <input type="time" className="input-field" value={form.hora} onChange={cambiar("hora")} />
          </div>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">Destinatarios *</label>
          <textarea
            className="input-field"
            rows="2"
            value={form.destinatarios}
            onChange={cambiar("destinatarios")}
            placeholder="correo@empresa.com, otro@empresa.com"
          />
          <p className="mt-1 text-xs text-gray-500">Separa los correos con coma. Hasta 20.</p>
        </div>
        {error && <p className="rounded bg-red-50 p-2 text-sm text-red-600">{error}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" className="btn-secondary" onClick={onClose} disabled={guardando}>
            Cancelar
          </button>
          <button type="submit" className="btn-primary" disabled={guardando}>
            {guardando ? "Guardando..." : "Guardar"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

export default function ProgramacionReportes() {
  const { user } = useAuth();
  const puedeGestionar = tieneRol(user?.rol, ROLES_PROGRAMAN_REPORTES);

  const [programaciones, setProgramaciones] = useState([]);
  const [envios, setEnvios] = useState([]);
  const [tipos, setTipos] = useState([]);
  const [correoConfigurado, setCorreoConfigurado] = useState(true);
  const [almacenes, setAlmacenes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [mensaje, setMensaje] = useState("");
  const [editando, setEditando] = useState(undefined);
  const [ocupado, setOcupado] = useState(null);

  const cargar = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [p, e] = await Promise.all([listarProgramaciones(), listarEnviosReporte()]);
      setProgramaciones(p.data || []);
      setEnvios(e.data || []);
    } catch (err) {
      setError(err.response?.data?.message || "Error al cargar las programaciones");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    cargar();
    listarTiposReporte()
      .then((r) => {
        setTipos(r.data || []);
        setCorreoConfigurado(r.correo_configurado !== false);
      })
      .catch(() => setTipos([]));
    listarAlmacenes().then((r) => setAlmacenes(r.data || [])).catch(() => setAlmacenes([]));
  }, [cargar]);

  const nombreTipo = (codigo) => tipos.find((t) => t.codigo === codigo)?.nombre || codigo;
  const nombreAlmacen = (p) =>
    almacenes.find((a) => a.id_almacen === p.parametros?.id_almacen)?.nombre || "Todas las sucursales";

  const accion = async (id, fn, textoOk) => {
    setOcupado(id);
    setMensaje("");
    setError("");
    try {
      const r = await fn();
      setMensaje(r.message || textoOk);
    } catch (err) {
      setError(err.response?.data?.message || "La operación no se pudo completar");
    } finally {
      setOcupado(null);
      cargar();
    }
  };

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">Envío programado de reportes</h1>
            <p className="text-sm text-gray-500">
              Recibe los reportes por correo en PDF cada día, semana o mes (RF70)
            </p>
          </div>
          {puedeGestionar && (
            <button className="btn-primary" onClick={() => setEditando(null)}>
              + Nueva programación
            </button>
          )}
        </div>

        {!correoConfigurado && (
          <p className="rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
            El servidor todavía no tiene una cuenta de correo configurada (SMTP). Las programaciones se
            guardan, pero cada envío quedará registrado con error hasta que se configure.
          </p>
        )}
        {mensaje && <p className="rounded bg-green-50 p-2 text-sm text-green-700">{mensaje}</p>}
        {error && <p className="rounded bg-red-50 p-2 text-sm text-red-600">{error}</p>}

        <div className="card">
          <h2 className="mb-3 font-semibold">Programaciones</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-left text-gray-500">
                  <th className="py-2">Nombre</th>
                  <th className="py-2">Reporte</th>
                  <th className="py-2">Frecuencia</th>
                  <th className="py-2">Destinatarios</th>
                  <th className="py-2">Próximo envío</th>
                  <th className="py-2">Último resultado</th>
                  <th className="py-2">Estado</th>
                  {puedeGestionar && <th className="py-2 text-right">Acciones</th>}
                </tr>
              </thead>
              <tbody>
                {loading && programaciones.length === 0 ? (
                  <tr>
                    <td colSpan="8" className="py-6 text-center text-gray-500">Cargando...</td>
                  </tr>
                ) : programaciones.length === 0 ? (
                  <tr>
                    <td colSpan="8" className="py-6 text-center text-gray-500">
                      Todavía no hay reportes programados
                    </td>
                  </tr>
                ) : (
                  programaciones.map((p) => (
                    <tr key={p.id_programacion} className={`border-b border-gray-100 align-top ${p.activo ? "" : "text-gray-400"}`}>
                      <td className="py-2 font-medium">{p.nombre}</td>
                      <td className="py-2">
                        <div>{nombreTipo(p.tipo_reporte)}</div>
                        <div className="text-xs text-gray-500">{nombreAlmacen(p)}</div>
                      </td>
                      <td className="py-2">{describirFrecuencia(p)}</td>
                      <td className="py-2 text-xs">{p.destinatarios.join(", ")}</td>
                      <td className="whitespace-nowrap py-2">{p.activo ? fechaHora(p.proximo_envio) : "—"}</td>
                      <td className="py-2">
                        {!p.ultimo_estado ? (
                          <span className="text-xs text-gray-500">Sin envíos</span>
                        ) : (
                          <span
                            className={`whitespace-nowrap rounded-full px-2 py-1 text-xs font-semibold ${
                              p.ultimo_estado === "ENVIADO" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
                            }`}
                            title={p.ultimo_error || undefined}
                          >
                            {p.ultimo_estado === "ENVIADO" ? "✓ Enviado" : "✕ Error"} · {fechaHora(p.ultima_fecha_bitacora)}
                          </span>
                        )}
                      </td>
                      <td className="py-2">
                        <span
                          className={`rounded-full px-2 py-1 text-xs font-semibold ${
                            p.activo ? "bg-blue-100 text-blue-700" : "bg-gray-200 text-gray-600"
                          }`}
                        >
                          {p.activo ? "Activa" : "Desactivada"}
                        </span>
                      </td>
                      {puedeGestionar && (
                        <td className="whitespace-nowrap py-2 text-right">
                          <button
                            className="mr-2 text-xs font-semibold text-brand-blue hover:underline disabled:opacity-50"
                            disabled={ocupado === p.id_programacion}
                            onClick={() => accion(p.id_programacion, () => enviarProgramacionAhora(p.id_programacion), "Reporte enviado")}
                          >
                            {ocupado === p.id_programacion ? "Enviando..." : "Enviar ahora"}
                          </button>
                          <button className="mr-2 text-xs font-semibold text-brand-blue hover:underline" onClick={() => setEditando(p)}>
                            Editar
                          </button>
                          <button
                            className="text-xs font-semibold text-gray-600 hover:underline disabled:opacity-50"
                            disabled={ocupado === p.id_programacion}
                            onClick={() =>
                              accion(p.id_programacion, () => cambiarEstadoProgramacion(p.id_programacion, !p.activo))
                            }
                          >
                            {p.activo ? "Desactivar" : "Activar"}
                          </button>
                        </td>
                      )}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="card">
          <h2 className="mb-3 font-semibold">Bitácora de envíos</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-left text-gray-500">
                  <th className="py-2">Fecha</th>
                  <th className="py-2">Programación</th>
                  <th className="py-2">Destinatarios</th>
                  <th className="py-2 text-right">Registros</th>
                  <th className="py-2 pl-6">Origen</th>
                  <th className="py-2">Resultado</th>
                </tr>
              </thead>
              <tbody>
                {envios.length === 0 ? (
                  <tr>
                    <td colSpan="6" className="py-6 text-center text-gray-500">Aún no se envió ningún reporte</td>
                  </tr>
                ) : (
                  envios.map((e) => (
                    <tr key={e.id_envio} className="border-b border-gray-100">
                      <td className="whitespace-nowrap py-2">{fechaHora(e.fecha_envio)}</td>
                      <td className="py-2">{e.nombre}</td>
                      <td className="py-2 text-xs">{e.destinatarios.join(", ")}</td>
                      <td className="py-2 text-right">{e.registros ?? "—"}</td>
                      <td className="py-2 pl-6 text-xs">{e.manual ? `Manual · ${e.usuario || ""}` : "Automático"}</td>
                      <td className="py-2">
                        {e.estado === "ENVIADO" ? (
                          <span className="text-xs font-semibold text-green-700">✓ Enviado</span>
                        ) : (
                          <span className="text-xs font-semibold text-red-700">✕ {e.mensaje_error}</span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {editando !== undefined && (
        <FormProgramacion
          inicial={editando}
          tipos={tipos}
          almacenes={almacenes}
          onClose={() => setEditando(undefined)}
          onSaved={(texto) => {
            setEditando(undefined);
            setMensaje(texto);
            cargar();
          }}
        />
      )}
    </Layout>
  );
}
