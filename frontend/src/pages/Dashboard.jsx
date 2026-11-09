import { useMemo } from "react";
import { Link } from "react-router-dom";
import Layout from "../components/layout/Layout";
import AvisoConteo from "../components/layout/AvisoConteo";
import { modulosParaRol, tonoModulo, totalAvisos } from "../components/layout/navegacion";
import { useAvisos } from "../components/layout/useAvisos";
import { useResumenAlertasVencimiento } from "../components/ui/IndicadorAlertasVencimiento";
import { useAuth } from "../context/AuthContext";
import { ROLES_LECTURA_Y_OPERACION, ROLES_OPERACION, tieneRol } from "../utils/permissions";

const ACCIONES_RAPIDAS = [
  { to: "/barcode", label: "Buscar por código", icon: "🔍" },
  { to: "/stock", label: "Consultar stock", icon: "📈", roles: ROLES_LECTURA_Y_OPERACION },
  { to: "/recepciones/nueva", label: "Nueva recepción", icon: "📥", roles: ROLES_OPERACION },
  { to: "/salidas", label: "Salidas", icon: "📤", roles: ROLES_OPERACION },
  { to: "/transferencias", label: "Transferencias", icon: "🔄", roles: ROLES_OPERACION },
];

function TarjetaAviso({ to, icon, titulo, detalle, tono }) {
  return (
    <Link
      to={to}
      className={`card block border-l-4 transition-shadow hover:shadow-md ${
        tono === "rojo" ? "border-l-red-500" : "border-l-amber-500"
      }`}
    >
      <p className="font-semibold">
        <span aria-hidden="true">{icon} </span>
        {titulo}
      </p>
      <p className="mt-1 text-sm text-gray-600">{detalle}</p>
    </Link>
  );
}

export default function Dashboard() {
  const { user } = useAuth();
  const avisos = useAvisos();
  const vencimientos = useResumenAlertasVencimiento();
  const modulos = useMemo(() => modulosParaRol(user?.rol), [user?.rol]);

  const puedeVer = (ruta) =>
    modulos.some((modulo) => modulo.destinos.some((destino) => destino.to === ruta));
  const acciones = ACCIONES_RAPIDAS.filter(
    (accion) => !accion.roles || tieneRol(user?.rol, accion.roles),
  );

  const ajustesPendientes = avisos["/ajustes/aprobacion"].cantidad;
  const mostrarVencimientos = puedeVer("/alertas-vencimiento") && vencimientos.pendientes > 0;
  const mostrarAjustes = puedeVer("/ajustes/aprobacion") && ajustesPendientes > 0;

  return (
    <Layout>
      <div className="space-y-8">
        <div>
          <h1 className="text-2xl font-bold">
            Hola, {user?.nombre_completo || user?.nombre_usuario}
          </h1>
          <p className="text-gray-600">¿Qué quieres hacer hoy?</p>
        </div>

        <section aria-label="Acciones rápidas" className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
          {acciones.map((accion) => (
            <Link
              key={accion.to}
              to={accion.to}
              className="flex items-center gap-3 rounded-lg bg-brand-blue px-4 py-3 font-semibold text-white transition-colors hover:bg-brand-blueDark"
            >
              <span aria-hidden="true" className="text-xl">
                {accion.icon}
              </span>
              {accion.label}
            </Link>
          ))}
        </section>

        <section>
          <h2 className="mb-3 text-lg font-semibold">Requiere tu atención</h2>
          {mostrarVencimientos || mostrarAjustes ? (
            <div className="grid gap-3 md:grid-cols-2">
              {mostrarVencimientos && (
                <TarjetaAviso
                  to="/alertas-vencimiento"
                  icon="⏰"
                  titulo="Alertas de vencimiento"
                  detalle={`${vencimientos.vencidas} vencido(s) · ${vencimientos.por_vencer} por vencer`}
                  tono={vencimientos.vencidas > 0 ? "rojo" : "ambar"}
                />
              )}
              {mostrarAjustes && (
                <TarjetaAviso
                  to="/ajustes/aprobacion"
                  icon="✅"
                  titulo="Ajustes por aprobar"
                  detalle={`${ajustesPendientes} ajuste(s) esperando decisión`}
                  tono="ambar"
                />
              )}
            </div>
          ) : (
            <p className="card text-sm text-gray-600">
              No hay alertas de vencimiento ni ajustes pendientes.
            </p>
          )}
        </section>

        <section>
          <h2 className="mb-3 text-lg font-semibold">Módulos</h2>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {modulos.map((modulo) => (
              <article key={modulo.id} className="card">
                <div className="mb-1 flex items-center gap-2">
                  <span aria-hidden="true" className="text-2xl">
                    {modulo.icon}
                  </span>
                  <h3 className="flex-1 text-lg font-semibold">{modulo.label}</h3>
                  <AvisoConteo
                    cantidad={totalAvisos(modulo, avisos)}
                    tono={tonoModulo(modulo, avisos)}
                  />
                </div>
                <p className="mb-3 text-sm text-gray-500">{modulo.descripcion}</p>
                <div className="flex flex-wrap gap-2">
                  {modulo.destinos.map((destino) => (
                    <Link
                      key={destino.to}
                      to={destino.to}
                      className="rounded-full bg-blue-100 px-3 py-1 text-sm text-brand-dark transition-colors hover:bg-blue-200"
                    >
                      {destino.label}
                    </Link>
                  ))}
                </div>
              </article>
            ))}
          </div>
        </section>
      </div>
    </Layout>
  );
}
