import { useState } from "react";
import Layout from "../../components/layout/Layout";
import TabCategorias from "./TabCategorias";
import TabSubcategorias from "./TabSubcategorias";
import TabMarcas from "./TabMarcas";

const TABS = [
  { id: "categorias", label: "Categorías" },
  { id: "subcategorias", label: "Subcategorías" },
  { id: "marcas", label: "Marcas" },
];

export default function Clasificacion() {
  const [tab, setTab] = useState("categorias");

  return (
    <Layout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Clasificación</h1>
          <p className="text-sm text-gray-500">
            Administración de categorías, subcategorías y marcas (RF04)
          </p>
        </div>

        <div className="card">
          <div className="border-b border-gray-200 mb-6">
            <nav className="flex gap-4">
              {TABS.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className={`pb-3 px-1 border-b-2 font-medium text-sm transition-colors ${
                    tab === t.id
                      ? "border-brand-red text-brand-red"
                      : "border-transparent text-gray-500 hover:text-gray-700"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </nav>
          </div>

          {tab === "categorias" && <TabCategorias />}
          {tab === "subcategorias" && <TabSubcategorias />}
          {tab === "marcas" && <TabMarcas />}
        </div>
      </div>
    </Layout>
  );
}