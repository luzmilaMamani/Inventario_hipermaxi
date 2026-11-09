-- RF57: el jefe de sucursal solicita transferencias y cancela las que aún no se enviaron.
INSERT INTO roles (nombre, descripcion)
VALUES ('JEFE_SUCURSAL', 'Solicita y cancela transferencias de su sucursal')
ON CONFLICT (nombre) DO NOTHING;
