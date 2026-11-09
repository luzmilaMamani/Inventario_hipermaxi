import { useEffect, useState } from "react";
import {
  EVENTO_ALERTAS_VENCIMIENTO,
  resumenAlertasVencimiento,
} from "../../api/alertasVencimiento.api";

const RESUMEN_VACIO = { por_vencer: 0, vencidas: 0, pendientes: 0 };
const INTERVALO_MS = 5 * 60 * 1000;

// RF42: resumen de alertas de vencimiento pendientes, se refresca solo.
export function useResumenAlertasVencimiento() {
  const [resumen, setResumen] = useState(RESUMEN_VACIO);

  useEffect(() => {
    let activo = true;
    const cargar = () =>
      resumenAlertasVencimiento()
        .then((respuesta) => activo && setResumen(respuesta.data || RESUMEN_VACIO))
        .catch(() => activo && setResumen(RESUMEN_VACIO));

    cargar();
    const intervalo = setInterval(cargar, INTERVALO_MS);
    window.addEventListener(EVENTO_ALERTAS_VENCIMIENTO, cargar);
    return () => {
      activo = false;
      clearInterval(intervalo);
      window.removeEventListener(EVENTO_ALERTAS_VENCIMIENTO, cargar);
    };
  }, []);

  return resumen;
}
