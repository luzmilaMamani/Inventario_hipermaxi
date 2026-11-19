const PDFDocument = require("pdfkit");

// Convierte un reporte { titulo, subtitulo, columnas, filas, resumen } en un PDF
// A4 horizontal con tabla paginada.

const formatear = (valor, tipo) => {
  if (valor === null || valor === undefined || valor === "") return "";
  if (tipo === "moneda") return `Bs ${Number(valor).toFixed(2)}`;
  if (tipo === "numero") return Number(valor).toLocaleString("es-BO", { maximumFractionDigits: 2 });
  return String(valor);
};

function generarPdfReporte({ titulo, subtitulo = "", columnas, filas, resumen = [] }) {
  const doc = new PDFDocument({ size: "A4", layout: "landscape", margin: 36 });
  const partes = [];
  doc.on("data", (parte) => partes.push(parte));
  const terminado = new Promise((resolve, reject) => {
    doc.on("end", () => resolve(Buffer.concat(partes)));
    doc.on("error", reject);
  });

  const izquierda = doc.page.margins.left;
  const anchoUtil = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const fijos = columnas.reduce((s, c) => s + (c.ancho || 0), 0);
  const sinAncho = columnas.filter((c) => !c.ancho).length;
  const anchoLibre = sinAncho ? Math.max((anchoUtil - fijos) / sinAncho, 40) : 0;
  const anchos = columnas.map((c) => c.ancho || anchoLibre);
  const escala = Math.min(1, anchoUtil / anchos.reduce((s, a) => s + a, 0));
  const anchosFinales = anchos.map((a) => a * escala);
  const alineacion = (c) => (["numero", "moneda"].includes(c.tipo) ? "right" : "left");

  doc.font("Helvetica-Bold").fontSize(16).fillColor("#15233D").text(titulo);
  doc.font("Helvetica").fontSize(9).fillColor("#6b7280")
    .text(`${subtitulo} · Generado el ${new Date().toLocaleString("es-BO")} · Chuby Hipermaxi`);
  doc.moveDown(0.6);

  if (resumen.length) {
    doc.font("Helvetica").fontSize(10).fillColor("#1f2937")
      .text(resumen.map((r) => `${r.label}: ${formatear(r.valor, r.tipo)}`).join("     "));
    doc.moveDown(0.6);
  }

  const encabezado = () => {
    let x = izquierda;
    const y = doc.y;
    doc.rect(izquierda, y - 2, anchoUtil, 16).fill("#eff6ff");
    doc.font("Helvetica-Bold").fontSize(8).fillColor("#15233D");
    columnas.forEach((c, i) => {
      doc.text(c.label, x + 2, y + 2, { width: anchosFinales[i] - 4, align: alineacion(c), lineBreak: false });
      x += anchosFinales[i];
    });
    doc.y = y + 16;
  };

  encabezado();
  doc.font("Helvetica").fontSize(8).fillColor("#1f2937");

  if (filas.length === 0) {
    doc.moveDown(0.5).text("Sin registros para este reporte.", izquierda);
  }

  for (const fila of filas) {
    const textos = columnas.map((c) => formatear(fila[c.key], c.tipo));
    const alto = Math.max(
      ...textos.map((t, i) => doc.heightOfString(t, { width: anchosFinales[i] - 4 })),
      10,
    ) + 4;
    if (doc.y + alto > doc.page.height - doc.page.margins.bottom) {
      doc.addPage();
      encabezado();
      doc.font("Helvetica").fontSize(8).fillColor("#1f2937");
    }
    const y = doc.y;
    let x = izquierda;
    textos.forEach((t, i) => {
      doc.text(t, x + 2, y + 2, { width: anchosFinales[i] - 4, align: alineacion(columnas[i]) });
      x += anchosFinales[i];
    });
    doc.moveTo(izquierda, y + alto).lineTo(izquierda + anchoUtil, y + alto).strokeColor("#e5e7eb").stroke();
    doc.y = y + alto;
  }

  doc.end();
  return terminado;
}

module.exports = { generarPdfReporte };
