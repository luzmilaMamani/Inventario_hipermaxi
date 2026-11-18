import { useState } from "react";
import { exportarExcel, exportarPdf } from "../../utils/exportar";

// Botones "Excel" y "PDF" para cualquier reporte con columnas tipadas.
// En reportes paginados, `cargarFilas` (async) trae todas las filas del filtro
// en el momento de exportar en lugar de usar solo la página visible.
export default function BotonesExportar({
  titulo,
  subtitulo,
  nombreArchivo,
  columnas,
  filas,
  resumen = [],
  cargarFilas,
}) {
  const [cargando, setCargando] = useState(false);
  const sinDatos = !filas || filas.length === 0;

  const exportar = async (formato) => {
    let datos = filas;
    if (cargarFilas) {
      setCargando(true);
      try {
        datos = await cargarFilas();
      } catch {
        window.alert("No se pudieron obtener los datos para exportar.");
        return;
      } finally {
        setCargando(false);
      }
    }
    if (formato === "excel") exportarExcel(nombreArchivo, columnas, datos);
    else exportarPdf({ titulo, subtitulo, columnas, filas: datos, resumen });
  };

  return (
    <div className="flex gap-2">
      <button
        type="button"
        className="btn-secondary text-sm disabled:cursor-not-allowed disabled:opacity-50"
        disabled={sinDatos || cargando}
        title={sinDatos ? "No hay datos para exportar" : "Descargar en CSV para Excel"}
        onClick={() => exportar("excel")}
      >
        {cargando ? "Preparando..." : "Exportar Excel"}
      </button>
      <button
        type="button"
        className="btn-secondary text-sm disabled:cursor-not-allowed disabled:opacity-50"
        disabled={sinDatos || cargando}
        title={sinDatos ? "No hay datos para exportar" : "Abrir vista para guardar como PDF"}
        onClick={() => exportar("pdf")}
      >
        Exportar PDF
      </button>
    </div>
  );
}
