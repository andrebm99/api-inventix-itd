import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { almacen_tipo, movimiento_tipo, producto_lote_estado, venta_estado } from '@prisma/client';
import { PrismaService } from '../../core/database/prisma.service.js';
import type { TenantContext } from '../../core/types/auth.types.js';
import { InventoryService } from '../inventory/inventory.service.js';
import type { AnularVentaDto, CreateVentaDto } from './dto/sales.dto.js';

@Injectable()
export class SalesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inventoryService: InventoryService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async listPaymentMethods() {
    return this.prisma.metodo_pago.findMany({
      where: { activo: true },
      orderBy: { nombre: 'asc' },
    });
  }

  async listSales(
    negocioId: string,
    filters?: { sucursalId?: string; estado?: venta_estado },
  ) {
    return this.prisma.venta.findMany({
      where: {
        negocio_id: negocioId,
        ...(filters?.sucursalId ? { sucursal_id: filters.sucursalId } : {}),
        ...(filters?.estado ? { estado: filters.estado } : {}),
      },
      include: {
        sucursal: { select: { id: true, nombre: true } },
        almacen: { select: { id: true, nombre: true, tipo: true } },
        usuario: { select: { id: true, nombre: true, correo: true } },
        movimiento: {
          select: {
            id: true,
            tipo: true,
            estado: true,
            motivo: true,
            fecha_aplicacion: true,
            other_movimiento: {
              select: {
                id: true,
                motivo: true,
                fecha_aplicacion: true,
                usuario: { select: { id: true, nombre: true, correo: true } },
              },
            },
          },
        },
        detalle_venta: {
          include: {
            producto: { select: { id: true, nombre: true, sku: true } },
          },
        },
        pago_venta: {
          include: { metodo_pago: { select: { id: true, nombre: true } } },
        },
      },
      orderBy: { fecha_venta: 'desc' },
    });
  }

  async getSale(negocioId: string, id: string) {
    const venta = await this.prisma.venta.findFirst({
      where: { id, negocio_id: negocioId },
      include: {
        sucursal: { select: { id: true, nombre: true } },
        almacen: { select: { id: true, nombre: true, tipo: true } },
        usuario: { select: { id: true, nombre: true, correo: true } },
        movimiento: {
          select: {
            id: true,
            tipo: true,
            estado: true,
            motivo: true,
            fecha_aplicacion: true,
            other_movimiento: {
              select: {
                id: true,
                motivo: true,
                fecha_aplicacion: true,
                usuario: { select: { id: true, nombre: true, correo: true } },
              },
            },
          },
        },
        detalle_venta: {
          include: {
            producto: { select: { id: true, nombre: true, sku: true } },
            producto_lote: { select: { id: true, codigo_lote: true } },
          },
        },
        pago_venta: {
          include: { metodo_pago: { select: { id: true, nombre: true } } },
        },
      },
    });

    if (!venta) {
      throw new NotFoundException('Venta no encontrada');
    }

    return venta;
  }

  async createSale(tenant: TenantContext, dto: CreateVentaDto) {
    const almacen = await this.prisma.almacen.findFirst({
      where: {
        id: dto.almacenDespachoId,
        deleted_at: null,
        sucursal: { negocio_id: tenant.negocioId, deleted_at: null },
      },
      include: { sucursal: true },
    });

    if (!almacen) {
      throw new NotFoundException('Almacén de despacho no encontrado en este negocio');
    }

    if (almacen.tipo === almacen_tipo.MERMAS_CUARENTENA) {
      throw new BadRequestException(
        'No se pueden emitir ventas desde un almacén tipificado como MERMAS_CUARENTENA',
      );
    }

    const metodoPagoIds = [...new Set(dto.pagos.map((p) => p.metodoPagoId))];
    const metodos = await this.prisma.metodo_pago.findMany({
      where: { id: { in: metodoPagoIds }, activo: true },
    });
    if (metodos.length !== metodoPagoIds.length) {
      throw new BadRequestException('Uno o más métodos de pago no existen o están inactivos');
    }

    let numeroComprobante = dto.numeroComprobante?.trim();
    if (!numeroComprobante || dto.autoCorrelativo) {
      const tipo = (dto.tipoComprobante || 'BOLETA').toUpperCase();
      const prefix = tipo === 'FACTURA' ? 'F001' : tipo === 'TICKET' ? 'T001' : 'B001';
      const count = await this.prisma.venta.count({
        where: { negocio_id: tenant.negocioId },
      });
      numeroComprobante = `${prefix}-${String(count + 1).padStart(6, '0')}`;
    }

    const created = await this.prisma.$transaction(async (tx) => {
      let subtotal = 0;
      const saleLines: Array<{
        producto_id: string;
        lote_id: string | null;
        cantidad: number;
        precio_unitario: number;
        descuento: number;
        subtotal_linea: number;
        costo_promedio: number;
      }> = [];

      for (const item of dto.detalles) {
        const producto = await tx.producto.findFirst({
          where: { id: item.productoId, negocio_id: tenant.negocioId, deleted_at: null },
        });
        if (!producto) {
          throw new NotFoundException(`Producto ${item.productoId} no encontrado`);
        }

        const precioUnitario = item.precioUnitario ?? Number(producto.precio_venta_base);
        const descuento = item.descuento ?? 0;
        const subtotalLinea = Number((item.cantidad * precioUnitario - descuento).toFixed(2));
        if (subtotalLinea < 0) {
          throw new BadRequestException(
            `El descuento de línea supera el subtotal del producto "${producto.nombre}"`,
          );
        }

        let resolvedLoteId = item.loteId ?? null;
        if (producto.maneja_lotes && !resolvedLoteId) {
          const fefoLote = await tx.stock_almacen.findFirst({
            where: {
              almacen_id: almacen.id,
              producto_id: producto.id,
              lote_id: { not: null },
              cantidad_actual: { gt: 0 },
              producto_lote: {
                estado: { in: [producto_lote_estado.DISPONIBLE, producto_lote_estado.POR_VENCER] },
                fecha_vencimiento: { gt: new Date() },
              },
            },
            include: { producto_lote: true },
            orderBy: { producto_lote: { fecha_vencimiento: 'asc' } },
          });

          if (fefoLote?.lote_id) {
            resolvedLoteId = fefoLote.lote_id;
          } else {
            const anyActive = await tx.producto_lote.findFirst({
              where: {
                producto_id: producto.id,
                estado: { in: [producto_lote_estado.DISPONIBLE, producto_lote_estado.POR_VENCER] },
                fecha_vencimiento: { gt: new Date() },
              },
              orderBy: { fecha_vencimiento: 'asc' },
            });
            resolvedLoteId = anyActive?.id ?? null;
          }
        }

        subtotal += subtotalLinea;
        saleLines.push({
          producto_id: producto.id,
          lote_id: resolvedLoteId,
          cantidad: item.cantidad,
          precio_unitario: precioUnitario,
          descuento,
          subtotal_linea: subtotalLinea,
          costo_promedio: Number(producto.costo_promedio ?? 0),
        });
      }

      const descuentoGlobal = dto.descuentoGlobal ?? 0;
      const baseImponible = Number((subtotal - descuentoGlobal).toFixed(2));
      if (baseImponible < 0) {
        throw new BadRequestException('El descuento global supera el subtotal de la venta');
      }

      const tasaImpuesto = dto.tasaImpuesto ?? 0;
      const impuesto = Number((baseImponible * tasaImpuesto).toFixed(2));
      const total = Number((baseImponible + impuesto).toFixed(2));

      const totalPagado = dto.pagos.reduce((acc, p) => acc + p.monto, 0);
      if (totalPagado + 0.01 < total) {
        throw new BadRequestException(
          `El monto pagado (${totalPagado.toFixed(2)}) es menor al total de la venta (${total.toFixed(2)})`,
        );
      }

      const draftMovement = await this.inventoryService.createDraftMovementInTx(tx, {
        negocioId: tenant.negocioId,
        sucursalId: almacen.sucursal_id,
        usuarioId: tenant.usuarioId,
        tipo: movimiento_tipo.SALIDA_VENTA,
        almacenOrigenId: almacen.id,
        almacenDestinoId: null,
        proveedorId: null,
        motivo: `Venta ${numeroComprobante}`,
        codigoTransferencia: null,
        detalles: saleLines.map((l) => ({
          productoId: l.producto_id,
          loteId: l.lote_id,
          cantidad: l.cantidad,
          costoUnitario: l.costo_promedio,
          descuentoUnitario: 0,
        })),
      });

      const completedMovement = await this.inventoryService.completeMovementInTx(
        tx,
        tenant,
        draftMovement.id,
      );

      return tx.venta.create({
        data: {
          negocio_id: tenant.negocioId,
          sucursal_id: almacen.sucursal_id,
          almacen_despacho_id: almacen.id,
          movimiento_id: completedMovement.id,
          usuario_id: tenant.usuarioId,
          numero_comprobante: numeroComprobante,
          subtotal: Number(subtotal.toFixed(2)),
          descuento_global: descuentoGlobal,
          impuesto,
          total,
          estado: venta_estado.EMITIDA,
          detalle_venta: {
            create: saleLines.map((l) => ({
              producto_id: l.producto_id,
              lote_id: l.lote_id,
              cantidad: l.cantidad,
              precio_unitario: l.precio_unitario,
              descuento: l.descuento,
              subtotal_linea: l.subtotal_linea,
            })),
          },
          pago_venta: {
            create: dto.pagos.map((p) => ({
              metodo_pago_id: p.metodoPagoId,
              monto: p.monto,
              referencia: p.referencia?.trim() ?? null,
            })),
          },
        },
        include: {
          detalle_venta: {
            include: {
              producto: { select: { id: true, nombre: true, sku: true } },
            },
          },
          pago_venta: {
            include: { metodo_pago: { select: { id: true, nombre: true } } },
          },
          movimiento: {
            select: { id: true, tipo: true, estado: true },
          },
        },
      });
    });

    this.eventEmitter.emit('sales.sale.created', {
      negocioId: tenant.negocioId,
      ventaId: created.id,
      movimientoId: created.movimiento_id,
      total: Number(created.total),
    });

    return created;
  }

  async cancelSale(tenant: TenantContext, id: string, dto?: AnularVentaDto) {
    const result = await this.prisma.$transaction(async (tx) => {
      const venta = await tx.venta.findFirst({
        where: { id, negocio_id: tenant.negocioId },
      });
      if (!venta) {
        throw new NotFoundException('Venta no encontrada');
      }
      if (venta.estado === venta_estado.ANULADA) {
        throw new BadRequestException('La venta ya fue anulada');
      }

      // Validar ventana máxima de 24 horas desde la emisión
      const saleDate = venta.fecha_venta ? new Date(venta.fecha_venta).getTime() : 0;
      const hoursElapsed = (Date.now() - saleDate) / (1000 * 60 * 60);
      if (hoursElapsed > 24) {
        throw new BadRequestException(
          'Solo se pueden anular comprobantes dentro de las primeras 24 horas posteriores a su emisión.',
        );
      }

      // Validar justificación obligatoria con mínimo 30 caracteres
      const motivo = dto?.motivo?.trim();
      if (!motivo || motivo.length < 30) {
        throw new BadRequestException(
          'La justificación de anulación es obligatoria y debe tener un mínimo de 30 caracteres explicativos.',
        );
      }

      let reversalResult: unknown = null;
      if (venta.movimiento_id) {
        reversalResult = await this.inventoryService.cancelMovementInTx(
          tx,
          tenant,
          venta.movimiento_id,
          motivo,
        );
      }

      const ventaAnulada = await tx.venta.update({
        where: { id },
        data: { estado: venta_estado.ANULADA },
      });

      return { venta: ventaAnulada, movimientoReversion: reversalResult };
    });

    this.eventEmitter.emit('sales.sale.cancelled', {
      negocioId: tenant.negocioId,
      ventaId: id,
    });

    return result;
  }
}

