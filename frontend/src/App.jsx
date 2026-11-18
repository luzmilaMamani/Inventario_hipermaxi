import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import ProtectedRoute from "./components/ProtectedRoute";

// Auth & Dashboard
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";

// Módulos Base
import ListaProductos from "./pages/productos/ListaProductos";
import ListaAlmacenes from "./pages/almacenes/ListaAlmacenes";
import ListaUbicaciones from "./pages/ubicaciones/ListaUbicaciones";
import Clasificacion from "./pages/clasificacion/Clasificacion";
import BuscarCodigoBarras from "./pages/barcode/BuscarCodigoBarras";
import ImprimirEtiquetas from "./pages/barcode/ImprimirEtiquetas";

// Stock y Salidas
import ConsultaStock from "./pages/stock/ConsultaStock";
import HistorialStock from "./pages/stock/HistorialStock";
import ProximosVencimientos from "./pages/stock/ProximosVencimientos";
import LotesVencidos from "./pages/stock/LotesVencidos";
import LotesCuarentena from "./pages/stock/LotesCuarentena";
import ParametrosVencimiento from "./pages/stock/ParametrosVencimiento";
import ListaRecepciones from "./pages/stock/ListaRecepciones";
import RegistrarRecepcion from "./pages/stock/RegistrarRecepcion";
import DetalleRecepcion from "./pages/stock/DetalleRecepcion";
import ListaDevoluciones from "./pages/devoluciones/ListaDevoluciones";
import RegistrarDevolucion from "./pages/devoluciones/RegistrarDevolucion";
import ListaDevolucionesProveedor from "./pages/devolucionesProveedor/ListaDevolucionesProveedor";
import RegistrarDevolucionProveedor from "./pages/devolucionesProveedor/RegistrarDevolucionProveedor";
import ListaSolicitudesMateriales from "./pages/solicitudesMateriales/ListaSolicitudesMateriales";
import ListaSalidas from "./pages/salidas/ListaSalidas";

// Reportes
import ReportePerdidas from "./pages/reportes/ReportePerdidas";
import ReporteDanos from "./pages/reportes/ReporteDanos";
import ReporteVencimientos from "./pages/reportes/ReporteVencimientos";
import ReporteExistencias from "./pages/reportes/ReporteExistencias";
import ReporteVencimientosLotes from "./pages/reportes/ReporteVencimientosLotes";
import ReporteTransferencias from "./pages/reportes/ReporteTransferencias";
import ComparativoSucursales from "./pages/reportes/ComparativoSucursales";
import DashboardIndicadores from "./pages/reportes/DashboardIndicadores";
import ProgramacionReportes from "./pages/reportes/ProgramacionReportes";

// Inventarios Físicos
import ListaInventarios from "./pages/inventarios/ListaInventarios";
import ConteoInventario from "./pages/inventarios/ConteoInventario";
import DiferenciasInventario from "./pages/inventarios/DiferenciasInventario";

// Transferencias (RF29)
import ListaTransferencias from "./pages/transferencias/ListaTransferencias";
import DiferenciasTransferencias from "./pages/transferencias/DiferenciasTransferencias";
import ListaAjustes from "./pages/ajustes/ListaAjustes";
import BandejaAprobacionAjustes from "./pages/ajustes/BandejaAprobacionAjustes";
import PanelAlertasStock from "./pages/alertas/PanelAlertasStock";
import PanelAlertasVencimiento from "./pages/alertas/PanelAlertasVencimiento";

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <Dashboard />
              </ProtectedRoute>
            }
          />

          <Route
            path="/productos"
            element={
              <ProtectedRoute>
                <ListaProductos />
              </ProtectedRoute>
            }
          />
          <Route
            path="/almacenes"
            element={
              <ProtectedRoute>
                <ListaAlmacenes />
              </ProtectedRoute>
            }
          />
          <Route
            path="/ubicaciones"
            element={
              <ProtectedRoute>
                <ListaUbicaciones />
              </ProtectedRoute>
            }
          />
          <Route
            path="/stock"
            element={
              <ProtectedRoute>
                <ConsultaStock />
              </ProtectedRoute>
            }
          />
          <Route
            path="/stock/historial/:productoId"
            element={
              <ProtectedRoute>
                <HistorialStock />
              </ProtectedRoute>
            }
          />
          <Route
            path="/stock/proximos-vencer"
            element={
              <ProtectedRoute>
                <ProximosVencimientos />
              </ProtectedRoute>
            }
          />
          {/* RF43: lotes vencidos separados del stock disponible */}
          <Route
            path="/stock/vencidos"
            element={
              <ProtectedRoute>
                <LotesVencidos />
              </ProtectedRoute>
            }
          />
          {/* RF61: lotes y cuarentena */}
          <Route
            path="/stock/lotes"
            element={
              <ProtectedRoute>
                <LotesCuarentena />
              </ProtectedRoute>
            }
          />
          <Route
            path="/stock/parametros-vencimiento"
            element={
              <ProtectedRoute>
                <ParametrosVencimiento />
              </ProtectedRoute>
            }
          />
          <Route
            path="/recepciones"
            element={
              <ProtectedRoute>
                <ListaRecepciones />
              </ProtectedRoute>
            }
          />
          <Route
            path="/recepciones/nueva"
            element={
              <ProtectedRoute>
                <RegistrarRecepcion />
              </ProtectedRoute>
            }
          />
          <Route
            path="/recepciones/:id"
            element={
              <ProtectedRoute>
                <DetalleRecepcion />
              </ProtectedRoute>
            }
          />
          <Route
            path="/clasificacion"
            element={
              <ProtectedRoute>
                <Clasificacion />
              </ProtectedRoute>
            }
          />
          <Route
            path="/barcode"
            element={
              <ProtectedRoute>
                <BuscarCodigoBarras />
              </ProtectedRoute>
            }
          />
          <Route
            path="/etiquetas"
            element={
              <ProtectedRoute>
                <ImprimirEtiquetas />
              </ProtectedRoute>
            }
          />

          <Route
            path="/salidas"
            element={
              <ProtectedRoute>
                <ListaSalidas />
              </ProtectedRoute>
            }
          />
          <Route
            path="/devoluciones"
            element={
              <ProtectedRoute>
                <ListaDevoluciones />
              </ProtectedRoute>
            }
          />
          <Route
            path="/devoluciones/nueva"
            element={
              <ProtectedRoute>
                <RegistrarDevolucion />
              </ProtectedRoute>
            }
          />
          {/* RF56: Devoluciones a proveedor */}
          <Route
            path="/devoluciones-proveedor"
            element={
              <ProtectedRoute>
                <ListaDevolucionesProveedor />
              </ProtectedRoute>
            }
          />
          <Route
            path="/devoluciones-proveedor/nueva"
            element={
              <ProtectedRoute>
                <RegistrarDevolucionProveedor />
              </ProtectedRoute>
            }
          />
          {/* HIP-259 / HIP-260: Producción y Logística */}
          <Route
            path="/solicitudes-materiales"
            element={
              <ProtectedRoute>
                <ListaSolicitudesMateriales />
              </ProtectedRoute>
            }
          />

          <Route
            path="/reportes/perdidas"
            element={
              <ProtectedRoute>
                <ReportePerdidas />
              </ProtectedRoute>
            }
          />
          <Route
            path="/reportes/danos"
            element={
              <ProtectedRoute>
                <ReporteDanos />
              </ProtectedRoute>
            }
          />
          <Route
            path="/reportes/vencimientos"
            element={
              <ProtectedRoute>
                <ReporteVencimientos />
              </ProtectedRoute>
            }
          />
          {/* RF63: lotes vencidos y próximos a vencer */}
          <Route
            path="/reportes/vencimientos-lotes"
            element={
              <ProtectedRoute>
                <ReporteVencimientosLotes />
              </ProtectedRoute>
            }
          />
          {/* RF64: transferencias entre sucursales */}
          <Route
            path="/reportes/transferencias"
            element={
              <ProtectedRoute>
                <ReporteTransferencias />
              </ProtectedRoute>
            }
          />
          {/* RF44: existencias por almacén, categoría o marca */}
          <Route
            path="/reportes/existencias"
            element={
              <ProtectedRoute>
                <ReporteExistencias />
              </ProtectedRoute>
            }
          />
          {/* RF67: comparativo de stock entre sucursales */}
          <Route
            path="/reportes/comparativo-sucursales"
            element={
              <ProtectedRoute>
                <ComparativoSucursales />
              </ProtectedRoute>
            }
          />
          {/* RF62: tablero de indicadores del inventario */}
          <Route
            path="/reportes/indicadores"
            element={
              <ProtectedRoute>
                <DashboardIndicadores />
              </ProtectedRoute>
            }
          />
          {/* RF70: envío programado de reportes por correo */}
          <Route
            path="/reportes/programacion"
            element={
              <ProtectedRoute>
                <ProgramacionReportes />
              </ProtectedRoute>
            }
          />

          <Route
            path="/inventarios"
            element={
              <ProtectedRoute>
                <ListaInventarios />
              </ProtectedRoute>
            }
          />
          <Route
            path="/inventarios/:id"
            element={
              <ProtectedRoute>
                <ConteoInventario />
              </ProtectedRoute>
            }
          />
          <Route
            path="/inventarios/:id/diferencias"
            element={
              <ProtectedRoute>
                <DiferenciasInventario />
              </ProtectedRoute>
            }
          />

          <Route
            path="/ajustes"
            element={
              <ProtectedRoute>
                <ListaAjustes />
              </ProtectedRoute>
            }
          />
          {/* RF53: aprobación de ajustes que superan el límite */}
          <Route
            path="/ajustes/aprobacion"
            element={
              <ProtectedRoute>
                <BandejaAprobacionAjustes />
              </ProtectedRoute>
            }
          />
          <Route
            path="/alertas-stock"
            element={
              <ProtectedRoute>
                <PanelAlertasStock />
              </ProtectedRoute>
            }
          />
          <Route
            path="/alertas-vencimiento"
            element={
              <ProtectedRoute>
                <PanelAlertasVencimiento />
              </ProtectedRoute>
            }
          />

          {/* RF29: Transferencias */}
          <Route
            path="/transferencias"
            element={
              <ProtectedRoute>
                <ListaTransferencias />
              </ProtectedRoute>
            }
          />
          {/* RF58: Diferencias en la recepción de transferencias */}
          <Route
            path="/transferencias/diferencias"
            element={
              <ProtectedRoute>
                <DiferenciasTransferencias />
              </ProtectedRoute>
            }
          />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
