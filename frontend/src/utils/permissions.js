export const ROLES_LECTURA = ["SUPERVISOR", "GERENTE", "AUDITOR"];
export const ROLES_OPERACION = [
  "ADMINISTRADOR",
  "ENCARGADO_ALMACEN",
  "EMPLEADO",
];
export const ROLES_GESTION = ["ADMINISTRADOR", "ENCARGADO_ALMACEN"];
export const ROLES_ADMINISTRACION = ["ADMINISTRADOR"];
export const ROLES_LECTURA_Y_OPERACION = [
  "ADMINISTRADOR",
  "ENCARGADO_ALMACEN",
  "EMPLEADO",
  "SUPERVISOR",
  "GERENTE",
  "AUDITOR",
];
export const ROLES_SIN_EMPLEADO = [
  "ADMINISTRADOR",
  "ENCARGADO_ALMACEN",
  "SUPERVISOR",
  "GERENTE",
  "AUDITOR",
];

// RF53: solo el supervisor aprueba o rechaza ajustes que superan el límite.
export const ROLES_APROBACION_AJUSTES = ["SUPERVISOR"];

export function tieneRol(rol, roles) {
  return roles.includes(rol);
}
