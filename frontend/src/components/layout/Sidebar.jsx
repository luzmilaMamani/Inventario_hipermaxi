import { NavLink } from "react-router-dom";

const links = [
  { to: "/", label: "Dashboard", icon: "📊" },
  { to: "/productos", label: "Productos", icon: "📦" },
  { to: "/almacenes", label: "Almacenes", icon: "🏬" },
];

export default function Sidebar() {
  return (
    <aside className="w-64 bg-white border-r border-gray-200 min-h-screen p-4">
      <div className="mb-8">
        <h1 className="text-xl font-bold text-brand-red">Chuby Hipermaxi</h1>
        <p className="text-xs text-gray-500">Sistema de Inventarios</p>
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
                  ? "bg-brand-red text-white font-semibold"
                  : "text-brand-dark hover:bg-gray-100"
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