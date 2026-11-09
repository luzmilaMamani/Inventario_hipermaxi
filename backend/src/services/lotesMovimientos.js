const ApiError = require("../utils/apiError");
const { asignarLotes, obtenerLotesVigentes } = require("./lotesFefo");

// Regla del inventario: stock.cantidad = suma de cantidad_actual de los lotes del
// producto en ese almacén. Todo movimiento debe bloquear primero los lotes y luego
// la fila de stock, para no cruzar bloqueos con las salidas.

async function bloquearLotes(client, idProducto, idAlmacen) {
  await client.query(
    `SELECT id_lote FROM lotes_productos
     WHERE id_producto = $1 AND id_almacen = $2
     ORDER BY id_lote
     FOR UPDATE`,
    [idProducto, idAlmacen],
  );
}

async function descontarDeLote(client, idLote, cantidad) {
  await client.query(
    `UPDATE lotes_productos
     SET cantidad_actual = cantidad_actual - $1::numeric,
         estado = CASE WHEN cantidad_actual - $1::numeric = 0 THEN 'AGOTADO' ELSE estado END
     WHERE id_lote = $2`,
    [cantidad, idLote],
  );
}

// Un lote agotado vuelve a DISPONIBLE; si ya venció, el trigger lo deja VENCIDO.
async function sumarALote(client, idLote, cantidad, { sumarInicial = false } = {}) {
  await client.query(
    `UPDATE lotes_productos
     SET cantidad_actual = cantidad_actual + $1::numeric,
         cantidad_inicial = cantidad_inicial + CASE WHEN $3::boolean THEN $1::numeric ELSE 0 END,
         estado = CASE WHEN estado = 'AGOTADO' THEN 'DISPONIBLE' ELSE estado END
     WHERE id_lote = $2`,
    [cantidad, idLote, sumarInicial],
  );
}

async function ingresarEnLote(client, datos) {
  const { idProducto, idAlmacen, numeroLote, fechaIngreso, fechaVencimiento, cantidad } = datos;
  const { rows } = await client.query(
    `INSERT INTO lotes_productos
       (id_producto, id_almacen, numero_lote, fecha_ingreso, fecha_vencimiento,
        cantidad_inicial, cantidad_actual)
     VALUES ($1, $2, $3, COALESCE($4::date, CURRENT_DATE), $5::date, $6::numeric, $6::numeric)
     ON CONFLICT (id_producto, id_almacen, numero_lote) DO UPDATE
       SET cantidad_inicial = lotes_productos.cantidad_inicial + EXCLUDED.cantidad_inicial,
           cantidad_actual = lotes_productos.cantidad_actual + EXCLUDED.cantidad_actual,
           estado = CASE
             WHEN lotes_productos.estado = 'AGOTADO' THEN 'DISPONIBLE'
             ELSE lotes_productos.estado
           END
     RETURNING id_lote`,
    [idProducto, idAlmacen, numeroLote, fechaIngreso || null, fechaVencimiento || null, cantidad],
  );
  return rows[0].id_lote;
}

// Al enviar, descuenta los lotes vigentes del origen (FEFO) y deja constancia.
async function enviarLotesTransferencia(client, { idDetalle, idProducto, idAlmacen, cantidad }) {
  const asignaciones = await asignarLotes(client, {
    id_producto: idProducto,
    id_almacen: idAlmacen,
    cantidad,
  });

  for (const { lote, cantidad: cantidadLote } of asignaciones) {
    await descontarDeLote(client, lote.id_lote, cantidadLote);
    await client.query(
      `INSERT INTO detalle_transferencia_lotes
         (id_detalle_transferencia, id_lote_origen, cantidad_enviada)
       VALUES ($1, $2, $3)`,
      [idDetalle, lote.id_lote, cantidadLote],
    );
  }
}

async function loteDestinoDeTransferencia(client, { envio, idAlmacenDestino, numeroTransferencia, cantidad }) {
  const existente = await client.query(
    `SELECT id_lote, TO_CHAR(fecha_vencimiento, 'YYYY-MM-DD') AS fecha_vencimiento
     FROM lotes_productos
     WHERE id_producto = $1 AND id_almacen = $2 AND numero_lote = $3
     FOR UPDATE`,
    [envio.id_producto, idAlmacenDestino, envio.numero_lote],
  );

  // El mismo número con otra fecha es otro lote físico: no se mezclan vencimientos.
  const mismoLote = existente.rows[0]?.fecha_vencimiento === envio.fecha_vencimiento;
  let numeroLote = existente.rowCount && !mismoLote
    ? `${envio.numero_lote}-${numeroTransferencia}`
    : envio.numero_lote;
  if (!envio.fecha_vencimiento && envio.controla_vencimiento && !numeroLote.startsWith("SALDO-")) {
    numeroLote = `SALDO-${numeroLote}`;
  }

  return ingresarEnLote(client, {
    idProducto: envio.id_producto,
    idAlmacen: idAlmacenDestino,
    numeroLote,
    fechaIngreso: envio.fecha_ingreso,
    fechaVencimiento: envio.fecha_vencimiento,
    cantidad,
  });
}

// Al recibir, recrea en destino los lotes enviados con su mismo vencimiento.
// Un faltante recae en los últimos lotes; un sobrante, en el último.
async function recibirLotesTransferencia(client, datos) {
  const { idDetalle, idProducto, idAlmacenDestino, numeroTransferencia, cantidadRecibida } = datos;
  const { rows: envios } = await client.query(
    `SELECT dtl.id_detalle_transferencia_lote, dtl.cantidad_enviada,
            lp.id_producto, lp.numero_lote,
            TO_CHAR(lp.fecha_ingreso, 'YYYY-MM-DD') AS fecha_ingreso,
            TO_CHAR(lp.fecha_vencimiento, 'YYYY-MM-DD') AS fecha_vencimiento,
            p.controla_vencimiento
     FROM detalle_transferencia_lotes dtl
     INNER JOIN lotes_productos lp ON lp.id_lote = dtl.id_lote_origen
     INNER JOIN productos p ON p.id_producto = lp.id_producto
     WHERE dtl.id_detalle_transferencia = $1
     ORDER BY dtl.id_detalle_transferencia_lote`,
    [idDetalle],
  );

  // Transferencias en tránsito enviadas antes de registrar lotes por línea.
  if (envios.length === 0) {
    if (cantidadRecibida > 0) {
      await ingresarEnLote(client, {
        idProducto,
        idAlmacen: idAlmacenDestino,
        numeroLote: `SALDO-${idProducto}-${idAlmacenDestino}`,
        cantidad: cantidadRecibida,
      });
    }
    return;
  }

  let pendiente = cantidadRecibida;
  for (const [indice, envio] of envios.entries()) {
    const esUltimo = indice === envios.length - 1;
    const recibida = esUltimo ? pendiente : Math.min(Number(envio.cantidad_enviada), pendiente);
    pendiente -= recibida;
    if (recibida <= 0) continue;

    const idLoteDestino = await loteDestinoDeTransferencia(client, {
      envio,
      idAlmacenDestino,
      numeroTransferencia,
      cantidad: recibida,
    });
    await client.query(
      `UPDATE detalle_transferencia_lotes
       SET cantidad_recibida = $1, id_lote_destino = $2
       WHERE id_detalle_transferencia_lote = $3`,
      [recibida, idLoteDestino, envio.id_detalle_transferencia_lote],
    );
  }
}

// Comprueba antes de registrar el ajuste que se podrá aplicar en los lotes.
async function validarAjusteEnLotes(client, datos) {
  const { idProducto, idAlmacen, diferencia, controlaVencimiento, fechaVencimiento } = datos;
  if (diferencia <= 0 || !controlaVencimiento || fechaVencimiento) return;

  const vigentes = await obtenerLotesVigentes(client, { id_producto: idProducto, id_almacen: idAlmacen });
  if (vigentes.length === 0) {
    throw new ApiError(
      400,
      "El producto controla vencimiento y no tiene lotes vigentes: indica la fecha de vencimiento de las unidades que agregas",
    );
  }
}

async function aumentarLotesPorAjuste(client, datos) {
  const { idProducto, idAlmacen, cantidad, numeroAjuste, fechaVencimiento } = datos;
  const vigentes = await obtenerLotesVigentes(client, { id_producto: idProducto, id_almacen: idAlmacen });

  // Se suma al lote que vence más tarde para no adelantar unidades en FEFO.
  const destino = vigentes[vigentes.length - 1];
  if (destino) {
    await sumarALote(client, destino.id_lote, cantidad);
    return;
  }
  await ingresarEnLote(client, {
    idProducto,
    idAlmacen,
    numeroLote: numeroAjuste,
    fechaVencimiento,
    cantidad,
  });
}

async function reducirLotesPorAjuste(client, { idProducto, idAlmacen, cantidad }) {
  const { rows: lotes } = await client.query(
    `SELECT id_lote, cantidad_actual
     FROM lotes_productos
     WHERE id_producto = $1 AND id_almacen = $2 AND cantidad_actual > 0
     ORDER BY (estado = 'CUARENTENA') ASC, fecha_vencimiento ASC NULLS LAST, fecha_ingreso ASC, id_lote ASC`,
    [idProducto, idAlmacen],
  );

  let pendiente = cantidad;
  for (const lote of lotes) {
    if (pendiente <= 0) break;
    const tomar = Math.min(Number(lote.cantidad_actual), pendiente);
    await descontarDeLote(client, lote.id_lote, tomar);
    pendiente -= tomar;
  }
}

async function aplicarAjusteEnLotes(client, datos) {
  const { diferencia, ...resto } = datos;
  if (diferencia > 0) {
    await aumentarLotesPorAjuste(client, { ...resto, cantidad: diferencia });
  } else if (diferencia < 0) {
    await reducirLotesPorAjuste(client, { ...resto, cantidad: -diferencia });
  }
}

module.exports = {
  bloquearLotes,
  sumarALote,
  enviarLotesTransferencia,
  recibirLotesTransferencia,
  validarAjusteEnLotes,
  aplicarAjusteEnLotes,
};
