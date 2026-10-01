import api from "./axios";

export const consultarStock = (params) =>
  api.get("/stock/consulta", { params }).then((r) => r.data);