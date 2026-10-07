import { NavLink } from "react-router-dom";

const links = [
  { to: "/", label: "Dashboard", icon: "📊" },
  { to: "/productos", label: "Productos", icon: "📦" },
  { to: "/clasificacion", label: "Clasificación", icon: "🏷️" },
  { to: "/almacenes", label: "Almacenes", icon: "🏬" },
  { to: "/ubicaciones", label: "Ubicaciones", icon: "📍" },
  { to: "/stock", label: "Consulta de stock", icon: "📈" },
  { to: "/barcode", label: "Buscar por código", icon: "🔍" },
];

export default function Sidebar() {
  return (
    <aside className="w-64 bg-brand-nav border-r border-slate-700 min-h-screen p-4">
      <div className="mb-8">
        <h1 className="text-xl font-bold text-brand-orange">Chuby Hipermaxi</h1>
        <p className="text-xs text-brand-navMuted">Sistema de Inventarios</p>
      </div>
      <nav className="space-y-1">
        {links.map((link) => (
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