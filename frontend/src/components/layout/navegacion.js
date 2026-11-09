import {
  ROLES_APROBACION_AJUSTES,
  ROLES_GESTION,
  ROLES_LECTURA_Y_OPERACION,
  ROLES_SIN_EMPLEADO,
  tieneRol,
} from "../../utils/permissions";

// Mapa único de pantallas: de aquí salen el menú, las pestañas, el buscador y el inicio.
export const MODULOS = [
  {
    id: "catalogo",
    label: "Catálogo",
    icon: "📦",
    descripcion: "Productos, almacenes y dónde se guarda cada cosa",
    destinos: [
      { to: "/productos", label: "Productos", icon: "📦", descripcion: "Alta, edición y consulta de productos", roles: ROLES_LECTURA_Y_OPERACION },
      { to: "/clasificacion", label: "Clasificación", icon: "🏷️", descripcion: "Categorías, subcategorías y marcas", roles: ROLES_SIN_EMPLEADO },
      { to: "/almacenes", label: "Almacenes", icon: "🏬", descripcion: "Sucursales y depósitos", roles: ROLES_LECTURA_Y_OPERACION },
      { to: "/ubicaciones", label: "Ubicaciones", icon: "📍", descripcion: "Zonas, pasillos y estantes", roles: ROLES_SIN_EMPLEADO },
      { to: "/barcode", label: "Buscar por código", icon: "🔍", descripcion: "Escanea un código y mira su stock" },
      { to: "/etiquetas", label: "Imprimir etiquetas", icon: "🖨️", descripcion: "Etiquetas con código de barras y precio", roles: ROLES_GESTION },
    ],
  },
  {
    id: "stock",
    label: "Stock",
    icon: "📈",
    descripcion: "Cuánto hay, qué está por vencer y conteos físicos",
    destinos: [
      { to: "/stock", label: "Consulta de stock", icon: "📈", descripcion: "Existencias por producto y almacén", roles: ROLES_LECTURA_Y_OPERACION },
      { to: "/stock/proximos-vencer", label: "Próximos vencimientos", icon: "📅", descripcion: "Lotes que vencen pronto", roles: ROLES_LECTURA_Y_OPERACION },
      { to: "/stock/vencidos", label: "Productos vencidos", icon: "🚫", descripcion: "Lotes vencidos y su baja", roles: ROLES_LECTURA_Y_OPERACION },
      { to: "/stock/lotes", label: "Lotes y cuarentena", icon: "🧪", descripcion: "Bloquea o libera lotes en revisión", roles: ROLES_LECTURA_Y_OPERACION },
      { to: "/inventarios", label: "Inventarios físicos", icon: "📋", descripcion: "Conteos y sus diferencias", roles: ROLES_LECTURA_Y_OPERACION },
    ],
  },
  {
    id: "movimientos",
    label: "Movimientos",
    icon: "🔄",
    descripcion: "Todo lo que entra, sale o cambia de almacén",
    destinos: [
      { to: "/recepciones", label: "Recepciones", icon: "📥", descripcion: "Mercadería que llega del proveedor", roles: ROLES_LECTURA_Y_OPERACION },
      { to: "/salidas", label: "Salidas", icon: "📤", descripcion: "Ventas, pérdidas, daños y vencimientos", roles: ROLES_LECTURA_Y_OPERACION },
      { to: "/transferencias", label: "Transferencias", icon: "🔄", descripcion: "Envíos entre almacenes", roles: ROLES_LECTURA_Y_OPERACION },
      { to: "/transferencias/diferencias", label: "Diferencias", icon: "⚖️", descripcion: "Faltantes y sobrantes al recibir transferencias", roles: ROLES_LECTURA_Y_OPERACION },
      { to: "/devoluciones", label: "Devoluciones de clientes", icon: "↩️", descripcion: "Productos que el cliente devuelve", roles: ROLES_LECTURA_Y_OPERACION },
      { to: "/devoluciones-proveedor", label: "Devoluciones a proveedor", icon: "🚚", descripcion: "Mercadería defectuosa y su reposición", roles: ROLES_LECTURA_Y_OPERACION },
      { to: "/solicitudes-materiales", label: "Solicitudes de materiales", icon: "🏭", descripcion: "Pedidos de Producción y Logística", roles: ROLES_LECTURA_Y_OPERACION },
    ],
  },
  {
    id: "control",
    label: "Control",
    icon: "🔔",
    descripcion: "Alertas, ajustes y aprobaciones",
    destinos: [
      { to: "/alertas-vencimiento", label: "Alertas de vencimiento", icon: "⏰", descripcion: "Lotes por vencer o vencidos", roles: ROLES_LECTURA_Y_OPERACION },
      { to: "/alertas-stock", label: "Alertas de stock", icon: "🔔", descripcion: "Productos en mínimo o por reponer", roles: ROLES_LECTURA_Y_OPERACION },
      { to: "/ajustes", label: "Ajustes", icon: "📝", descripcion: "Correcciones de stock e historial", roles: ROLES_LECTURA_Y_OPERACION },
      { to: "/ajustes/aprobacion", label: "Aprobación de ajustes", icon: "✅", descripcion: "Ajustes que superan el límite", roles: [...ROLES_APROBACION_AJUSTES, "ADMINISTRADOR"] },
      { to: "/stock/parametros-vencimiento", label: "Parámetros de vencimiento", icon: "⚙️", descripcion: "Días de aviso por categoría", roles: ROLES_SIN_EMPLEADO },
    ],
  },
  {
    id: "reportes",
    label: "Reportes",
    icon: "📊",
    descripcion: "Pérdidas, daños y vencimientos valorizados",
    destinos: [
      { to: "/reportes/perdidas", label: "Pérdidas", icon: "🚨", descripcion: "Robos y extravíos" },
      { to: "/reportes/danos", label: "Daños", icon: "⚠️", descripcion: "Mercadería dañada" },
      { to: "/reportes/vencimientos", label: "Vencimientos", icon: "⏳", descripcion: "Bajas por vencimiento" },
    ],
  },
];

export function modulosParaRol(rol) {
  return MODULOS.map((modulo) => ({
    ...modulo,
    destinos: modulo.destinos.filter(
      (destino) => !destino.roles || tieneRol(rol, destino.roles),
    ),
  })).filter((modulo) => modulo.destinos.length > 0);
}

// Gana la ruta más larga: /stock/vencidos no debe marcar también /stock, y las
// pantallas de detalle (/recepciones/12) mantienen marcada su lista.
export function ubicarRuta(modulos, pathname) {
  let mejor = null;
  for (const modulo of modulos) {
    for (const destino of modulo.destinos) {
      const coincide = pathname === destino.to || pathname.startsWith(`${destino.to}/`);
      if (coincide && (!mejor || destino.to.length > mejor.destino.to.length)) {
        mejor = { modulo, destino };
      }
    }
  }
  return mejor;
}

export function normalizarTexto(texto) {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

export function buscarDestinos(modulos, consulta) {
  const terminos = normalizarTexto(consulta).split(/\s+/).filter(Boolean);
  const resultados = [];

  for (const modulo of modulos) {
    for (const destino of modulo.destinos) {
      const texto = normalizarTexto(`${destino.label} ${destino.descripcion} ${modulo.label}`);
      if (terminos.every((termino) => texto.includes(termino))) {
        const enTitulo = terminos.every((termino) =>
          normalizarTexto(destino.label).includes(termino),
        );
        resultados.push({ modulo, destino, enTitulo });
      }
    }
  }

  return resultados.sort((a, b) => Number(b.enTitulo) - Number(a.enTitulo));
}

export function totalAvisos(modulo, avisos) {
  return modulo.destinos.reduce(
    (suma, destino) => suma + (avisos[destino.to]?.cantidad || 0),
    0,
  );
}

export function tonoModulo(modulo, avisos) {
  return modulo.destinos.some((destino) => avisos[destino.to]?.tono === "rojo")
    ? "rojo"
    : "ambar";
}
