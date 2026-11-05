import { useAuth } from "../../context/AuthContext";
import { tieneRol } from "../../utils/permissions";

export default function RoleGate({ roles, children }) {
  const { user } = useAuth();
  return tieneRol(user?.rol, roles) ? children : null;
}
