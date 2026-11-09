import { useEffect, useState } from "react";
import {
  EVENTO_AJUSTES_PENDIENTES,
  resumenAjustesPendientes,
} from "../../api/ajustes.api";

const INTERVALO_MS = 5 * 60 * 1000;

// RF53: cantidad de ajustes que esperan aprobación; se refresca solo.
export function useAjustesPendientes() {
  const [pendientes, setPendientes] = useState(0);

  useEffect(() => {
    let activo = true;
    const cargar = () =>
      resumenAjustesPendientes()
        .then((respuesta) => activo && setPendientes(Number(respuesta.data?.pendientes || 0)))
        .catch(() => activo && setPendientes(0));

    cargar();
    const intervalo = setInterval(cargar, INTERVALO_MS);
    window.addEventListener(EVENTO_AJUSTES_PENDIENTES, cargar);
    return () => {
      activo = false;
      clearInterval(intervalo);
      window.removeEventListener(EVENTO_AJUSTES_PENDIENTES, cargar);
    };
  }, []);

  return pendientes;
}
