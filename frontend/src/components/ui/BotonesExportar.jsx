import { exportarExcel, exportarPdf } from "../../utils/exportar";

// Botones "Excel" y "PDF" para cualquier reporte con columnas tipadas.
export default function BotonesExportar({
  titulo,
  subtitulo,
  nombreArchivo,
  columnas,
  filas,
  resumen = [],
}) {
  const sinDatos = !filas || filas.length === 0;

  return (
    <div className="flex gap-2">
      <button
        type="button"
        className="btn-secondary text-sm disabled:cursor-not-allowed disabled:opacity-50"
        disabled={sinDatos}
        title={sinDatos ? "No hay datos para exportar" : "Descargar en CSV para Excel"}
        onClick={() => exportarExcel(nombreArchivo, columnas, filas)}
      >
        Exportar Excel
      </button>
      <button
        type="button"
        className="btn-secondary text-sm disabled:cursor-not-allowed disabled:opacity-50"
        disabled={sinDatos}
        title={sinDatos ? "No hay datos para exportar" : "Abrir vista para guardar como PDF"}
        onClick={() => exportarPdf({ titulo, subtitulo, columnas, filas, resumen })}
      >
        Exportar PDF
      </button>
    </div>
  );
}
