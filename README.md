# PharmaDerm Backend (Render-ready)

Backend minimo para modo `VITE_DATA_MODE=backend` del frontend.

## Endpoints implementados

- `POST /api/auth/register`
- `POST /api/auth/login`
- `GET /api/auth/me`
- `GET /api/auth/verify-email?token=...`
- `POST /api/auth/forgot-password`
- `POST /api/auth/reset-password`
- `GET /api/cart`
- `PUT /api/cart`
- `DELETE /api/cart`
- `GET /api/health`

## Ejecutar local

1. Copia variables:
   - `cp .env.example .env` (o manual en Windows)
2. Instala dependencias:
   - `npm install`
3. Inicia:
   - `npm run dev`

Servidor local: `http://localhost:3000`

## Variables importantes

- `PORT`
- `JWT_SECRET`
- `FRONTEND_URL`
- `API_PUBLIC_URL` (public backend URL used in verification links)`r`n- `DATABASE_URL` (PostgreSQL connection string; enables DB-backed users/cart)
- `BREVO_API_KEY` (recomendado para envio de correo en Render)
- SMTP opcional (`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`)

Si SMTP no esta configurado, el link de recuperacion se imprime en logs.

## Deploy en Render

1. Crea un **Web Service** desde este repo.
2. En **Root Directory**, deja vacio (raiz del repo).
3. Build Command: `npm install`
4. Start Command: `npm start`
5. Configura variables:
   - `NODE_ENV=production`
   - `JWT_SECRET=...`
   - `FRONTEND_URL=https://tu-frontend.vercel.app`
   - `API_PUBLIC_URL=https://tu-backend.onrender.com`
   - SMTP (opcional)

## Conectar frontend (Vercel)

En Vercel, agrega:

- `VITE_DATA_MODE=backend`
- `VITE_API_BASE_URL=https://TU-SERVICIO-RENDER.onrender.com/api`


