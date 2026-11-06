import Layout from "../components/layout/Layout";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useResumenAlertasVencimiento } from "../components/ui/IndicadorAlertasVencimiento";

export default function Dashboard() {
  const { user } = useAuth();
  const alertasVencimiento = useResumenAlertasVencimiento();

  return (
    <Layout>
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <div className="card">
          <p className="text-gray-600">
            Bienvenido al sistema de inventarios de Chuby Hipermaxi,{" "}
            <strong>{user?.nombre_completo}</strong>.
          </p>
        </div>
        {alertasVencimiento.pendientes > 0 && (
          <Link
            to="/alertas-vencimiento"
            className={`card block border-l-4 hover:bg-gray-50 ${
              alertasVencimiento.vencidas > 0 ? "border-red-500" : "border-amber-500"
            }`}
          >
            <p className="font-semibold">⏰ Alertas de vencimiento pendientes</p>
            <p className="text-sm text-gray-600">
              <span className="font-semibold text-red-600">
                {alertasVencimiento.vencidas} vencido(s)
              </span>{" "}
              ·{" "}
              <span className="font-semibold text-amber-600">
                {alertasVencimiento.por_vencer} por vencer
              </span>{" "}
              — ver detalle
            </p>
          </Link>
        )}
      </div>
    </Layout>
  );
}