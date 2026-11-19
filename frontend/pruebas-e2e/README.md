# Pruebas funcionales E2E (HT06)

Ejecutan en un navegador real los casos de
[`docs/pruebas/casos_prueba_funcionales.md`](../../docs/pruebas/casos_prueba_funcionales.md)
y verifican el efecto en los datos con la API. No usan dependencias: controlan
Chrome por el protocolo DevTools.

> Corre **solo contra una base de pruebas**: los casos registran recepciones,
> salidas, transferencias e inventarios.

## Preparación

1. Backend apuntando a una base de pruebas (puerto 3100) y sin Pub/Sub:

   ```bash
   cd backend
   DB_NAME=hipermaxi_pruebas PORT=3100 CORS_ORIGIN='*' PUBSUB_TOPIC= PUBSUB_SUBSCRIPTION= npm start
   ```

2. Frontend apuntando a ese backend (puerto 5199):

   ```bash
   cd frontend
   VITE_API_URL=http://localhost:3100/api npx vite --port 5199
   ```

3. Chrome sin ventana con depuración remota:

   ```bash
   chrome --headless=new --remote-debugging-port=9333 --user-data-dir=/tmp/chrome-e2e
   ```

El arnés firma los tokens de cada rol con el `JWT_SECRET` de `backend/.env`.
Las direcciones se cambian con `E2E_FRONTEND`, `E2E_API` y `E2E_CHROME`.

## Ejecución

```bash
cd frontend
node pruebas-e2e/casos.cjs            # todos los casos
node pruebas-e2e/casos.cjs TRF-05     # solo algunos
```

Imprime ✅/❌ por caso y deja `pruebas-e2e/resultados/resultados.json` con el
detalle, los errores de JavaScript y los diálogos de confirmación mostrados, y una
captura por cada caso que falla.
