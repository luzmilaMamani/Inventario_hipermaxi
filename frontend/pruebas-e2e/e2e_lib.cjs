// HT06 (HIP-251): arnés E2E mínimo sobre Chrome DevTools Protocol, sin
// dependencias. Ver README.md de esta carpeta.
const fs = require("node:fs");
const path = require("node:path");
const { execSync } = require("node:child_process");

const ORIGEN = process.env.E2E_FRONTEND || "http://localhost:5199";
const API = process.env.E2E_API || "http://localhost:3100/api";
const CHROME = process.env.E2E_CHROME || "http://localhost:9333";
const BACK = path.resolve(__dirname, "../../backend");
const IDS = { ADMINISTRADOR: 1, ENCARGADO_ALMACEN: 2, SUPERVISOR: 3, EMPLEADO: 4, GERENTE: 5, AUDITOR: 6 };
const tokens = {};

function token(rol) {
  if (!tokens[rol]) {
    tokens[rol] = execSync(
      `node -e "require('dotenv').config();console.log(require('jsonwebtoken').sign({id_usuario:${IDS[rol]},nombre_usuario:'${rol.toLowerCase()}',rol:'${rol}'},process.env.JWT_SECRET,{expiresIn:'2h'}))"`,
      { cwd: BACK },
    ).toString().trim();
  }
  return tokens[rol];
}

async function api(rol, metodo, ruta, cuerpo) {
  const r = await fetch(`${API}${ruta}`, {
    method: metodo,
    headers: { Authorization: `Bearer ${token(rol)}`, "Content-Type": "application/json" },
    body: cuerpo ? JSON.stringify(cuerpo) : undefined,
  });
  return { status: r.status, body: await r.json().catch(() => null) };
}

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

// Código que se inyecta en la página: utilidades para encontrar y operar controles.
const UTILIDADES = `
window.__e2e = {
  norm: (t) => (t || "").replace(/\\s+/g, " ").trim(),
  visible: (el) => !!el && el.offsetParent !== null,
  campo(etiqueta) {
    const labels = [...document.querySelectorAll("label")].filter((l) => this.visible(l) && this.norm(l.textContent).startsWith(etiqueta));
    const label = labels[labels.length - 1];
    if (!label) throw new Error("No hay campo con etiqueta: " + etiqueta);
    if (label.htmlFor) return document.getElementById(label.htmlFor);
    return label.parentElement.querySelector("input, select, textarea") || label.querySelector("input, select, textarea");
  },
  poner(el, valor) {
    const proto = el.tagName === "SELECT" ? HTMLSelectElement.prototype : el.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, "value").set.call(el, valor);
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  },
  escribir(etiqueta, valor) { this.poner(this.campo(etiqueta), String(valor)); return true; },
  elegir(etiqueta, texto) {
    const sel = this.campo(etiqueta);
    const op = [...sel.options].find((o) => this.norm(o.textContent).includes(texto));
    if (!op) throw new Error("Opción '" + texto + "' no está en " + etiqueta + ": " + [...sel.options].map((o) => o.textContent).join(" | "));
    this.poner(sel, op.value);
    return op.textContent;
  },
  clic(texto, exacto) {
    const candidatos = [...document.querySelectorAll("button, a")].filter((b) => this.visible(b) && !b.disabled &&
      (exacto ? this.norm(b.textContent) === texto : this.norm(b.textContent).includes(texto)));
    const b = candidatos[candidatos.length - 1];
    if (!b) throw new Error("No hay botón: " + texto);
    b.click();
    return this.norm(b.textContent);
  },
  clicEnFila(textoFila, textoBoton) {
    const fila = [...document.querySelectorAll("tr")].find((tr) => this.norm(tr.textContent).includes(textoFila));
    if (!fila) throw new Error("No hay fila con: " + textoFila);
    const b = [...fila.querySelectorAll("button, a")].find((x) => this.norm(x.textContent).includes(textoBoton));
    if (!b) throw new Error("La fila no tiene botón: " + textoBoton);
    b.click();
    return true;
  },
  texto() { return this.norm(document.body.innerText); },
};
true;`;

async function abrirSesion(rol, { ancho = 1440 } = {}) {
  const objetivo = await (await fetch(`${CHROME}/json/new?about:blank`, { method: "PUT" })).json();
  const ws = new WebSocket(objetivo.webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener("open", r));
  let id = 0;
  const pendientes = new Map();
  const errores = [];
  const dialogos = [];
  ws.addEventListener("message", (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pendientes.has(m.id)) {
      pendientes.get(m.id)(m);
      pendientes.delete(m.id);
    } else if (m.method === "Runtime.exceptionThrown") {
      errores.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
    } else if (m.method === "Runtime.consoleAPICalled" && m.params.type === "error") {
      errores.push(m.params.args.map((a) => a.value ?? a.description).join(" "));
    } else if (m.method === "Page.javascriptDialogOpening") {
      dialogos.push(m.params.message);
      cmd("Page.handleJavaScriptDialog", { accept: true });
    }
  });
  const cmd = (method, params = {}) =>
    new Promise((r) => {
      id += 1;
      pendientes.set(id, r);
      ws.send(JSON.stringify({ id, method, params }));
    });
  await cmd("Runtime.enable");
  await cmd("Page.enable");
  await cmd("Emulation.setDeviceMetricsOverride", { width: ancho, height: 900, deviceScaleFactor: 1, mobile: ancho < 700 });
  const user = { id_usuario: IDS[rol], nombre_usuario: rol.toLowerCase(), nombre_completo: `Usuario ${rol}`, rol };
  await cmd("Page.addScriptToEvaluateOnNewDocument", {
    source: `try{localStorage.setItem("token", ${JSON.stringify(token(rol))}); localStorage.setItem("user", ${JSON.stringify(JSON.stringify(user))});}catch(e){}`,
  });

  const evaluar = async (expr) => {
    const r = await cmd("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true });
    if (r.result?.exceptionDetails) {
      throw new Error(r.result.exceptionDetails.exception?.description?.split("\n")[0] || r.result.exceptionDetails.text);
    }
    return r.result?.result?.value;
  };
  const llamar = async (metodo, ...args) => {
    await evaluar(UTILIDADES);
    return evaluar(`window.__e2e.${metodo}(${args.map((a) => JSON.stringify(a)).join(",")})`);
  };

  const s = {
    errores,
    dialogos,
    async ir(ruta, espera = 1800) {
      await cmd("Page.navigate", { url: `${ORIGEN}${ruta}` });
      await dormir(espera);
    },
    escribir: (etiqueta, valor) => llamar("escribir", etiqueta, valor),
    elegir: (etiqueta, texto) => llamar("elegir", etiqueta, texto),
    async clic(texto, { exacto = false, espera = 900 } = {}) {
      const r = await llamar("clic", texto, exacto);
      await dormir(espera);
      return r;
    },
    async clicEnFila(fila, boton, espera = 900) {
      await llamar("clicEnFila", fila, boton);
      await dormir(espera);
    },
    texto: () => llamar("texto"),
    evaluar,
    async esperarTexto(fragmento, ms = 6000) {
      const fin = Date.now() + ms;
      while (Date.now() < fin) {
        const t = await llamar("texto");
        if (t.includes(fragmento)) return true;
        await dormir(250);
      }
      throw new Error(`No apareció el texto: "${fragmento}"`);
    },
    url: () => evaluar("location.pathname + location.search"),
    async captura(archivo) {
      const { result } = await cmd("Page.getLayoutMetrics");
      const alto = Math.min(Math.ceil(result.cssContentSize.height), 2400);
      await cmd("Emulation.setDeviceMetricsOverride", { width: ancho, height: alto, deviceScaleFactor: 1, mobile: ancho < 700 });
      const shot = await cmd("Page.captureScreenshot", { format: "png" });
      fs.writeFileSync(archivo, Buffer.from(shot.result.data, "base64"));
      await cmd("Emulation.setDeviceMetricsOverride", { width: ancho, height: 900, deviceScaleFactor: 1, mobile: ancho < 700 });
    },
    async cerrar() {
      await fetch(`${CHROME}/json/close/${objetivo.id}`).catch(() => {});
      ws.close();
    },
  };
  return s;
}

module.exports = { abrirSesion, api, dormir, ORIGEN };
