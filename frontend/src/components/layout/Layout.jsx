import Sidebar from "./Sidebar";
import Navbar from "./Navbar";
import { useAuth } from "../../context/AuthContext";
import { ROLES_LECTURA, tieneRol } from "../../utils/permissions";

export default function Layout({ children }) {
  const { user } = useAuth();
  const esSoloLectura = tieneRol(user?.rol, ROLES_LECTURA);

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex-1 flex flex-col">
        <Navbar />
        <main className="p-6 flex-1">
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
    </div>
  );
}