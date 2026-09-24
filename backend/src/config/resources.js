const resources = {
  roles: {
    table: 'roles',
    primaryKey: 'id_rol',
    columns: ['nombre', 'descripcion', 'activo']
  },
  usuarios: {
    table: 'usuarios',
    primaryKey: 'id_usuario',
    columns: ['id_rol', 'nombre_usuario', 'nombre_completo', 'email', 'activo'],
    defaultSelect:
      'id_usuario, id_rol, nombre_usuario, nombre_completo, email, activo, ultimo_login, fecha_creacion'
  },
  categorias: {
    table: 'categorias',
    primaryKey: 'id_categoria',
    columns: ['nombre', 'descripcion', 'activo']
  },
  subcategorias: {
    table: 'subcategorias',
    primaryKey: 'id_subcategoria',
    columns: ['id_categoria', 'nombre', 'descripcion', 'activo']
  },
  marcas: {
    table: 'marcas',
    primaryKey: 'id_marca',
    columns: ['nombre', 'descripcion', 'activo']
  },
  unidades_medida: {
    table: 'unidades_medida',
    primaryKey: 'id_unidad',
    columns: ['nombre', 'abreviatura']
  },
  productos: {
    table: 'productos',
    primaryKey: 'id_producto',
    columns: [
      'codigo',
      'codigo_barras',
      'nombre',
      'descripcion',
      'id_categoria',
      'id_subcategoria',
      'id_marca',
      'id_unidad',
      'controla_vencimiento',
      'stock_minimo',
      'stock_maximo',
      'punto_reposicion',
      'estado'
    ]
  },
  almacenes: {
    table: 'almacenes',
    primaryKey: 'id_almacen',
    columns: ['codigo', 'nombre', 'tipo', 'direccion', 'ciudad', 'capacidad', 'activo']
  },
  ubicaciones: {
    table: 'ubicaciones',
    primaryKey: 'id_ubicacion',
    columns: ['id_almacen', 'zona', 'pasillo', 'estante', 'nivel', 'descripcion', 'activo']
  },
  lotes_productos: {
    table: 'lotes_productos',
    primaryKey: 'id_lote',
    columns: [
      'id_producto',
      'id_almacen',
      'numero_lote',
      'fecha_ingreso',
      'fecha_vencimiento',
      'cantidad_inicial',
      'cantidad_actual',
      'estado'
    ]
  },
  stock: {
    table: 'stock',
    primaryKey: 'id_stock',
    columns: ['id_producto', 'id_almacen', 'cantidad', 'cantidad_reservada']
  },
  stock_ubicaciones: {
    table: 'stock_ubicaciones',
    primaryKey: 'id_stock_ubicacion',
    columns: ['id_producto', 'id_ubicacion', 'cantidad']
  },
  entradas_inventario: {
    table: 'entradas_inventario',
    primaryKey: 'id_entrada',
    columns: [
      'numero_entrada',
      'id_almacen',
      'id_usuario',
      'fecha_entrada',
      'origen',
      'referencia_externa',
      'estado',
      'observaciones'
    ]
  },
  detalle_entradas: {
    table: 'detalle_entradas',
    primaryKey: 'id_detalle_entrada',
    columns: ['id_entrada', 'id_producto', 'id_lote', 'cantidad_solicitada', 'cantidad_recibida', 'observaciones']
  },
  salidas_inventario: {
    table: 'salidas_inventario',
    primaryKey: 'id_salida',
    columns: [
      'numero_salida',
      'id_almacen',
      'id_usuario',
      'fecha_salida',
      'motivo',
      'referencia_externa',
      'estado',
      'observaciones'
    ]
  },
  detalle_salidas: {
    table: 'detalle_salidas',
    primaryKey: 'id_detalle_salida',
    columns: ['id_salida', 'id_producto', 'id_lote', 'cantidad', 'observaciones']
  },
  transferencias: {
    table: 'transferencias',
    primaryKey: 'id_transferencia',
    columns: [
      'numero_transferencia',
      'almacen_origen',
      'almacen_destino',
      'id_usuario_solicita',
      'id_usuario_aprueba',
      'fecha_solicitud',
      'fecha_aprobacion',
      'fecha_envio',
      'fecha_recepcion',
      'estado',
      'observaciones'
    ]
  },
  detalle_transferencias: {
    table: 'detalle_transferencias',
    primaryKey: 'id_detalle_transferencia',
    columns: [
      'id_transferencia',
      'id_producto',
      'id_lote',
      'cantidad_solicitada',
      'cantidad_enviada',
      'cantidad_recibida',
      'observaciones'
    ]
  },
  inventarios_fisicos: {
    table: 'inventarios_fisicos',
    primaryKey: 'id_inventario',
    columns: [
      'numero_inventario',
      'id_almacen',
      'id_usuario',
      'fecha_programada',
      'fecha_inicio',
      'fecha_fin',
      'estado',
      'observaciones'
    ]
  },
  detalle_inventario_fisico: {
    table: 'detalle_inventario_fisico',
    primaryKey: 'id_detalle',
    columns: ['id_inventario', 'id_producto', 'id_lote', 'cantidad_sistema', 'cantidad_fisica', 'observaciones']
  },
  ajustes_inventario: {
    table: 'ajustes_inventario',
    primaryKey: 'id_ajuste',
    columns: [
      'numero_ajuste',
      'id_almacen',
      'id_producto',
      'id_lote',
      'id_usuario',
      'cantidad_anterior',
      'cantidad_nueva',
      'motivo',
      'estado'
    ]
  },
  movimientos_inventario: {
    table: 'movimientos_inventario',
    primaryKey: 'id_movimiento',
    columns: [
      'id_producto',
      'id_almacen',
      'id_lote',
      'id_usuario',
      'tipo_movimiento',
      'cantidad',
      'stock_anterior',
      'stock_nuevo',
      'referencia',
      'observaciones'
    ]
  },
  integraciones: {
    table: 'integraciones',
    primaryKey: 'id_integracion',
    columns: ['sistema', 'descripcion', 'activo']
  },
  logs_integracion: {
    table: 'logs_integracion',
    primaryKey: 'id_log',
    columns: [
      'id_integracion',
      'tipo_operacion',
      'entidad',
      'referencia_externa',
      'estado',
      'datos',
      'respuesta',
      'fecha_envio',
      'fecha_respuesta',
      'mensaje_error'
    ]
  },
  referencias_externas: {
    table: 'referencias_externas',
    primaryKey: 'id_referencia',
    columns: ['id_integracion', 'entidad_local', 'id_entidad_local', 'id_externo']
  }
};

module.exports = resources;
