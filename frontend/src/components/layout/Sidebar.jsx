import { NavLink } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import {
  ROLES_LECTURA_Y_OPERACION,
  ROLES_SIN_EMPLEADO,
  tieneRol,
} from "../../utils/permissions";

const links = [
  { to: "/", label: "Dashboard", icon: "📊" },
  { to: "/productos", label: "Productos", icon: "📦", roles: ROLES_LECTURA_Y_OPERACION },
  { to: "/clasificacion", label: "Clasificación", icon: "🏷️", roles: ROLES_SIN_EMPLEADO },
  { to: "/almacenes", label: "Almacenes", icon: "🏬", roles: ROLES_LECTURA_Y_OPERACION },
  { to: "/ubicaciones", label: "Ubicaciones", icon: "📍", roles: ROLES_SIN_EMPLEADO },
  { to: "/stock", label: "Consulta de stock", icon: "📈", roles: ROLES_LECTURA_Y_OPERACION },
  { to: "/recepciones", label: "Recepciones", icon: "📥", roles: ROLES_LECTURA_Y_OPERACION },
  { to: "/salidas", label: "Salidas", icon: "📤", roles: ROLES_LECTURA_Y_OPERACION },
  { to: "/transferencias", label: "Transferencias", icon: "🔄", roles: ROLES_LECTURA_Y_OPERACION },
  { to: "/inventarios", label: "Inventarios Físicos", icon: "📋", roles: ROLES_LECTURA_Y_OPERACION },
  { to: "/reportes/perdidas", label: "Reporte pérdidas", icon: "🚨" },
  { to: "/reportes/danos", label: "Reporte daños", icon: "⚠️" },
  { to: "/reportes/vencimientos", label: "Reporte vencimientos", icon: "⏳" },
  { to: "/barcode", label: "Buscar por código", icon: "🔍" },
];

export default function Sidebar() {
  const { user } = useAuth();
  const enlaces = links.filter(
    (link) =>
      !link.roles || tieneRol(user?.rol, link.roles),
  );

  return (
    <aside className="w-64 bg-brand-nav border-r border-slate-700 min-h-screen p-4">
      <div className="mb-8">
        <h1 className="text-xl font-bold text-brand-orange">Chuby Hipermaxi</h1>
        <p className="text-xs text-brand-navMuted">Sistema de Inventarios</p>
      </div>
      <nav className="space-y-1">
        {enlaces.map((link) => (
          <NavLink
            key={link.to}
            to={link.to}
            end={link.to === "/"}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${
                isActive
                  ? "bg-brand-blue text-white font-semibold"
                  : "text-brand-navMuted hover:bg-slate-800 hover:text-white"
              }`
            }
          >
            <span>{link.icon}</span>
            <span>{link.label}</span>
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}
