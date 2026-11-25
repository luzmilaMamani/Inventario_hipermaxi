import Layout from "../../components/layout/Layout";

export default function ManualUsuario() {
  return (
    <Layout>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Manual de usuario</h1>
          <p className="text-sm text-gray-500">
            Cómo usar cada módulo. También puedes descargarlo para leerlo sin conexión.
          </p>
        </div>
        <a className="btn-primary" href="/manual/manual-usuario.pdf" download>
          Descargar PDF
        </a>
      </div>
      <iframe
        title="Manual de usuario de Chuby Hipermaxi"
        src="/manual/index.html"
        className="h-[calc(100vh-12rem)] w-full rounded-lg border border-blue-100 bg-white"
      />
    </Layout>
  );
}
