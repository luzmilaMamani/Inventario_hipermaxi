const nodemailer = require("nodemailer");
const env = require("../config/env");

// Envío de correos por SMTP. La cuenta se configura en backend/.env
// (SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_PASSWORD, SMTP_FROM).

let transporte = null;

const correoConfigurado = () => Boolean(env.smtp.host && env.smtp.from);

function obtenerTransporte() {
  if (!correoConfigurado()) {
    throw new Error("El envío de correos no está configurado: falta SMTP_HOST o SMTP_FROM en el .env");
  }
  if (!transporte) {
    transporte = nodemailer.createTransport({
      host: env.smtp.host,
      port: env.smtp.port,
      secure: env.smtp.secure,
      auth: env.smtp.user ? { user: env.smtp.user, pass: env.smtp.password } : undefined,
    });
  }
  return transporte;
}

async function enviarCorreo({ para, asunto, texto, html, adjuntos = [] }) {
  const info = await obtenerTransporte().sendMail({
    from: env.smtp.from,
    to: para.join(", "),
    subject: asunto,
    text: texto,
    html,
    attachments: adjuntos,
  });
  return info.messageId;
}

module.exports = { enviarCorreo, correoConfigurado };
