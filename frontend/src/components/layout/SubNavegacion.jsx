import { useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import AvisoConteo from "./AvisoConteo";

// Pestañas del módulo actual: cambiar entre pantallas hermanas sin abrir el menú.
export default function SubNavegacion({ ubicacion, avisos }) {
  const barraRef = useRef(null);
  const rutaActiva = ubicacion?.destino.to;

  // En pantallas angostas la pestaña activa puede quedar fuera de la barra.
  useEffect(() => {
    const barra = barraRef.current;
    const pestana = barra?.querySelector('[aria-current="page"]');
    if (!pestana) return;
    barra.scrollLeft = pestana.offsetLeft - (barra.clientWidth - pestana.offsetWidth) / 2;
  }, [rutaActiva]);

  if (!ubicacion) return null;
  const { modulo, destino: destinoActivo } = ubicacion;

  return (
    <nav aria-label={`Pantallas de ${modulo.label}`} className="border-b border-blue-100 bg-brand-panel">
      <div
        ref={barraRef}
        className="relative mx-auto flex max-w-[1600px] items-center gap-3 overflow-x-auto px-4 py-2 sm:px-6"
      >
        <span className="shrink-0 text-sm font-semibold text-brand-dark">
          <span aria-hidden="true">{modulo.icon} </span>
          {modulo.label}
        </span>
        <span aria-hidden="true" className="h-5 w-px shrink-0 bg-blue-200" />
        {modulo.destinos.map((destino) => {
          const activo = destino.to === destinoActivo.to;
          return (
            <Link
              key={destino.to}
              to={destino.to}
              aria-current={activo ? "page" : undefined}
              className={`flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1 text-sm transition-colors ${
                activo
                  ? "bg-brand-blue font-semibold text-white"
                  : "text-brand-dark hover:bg-blue-100"
              }`}
            >
              {destino.label}
              <AvisoConteo {...avisos[destino.to]} />
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
