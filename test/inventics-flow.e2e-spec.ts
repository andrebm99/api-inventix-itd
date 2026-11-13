import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/core/database/prisma.service.js';
import { HttpExceptionFilter } from '../src/core/filters/http-exception.filter.js';

describe('Inventics SaaS Core Flow (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  const uniqueSuffix = Date.now().toString();
  const testEmail = `e2e.${uniqueSuffix}@inventics.test`;
  const testRuc = `20${uniqueSuffix.slice(-9)}`;

  let accessToken = '';
  let userId = '';
  let negocioId = '';
  let sucursalId = '';
  let almacenId = '';
  let proveedorId = '';
  let productoId = '';
  let codigoExistencia = '';
  let metodoPagoId = '';
  let recomendacionId = '';

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1', { exclude: ['/'] });
    app.useGlobalFilters(new HttpExceptionFilter());
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: { enableImplicitConversion: true },
      }),
    );

    await app.init();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    if (negocioId) {
      await prisma.cierre_inventario_periodo.deleteMany({ where: { negocio_id: negocioId } });
      await prisma.venta.deleteMany({ where: { negocio_id: negocioId } });
      await prisma.movimiento.deleteMany({ where: { negocio_id: negocioId } });
      await prisma.stock_almacen.deleteMany({
        where: { almacen: { sucursal: { negocio_id: negocioId } } },
      });
      await prisma.producto.deleteMany({ where: { negocio_id: negocioId } });
      await prisma.proveedor.deleteMany({ where: { negocio_id: negocioId } });
      await prisma.almacen.deleteMany({ where: { sucursal: { negocio_id: negocioId } } });
      await prisma.sucursal.deleteMany({ where: { negocio_id: negocioId } });
      await prisma.negocio.deleteMany({ where: { id: negocioId } });
    }
    if (userId) {
      await prisma.usuario.deleteMany({ where: { id: userId } });
    }
    await app.close();
  });

  it('1. Registra usuario y crea negocio con sucursal y almacén principal por defecto', async () => {
    const regRes = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        nombre: 'Test Owner',
        correo: testEmail,
        password: 'Password123!',
      })
      .expect(201);

    accessToken = regRes.body.accessToken as string;
    userId = regRes.body.usuario.id as string;
    expect(accessToken).toBeTruthy();

    const bizRes = await request(app.getHttpServer())
      .post('/api/v1/negocios')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        nombre: `Negocio E2E ${uniqueSuffix}`,
        ruc: testRuc,
      })
      .expect(201);

    negocioId = bizRes.body.id as string;
    sucursalId = bizRes.body.sucursalPrincipal.id as string;
    almacenId = bizRes.body.sucursalPrincipal.almacenes[0].id as string;
    expect(bizRes.body.sucursalPrincipal.almacenes[0].tipo).toBe('PRINCIPAL');
  });

  it('2. Crea proveedor, producto y convenio producto-proveedor', async () => {
    const provRes = await request(app.getHttpServer())
      .post('/api/v1/proveedores')
      .set('Authorization', `Bearer ${accessToken}`)
      .set('x-negocio-id', negocioId)
      .send({
        razonSocial: 'Proveedor Demo S.A.C.',
        ruc: `209${uniqueSuffix.slice(-8)}`,
        leadTimePromedioDias: 5,
      })
      .expect(201);
    proveedorId = provRes.body.id as string;

    const prodRes = await request(app.getHttpServer())
      .post('/api/v1/productos')
      .set('Authorization', `Bearer ${accessToken}`)
      .set('x-negocio-id', negocioId)
      .send({
        sku: `SKU-${uniqueSuffix.slice(-6)}`,
        nombre: 'Aceite Sintético 1L',
        precioVentaBase: 25.5,
        manejaLotes: false,
      })
      .expect(201);
    productoId = prodRes.body.id as string;

    await request(app.getHttpServer())
      .put(`/api/v1/productos/${productoId}/proveedores`)
      .set('Authorization', `Bearer ${accessToken}`)
      .set('x-negocio-id', negocioId)
      .send({
        proveedorId,
        costoCompra: 12.5,
        leadTimeDias: 5,
        esPreferente: true,
      })
      .expect(200);
  });

  it('3. Registra ENTRADA_COMPRA, consulta stock por LPN y ejecuta venta + anulación reversible', async () => {
    const movRes = await request(app.getHttpServer())
      .post('/api/v1/movimientos')
      .set('Authorization', `Bearer ${accessToken}`)
      .set('x-negocio-id', negocioId)
      .send({
        tipo: 'ENTRADA_COMPRA',
        sucursalId,
        almacenDestinoId: almacenId,
        proveedorId,
        motivo: 'Compra inicial E2E',
        completarInmediato: true,
        detalles: [{ productoId, cantidad: 10, costoUnitario: 12.5 }],
      })
      .expect(201);

    expect(movRes.body.estado).toBe('COMPLETADO');

    const stockRes = await request(app.getHttpServer())
      .get('/api/v1/stock')
      .query({ almacenId, productoId })
      .set('Authorization', `Bearer ${accessToken}`)
      .set('x-negocio-id', negocioId)
      .expect(200);

    expect(stockRes.body).toHaveLength(1);
    expect(stockRes.body[0].cantidad_actual).toBe(10);
    codigoExistencia = stockRes.body[0].codigo_existencia as string;
    expect(codigoExistencia).toBeTruthy();

    const lookupRes = await request(app.getHttpServer())
      .get(`/api/v1/stock/codigo/${codigoExistencia}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .set('x-negocio-id', negocioId)
      .expect(200);
    expect(lookupRes.body.cantidad_disponible).toBe(10);

    const methodsRes = await request(app.getHttpServer())
      .get('/api/v1/metodos-pago')
      .set('Authorization', `Bearer ${accessToken}`)
      .set('x-negocio-id', negocioId)
      .expect(200);
    metodoPagoId = methodsRes.body[0].id as string;

    const saleRes = await request(app.getHttpServer())
      .post('/api/v1/ventas')
      .set('Authorization', `Bearer ${accessToken}`)
      .set('x-negocio-id', negocioId)
      .send({
        almacenDespachoId: almacenId,
        detalles: [{ productoId, cantidad: 9 }],
        pagos: [{ metodoPagoId, monto: 229.5 }],
      })
      .expect(201);

    expect(saleRes.body.estado).toBe('EMITIDA');
    expect(saleRes.body.movimiento.tipo).toBe('SALIDA_VENTA');

    const afterSaleStock = await request(app.getHttpServer())
      .get(`/api/v1/stock/codigo/${codigoExistencia}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .set('x-negocio-id', negocioId)
      .expect(200);
    expect(afterSaleStock.body.cantidad_actual).toBe(1);
  });

  it('4. Ejecuta cierre diario, análisis predictivo IA y acepta recomendación generando borrador', async () => {
    const closeRes = await request(app.getHttpServer())
      .post('/api/v1/cierres/ejecutar')
      .set('Authorization', `Bearer ${accessToken}`)
      .set('x-negocio-id', negocioId)
      .send({ observaciones: 'Cierre E2E' })
      .expect(201);

    expect(closeRes.body.resultados[0].status).toBe('CLOSED');

    const aiRes = await request(app.getHttpServer())
      .post('/api/v1/ia/analizar')
      .set('Authorization', `Bearer ${accessToken}`)
      .set('x-negocio-id', negocioId)
      .send({ ventanaDias: 30, diasCoberturaObjetivo: 14 })
      .expect(201);

    expect(aiRes.body.recomendacionesGeneradas.length).toBeGreaterThanOrEqual(1);
    recomendacionId = aiRes.body.recomendacionesGeneradas[0].id as string;
    expect(aiRes.body.recomendacionesGeneradas[0].estado).toBe('PENDIENTE');

    const decideRes = await request(app.getHttpServer())
      .post(`/api/v1/ia/recomendaciones/${recomendacionId}/decidir`)
      .set('Authorization', `Bearer ${accessToken}`)
      .set('x-negocio-id', negocioId)
      .send({ decision: 'ACEPTADA' })
      .expect(201);

    expect(decideRes.body.recomendacion.estado).toBe('ACEPTADA');
    expect(decideRes.body.borradorCompraCreado).toBeTruthy();
    expect(decideRes.body.borradorCompraCreado.tipo).toBe('ENTRADA_COMPRA');
    expect(decideRes.body.borradorCompraCreado.estado).toBe('BORRADOR');
  });

  it('5. Valida reglas de integridad: bloquea borrado con stock y valida formato de HttpExceptionFilter', async () => {
    const delProdRes = await request(app.getHttpServer())
      .delete(`/api/v1/productos/${productoId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .set('x-negocio-id', negocioId)
      .expect(400);

    expect(delProdRes.body.statusCode).toBe(400);
    expect(delProdRes.body.path).toBe(`/api/v1/productos/${productoId}`);
    expect(delProdRes.body.message).toContain('No se puede eliminar el producto porque aún cuenta con');

    const delAlmRes = await request(app.getHttpServer())
      .delete(`/api/v1/almacenes/${almacenId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .set('x-negocio-id', negocioId)
      .expect(400);

    expect(delAlmRes.body.statusCode).toBe(400);
    expect(delAlmRes.body.message).toContain('No se puede eliminar el almacén porque aún tiene');

    const lotUpdateRes = await request(app.getHttpServer())
      .post('/api/v1/lotes/actualizar-vencimientos')
      .set('Authorization', `Bearer ${accessToken}`)
      .set('x-negocio-id', negocioId)
      .expect(201);

    expect(lotUpdateRes.body).toHaveProperty('lotesVencidos');
    expect(lotUpdateRes.body).toHaveProperty('lotesPorVencer');
  });

  it('6. Consulta reportes ejecutivos: dashboard, kardex cronológico y arqueo de ventas', async () => {
    const dashRes = await request(app.getHttpServer())
      .get('/api/v1/reportes/dashboard')
      .set('Authorization', `Bearer ${accessToken}`)
      .set('x-negocio-id', negocioId)
      .expect(200);

    expect(dashRes.body).toHaveProperty('inventario');
    expect(dashRes.body).toHaveProperty('ventasHoy');
    expect(dashRes.body).toHaveProperty('alertas');
    expect(dashRes.body.inventario.totalProductosActivos).toBeGreaterThanOrEqual(1);

    const kardexRes = await request(app.getHttpServer())
      .get(`/api/v1/reportes/kardex/${productoId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .set('x-negocio-id', negocioId)
      .expect(200);

    expect(kardexRes.body.producto.id).toBe(productoId);
    expect(kardexRes.body.lineasKardex.length).toBeGreaterThanOrEqual(2);
    expect(kardexRes.body.lineasKardex[0].entrada.cantidad).toBe(10);
    expect(kardexRes.body.lineasKardex[1].salida.cantidad).toBe(9);
    expect(kardexRes.body.lineasKardex[1].saldo.cantidad).toBe(1);

    const salesRepRes = await request(app.getHttpServer())
      .get('/api/v1/reportes/ventas')
      .set('Authorization', `Bearer ${accessToken}`)
      .set('x-negocio-id', negocioId)
      .expect(200);

    expect(salesRepRes.body.totales.cantidadVentas).toBeGreaterThanOrEqual(1);
    expect(salesRepRes.body.desglosePorMetodoPago.length).toBeGreaterThanOrEqual(1);
  });
});

