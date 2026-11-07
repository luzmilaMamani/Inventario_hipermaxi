import api from "./axios";
import { esVistaPrevia, usuariosPreview } from "./preview";

export const listarUsuarios = (params) => {
  if (esVistaPrevia) return Promise.resolve(usuariosPreview);
  return api.get("/usuarios", { params }).then((r) => r.data);
};
