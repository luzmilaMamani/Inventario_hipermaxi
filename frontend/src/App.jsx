import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import ProtectedRoute from "./components/ProtectedRoute";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import ListaProductos from "./pages/productos/ListaProductos";
import ListaAlmacenes from "./pages/almacenes/ListaAlmacenes";
import ListaUbicaciones from "./pages/ubicaciones/ListaUbicaciones";
import Clasificacion from "./pages/clasificacion/Clasificacion";
import BuscarCodigoBarras from "./pages/barcode/BuscarCodigoBarras";
import ConsultaStock from "./pages/stock/ConsultaStock";

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
          <Route path="/productos" element={<ProtectedRoute><ListaProductos /></ProtectedRoute>} />
          <Route path="/almacenes" element={<ProtectedRoute><ListaAlmacenes /></ProtectedRoute>} />
          <Route path="/ubicaciones" element={<ProtectedRoute><ListaUbicaciones /></ProtectedRoute>} />
          <Route path="/stock" element={<ProtectedRoute><ConsultaStock /></ProtectedRoute>} />
          <Route path="/clasificacion" element={<ProtectedRoute><Clasificacion /></ProtectedRoute>} />
          <Route path="/barcode" element={<ProtectedRoute><BuscarCodigoBarras /></ProtectedRoute>} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}