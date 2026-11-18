// RF65 (HIP-228): índice de rotación y clasificación de productos.
//
//  rotación del período   = unidades que salieron / stock promedio
//  rotación mensual       = rotación del período × 30 / días del período
//  días de inventario     = días del período / rotación del período
//                           (cuántos días dura el stock al ritmo de salida actual)
//
// Clasificación: entre los productos que tuvieron salidas, el tercio con mayor
// rotación es ALTA, el del medio MEDIA y el menor BAJA. Los que no tuvieron
// salidas pero sí stock son SIN_MOVIMIENTO (stock inmovilizado).

const redondear = (valor, decimales = 2) =>
  valor === null || !Number.isFinite(valor) ? null : Math.round(valor * 10 ** decimales) / 10 ** decimales;

function calcularRotacion(fila, dias) {
  const salidas = Number(fila.unidades_salida);
  const promedio = Number(fila.stock_promedio);
  let rotacion = null;
  if (promedio > 0) rotacion = salidas / promedio;
  else if (salidas > 0) rotacion = Infinity; // vendió todo lo que entró: sin stock que inmovilizar
  return {
    rotacion_periodo: rotacion === Infinity ? null : redondear(rotacion, 3),
    rotacion_mensual: rotacion === null || rotacion === Infinity ? null : redondear((rotacion * 30) / dias, 3),
    dias_inventario: rotacion > 0 && rotacion !== Infinity ? redondear(dias / rotacion, 1) : null,
    _orden: rotacion,
  };
}

function clasificar(filas) {
  const conSalidas = filas
    .filter((f) => Number(f.unidades_salida) > 0)
    .sort((a, b) => b._orden - a._orden);
  const tercio = Math.ceil(conSalidas.length / 3);
  const clase = new Map();
  conSalidas.forEach((f, i) => {
    clase.set(f.id_producto, i < tercio ? "ALTA" : i < tercio * 2 ? "MEDIA" : "BAJA");
  });
  return filas.map((f) => ({
    ...f,
    clasificacion: clase.get(f.id_producto) || (Number(f.stock_promedio) > 0 ? "SIN_MOVIMIENTO" : "SIN_STOCK"),
  }));
}

function analizarRotacion(filas, dias) {
  const calculadas = filas.map((f) => ({
    ...f,
    stock_inicial: Number(f.stock_inicial),
    stock_final: Number(f.stock_final),
    stock_promedio: Number(f.stock_promedio),
    unidades_salida: Number(f.unidades_salida),
    valor_salida: Number(f.valor_salida),
    valor_stock_promedio: redondear(Number(f.stock_promedio) * Number(f.precio)),
    ...calcularRotacion(f, dias),
  }));

  const clasificadas = clasificar(calculadas)
    // Ranking: mayor rotación primero; sin movimiento al final por valor inmovilizado.
    .sort(
      (a, b) =>
        (b._orden ?? -1) - (a._orden ?? -1) || b.valor_stock_promedio - a.valor_stock_promedio,
    )
    .map(({ _orden, ...resto }, i) => ({ ...resto, posicion: i + 1 }));

  const contar = (c) => clasificadas.filter((f) => f.clasificacion === c);
  const totalSalidas = clasificadas.reduce((s, f) => s + f.unidades_salida, 0);
  const totalPromedio = clasificadas.reduce((s, f) => s + f.stock_promedio, 0);
  const rotacionGlobal = totalPromedio > 0 ? totalSalidas / totalPromedio : null;

  return {
    data: clasificadas,
    resumen: {
      productos: clasificadas.length,
      alta: contar("ALTA").length,
      media: contar("MEDIA").length,
      baja: contar("BAJA").length,
      sin_movimiento: contar("SIN_MOVIMIENTO").length,
      valor_sin_movimiento: redondear(contar("SIN_MOVIMIENTO").reduce((s, f) => s + f.valor_stock_promedio, 0)),
      rotacion_mensual_global: rotacionGlobal === null ? null : redondear((rotacionGlobal * 30) / dias, 3),
      dias_inventario_global: rotacionGlobal > 0 ? redondear(dias / rotacionGlobal, 1) : null,
    },
  };
}

module.exports = { analizarRotacion, calcularRotacion, clasificar };
