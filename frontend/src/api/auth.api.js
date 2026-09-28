import api from "./axios";

export const login = (nombre_usuario, password) =>
  api.post("/auth/login", { nombre_usuario, password }).then((r) => r.data);

export const me = () => api.get("/auth/me").then((r) => r.data);