const db = require("../config/db");
const env = require("../config/env");

const { marcarLotesVencidos } = require("./lotesVencidos");
const { informarProductosProximosVencer } = require("./vencimientosPubSub");

// RF42: proceso programado que revisa los lotes y genera alertas de vencimiento.
// RF43: antes marca como VENCIDO los lotes cuya fecha ya pasó, para separarlos
// del stock disponible.
// HIP-260: también informa a Producción y Logística los lotes que vencen en
// menos de dos meses.
async function generarAlertasVencimiento() {
  const marcados = await marcarLotesVencidos(db);
  if (marcados > 0) console.log(`Lotes marcados como vencidos: ${marcados}`);
  const { rows } = await db.query("SELECT fn_generar_alertas_vencimiento() AS nuevas");

  // Un fallo al informar no debe impedir las alertas: se reintenta en la
  // siguiente revisión, porque el lote sigue sin figurar como informado.
  try {
    const informados = await informarProductosProximosVencer();
    if (informados > 0) {
      console.log(`Pub/Sub: ${informados} lote(s) próximos a vencer registrados para Logística`);
    }
  } catch (error) {
    console.error("Error al informar productos próximos a vencer:", error.message);
  }

  return Number(rows[0]?.nuevas || 0);
}

let temporizador = null;

function iniciarRevisionVencimientos() {
  if (temporizador) return;
  const minutos = env.alertasVencimientoIntervaloMin;
  if (!(minutos > 0)) {
    console.log("Revisión programada de vencimientos desactivada");
    return;
  }

  const ejecutar = async () => {
    try {
      const nuevas = await generarAlertasVencimiento();
      if (nuevas > 0) console.log(`Alertas de vencimiento generadas: ${nuevas}`);
    } catch (error) {
      console.error("Error al generar alertas de vencimiento:", error.message);
    }
  };

  ejecutar();
  temporizador = setInterval(ejecutar, minutos * 60 * 1000);
  temporizador.unref?.();
}

module.exports = { generarAlertasVencimiento, iniciarRevisionVencimientos };
