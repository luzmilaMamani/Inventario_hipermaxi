require("../helpers/entorno");
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { calcularProximoEnvio } = require("../../src/services/envioReportes");

// Miércoles 18/11/2026 10:00 (hora local).
const base = new Date(2026, 10, 18, 10, 0);
const local = (d) => [d.getFullYear(), d.getMonth() + 1, d.getDate(), d.getHours(), d.getMinutes()];

test("DIARIA: hoy si la hora no pasó, si no mañana", () => {
  assert.deepEqual(local(calcularProximoEnvio({ frecuencia: "DIARIA", hora: "11:30" }, base)), [2026, 11, 18, 11, 30]);
  assert.deepEqual(local(calcularProximoEnvio({ frecuencia: "DIARIA", hora: "08:00" }, base)), [2026, 11, 19, 8, 0]);
  // Exactamente a la misma hora ya cuenta como pasada.
  assert.deepEqual(local(calcularProximoEnvio({ frecuencia: "DIARIA", hora: "10:00" }, base)), [2026, 11, 19, 10, 0]);
});

test("SEMANAL: próximo día de la semana indicado (1 = lunes, 7 = domingo)", () => {
  assert.deepEqual(local(calcularProximoEnvio({ frecuencia: "SEMANAL", hora: "07:00", dia_semana: 1 }, base)), [2026, 11, 23, 7, 0]);
  assert.deepEqual(local(calcularProximoEnvio({ frecuencia: "SEMANAL", hora: "07:00", dia_semana: 7 }, base)), [2026, 11, 22, 7, 0]);
  // Mismo día (miércoles): hoy si la hora no pasó, si no la semana siguiente.
  assert.deepEqual(local(calcularProximoEnvio({ frecuencia: "SEMANAL", hora: "18:00", dia_semana: 3 }, base)), [2026, 11, 18, 18, 0]);
  assert.deepEqual(local(calcularProximoEnvio({ frecuencia: "SEMANAL", hora: "09:00", dia_semana: 3 }, base)), [2026, 11, 25, 9, 0]);
});

test("MENSUAL: día indicado de este mes o del siguiente, cruzando el año", () => {
  assert.deepEqual(local(calcularProximoEnvio({ frecuencia: "MENSUAL", hora: "07:00", dia_mes: 28 }, base)), [2026, 11, 28, 7, 0]);
  assert.deepEqual(local(calcularProximoEnvio({ frecuencia: "MENSUAL", hora: "07:00", dia_mes: 1 }, base)), [2026, 12, 1, 7, 0]);
  const diciembre = new Date(2026, 11, 20, 12, 0);
  assert.deepEqual(local(calcularProximoEnvio({ frecuencia: "MENSUAL", hora: "07:00", dia_mes: 5 }, diciembre)), [2027, 1, 5, 7, 0]);
});

test("frecuencia desconocida lanza error", () => {
  assert.throws(() => calcularProximoEnvio({ frecuencia: "ANUAL", hora: "07:00" }, base), /Frecuencia no válida/);
});
