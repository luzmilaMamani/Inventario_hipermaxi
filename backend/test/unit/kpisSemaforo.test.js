require("../helpers/entorno");
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { simularDb } = require("../helpers/entorno");
const {
  calcularSemaforo,
  mesesHasta,
  aplicarMetasYTendencia,
} = require("../../src/services/indicadores");

test("el semáforo compara el valor con la meta según si conviene subir o bajar", () => {
  assert.equal(calcularSemaforo(96, 95, "MAYOR"), "verde");
  assert.equal(calcularSemaforo(90, 95, "MAYOR"), "amarillo");
  assert.equal(calcularSemaforo(80, 95, "MAYOR"), "rojo");
  assert.equal(calcularSemaforo(4, 5, "MENOR"), "verde");
  assert.equal(calcularSemaforo(5.4, 5, "MENOR"), "amarillo");
  assert.equal(calcularSemaforo(8, 5, "MENOR"), "rojo");
  assert.equal(calcularSemaforo(null, 5, "MAYOR"), "sin_datos");
  assert.equal(calcularSemaforo(5, null, "MENOR"), "sin_datos");
});

test("la tendencia pide los 6 meses calendario hasta el fin del período", () => {
  const meses = mesesHasta("2026-11-23", 6);
  assert.deepEqual(meses.map((m) => m.etiqueta), ["06/26", "07/26", "08/26", "09/26", "10/26", "11/26"]);
  assert.equal(meses[0].desde, "2026-06-01");
  assert.equal(meses[0].hasta, "2026-06-30");
  assert.equal(meses[5].desde, "2026-11-01");
  assert.equal(meses[5].hasta, "2026-11-23");
});

test("la meta de la sucursal pisa la global y el mes cerrado sale de la foto", async () => {
  const codigos = ["QUIEBRE_STOCK"];
  const kpis = [{
    codigo: "QUIEBRE_STOCK",
    nombre: "Tasa de quiebre de stock",
    valor: 4.2,
    unidad: "%",
    detalle: {},
  }];
  const fotos = ["06", "07", "08", "09", "10"].map((mes) => ({
    anio: 2026,
    mes: Number(mes),
    codigo_kpi: "QUIEBRE_STOCK",
    valor: "3",
  }));

  const calculo = (sql) => {
    if (sql.includes("neto_desde_inicio")) {
      return { rows: [{ valor_actual: "0", valor_inicio: "0", valor_fin: "0", costo_vendido: "0", valor_merma: "0", unidades_merma: "0" }] };
    }
    if (sql.includes("en_quiebre")) return { rows: [{ registros: 20, en_quiebre: 1 }] };
    if (sql.includes("vw_conteos_inventario")) return { rows: [{ lineas: 0, exactas: 0, inventarios: 0 }] };
    if (sql.includes("CURRENT_DATE + 30")) return { rows: [{ lotes: 0, unidades: "0", valor: "0" }] };
    if (sql.includes("vw_recepciones_cumplimiento")) return { rows: [{ recepciones: 0, sin_diferencia: 0 }] };
    return { rows: [] };
  };
  simularDb([
    () => ({
      rows: [
        { codigo_kpi: "QUIEBRE_STOCK", id_almacen: null, meta: "10" },
        { codigo_kpi: "QUIEBRE_STOCK", id_almacen: 2, meta: "4" },
      ],
    }),
    () => ({ rows: fotos }),
    ...Array.from({ length: 12 }, () => calculo),
  ]);

  const [kpi] = await aplicarMetasYTendencia(kpis, { idAlmacen: 2, hasta: "2026-11-23" });
  assert.equal(kpi.meta, 4);
  assert.equal(kpi.semaforo, "amarillo");
  assert.equal(kpi.tendencia.length, 6);
  assert.equal(kpi.tendencia[0].valor, 3);
  assert.equal(kpi.tendencia[4].etiqueta, "10/26");
  assert.equal(kpi.tendencia[5].etiqueta, "11/26");
  assert.ok(codigos.includes(kpi.codigo));
});
