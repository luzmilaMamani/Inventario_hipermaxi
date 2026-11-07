const PDFDocument = require("pdfkit");
const bwipjs = require("bwip-js");

// RF59: etiquetas de 63.5 x 33.9 mm en hoja A4 (3 columnas x 8 filas = 24 por hoja).
const MM = 72 / 25.4;
const PAGINA = { ancho: 210 * MM, alto: 297 * MM };
const ETIQUETA = { ancho: 63.5 * MM, alto: 33.9 * MM };
const COLUMNAS = 3;
const FILAS = 8;
const MARGEN_X = (PAGINA.ancho - COLUMNAS * ETIQUETA.ancho) / 2;
const MARGEN_Y = (PAGINA.alto - FILAS * ETIQUETA.alto) / 2;
const RELLENO = 2.5 * MM;

function digitoControlGtin(digitos) {
  // Suma ponderada 3/1 desde la derecha (EAN-8, UPC-A, EAN-13).
  const suma = [...digitos]
    .reverse()
    .reduce((total, d, i) => total + Number(d) * (i % 2 === 0 ? 3 : 1), 0);
  return (10 - (suma % 10)) % 10;
}

function esGtinValido(codigo) {
  if (!/^\d+$/.test(codigo)) return false;
  return digitoControlGtin(codigo.slice(0, -1)) === Number(codigo.slice(-1));
}

// Elige la simbología: EAN/UPC si el código es un GTIN válido; si no, Code 128,
// que lee cualquier lector y admite letras y números.
function simbologia(codigo) {
  if (codigo.length === 13 && esGtinValido(codigo)) return "ean13";
  if (codigo.length === 12 && esGtinValido(codigo)) return "upca";
  if (codigo.length === 8 && esGtinValido(codigo)) return "ean8";
  return "code128";
}

const cacheCodigos = new Map();

async function imagenCodigo(codigo) {
  if (cacheCodigos.has(codigo)) return cacheCodigos.get(codigo);
  const bcid = simbologia(codigo);
  const opciones = {
    bcid,
    text: codigo,
    scale: 4,
    height: 12,
    includetext: true,
    // Zona de silencio a ambos lados para que el lector detecte el código.
    paddingwidth: 10,
    paddingheight: 1,
  };
  // En EAN/UPC el texto se agrupa con las barras guía; centrarlo lo solaparía.
  if (bcid === "code128") opciones.textxalign = "center";
  const imagen = await bwipjs.toBuffer(opciones);
  cacheCodigos.set(codigo, imagen);
  if (cacheCodigos.size > 500) cacheCodigos.delete(cacheCodigos.keys().next().value);
  return imagen;
}

function formatearPrecio(precio) {
  return `Bs ${Number(precio || 0).toLocaleString("es-BO", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/**
 * Genera el PDF de etiquetas.
 * @param {Array<{codigo: string, nombre: string, precio: number, cantidad: number}>} productos
 * @param {{ posicionInicial?: number }} opciones posición (0-23) de la primera etiqueta,
 *   para aprovechar hojas ya usadas.
 * @returns {Promise<Buffer>}
 */
async function generarPdfEtiquetas(productos, { posicionInicial = 0 } = {}) {
  const imagenes = new Map();
  for (const producto of productos) {
    if (!imagenes.has(producto.codigo)) {
      imagenes.set(producto.codigo, await imagenCodigo(producto.codigo));
    }
  }

  const doc = new PDFDocument({ size: "A4", margin: 0, autoFirstPage: true });
  doc.info.Title = "Etiquetas de productos";
  const partes = [];
  doc.on("data", (parte) => partes.push(parte));
  const terminado = new Promise((resolve, reject) => {
    doc.on("end", () => resolve(Buffer.concat(partes)));
    doc.on("error", reject);
  });

  const porHoja = COLUMNAS * FILAS;
  let posicion = posicionInicial % porHoja;

  for (const producto of productos) {
    for (let i = 0; i < producto.cantidad; i += 1) {
      if (posicion === porHoja) {
        doc.addPage({ size: "A4", margin: 0 });
        posicion = 0;
      }
      const x = MARGEN_X + (posicion % COLUMNAS) * ETIQUETA.ancho;
      const y = MARGEN_Y + Math.floor(posicion / COLUMNAS) * ETIQUETA.alto;
      const anchoUtil = ETIQUETA.ancho - RELLENO * 2;

      // Guía de corte tenue.
      doc
        .save()
        .lineWidth(0.3)
        .strokeColor("#d1d5db")
        .rect(x, y, ETIQUETA.ancho, ETIQUETA.alto)
        .stroke()
        .restore();

      // Fila superior: nombre (izquierda, hasta 2 líneas) y precio (derecha).
      const anchoPrecio = anchoUtil * 0.34;
      doc
        .fillColor("#111827")
        .font("Helvetica-Bold")
        .fontSize(7.5)
        .text(producto.nombre, x + RELLENO, y + RELLENO, {
          width: anchoUtil - anchoPrecio - 2,
          height: 18,
          ellipsis: true,
          lineGap: 0,
        });
      doc
        .font("Helvetica-Bold")
        .fontSize(11)
        .text(formatearPrecio(producto.precio), x + RELLENO + anchoUtil - anchoPrecio, y + RELLENO, {
          width: anchoPrecio,
          align: "right",
          lineBreak: false,
        });

      // Código de barras a todo el ancho de la etiqueta.
      const yCodigo = y + RELLENO + 19;
      doc.image(imagenes.get(producto.codigo), x + RELLENO, yCodigo, {
        fit: [anchoUtil, y + ETIQUETA.alto - RELLENO - yCodigo],
        align: "center",
        valign: "center",
      });

      posicion += 1;
    }
  }

  doc.end();
  return terminado;
}

module.exports = { generarPdfEtiquetas, simbologia, esGtinValido };
