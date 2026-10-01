import { useAuth } from "../../context/AuthContext";

export default function Navbar() {
  const { user, logout } = useAuth();

  return (
    <header className="bg-brand-panel border-b border-blue-100 px-6 py-3 flex items-center justify-between">
      <div>
        <h2 className="font-semibold text-brand-dark">
          Bienvenido, {user?.nombre_completo || user?.nombre_usuario}
        </h2>
        <p className="text-xs text-gray-500">Rol: {user?.rol}</p>
      </div>
      <button onClick={logout} className="btn-secondary text-sm">
        Cerrar sesión
      </button>
    </header>
  );
}