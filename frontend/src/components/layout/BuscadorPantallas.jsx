import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { buscarDestinos } from "./navegacion";

export default function BuscadorPantallas({ modulos, onClose }) {
  const navigate = useNavigate();
  const [consulta, setConsulta] = useState("");
  const [seleccion, setSeleccion] = useState(0);
  const listaRef = useRef(null);
  const resultados = useMemo(() => buscarDestinos(modulos, consulta), [modulos, consulta]);

  useEffect(() => {
    listaRef.current?.children[seleccion]?.scrollIntoView({ block: "nearest" });
  }, [seleccion]);

  const ir = (resultado) => {
    if (!resultado) return;
    onClose();
    navigate(resultado.destino.to);
  };

  const alPresionarTecla = (evento) => {
    if (evento.key === "ArrowDown") {
      evento.preventDefault();
      setSeleccion((actual) => Math.min(actual + 1, resultados.length - 1));
    } else if (evento.key === "ArrowUp") {
      evento.preventDefault();
      setSeleccion((actual) => Math.max(actual - 1, 0));
    } else if (evento.key === "Enter") {
      evento.preventDefault();
      ir(resultados[seleccion]);
    } else if (evento.key === "Escape") {
      onClose();
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 px-4 pt-[12vh]"
      onMouseDown={(evento) => evento.target === evento.currentTarget && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Buscar pantalla"
        className="animar-entrada w-full max-w-xl overflow-hidden rounded-xl bg-white shadow-2xl"
      >
        <input
          autoFocus
          type="text"
          value={consulta}
          onChange={(evento) => {
            setConsulta(evento.target.value);
            setSeleccion(0);
          }}
          onKeyDown={alPresionarTecla}
          placeholder="¿A dónde quieres ir? Ej: vencidos, etiquetas, ajustes…"
          aria-label="Buscar pantalla"
          className="w-full border-b border-blue-100 px-5 py-4 text-base focus:outline-none"
        />
        {resultados.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-gray-500">
            No hay pantallas que coincidan con “{consulta}”.
          </p>
        ) : (
          <ul ref={listaRef} className="max-h-[50vh] overflow-y-auto p-2">
            {resultados.map((resultado, indice) => (
              <li key={resultado.destino.to}>
                <button
                  type="button"
                  onClick={() => ir(resultado)}
                  onMouseMove={() => setSeleccion(indice)}
                  className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left ${
                    indice === seleccion ? "bg-blue-50" : ""
                  }`}
                >
                  <span aria-hidden="true" className="text-xl">
                    {resultado.destino.icon}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium text-brand-dark">
                      {resultado.destino.label}
                    </span>
                    <span className="block truncate text-xs text-gray-500">
                      {resultado.destino.descripcion}
                    </span>
                  </span>
                  <span className="shrink-0 text-xs text-gray-400">{resultado.modulo.label}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        <p className="border-t border-blue-100 px-5 py-2 text-xs text-gray-400">
          ↑ ↓ para moverte · Enter para abrir · Esc para cerrar
        </p>
      </div>
    </div>
  );
}
