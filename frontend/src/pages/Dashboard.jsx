import Layout from "../components/layout/Layout";
import { useAuth } from "../context/AuthContext";

export default function Dashboard() {
  const { user } = useAuth();

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
      </div>
    </Layout>
  );
}