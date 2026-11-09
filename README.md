# Inventario_hipermaxi

## Despliegue con Docker

El sistema se despliega en dos contenedores: `hipermaxi-frontend` (nginx con la
aplicación React) y `hipermaxi-backend` (API REST con Node.js). PostgreSQL corre
en la máquina anfitriona.

Requisitos: Docker Desktop, PostgreSQL con la base configurada, `backend/.env`
completo y el JSON de la cuenta de servicio de Google en
`../credenciales_gcp/credenciales.json` (o la ruta indicada en la variable
`GCP_CREDENTIALS_FILE`).

```bash
docker compose up -d --build
docker compose ps
```

- Aplicación: http://localhost:8088
- API: http://localhost:3000/health

Para detenerlo: `docker compose down`.
