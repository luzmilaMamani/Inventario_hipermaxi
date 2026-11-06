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

// Contador para el menú: rojo si hay vencidos, ámbar si solo hay por vencer.
export default function IndicadorAlertasVencimiento() {
  const { pendientes, vencidas } = useResumenAlertasVencimiento();
  if (!pendientes) return null;

  return (
    <span
      title={`${pendientes} alerta(s) de vencimiento pendiente(s)`}
      className={`ml-auto rounded-full px-2 py-0.5 text-xs font-bold text-white ${
        vencidas > 0 ? "bg-red-600" : "bg-amber-500"
      }`}
    >
      {pendientes > 99 ? "99+" : pendientes}
    </span>
  );
}
