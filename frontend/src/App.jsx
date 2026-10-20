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
import ListaSalidas from "./pages/salidas/ListaSalidas";
import ReportePerdidas from "./pages/reportes/ReportePerdidas";
import ReporteDanos from "./pages/reportes/ReporteDanos";
import ReporteVencimientos from "./pages/reportes/ReporteVencimientos";
import ListaInventarios from "./pages/inventarios/ListaInventarios";
import ConteoInventario from "./pages/inventarios/ConteoInventario";
import DiferenciasInventario from "./pages/inventarios/DiferenciasInventario"; // <-- NUEVO

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
          <Route path="/salidas" element={<ProtectedRoute><ListaSalidas /></ProtectedRoute>} />
          <Route path="/reportes/perdidas" element={<ProtectedRoute><ReportePerdidas /></ProtectedRoute>} />
          <Route path="/reportes/danos" element={<ProtectedRoute><ReporteDanos /></ProtectedRoute>} />
          <Route path="/reportes/vencimientos" element={<ProtectedRoute><ReporteVencimientos /></ProtectedRoute>} />
          <Route path="/inventarios" element={<ProtectedRoute><ListaInventarios /></ProtectedRoute>} />
          <Route path="/inventarios/:id" element={<ProtectedRoute><ConteoInventario /></ProtectedRoute>} />
          <Route path="/inventarios/:id/diferencias" element={<ProtectedRoute><DiferenciasInventario /></ProtectedRoute>} /> {/* <-- NUEVO */}
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}