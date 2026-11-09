import { useResumenAlertasVencimiento } from "../ui/IndicadorAlertasVencimiento";
import { useAjustesPendientes } from "../ui/IndicadorAjustesPendientes";

// Contadores que se muestran en el menú, indexados por la ruta a la que avisan.
export function useAvisos() {
  const vencimientos = useResumenAlertasVencimiento();
  const ajustes = useAjustesPendientes();

  return {
    "/alertas-vencimiento": {
      cantidad: vencimientos.pendientes,
      tono: vencimientos.vencidas > 0 ? "rojo" : "ambar",
    },
    "/ajustes/aprobacion": { cantidad: ajustes, tono: "ambar" },
  };
}
