import { useEffect, useMemo, useState } from "react";
import Layout from "../../components/layout/Layout";
import Select from "../../components/ui/Select";
import BotonesExportar from "../../components/ui/BotonesExportar";
import Pagination from "../../components/ui/Pagination";
import { reporteAjustes } from "../../api/reportes.api";
import { listarAlmacenes } from "../../api/catalogos.api";
import { listarUsuarios } from "../../api/usuarios.api";
import {
  ESTILO_ESTADO_AJUSTE,
  MOTIVOS_AJUSTE,
  etiquetaEstadoAjuste,
  etiquetaMotivo,
} from "../../api/ajustes.api";
import { formatearValor } from "../../utils/exportar";

const FILTROS_INICIALES = {
  fecha_desde: "",
  fecha_hasta: "",
  id_usuario: "",
  id_almacen: "",
  motivo: "",
};

const RESUMEN_VACIO = {
  registros: 0,
  unidades: 0,
  valor_total: 0,
  aplicados: 0,
  valor_aplicado: 0,
  pendientes: 0,
  rechazados: 0,
};

const COLUMNAS = [
  { key: "numero_ajuste", label: "Número" },
  { key: "fecha_ajuste", label: "Fecha", tipo: "fecha" },
  { key: "responsable", label: "Responsable" },
  { key: "aprobador", label: "Aprobador", valor: (f) => f.aprobador || "Sin aprobador" },
  { key: "motivo", label: "Motivo", valor: (f) => etiquetaMotivo(f.motivo) },
  { key: "justificacion", label: "Justificación" },
  { key: "estado", label: "Estado", valor: (f) => etiquetaEstadoAjuste(f.estado) },
  { key: "almacen", label: "Almacén" },
  { key: "producto_codigo", label: "Código" },
  { key: "producto", label: "Producto" },
  { key: "diferencia", label: "Diferencia", tipo: "numero" },
  { key: "valor_ajuste", label: "Valor", tipo: "moneda" },
  { key: "motivo_rechazo", label: "Motivo de rechazo" },
];

function formatearFecha(fecha) {
  return fecha ? new Date(fecha).toLocaleString("es-BO") : "—";
}

function formatearDiferencia(valor) {
  const diferencia = Number(valor ?? 0);
  const texto = Math.abs(diferencia).toLocaleString("es-BO");
  if (diferencia > 0) return `+${texto}`;
  if (diferencia < 0) return `-${texto}`;
  return texto;
}

export default function ReporteAjustes() {
  const [filtros, setFiltros] = useState(FILTROS_INICIALES);
  const [registros, setRegistros] = useState([]);
  const [resumen, setResumen] = useState(RESUMEN_VACIO);
  const [porResponsable, setPorResponsable] = useState([]);
  const [porMotivo, setPorMotivo] = useState([]);
  const [almacenes, setAlmacenes] = useState([]);
  const [usuarios, setUsuarios] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ page: 1, limit: 100, total: 0 });

  useEffect(() => {
    listarAlmacenes().then((r) => setAlmacenes(r.data || [])).catch(() => setAlmacenes([]));
    listarUsuarios({ limit: 200, activo: true, orderBy: "nombre_completo", order: "ASC" })
      .then((r) => setUsuarios(r.data || []))
      .catch(() => setUsuarios([]));
  }, []);

  const fechasInvalidas = filtros.fecha_desde && filtros.fecha_hasta && filtros.fecha_desde > filtros.fecha_hasta;

  useEffect(() => {
    if (fechasInvalidas) return undefined;
    let vigente = true;
    setLoading(true);
    setError("");
    const params = Object.fromEntries(Object.entries(filtros).filter(([, v]) => v !== ""));
    reporteAjustes({ ...params, page, limit: 100 })
      .then((data) => {
        if (!vigente) return;
        setRegistros(data.data || []);
        setPagination(data.pagination || { page: 1, limit: 100, total: 0 });
        setResumen(data.resumen || RESUMEN_VACIO);
        setPorResponsable(data.por_responsable || []);
        setPorMotivo(data.por_motivo || []);
      })
      .catch((err) => {
        if (vigente) setError(err.response?.data?.message || "Error al cargar el reporte");
      })
      .finally(() => {
        if (vigente) setLoading(false);
      });
    return () => {
      vigente = false;
    };
  }, [filtros, page, fechasInvalidas]);

  const cambiar = (campo) => (e) => {
    setFiltros({ ...filtros, [campo]: e.target.value });
    setPage(1);
  };

  const paramsExportar = Object.fromEntries(Object.entries(filtros).filter(([, v]) => v !== ""));

  const subtitulo = useMemo(() => {
    const partes = [];
    if (filtros.fecha_desde || filtros.fecha_hasta) {
      partes.push(`Del ${filtros.fecha_desde || "inicio"} al ${filtros.fecha_hasta || "hoy"}`);
    }
    if (filtros.id_usuario) {
      const usuario = usuarios.find((u) => String(u.id_usuario) === String(filtros.id_usuario));
      partes.push(`Responsable: ${usuario?.nombre_completo || usuario?.nombre_usuario || filtros.id_usuario}`);
    }
    if (filtros.id_almacen) {
      const almacen = almacenes.find((a) => String(a.id_almacen) === String(filtros.id_almacen));
      partes.push(`Almacén: ${almacen?.nombre || filtros.id_almacen}`);
    }
    if (filtros.motivo) partes.push(etiquetaMotivo(filtros.motivo));
    return partes.length ? partes.join(" · ") : "Todos los períodos y responsables";
  }, [filtros, usuarios, almacenes]);

  const tarjetas = [
    { label: "Ajustes", valor: resumen.registros, tipo: "numero" },
    { label: "Valor total", valor: resumen.valor_total, tipo: "moneda" },
    { label: "Aplicados al stock", valor: resumen.aplicados, tipo: "numero" },
    { label: "Valor aplicado", valor: resumen.valor_aplicado, tipo: "moneda" },
  ];

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">Reporte de ajustes</h1>
            <p className="text-sm text-gray-500">
              Quién modificó el stock, con qué justificación y quién lo aprobó.
            </p>
          </div>
          <BotonesExportar
            titulo="Reporte de ajustes de inventario"
            subtitulo={subtitulo}
            nombreArchivo="ajustes"
            columnas={COLUMNAS}
            filas={registros}
            cargarFilas={() => reporteAjustes({ ...paramsExportar, todos: "true" }).then((r) => r.data)}
            resumen={tarjetas}
          />
        </div>

        <div className="card">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3 xl:grid-cols-6">
            <div>
              <label className="mb-1 block text-sm font-medium" htmlFor="ajuste-desde">
                Desde
              </label>
              <input
                id="ajuste-desde"
                type="date"
                className="input-field"
                value={filtros.fecha_desde}
                onChange={cambiar("fecha_desde")}
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium" htmlFor="ajuste-hasta">
                Hasta
              </label>
              <input
                id="ajuste-hasta"
                type="date"
                className="input-field"
                value={filtros.fecha_hasta}
                onChange={cambiar("fecha_hasta")}
              />
            </div>
            <Select
              label="Responsable"
              value={filtros.id_usuario}
              onChange={cambiar("id_usuario")}
              options={usuarios.map((u) => ({
                value: u.id_usuario,
                label: u.nombre_completo || u.nombre_usuario,
              }))}
              placeholder="Todos"
            />
            <Select
              label="Almacén"
              value={filtros.id_almacen}
              onChange={cambiar("id_almacen")}
              options={almacenes.map((a) => ({ value: a.id_almacen, label: `${a.codigo} - ${a.nombre}` }))}
              placeholder="Todos"
            />
            <Select
              label="Motivo"
              value={filtros.motivo}
              onChange={cambiar("motivo")}
              options={MOTIVOS_AJUSTE}
              placeholder="Todos"
            />
            <div className="flex items-end">
              <button
                type="button"
                className="btn-secondary w-full"
                onClick={() => {
                  setFiltros(FILTROS_INICIALES);
                  setPage(1);
                }}
              >
                Limpiar filtros
              </button>
            </div>
          </div>
          {fechasInvalidas && (
            <p className="mt-2 text-sm text-red-600">La fecha inicial no puede ser posterior a la final.</p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {tarjetas.map((t) => (
            <div key={t.label} className="rounded border border-gray-200 bg-gray-50 p-3">
              <p className="text-xs text-gray-600">{t.label}</p>
              <p className="text-xl font-bold">{formatearValor(t.valor || 0, t.tipo)}</p>
            </div>
          ))}
        </div>

        {error && <p className="rounded bg-red-50 p-2 text-sm text-red-600">{error}</p>}

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
          <div className="card">
            <h2 className="mb-3 font-semibold">Totales por responsable</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 text-left text-gray-500">
                    <th className="py-2">Responsable</th>
                    <th className="py-2 text-right">Ajustes</th>
                    <th className="py-2 text-right">Unidades</th>
                    <th className="py-2 text-right">Valor</th>
                  </tr>
                </thead>
                <tbody>
                  {porResponsable.length === 0 ? (
                    <tr>
                      <td colSpan="4" className="py-4 text-center text-gray-500">
                        Sin datos
                      </td>
                    </tr>
                  ) : (
                    porResponsable.map((f) => (
                      <tr key={f.id_usuario} className="border-b border-gray-100">
                        <td className="py-2 font-medium">{f.responsable}</td>
                        <td className="py-2 text-right">{formatearValor(f.registros, "numero")}</td>
                        <td className="py-2 text-right">{formatearValor(f.unidades, "numero")}</td>
                        <td className="py-2 text-right font-semibold">{formatearValor(f.valor, "moneda")}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="card">
            <h2 className="mb-3 font-semibold">Totales por motivo</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 text-left text-gray-500">
                    <th className="py-2">Motivo</th>
                    <th className="py-2 text-right">Ajustes</th>
                    <th className="py-2 text-right">Unidades</th>
                    <th className="py-2 text-right">Valor</th>
                  </tr>
                </thead>
                <tbody>
                  {porMotivo.length === 0 ? (
                    <tr>
                      <td colSpan="4" className="py-4 text-center text-gray-500">
                        Sin datos
                      </td>
                    </tr>
                  ) : (
                    porMotivo.map((f) => (
                      <tr key={f.motivo} className="border-b border-gray-100">
                        <td className="py-2 font-medium">{etiquetaMotivo(f.motivo)}</td>
                        <td className="py-2 text-right">{formatearValor(f.registros, "numero")}</td>
                        <td className="py-2 text-right">{formatearValor(f.unidades, "numero")}</td>
                        <td className="py-2 text-right font-semibold">{formatearValor(f.valor, "moneda")}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div className="card">
          <h2 className="mb-3 font-semibold">Detalle de ajustes</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-left text-gray-500">
                  <th className="py-2 pr-3">Fecha</th>
                  <th className="py-2 pr-3">Producto</th>
                  <th className="py-2 pr-3">Almacén</th>
                  <th className="py-2 pr-3">Responsable</th>
                  <th className="py-2 pr-3">Aprobador</th>
                  <th className="py-2 pr-3">Motivo</th>
                  <th className="py-2 pr-3 text-right">Diferencia</th>
                  <th className="py-2 pr-3 text-right">Valor</th>
                  <th className="py-2">Estado</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan="9" className="py-6 text-center text-gray-500">
                      Cargando...
                    </td>
                  </tr>
                ) : registros.length === 0 ? (
                  <tr>
                    <td colSpan="9" className="py-6 text-center text-gray-500">
                      No hay ajustes con esos filtros
                    </td>
                  </tr>
                ) : (
                  registros.map((r) => (
                    <tr key={r.id_ajuste} className="border-b border-gray-100 align-top hover:bg-gray-50">
                      <td className="whitespace-nowrap py-2 pr-3">
                        <div>{formatearFecha(r.fecha_ajuste)}</div>
                        <div className="font-mono text-xs text-gray-500">{r.numero_ajuste}</div>
                      </td>
                      <td className="py-2 pr-3">
                        <div className="font-medium">{r.producto}</div>
                        <div className="font-mono text-xs text-gray-500">{r.producto_codigo}</div>
                      </td>
                      <td className="py-2 pr-3">{r.almacen}</td>
                      <td className="py-2 pr-3">{r.responsable}</td>
                      <td className="py-2 pr-3">
                        <div>{r.aprobador || "Sin aprobador"}</div>
                        {r.fecha_aprobacion && (
                          <div className="text-xs text-gray-500">{formatearFecha(r.fecha_aprobacion)}</div>
                        )}
                      </td>
                      <td className="py-2 pr-3">
                        <div>{etiquetaMotivo(r.motivo)}</div>
                        <div className="max-w-xs text-xs text-gray-500">{r.justificacion}</div>
                        {r.motivo_rechazo && (
                          <div className="max-w-xs text-xs text-red-600">Rechazo: {r.motivo_rechazo}</div>
                        )}
                      </td>
                      <td className="py-2 pr-3 text-right font-semibold">{formatearDiferencia(r.diferencia)}</td>
                      <td className="py-2 pr-3 text-right font-semibold">{formatearValor(r.valor_ajuste, "moneda")}</td>
                      <td className="py-2">
                        <span
                          className={`whitespace-nowrap rounded-full px-2 py-1 text-xs font-semibold ${
                            ESTILO_ESTADO_AJUSTE[r.estado] || "bg-gray-100 text-gray-600"
                          }`}
                        >
                          {etiquetaEstadoAjuste(r.estado)}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <Pagination page={pagination.page} limit={pagination.limit} total={pagination.total} onChange={setPage} />
        </div>
      </div>
    </Layout>
  );
}
