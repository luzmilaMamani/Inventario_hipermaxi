// Kardex valorizado por costo promedio ponderado.
// Las entradas de recepción actualizan el promedio. El resto de ingresos
// (devoluciones, anulaciones, ajustes y transferencias que suman) entran al
// promedio vigente para no mezclar un precio de venta con el costo.
// Las salidas se valoran a ese promedio y no lo cambian.
// El saldo inicial absorbe la diferencia entre el stock actual y la suma de
// movimientos, así el saldo final coincide con el stock del almacén.

function cantidad(valor) {
  return Math.round((Number(valor) + Number.EPSILON) * 10000) / 10000;
}

function dinero(valor) {
  return Math.round((Number(valor) + Number.EPSILON) * 100) / 100;
}

function costo(valor) {
  return Math.round((Number(valor) + Number.EPSILON) * 10000) / 10000;
}

function calcularKardex(movimientos, { stockActual = 0, precioInicial = 0 } = {}) {
  const neto = movimientos.reduce((suma, movimiento) => suma + Number(movimiento.cantidad_neta), 0);
  let saldo = cantidad(Number(stockActual) - neto);
  let promedio = saldo > 0 ? Number(precioInicial) || 0 : 0;
  const filas = [];

  if (saldo !== 0) {
    filas.push({
      id_movimiento: null,
      fecha: null,
      fecha_movimiento: null,
      tipo_movimiento: "SALDO_INICIAL",
      referencia: null,
      observaciones: null,
      entrada: saldo > 0 ? saldo : 0,
      salida: saldo < 0 ? cantidad(Math.abs(saldo)) : 0,
      saldo,
      costo_unitario: costo(promedio),
      saldo_valorizado: dinero(saldo * promedio),
    });
  }

  for (const movimiento of movimientos) {
    const neta = Number(movimiento.cantidad_neta) || 0;
    const costoMovimiento = Number(movimiento.costo_unitario) || 0;
    let costoLinea = promedio;

    if (neta > 0) {
      const esRecepcion = movimiento.tipo_movimiento === "ENTRADA";
      const costoIngreso = esRecepcion || promedio <= 0 || saldo <= 0 ? costoMovimiento : promedio;
      const nuevo = cantidad(saldo + neta);
      if (saldo > 0 && nuevo > 0) {
        promedio = (saldo * promedio + neta * costoIngreso) / nuevo;
      } else if (nuevo > 0) {
        promedio = costoIngreso;
      }
      costoLinea = promedio;
      saldo = nuevo;
    } else if (neta < 0) {
      costoLinea = promedio;
      saldo = cantidad(saldo + neta);
    }

    filas.push({
      id_movimiento: movimiento.id_movimiento,
      fecha: movimiento.fecha || null,
      fecha_movimiento: movimiento.fecha_movimiento,
      tipo_movimiento: movimiento.tipo_movimiento,
      referencia: movimiento.referencia || null,
      observaciones: movimiento.observaciones || null,
      entrada: neta > 0 ? cantidad(neta) : 0,
      salida: neta < 0 ? cantidad(Math.abs(neta)) : 0,
      saldo,
      costo_unitario: costo(costoLinea),
      saldo_valorizado: dinero(saldo * promedio),
    });
  }

  return {
    filas,
    saldo_final: saldo,
    costo_promedio: costo(promedio),
    saldo_valorizado: dinero(saldo * promedio),
  };
}

// Conserva el saldo corrido. Lo anterior al período se resume en una fila.
function filtrarPeriodo(filas, desde, hasta) {
  if (!desde && !hasta) return filas;

  const visibles = [];
  let anterior = null;
  for (const fila of filas) {
    if (!fila.fecha) {
      if (desde) anterior = fila;
      else visibles.push(fila);
      continue;
    }
    if (desde && fila.fecha < desde) {
      anterior = fila;
      continue;
    }
    if (hasta && fila.fecha > hasta) continue;
    visibles.push(fila);
  }

  if (anterior) {
    visibles.unshift({
      ...anterior,
      id_movimiento: null,
      tipo_movimiento: "SALDO_ANTERIOR",
      referencia: null,
      observaciones: null,
      entrada: 0,
      salida: 0,
      fecha: desde || anterior.fecha,
      fecha_movimiento: desde || anterior.fecha_movimiento,
    });
  }
  return visibles;
}

module.exports = { calcularKardex, filtrarPeriodo };
