import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import AvisoConteo from "./AvisoConteo";
import BuscadorPantallas from "./BuscadorPantallas";
import { tonoModulo, totalAvisos } from "./navegacion";

const CLASE_ENLACE_PRINCIPAL =
  "flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium whitespace-nowrap transition-colors";

function claseEnlacePrincipal(activo) {
  return `${CLASE_ENLACE_PRINCIPAL} ${
    activo
      ? "bg-brand-blue text-white"
      : "text-brand-navMuted hover:bg-slate-800 hover:text-white"
  }`;
}

function PanelModulo({ modulo, avisos, rutaActiva, onElegir }) {
  return (
    <div className="animar-entrada absolute inset-x-0 top-full border-b border-blue-100 bg-white shadow-xl">
      <div className="mx-auto max-h-[calc(100vh-4rem)] max-w-[1600px] overflow-y-auto p-6">
        <p className="mb-4 text-sm text-gray-500">{modulo.descripcion}</p>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {modulo.destinos.map((destino) => (
            <Link
              key={destino.to}
              to={destino.to}
              onClick={onElegir}
              className={`flex items-center gap-3 rounded-lg border p-3 transition-colors ${
                rutaActiva === destino.to
                  ? "border-brand-blue bg-blue-50"
                  : "border-blue-100 hover:border-brand-blue hover:bg-blue-50"
              }`}
            >
              <span aria-hidden="true" className="text-2xl">
                {destino.icon}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-semibold text-brand-dark">{destino.label}</span>
                <span className="block text-xs text-gray-500">{destino.descripcion}</span>
              </span>
              <AvisoConteo {...avisos[destino.to]} />
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}

function MenuMovil({ modulos, avisos, moduloActivo, rutaActiva, onElegir }) {
  return (
    <div className="animar-entrada max-h-[calc(100vh-4rem)] overflow-y-auto border-t border-slate-700 bg-brand-nav p-3 lg:hidden">
      <Link
        to="/"
        onClick={onElegir}
        className="block rounded-lg px-3 py-2 font-medium text-white hover:bg-slate-800"
      >
        🏠 Inicio
      </Link>
      {modulos.map((modulo) => (
        <details key={modulo.id} open={modulo.id === moduloActivo?.id} className="group">
          <summary className="flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 font-medium text-white hover:bg-slate-800">
            <span aria-hidden="true">{modulo.icon}</span>
            <span className="flex-1">{modulo.label}</span>
            <AvisoConteo
              cantidad={totalAvisos(modulo, avisos)}
              tono={tonoModulo(modulo, avisos)}
            />
            <span aria-hidden="true" className="text-xs transition-transform group-open:rotate-180">
              ▼
            </span>
          </summary>
          <div className="ml-4 space-y-1 border-l border-slate-700 py-1 pl-2">
            {modulo.destinos.map((destino) => (
              <Link
                key={destino.to}
                to={destino.to}
                onClick={onElegir}
                className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm ${
                  rutaActiva === destino.to
                    ? "bg-brand-blue font-semibold text-white"
                    : "text-brand-navMuted hover:bg-slate-800 hover:text-white"
                }`}
              >
                <span aria-hidden="true">{destino.icon}</span>
                <span className="flex-1">{destino.label}</span>
                <AvisoConteo {...avisos[destino.to]} />
              </Link>
            ))}
          </div>
        </details>
      ))}
    </div>
  );
}

export default function Navbar({ modulos, ubicacion, avisos }) {
  const { user, logout } = useAuth();
  const { pathname } = useLocation();
  const [idAbierto, setIdAbierto] = useState(null);
  const [menuMovil, setMenuMovil] = useState(false);
  const [buscando, setBuscando] = useState(false);
  const contenedorRef = useRef(null);

  const moduloAbierto = modulos.find((modulo) => modulo.id === idAbierto);
  const rutaActiva = ubicacion?.destino.to;

  useEffect(() => {
    const alPresionarTecla = (evento) => {
      if ((evento.ctrlKey || evento.metaKey) && evento.key.toLowerCase() === "k") {
        evento.preventDefault();
        setIdAbierto(null);
        setBuscando((actual) => !actual);
      } else if (evento.key === "Escape") {
        setIdAbierto(null);
        setMenuMovil(false);
      }
    };
    document.addEventListener("keydown", alPresionarTecla);
    return () => document.removeEventListener("keydown", alPresionarTecla);
  }, []);

  useEffect(() => {
    if (!idAbierto) return undefined;
    const alPresionarFuera = (evento) => {
      if (!contenedorRef.current?.contains(evento.target)) setIdAbierto(null);
    };
    document.addEventListener("mousedown", alPresionarFuera);
    return () => document.removeEventListener("mousedown", alPresionarFuera);
  }, [idAbierto]);

  const cerrarMenus = () => {
    setIdAbierto(null);
    setMenuMovil(false);
  };

  return (
    <header ref={contenedorRef} className="relative bg-brand-nav">
      <div className="mx-auto flex h-16 max-w-[1600px] items-center gap-3 px-4 sm:px-6">
        <button
          type="button"
          onClick={() => setMenuMovil((actual) => !actual)}
          aria-label={menuMovil ? "Cerrar menú" : "Abrir menú"}
          aria-expanded={menuMovil}
          className="rounded-lg px-2 py-1 text-xl text-white hover:bg-slate-800 lg:hidden"
        >
          {menuMovil ? "✕" : "☰"}
        </button>

        <Link to="/" onClick={cerrarMenus} className="shrink-0">
          <span className="block text-lg font-bold leading-tight text-brand-orange">
            Chuby Hipermaxi
          </span>
          <span className="hidden text-xs leading-tight text-brand-navMuted sm:block">
            Sistema de Inventarios
          </span>
        </Link>

        <nav aria-label="Módulos" className="ml-4 hidden items-center gap-1 lg:flex">
          <Link to="/" onClick={cerrarMenus} className={claseEnlacePrincipal(pathname === "/" && !idAbierto)}>
            Inicio
          </Link>
          {modulos.map((modulo) => (
            <button
              key={modulo.id}
              type="button"
              aria-expanded={idAbierto === modulo.id}
              aria-haspopup="true"
              onClick={() => setIdAbierto((actual) => (actual === modulo.id ? null : modulo.id))}
              onMouseEnter={() => idAbierto && setIdAbierto(modulo.id)}
              className={claseEnlacePrincipal(
                ubicacion?.modulo.id === modulo.id || idAbierto === modulo.id,
              )}
            >
              {modulo.label}
              <AvisoConteo
                cantidad={totalAvisos(modulo, avisos)}
                tono={tonoModulo(modulo, avisos)}
              />
              <span aria-hidden="true" className="text-[10px] opacity-70">
                ▼
              </span>
            </button>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-3">
          <button
            type="button"
            onClick={() => {
              setIdAbierto(null);
              setBuscando(true);
            }}
            aria-label="Buscar pantalla"
            className="flex items-center gap-2 rounded-lg border border-slate-600 px-3 py-1.5 text-sm text-brand-navMuted transition-colors hover:border-slate-400 hover:text-white"
          >
            <span aria-hidden="true">🔍</span>
            <span className="hidden xl:inline">Buscar pantalla</span>
            <kbd className="hidden rounded bg-slate-700 px-1.5 text-xs xl:inline">Ctrl K</kbd>
          </button>

          <div className="hidden text-right md:block">
            <p className="max-w-[12rem] truncate text-sm font-medium leading-tight text-white">
              {user?.nombre_completo || user?.nombre_usuario}
            </p>
            <p className="text-xs leading-tight text-brand-navMuted">
              {user?.rol?.replaceAll("_", " ")}
            </p>
          </div>
          <button
            type="button"
            onClick={logout}
            className="whitespace-nowrap rounded-lg px-2 py-1.5 text-sm text-brand-navMuted transition-colors hover:bg-slate-800 hover:text-white"
          >
            Salir
          </button>
        </div>
      </div>

      {moduloAbierto && (
        <div className="hidden lg:block">
          <PanelModulo
            modulo={moduloAbierto}
            avisos={avisos}
            rutaActiva={rutaActiva}
            onElegir={cerrarMenus}
          />
        </div>
      )}

      {menuMovil && (
        <MenuMovil
          modulos={modulos}
          avisos={avisos}
          moduloActivo={ubicacion?.modulo}
          rutaActiva={rutaActiva}
          onElegir={cerrarMenus}
        />
      )}

      {buscando && <BuscadorPantallas modulos={modulos} onClose={() => setBuscando(false)} />}
    </header>
  );
}
