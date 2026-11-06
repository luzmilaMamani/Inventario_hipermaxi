const db = require("../config/db");
const env = require("../config/env");

// RF42: proceso programado que revisa los lotes y genera alertas de vencimiento.
async function generarAlertasVencimiento() {
  const { rows } = await db.query("SELECT fn_generar_alertas_vencimiento() AS nuevas");
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
