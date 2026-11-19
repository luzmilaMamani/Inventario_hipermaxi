const { asignarLotes } = require("./lotesFefo");
const { obtenerCantidadNoDisponible } = require("./lotesVencidos");
const { bloquearLotes, sumarALote } = require("./lotesMovimientos");

// RF72 (HIP-273): efecto en el stock de las ventas que llegan del SI de Ventas.
//  - venta.confirmada: salida de stock por FEFO (movimiento VENTA).
//  - venta.anulada: reingreso de lo descontado a los mismos lotes
//    (movimiento ANULACION_VENTA).
// Todas las funciones reciben un cliente con la transacción abierta; quien las
// llama (el suscriptor de Pub/Sub o el reproceso) confirma o revierte.

// Falla de negocio: el mensaje es correcto pero no se puede aplicar ahora
// (producto inexistente, sin stock, sucursal desconocida). Se registra con error
// y se puede reprocesar.
class ErrorVenta extends Error {}

const referenciaVenta = (idVenta) => `VENTA-${idVenta}`;

async function resolverAlmacen(client, sucursal) {
  const texto = String(sucursal ?? "").trim();
  const { rows } = await client.query(
    `SELECT id_almacen FROM almacenes
     WHERE activo = TRUE
       AND (UPPER(codigo) = UPPER($1) OR UPPER(nombre) = UPPER($1)
            OR ($1 ~ '^[0-9]+$' AND id_almacen = $1::int))
     ORDER BY (UPPER(codigo) = UPPER($1)) DESC
     LIMIT 1`,
    [texto],
  );
  return rows[0]?.id_almacen ?? null;
}

// Guarda la venta y su detalle (una vez). Devuelve la fila bloqueada.
async function guardarVenta(client, { id_venta: idVenta, sucursal, fecha, detalle = [] }, idMensaje) {
  const { rows } = await client.query(
    `INSERT INTO venta_recibida (id_venta, sucursal, fecha_venta, id_mensaje_confirmacion)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (id_venta) DO UPDATE
       SET id_mensaje_confirmacion = COALESCE(venta_recibida.id_mensaje_confirmacion, EXCLUDED.id_mensaje_confirmacion)
     RETURNING *`,
    [String(idVenta), String(sucursal), fecha, idMensaje],
  );
  const venta = rows[0];
  await client.query("SELECT 1 FROM venta_recibida WHERE id_venta_recibida = $1 FOR UPDATE", [venta.id_venta_recibida]);

  // Si el mismo código viene en dos líneas se suman.
  const cantidades = new Map();
  for (const linea of detalle) {
    const codigo = String(linea.codigo_producto).trim();
    cantidades.set(codigo, (cantidades.get(codigo) || 0) + Number(linea.cantidad));
  }
  for (const [codigo, cantidad] of cantidades) {
    await client.query(
      `INSERT INTO venta_recibida_detalle (id_venta_recibida, codigo_producto, cantidad)
       VALUES ($1, $2, $3)
       ON CONFLICT (id_venta_recibida, codigo_producto) DO NOTHING`,
      [venta.id_venta_recibida, codigo, cantidad],
    );
  }
  return venta;
}

// Descuenta del stock cada línea de la venta por FEFO. Si algo impide la venta
// completa lanza ErrorVenta con todos los motivos.
async function descontarVenta(client, venta) {
  const idAlmacen = await resolverAlmacen(client, venta.sucursal);
  if (!idAlmacen) throw new ErrorVenta(`La sucursal ${venta.sucursal} no existe o está inactiva`);

  const { rows: lineas } = await client.query(
    `SELECT d.id_venta_recibida_detalle, d.codigo_producto, d.cantidad,
            p.id_producto, COALESCE(p.precio, 0) AS precio
     FROM venta_recibida_detalle d
     LEFT JOIN productos p
       ON (p.codigo = d.codigo_producto OR p.codigo_barras = d.codigo_producto)
      AND p.estado = 'ACTIVO'
     WHERE d.id_venta_recibida = $1
     ORDER BY p.id_producto NULLS FIRST`,
    [venta.id_venta_recibida],
  );
  if (lineas.length === 0) throw new ErrorVenta("La venta no tiene productos");

  const inexistentes = lineas.filter((l) => !l.id_producto).map((l) => l.codigo_producto);
  if (inexistentes.length) {
    throw new ErrorVenta(`Producto inexistente o inactivo: ${inexistentes.join(", ")}`);
  }

  const referencia = referenciaVenta(venta.id_venta);
  const faltantes = [];

  // Orden fijo por producto para no cruzar bloqueos con otras ventas.
  for (const linea of lineas) {
    const idProducto = linea.id_producto;
    const cantidad = Number(linea.cantidad);
    await client.query("UPDATE venta_recibida_detalle SET id_producto = $1 WHERE id_venta_recibida_detalle = $2", [
      idProducto,
      linea.id_venta_recibida_detalle,
    ]);

    // Primero los lotes (FEFO, los bloquea) y después la fila de stock, igual que
    // las salidas, para no cruzar bloqueos.
    let asignaciones;
    try {
      asignaciones = await asignarLotes(client, { id_producto: idProducto, id_almacen: idAlmacen, cantidad });
    } catch (error) {
      if (error.statusCode !== 400) throw error;
      faltantes.push(`${linea.codigo_producto}: ${error.message}`);
      continue;
    }

    const { rows: stockRows } = await client.query(
      `SELECT id_stock, cantidad, COALESCE(cantidad_reservada, 0) AS reservada
       FROM stock WHERE id_producto = $1 AND id_almacen = $2 FOR UPDATE`,
      [idProducto, idAlmacen],
    );
    const stock = stockRows[0];
    // RF43/RF61: lo vencido, en cuarentena o reservado no se vende.
    const disponible = stock
      ? Number(stock.cantidad) - Number(stock.reservada) - (await obtenerCantidadNoDisponible(client, idProducto, idAlmacen))
      : 0;
    if (!stock || cantidad > disponible) {
      faltantes.push(`${linea.codigo_producto} (pedido ${cantidad}, disponible ${Math.max(disponible, 0)})`);
      continue;
    }

    let saldo = Number(stock.cantidad);
    for (const { lote, cantidad: cantidadLote } of asignaciones) {
      await client.query(
        `UPDATE lotes_productos
         SET cantidad_actual = cantidad_actual - $1::numeric,
             estado = CASE WHEN cantidad_actual - $1::numeric = 0 THEN 'AGOTADO' ELSE estado END
         WHERE id_lote = $2`,
        [cantidadLote, lote.id_lote],
      );
      await client.query(
        `INSERT INTO movimientos_inventario
           (id_producto, id_almacen, id_lote, tipo_movimiento, cantidad,
            stock_anterior, stock_nuevo, referencia, observaciones)
         VALUES ($1, $2, $3, 'VENTA', $4, $5, $6, $7, $8)`,
        [idProducto, idAlmacen, lote.id_lote, cantidadLote, saldo, saldo - cantidadLote, referencia,
          `Venta ${venta.id_venta} recibida del SI de Ventas`],
      );
      saldo -= cantidadLote;
    }
    await client.query(
      "UPDATE stock SET cantidad = $1, fecha_actualizacion = CURRENT_TIMESTAMP WHERE id_stock = $2",
      [saldo, stock.id_stock],
    );
  }

  if (faltantes.length) throw new ErrorVenta(`Stock insuficiente: ${faltantes.join("; ")}`);

  await client.query(
    `UPDATE venta_recibida
     SET estado = 'DESCONTADA', id_almacen = $1, fecha_descuento = CURRENT_TIMESTAMP, error = NULL
     WHERE id_venta_recibida = $2`,
    [idAlmacen, venta.id_venta_recibida],
  );
}

// Intenta el descuento dentro de un savepoint: si falla por negocio, deshace lo
// parcial y deja la venta en ERROR con el motivo.
async function intentarDescuento(client, venta) {
  await client.query("SAVEPOINT descuento_venta");
  try {
    await descontarVenta(client, venta);
    await client.query("RELEASE SAVEPOINT descuento_venta");
    return { estado: "DESCONTADA", id_venta: venta.id_venta };
  } catch (error) {
    if (!(error instanceof ErrorVenta)) throw error;
    await client.query("ROLLBACK TO SAVEPOINT descuento_venta");
    await client.query(
      "UPDATE venta_recibida SET estado = 'ERROR', error = $1 WHERE id_venta_recibida = $2",
      [error.message, venta.id_venta_recibida],
    );
    return { estado: "ERROR", id_venta: venta.id_venta, error: error.message };
  }
}

// venta.confirmada
async function registrarVentaConfirmada(client, mensaje, idMensaje) {
  const venta = await guardarVenta(client, mensaje, idMensaje);
  if (venta.estado === "DESCONTADA" || venta.estado === "ANULADA") {
    // Ya aplicada, o la anulación llegó antes que la confirmación.
    return { estado: venta.estado, id_venta: venta.id_venta, sin_cambios: true };
  }
  return intentarDescuento(client, venta);
}

// venta.anulada
async function registrarVentaAnulada(client, mensaje, idMensaje) {
  const { rows } = await client.query(
    "SELECT * FROM venta_recibida WHERE id_venta = $1 FOR UPDATE",
    [String(mensaje.id_venta)],
  );
  let venta = rows[0];

  if (!venta) {
    // La anulación llegó primero: se registra para ignorar la confirmación.
    await client.query(
      `INSERT INTO venta_recibida
         (id_venta, sucursal, fecha_venta, estado, id_mensaje_anulacion, fecha_anulacion)
       VALUES ($1, $2, $3, 'ANULADA', $4, CURRENT_TIMESTAMP)`,
      [String(mensaje.id_venta), String(mensaje.sucursal), mensaje.fecha, idMensaje],
    );
    return { estado: "ANULADA", id_venta: String(mensaje.id_venta), sin_venta_previa: true };
  }
  if (venta.estado === "ANULADA") {
    return { estado: "ANULADA", id_venta: venta.id_venta, sin_cambios: true };
  }

  let reingresado = 0;
  if (venta.estado === "DESCONTADA") {
    const referencia = referenciaVenta(venta.id_venta);
    const { rows: movimientos } = await client.query(
      `SELECT m.id_producto, m.id_almacen, m.id_lote, m.cantidad
       FROM movimientos_inventario m
       WHERE m.referencia = $1 AND m.tipo_movimiento = 'VENTA'
       ORDER BY m.id_producto, m.id_lote`,
      [referencia],
    );

    const productos = [...new Set(movimientos.map((m) => m.id_producto))];
    for (const idProducto of productos) {
      const idAlmacen = movimientos.find((m) => m.id_producto === idProducto).id_almacen;
      await bloquearLotes(client, idProducto, idAlmacen);
      const { rows: stockRows } = await client.query(
        "SELECT id_stock, cantidad FROM stock WHERE id_producto = $1 AND id_almacen = $2 FOR UPDATE",
        [idProducto, idAlmacen],
      );
      let saldo = Number(stockRows[0].cantidad);
      for (const m of movimientos.filter((x) => x.id_producto === idProducto)) {
        const cantidad = Number(m.cantidad);
        await sumarALote(client, m.id_lote, cantidad);
        await client.query(
          `INSERT INTO movimientos_inventario
             (id_producto, id_almacen, id_lote, tipo_movimiento, cantidad,
              stock_anterior, stock_nuevo, referencia, observaciones)
           VALUES ($1, $2, $3, 'ANULACION_VENTA', $4, $5, $6, $7, $8)`,
          [idProducto, idAlmacen, m.id_lote, cantidad, saldo, saldo + cantidad, referencia,
            `Reingreso por anulación de la venta ${venta.id_venta}`],
        );
        saldo += cantidad;
        reingresado += cantidad;
      }
      await client.query(
        "UPDATE stock SET cantidad = $1, fecha_actualizacion = CURRENT_TIMESTAMP WHERE id_stock = $2",
        [saldo, stockRows[0].id_stock],
      );
    }
  }

  const { rows: actualizada } = await client.query(
    `UPDATE venta_recibida
     SET estado = 'ANULADA', id_mensaje_anulacion = $1, fecha_anulacion = CURRENT_TIMESTAMP
     WHERE id_venta_recibida = $2
     RETURNING *`,
    [idMensaje, venta.id_venta_recibida],
  );
  venta = actualizada[0];
  return { estado: "ANULADA", id_venta: venta.id_venta, unidades_reingresadas: reingresado };
}

// Reintenta una venta que quedó en ERROR (por ejemplo, después de reponer stock).
async function reprocesarVenta(client, idVenta) {
  const { rows } = await client.query("SELECT * FROM venta_recibida WHERE id_venta = $1 FOR UPDATE", [String(idVenta)]);
  const venta = rows[0];
  if (!venta) throw new ErrorVenta(`La venta ${idVenta} no fue recibida`);
  if (venta.estado !== "ERROR" && venta.estado !== "PENDIENTE") {
    return { estado: venta.estado, id_venta: venta.id_venta, sin_cambios: true };
  }
  return intentarDescuento(client, venta);
}

module.exports = {
  ErrorVenta,
  referenciaVenta,
  resolverAlmacen,
  registrarVentaConfirmada,
  registrarVentaAnulada,
  reprocesarVenta,
};
