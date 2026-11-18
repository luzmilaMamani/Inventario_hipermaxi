// Exportación de reportes sin dependencias externas.
//
// Columnas: [{ key, label, tipo }] donde tipo es "texto" (por defecto), "numero",
// "moneda", "porcentaje" o "fecha". Si la columna trae `valor(fila)`, se usa en
// lugar de fila[key].

const valorDe = (columna, fila) =>
  typeof columna.valor === "function" ? columna.valor(fila) : fila[columna.key];

export function formatearValor(valor, tipo = "texto") {
  if (valor === null || valor === undefined || valor === "") return "";
  switch (tipo) {
    case "numero":
      return Number(valor).toLocaleString("es-BO", { maximumFractionDigits: 2 });
    case "moneda":
      return `Bs ${Number(valor).toLocaleString("es-BO", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })}`;
    case "porcentaje":
      return `${Number(valor).toLocaleString("es-BO", { maximumFractionDigits: 1 })}%`;
    case "fecha": {
      const fecha = new Date(valor);
      return Number.isNaN(fecha.getTime()) ? String(valor) : fecha.toLocaleDateString("es-BO");
    }
    default:
      return String(valor);
  }
}

const marcaArchivo = () => new Date().toISOString().slice(0, 10);

function descargar(contenido, nombre, tipo) {
  const url = URL.createObjectURL(new Blob([contenido], { type: tipo }));
  const enlace = document.createElement("a");
  enlace.href = url;
  enlace.download = nombre;
  document.body.appendChild(enlace);
  enlace.click();
  enlace.remove();
  URL.revokeObjectURL(url);
}

// CSV con separador ";" y coma decimal, que Excel en español abre en columnas.
export function exportarExcel(nombreArchivo, columnas, filas) {
  const celda = (texto) => {
    const limpio = String(texto ?? "");
    return /[";\n\r]/.test(limpio) ? `"${limpio.replaceAll('"', '""')}"` : limpio;
  };
  const numeroCsv = (valor) =>
    valor === null || valor === undefined || valor === ""
      ? ""
      : String(Number(valor)).replace(".", ",");

  const lineas = [
    columnas.map((c) => celda(c.label)).join(";"),
    ...filas.map((fila) =>
      columnas
        .map((c) => {
          const valor = valorDe(c, fila);
          if (["numero", "moneda", "porcentaje"].includes(c.tipo)) return numeroCsv(valor);
          return celda(formatearValor(valor, c.tipo));
        })
        .join(";"),
    ),
  ];

  descargar(`﻿${lineas.join("\r\n")}`, `${nombreArchivo}_${marcaArchivo()}.csv`, "text/csv;charset=utf-8");
}

const escaparHtml = (texto) =>
  String(texto ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

// Abre una vista de impresión: el navegador permite guardarla como PDF.
export function exportarPdf({ titulo, subtitulo = "", columnas, filas, resumen = [] }) {
  const ventana = window.open("", "_blank");
  if (!ventana) {
    window.alert("Permite las ventanas emergentes para exportar a PDF.");
    return;
  }

  const alineacion = (c) =>
    ["numero", "moneda", "porcentaje"].includes(c.tipo) ? ' style="text-align:right"' : "";

  const tarjetas = resumen
    .map(
      (r) =>
        `<div class="dato"><span>${escaparHtml(r.label)}</span><strong>${escaparHtml(
          formatearValor(r.valor, r.tipo),
        )}</strong></div>`,
    )
    .join("");

  const cuerpo = filas
    .map(
      (fila) =>
        `<tr>${columnas
          .map((c) => `<td${alineacion(c)}>${escaparHtml(formatearValor(valorDe(c, fila), c.tipo))}</td>`)
          .join("")}</tr>`,
    )
    .join("");

  ventana.document.write(`<!doctype html>
<html lang="es"><head><meta charset="utf-8"><title>${escaparHtml(titulo)}</title>
<style>
  body { font-family: Arial, sans-serif; color: #1f2937; margin: 24px; font-size: 11px; }
  h1 { font-size: 18px; margin: 0 0 4px; }
  .sub { color: #6b7280; margin: 0 0 12px; }
  .resumen { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 12px; }
  .dato { border: 1px solid #dbeafe; border-radius: 6px; padding: 6px 10px; }
  .dato span { display: block; color: #6b7280; font-size: 10px; }
  .dato strong { font-size: 13px; }
  table { width: 100%; border-collapse: collapse; }
  th, td { border-bottom: 1px solid #e5e7eb; padding: 4px 6px; text-align: left; }
  th { background: #eff6ff; }
  @media print { body { margin: 0; } }
</style></head><body>
<h1>${escaparHtml(titulo)}</h1>
<p class="sub">${escaparHtml(subtitulo)} · Generado el ${escaparHtml(new Date().toLocaleString("es-BO"))}</p>
<div class="resumen">${tarjetas}</div>
<table><thead><tr>${columnas
    .map((c) => `<th${alineacion(c)}>${escaparHtml(c.label)}</th>`)
    .join("")}</tr></thead>
<tbody>${cuerpo || `<tr><td colspan="${columnas.length}">Sin registros</td></tr>`}</tbody></table>
</body></html>`);
  ventana.document.close();
  ventana.focus();
  // Según el navegador, onload puede no dispararse tras document.write: se
  // imprime con lo que llegue primero, una sola vez.
  let impreso = false;
  const imprimir = () => {
    if (impreso) return;
    impreso = true;
    ventana.print();
  };
  ventana.onload = imprimir;
  setTimeout(imprimir, 400);
}
