# InventiX API · Backend NestJS

Backend modular en **NestJS 12**, **Prisma ORM 6.19**, **MySQL 8.0** y **Gemini AI** (`@google/genai`) para la plataforma SaaS B2B de control de inventario inteligente, trazabilidad FEFO por lotes y asistente predictivo de reposición con arquitectura Human-in-the-Loop.

---

## 🚀 Estado de Servicios y URLs

* **API Base:** `http://localhost:3000/api/v1`
* **Documentación Swagger / OpenAPI:** `http://localhost:3000/docs`
* **Base de Datos:** MySQL 8.0 en puerto `4000` (Base de datos: `inventixs`)
* **Frontend Conectado:** `http://localhost:5173` (`frontend_inventix_itd`)

---

## 🔑 Credenciales de Acceso Rápido (Demo)

El sistema cuenta con un seeder inicial preconfigurado con una empresa retail real:

* **Correo:** `admin@inventix.com`
* **Contraseña:** `Secret123!`
* **Empresa / Negocio:** `Minimarket La Esquina` (RUC `20609876543`)
* **Rol:** `PROPIETARIO` (Control total y administración)

### Usuarios de Colaboración:
* **Cajero:** `cajero@inventix.com` / `Secret123!` (Rol: `CAJERO`)
* **Almacenero:** `almacen@inventix.com` / `Secret123!` (Rol: `OPERADOR_ALMACEN`)

---

## ⚙️ Variables de Entorno (`.env`)

```env
PORT=3000
DATABASE_URL="mysql://root:12345678@localhost:4000/inventixs"
JWT_SECRET="inventics_super_secret_jwt_key_2026_dev_mode"
JWT_EXPIRES_IN="7d"
GEMINI_API_KEY="" # Opcional: si no se define, activa fallback determinístico ROP + ABC
```

---

## 📦 Comandos Principales

```bash
# Instalar dependencias
npm install

# Iniciar en modo desarrollo (recarga en caliente)
npm run start:dev

# Compilar para producción
npm run build

# Ejecutar linter con Oxlint (0 errores en 70 archivos)
npm run lint

# Ejecutar pruebas unitarias
npm test

# Ejecutar pruebas End-to-End (E2E)
npm run test:e2e
```

---

## 🏛️ Arquitectura Modular

```
src/
├── core/                       # Núcleo transversal
│   ├── database/               # PrismaService y PrismaModule
│   ├── decorators/             # @CurrentUser, @CurrentTenant, @Public, @TenantAuth
│   ├── filters/                # HttpExceptionFilter global unificado
│   ├── guards/                 # JwtAuthGuard, TenantGuard, PermissionsGuard
│   └── types/                  # Tipos de sesión, contexto multi-tenant y RBAC
└── modules/
    ├── auth/                   # Registro, login JWT y perfil /auth/me
    ├── organization/           # Negocios, sucursales y almacenes (Principal, Pulmón, Mermas)
    ├── iam/                    # Control de accesos RBAC (5 roles jerárquicos, 27 permisos)
    ├── catalog/                # Categorías, unidades, productos (SKU), lotes FEFO y ubicaciones
    ├── suppliers/              # Proveedores y matriz producto-proveedor
    ├── inventory/              # Existencias LPN, Kardex (Borrador -> Aprobado -> Completado)
    ├── sales/                  # Ventas POS, métodos de pago y descuento atómico FEFO
    ├── snapshots/              # Cierre diario de inventario a las 23:59 y trigger manual
    ├── ai-assistant/           # Asistente Gemini 3.8 Flash + ROP + Human-in-the-Loop
    └── reports/                # Dashboard ejecutivo, Kardex por producto, ventas y mermas
```

---

## 📡 Módulos y Endpoints Clave

Todas las rutas bajo `/api/v1/`:

### 1. Autenticación (`/auth`)
* `POST /auth/register` - Registro de usuario global.
* `POST /auth/login` - Inicio de sesión (retorna `accessToken`, perfil y lista de negocios).
* `GET /auth/me` - Perfil del usuario activo.

### 2. Multi-Tenant y Organización (`/negocios`, `/sucursales`, `/almacenes`)
* `POST /negocios` - Crea nuevo negocio, asigna rol PROPIETARIO, y auto-genera sucursal y almacén principal.
* `GET /negocios` - Lista de empresas del usuario autenticado.
* `GET /negocios/actual` - Configuración de la empresa activa (requiere `x-negocio-id`).
* `GET /almacenes` - Lista almacenes de la empresa.
* `POST /almacenes` - Crea nuevo almacén (Tipos: `PRINCIPAL`, `PULMON`, `MERMAS_CUARENTENA`).

### 3. Catálogo y Lotes FEFO (`/categorias`, `/unidades-medida`, `/productos`, `/lotes`)
* `GET /productos` - Listado con SKU, precio, costo y stock disponible.
* `POST /productos` - Registro de producto con validación de SKU único.
* `PATCH /productos/:id` - Actualización de precio, stock mínimo y catálogo.
* `GET /lotes` - Trazabilidad por número de lote, fecha de vencimiento y almacén.

### 4. Inventario y Kardex (`/stock`, `/movimientos`)
* `GET /stock` - Existencias consolidadas por producto, almacén y código LPN.
* `GET /movimientos` - Historial completo de operaciones.
* `POST /movimientos` - Crea movimiento en estado `BORRADOR`.
* `POST /movimientos/:id/aprobar` - Transición a `APROBADO`.
* `POST /movimientos/:id/completar` - Ejecuta la afectación atómica al inventario y costo promedio ponderado.

### 5. Punto de Venta y Facturación (`/ventas`, `/metodos-pago`)
* `GET /metodos-pago` - Efectivo, Tarjeta, Transferencia, Yape/Plin.
* `GET /ventas` - Historial de ventas emitidas.
* `POST /ventas` - Emite comprobante y descuenta automáticamente existencias vía **FEFO**.

### 6. Inteligencia Artificial y Reposición (`/ia`)
* `POST /ia/analizar` - Ejecuta análisis ROP + ABC y genera recomendaciones explicadas con Gemini.
* `GET /ia/recomendaciones` - Listado de órdenes sugeridas y su prioridad.
* `POST /ia/recomendaciones/:id/decidir` - Aprobación `Human-in-the-Loop` que genera automáticamente un borrador de compra en Movimientos.

### 7. Reportes y Snapshots (`/reportes`, `/cierres`)
* `GET /reportes/dashboard` - Métricas consolidadas (Valor total, unidades, stock bajo, lotes por vencer).
* `GET /reportes/kardex/:productoId` - Kardex físico-valorizado por producto.
* `POST /cierres/ejecutar` - Snapshot formal de cierre de inventario.
