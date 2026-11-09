import { useMemo } from "react";
import { useLocation } from "react-router-dom";
import Navbar from "./Navbar";
import SubNavegacion from "./SubNavegacion";
import { modulosParaRol, ubicarRuta } from "./navegacion";
import { useAvisos } from "./useAvisos";
import { useAuth } from "../../context/AuthContext";
import { ROLES_LECTURA, tieneRol } from "../../utils/permissions";

export default function Layout({ children }) {
  const { user } = useAuth();
  const { pathname } = useLocation();
  const avisos = useAvisos();
  const modulos = useMemo(() => modulosParaRol(user?.rol), [user?.rol]);
  const ubicacion = ubicarRuta(modulos, pathname);
  const esSoloLectura = tieneRol(user?.rol, ROLES_LECTURA);

  return (
    <div className="flex min-h-screen flex-col">
      <div className="sticky top-0 z-40">
        <Navbar modulos={modulos} ubicacion={ubicacion} avisos={avisos} />
        <SubNavegacion ubicacion={ubicacion} avisos={avisos} />
      </div>
      <main className="mx-auto w-full min-w-0 max-w-[1600px] flex-1 p-4 sm:p-6">
        {esSoloLectura && (
          <div
            role="status"
            className="mb-4 rounded border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800"
          >
            Modo de solo lectura para el rol {user.rol}.
          </div>
        )}
        {children}
      </main>
    </div>
  );
}
