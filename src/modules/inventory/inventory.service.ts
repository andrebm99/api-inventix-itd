import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  almacen_tipo,
  movimiento_estado,
  movimiento_tipo,
  Prisma,
  producto_lote_estado,
} from '@prisma/client';
import { PrismaService } from '../../core/database/prisma.service.js';
import type { TenantContext } from '../../core/types/auth.types.js';
import type { AnularMovimientoDto, CreateMovimientoDto } from './dto/inventory.dto.js';

export interface MovementLineInput {
  productoId: string;
  loteId?: string | null;
  cantidad: number;
  costoUnitario?: number;
  descuentoUnitario?: number;
}

@Injectable()
export class InventoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  // ==================== STOCK EN TIEMPO REAL ====================

  async listStock(
    negocioId: string,
    filters?: {
      almacenId?: string;
      sucursalId?: string;
      productoId?: string;
      soloConStock?: boolean;
    },
  ) {
    const rows = await this.prisma.stock_almacen.findMany({
      where: {
        almacen: {
          deleted_at: null,
          sucursal: {
            negocio_id: negocioId,
            deleted_at: null,
            ...(filters?.sucursalId ? { id: filters.sucursalId } : {}),
          },
          ...(filters?.almacenId ? { id: filters.almacenId } : {}),
        },
        producto: {
          negocio_id: negocioId,
          deleted_at: null,
          ...(filters?.productoId ? { id: filters.productoId } : {}),
        },
        ...(filters?.soloConStock ? { cantidad_actual: { gt: 0 } } : {}),
      },
      include: {
        almacen: {
          select: {
            id: true,
            nombre: true,
            tipo: true,
            sucursal: { select: { id: true, nombre: true } },
          },
        },
        producto: {
          select: {
            id: true,
            nombre: true,
            sku: true,
            codigo_barras: true,
            costo_promedio: true,
            precio_venta_base: true,
          },
        },
        producto_lote: {
          select: {
            id: true,
            codigo_lote: true,
            fecha_vencimiento: true,
            estado: true,
          },
        },
      },
      orderBy: [{ updated_at: 'desc' }],
    });

    return rows.map((row) => ({
      ...row,
      cantidad_disponible: row.cantidad_actual - row.cantidad_reservada,
    }));
  }

  async findStockByCode(negocioId: string, codigoExistencia: string) {
    const stock = await this.prisma.stock_almacen.findFirst({
      where: {
        codigo_existencia: codigoExistencia.trim(),
        almacen: {
          deleted_at: null,
          sucursal: { negocio_id: negocioId, deleted_at: null },
        },
      },
      include: {
        almacen: {
          select: {
            id: true,
            nombre: true,
            tipo: true,
            sucursal: { select: { id: true, nombre: true } },
          },
        },
        producto: {
          select: {
            id: true,
            nombre: true,
            sku: true,
            codigo_barras: true,
            costo_promedio: true,
            precio_venta_base: true,
          },
        },
        producto_lote: true,
      },
    });

    if (!stock) {
      throw new NotFoundException(`No se encontró existencia con código ${codigoExistencia}`);
    }

    return {
      ...stock,
      cantidad_disponible: stock.cantidad_actual - stock.cantidad_reservada,
    };
  }

  // ==================== KÁRDEX Y MOVIMIENTOS ====================

  async listMovements(
    negocioId: string,
    filters?: {
      tipo?: movimiento_tipo;
      estado?: movimiento_estado;
      sucursalId?: string;
      almacenId?: string;
      productoId?: string;
    },
  ) {
    return this.prisma.movimiento.findMany({
      where: {
        negocio_id: negocioId,
        ...(filters?.tipo ? { tipo: filters.tipo } : {}),
        ...(filters?.estado ? { estado: filters.estado } : {}),
        ...(filters?.sucursalId ? { sucursal_id: filters.sucursalId } : {}),
        ...(filters?.almacenId
          ? {
              OR: [
                { almacen_origen_id: filters.almacenId },
                { almacen_destino_id: filters.almacenId },
              ],
            }
          : {}),
        ...(filters?.productoId
          ? {
              detalle_movimiento: {
                some: { producto_id: filters.productoId },
              },
            }
          : {}),
      },
      include: {
        sucursal: { select: { id: true, nombre: true } },
        almacen_movimiento_almacen_origen_idToalmacen: {
          select: { id: true, nombre: true, tipo: true },
        },
        almacen_movimiento_almacen_destino_idToalmacen: {
          select: { id: true, nombre: true, tipo: true },
        },
        proveedor: { select: { id: true, razon_social: true } },
        usuario: { select: { id: true, nombre: true } },
        detalle_movimiento: {
          include: {
            producto: { select: { id: true, nombre: true, sku: true } },
            producto_lote: { select: { id: true, codigo_lote: true } },
          },
        },
      },
      orderBy: { fecha_registro: 'desc' },
    });
  }

  async getMovement(negocioId: string, id: string) {
    const mov = await this.prisma.movimiento.findFirst({
      where: { id, negocio_id: negocioId },
      include: {
        sucursal: { select: { id: true, nombre: true } },
        almacen_movimiento_almacen_origen_idToalmacen: {
          select: { id: true, nombre: true, tipo: true },
        },
        almacen_movimiento_almacen_destino_idToalmacen: {
          select: { id: true, nombre: true, tipo: true },
        },
        proveedor: { select: { id: true, razon_social: true, ruc: true } },
        usuario: { select: { id: true, nombre: true, correo: true } },
        movimiento: { select: { id: true, tipo: true, estado: true, motivo: true } },
        other_movimiento: { select: { id: true, tipo: true, estado: true, motivo: true } },
        detalle_movimiento: {
          include: {
            producto: { select: { id: true, nombre: true, sku: true } },
            producto_lote: { select: { id: true, codigo_lote: true, fecha_vencimiento: true } },
          },
        },
      },
    });

    if (!mov) {
      throw new NotFoundException('Movimiento no encontrado');
    }

    return mov;
  }

  async createMovement(tenant: TenantContext, dto: CreateMovimientoDto) {
    if (dto.completarInmediato) {
      const canApprove =
        tenant.rol.nivelJerarquia >= 100 || tenant.permisos.includes('inventario:approve');
      if (!canApprove) {
        throw new ForbiddenException(
          'No tienes permiso inventario:approve para completar movimientos inmediatamente',
        );
      }
    }

    const created = await this.prisma.$transaction(async (tx) => {
      const mov = await this.createDraftMovementInTx(tx, {
        negocioId: tenant.negocioId,
        sucursalId: dto.sucursalId,
        usuarioId: tenant.usuarioId,
        tipo: dto.tipo,
        almacenOrigenId: dto.almacenOrigenId ?? null,
        almacenDestinoId: dto.almacenDestinoId ?? null,
        proveedorId: dto.proveedorId ?? null,
        motivo: dto.motivo.trim(),
        codigoTransferencia: dto.codigoTransferencia?.trim() ?? null,
        detalles: dto.detalles,
      });

      if (dto.completarInmediato) {
        return this.completeMovementInTx(tx, tenant, mov.id);
      }

      return mov;
    });

    if (created.estado === movimiento_estado.COMPLETADO) {
      this.eventEmitter.emit('inventory.movement.completed', {
        negocioId: tenant.negocioId,
        movimientoId: created.id,
        tipo: created.tipo,
      });
    }

    return created;
  }

  async approveMovement(tenant: TenantContext, id: string) {
    const mov = await this.prisma.movimiento.findFirst({
      where: { id, negocio_id: tenant.negocioId },
    });
    if (!mov) {
      throw new NotFoundException('Movimiento no encontrado');
    }
    if (mov.estado !== movimiento_estado.BORRADOR) {
      throw new BadRequestException(
        `Solo se pueden aprobar movimientos en BORRADOR (estado actual: ${mov.estado})`,
      );
    }

    return this.prisma.movimiento.update({
      where: { id },
      data: { estado: movimiento_estado.APROBADO },
    });
  }

  async completeMovement(tenant: TenantContext, id: string) {
    const completed = await this.prisma.$transaction((tx) =>
      this.completeMovementInTx(tx, tenant, id),
    );

    this.eventEmitter.emit('inventory.movement.completed', {
      negocioId: tenant.negocioId,
      movimientoId: completed.id,
      tipo: completed.tipo,
    });

    return completed;
  }

  async cancelMovement(tenant: TenantContext, id: string, dto?: AnularMovimientoDto) {
    const result = await this.prisma.$transaction((tx) =>
      this.cancelMovementInTx(tx, tenant, id, dto?.motivo),
    );

    if (result.reverso) {
      this.eventEmitter.emit('inventory.movement.completed', {
        negocioId: tenant.negocioId,
        movimientoId: result.reverso.id,
        tipo: result.reverso.tipo,
      });
    }

    return result;
  }

  // ==================== MÉTODOS TRANSACCIONALES REUTILIZABLES ====================

  async createDraftMovementInTx(
    tx: Prisma.TransactionClient,
    input: {
      negocioId: string;
      sucursalId: string;
      usuarioId: string;
      tipo: movimiento_tipo;
      almacenOrigenId: string | null;
      almacenDestinoId: string | null;
      proveedorId: string | null;
      motivo: string;
      codigoTransferencia: string | null;
      detalles: MovementLineInput[];
    },
  ) {
    this.validateMovementWarehousesShape(input.tipo, input.almacenOrigenId, input.almacenDestinoId);

    const sucursal = await tx.sucursal.findFirst({
      where: { id: input.sucursalId, negocio_id: input.negocioId, deleted_at: null },
    });
    if (!sucursal) {
      throw new NotFoundException('Sucursal no encontrada en este negocio');
    }

    let origen = null;
    if (input.almacenOrigenId) {
      origen = await tx.almacen.findFirst({
        where: {
          id: input.almacenOrigenId,
          deleted_at: null,
          sucursal: { negocio_id: input.negocioId, deleted_at: null },
        },
      });
      if (!origen) {
        throw new NotFoundException('Almacén de origen no encontrado en este negocio');
      }
    }

    let destino = null;
    if (input.almacenDestinoId) {
      destino = await tx.almacen.findFirst({
        where: {
          id: input.almacenDestinoId,
          deleted_at: null,
          sucursal: { negocio_id: input.negocioId, deleted_at: null },
        },
      });
      if (!destino) {
        throw new NotFoundException('Almacén de destino no encontrado en este negocio');
      }
    }

    if (origen?.tipo === almacen_tipo.MERMAS_CUARENTENA) {
      if (input.tipo === movimiento_tipo.SALIDA_VENTA) {
        throw new BadRequestException(
          'No se pueden despachar ventas desde almacenes de MERMAS_CUARENTENA',
        );
      }
      if (
        input.tipo === movimiento_tipo.TRASLADO_INTERNO &&
        destino?.tipo === almacen_tipo.EXPOSICION
      ) {
        throw new BadRequestException(
          'No se pueden trasladar artículos desde MERMAS_CUARENTENA hacia piso de EXPOSICION',
        );
      }
    }

    if (input.proveedorId) {
      const prov = await tx.proveedor.findFirst({
        where: { id: input.proveedorId, negocio_id: input.negocioId, deleted_at: null },
      });
      if (!prov) {
        throw new NotFoundException('Proveedor no encontrado en este negocio');
      }
    }

    const validatedLines: Array<{
      producto_id: string;
      lote_id: string | null;
      cantidad: number;
      costo_unitario: number;
      descuento_unitario: number;
    }> = [];

    for (const line of input.detalles) {
      const producto = await tx.producto.findFirst({
        where: { id: line.productoId, negocio_id: input.negocioId, deleted_at: null },
      });
      if (!producto) {
        throw new NotFoundException(`Producto ${line.productoId} no encontrado`);
      }

      if (producto.maneja_lotes) {
        if (!line.loteId) {
          throw new BadRequestException(
            `El producto "${producto.nombre}" requiere especificar un loteId`,
          );
        }
        const lote = await tx.producto_lote.findFirst({
          where: { id: line.loteId, producto_id: producto.id },
        });
        if (!lote) {
          throw new NotFoundException(`Lote ${line.loteId} no pertenece al producto`);
        }
        if (
          (input.tipo === movimiento_tipo.SALIDA_VENTA ||
            input.tipo === movimiento_tipo.TRASLADO_INTERNO) &&
          (lote.estado === producto_lote_estado.VENCIDO ||
            lote.estado === producto_lote_estado.CUARENTENA)
        ) {
          throw new BadRequestException(
            `El lote ${lote.codigo_lote} está en estado ${lote.estado} y no puede despacharse`,
          );
        }
      } else if (line.loteId) {
        throw new BadRequestException(
          `El producto "${producto.nombre}" no maneja lotes (loteId debe omitirse)`,
        );
      }

      validatedLines.push({
        producto_id: producto.id,
        lote_id: line.loteId ?? null,
        cantidad: line.cantidad,
        costo_unitario: line.costoUnitario ?? Number(producto.costo_promedio ?? 0),
        descuento_unitario: line.descuentoUnitario ?? 0,
      });
    }

    return tx.movimiento.create({
      data: {
        negocio_id: input.negocioId,
        sucursal_id: input.sucursalId,
        almacen_origen_id: input.almacenOrigenId,
        almacen_destino_id: input.almacenDestinoId,
        proveedor_id: input.proveedorId,
        usuario_creador_id: input.usuarioId,
        tipo: input.tipo,
        estado: movimiento_estado.BORRADOR,
        motivo: input.motivo,
        codigo_transferencia: input.codigoTransferencia,
        detalle_movimiento: {
          create: validatedLines,
        },
      },
      include: {
        detalle_movimiento: true,
      },
    });
  }

  async completeMovementInTx(
    tx: Prisma.TransactionClient,
    tenant: TenantContext,
    movimientoId: string,
  ) {
    const mov = await tx.movimiento.findFirst({
      where: { id: movimientoId, negocio_id: tenant.negocioId },
      include: { detalle_movimiento: true },
    });

    if (!mov) {
      throw new NotFoundException('Movimiento no encontrado');
    }

    if (
      mov.estado !== movimiento_estado.BORRADOR &&
      mov.estado !== movimiento_estado.APROBADO
    ) {
      throw new BadRequestException(
        `Solo se pueden completar movimientos en BORRADOR o APROBADO (estado actual: ${mov.estado})`,
      );
    }

    const allowNegative = tenant.config?.permite_stock_negativo ?? false;

    for (const line of mov.detalle_movimiento) {
      if (mov.tipo === movimiento_tipo.ENTRADA_COMPRA) {
        await this.updateWeightedAverageCostInTx(
          tx,
          line.producto_id,
          line.cantidad,
          Number(line.costo_unitario) - Number(line.descuento_unitario),
        );
      }

      if (mov.almacen_origen_id) {
        await this.adjustStockInTx(tx, {
          almacenId: mov.almacen_origen_id,
          productoId: line.producto_id,
          loteId: line.lote_id,
          delta: -line.cantidad,
          allowNegative,
        });
      }

      if (mov.almacen_destino_id) {
        await this.adjustStockInTx(tx, {
          almacenId: mov.almacen_destino_id,
          productoId: line.producto_id,
          loteId: line.lote_id,
          delta: line.cantidad,
          allowNegative: true,
        });
      }
    }

    return tx.movimiento.update({
      where: { id: mov.id },
      data: {
        estado: movimiento_estado.COMPLETADO,
        fecha_aplicacion: new Date(),
      },
      include: {
        detalle_movimiento: {
          include: {
            producto: { select: { id: true, nombre: true, sku: true } },
            producto_lote: { select: { id: true, codigo_lote: true } },
          },
        },
      },
    });
  }

  async cancelMovementInTx(
    tx: Prisma.TransactionClient,
    tenant: TenantContext,
    movimientoId: string,
    motivoAnulacion?: string,
  ) {
    const mov = await tx.movimiento.findFirst({
      where: { id: movimientoId, negocio_id: tenant.negocioId },
      include: { detalle_movimiento: true },
    });

    if (!mov) {
      throw new NotFoundException('Movimiento no encontrado');
    }

    if (mov.estado === movimiento_estado.ANULADO) {
      throw new BadRequestException('El movimiento ya se encuentra anulado');
    }

    if (mov.movimiento_reverso_id) {
      throw new BadRequestException('Un movimiento de reversión no puede anularse');
    }

    if (
      mov.estado === movimiento_estado.BORRADOR ||
      mov.estado === movimiento_estado.APROBADO
    ) {
      const anulado = await tx.movimiento.update({
        where: { id: mov.id },
        data: { estado: movimiento_estado.ANULADO },
      });
      return { movimientoAnulado: anulado, reverso: null };
    }

    // Si estaba COMPLETADO, crear contra-movimiento invirtiendo almacenes origen <-> destino
    const allowNegative = tenant.config?.permite_stock_negativo ?? false;
    const revOrigen = mov.almacen_destino_id;
    const revDestino = mov.almacen_origen_id;

    for (const line of mov.detalle_movimiento) {
      if (revOrigen) {
        await this.adjustStockInTx(tx, {
          almacenId: revOrigen,
          productoId: line.producto_id,
          loteId: line.lote_id,
          delta: -line.cantidad,
          allowNegative,
        });
      }
      if (revDestino) {
        await this.adjustStockInTx(tx, {
          almacenId: revDestino,
          productoId: line.producto_id,
          loteId: line.lote_id,
          delta: line.cantidad,
          allowNegative: true,
        });
      }
    }

    const reverso = await tx.movimiento.create({
      data: {
        negocio_id: mov.negocio_id,
        sucursal_id: mov.sucursal_id,
        almacen_origen_id: revOrigen,
        almacen_destino_id: revDestino,
        proveedor_id: mov.proveedor_id,
        usuario_creador_id: tenant.usuarioId,
        tipo: mov.tipo,
        estado: movimiento_estado.COMPLETADO,
        motivo: motivoAnulacion?.trim()
          ? `REVERSIÓN (${mov.motivo}): ${motivoAnulacion.trim()}`
          : `REVERSIÓN DE MOVIMIENTO: ${mov.motivo}`,
        codigo_transferencia: mov.codigo_transferencia,
        movimiento_reverso_id: mov.id,
        fecha_aplicacion: new Date(),
        detalle_movimiento: {
          create: mov.detalle_movimiento.map((d) => ({
            producto_id: d.producto_id,
            lote_id: d.lote_id,
            cantidad: d.cantidad,
            costo_unitario: d.costo_unitario,
            descuento_unitario: d.descuento_unitario,
          })),
        },
      },
      include: { detalle_movimiento: true },
    });

    const movimientoAnulado = await tx.movimiento.update({
      where: { id: mov.id },
      data: { estado: movimiento_estado.ANULADO },
    });

    return { movimientoAnulado, reverso };
  }

  // ==================== HELPERS INTERNOS ====================

  private validateMovementWarehousesShape(
    tipo: movimiento_tipo,
    origenId: string | null,
    destinoId: string | null,
  ): void {
    switch (tipo) {
      case movimiento_tipo.ENTRADA_COMPRA:
        if (origenId || !destinoId) {
          throw new BadRequestException(
            'ENTRADA_COMPRA requiere almacenDestinoId y almacenOrigenId debe ser nulo',
          );
        }
        break;
      case movimiento_tipo.TRASLADO_INTERNO:
        if (!origenId || !destinoId || origenId === destinoId) {
          throw new BadRequestException(
            'TRASLADO_INTERNO requiere almacenOrigenId y almacenDestinoId distintos',
          );
        }
        break;
      case movimiento_tipo.SALIDA_VENTA:
      case movimiento_tipo.SALIDA_MERMA:
        if (!origenId || destinoId) {
          throw new BadRequestException(
            `${tipo} requiere almacenOrigenId y almacenDestinoId debe ser nulo`,
          );
        }
        break;
      case movimiento_tipo.AJUSTE_INVENTARIO:
        if ((origenId && destinoId) || (!origenId && !destinoId)) {
          throw new BadRequestException(
            'AJUSTE_INVENTARIO requiere exactamente uno de almacenOrigenId (salida) o almacenDestinoId (entrada)',
          );
        }
        break;
    }
  }

  private async adjustStockInTx(
    tx: Prisma.TransactionClient,
    params: {
      almacenId: string;
      productoId: string;
      loteId: string | null;
      delta: number;
      allowNegative: boolean;
    },
  ): Promise<void> {
    const existing = await tx.stock_almacen.findFirst({
      where: {
        almacen_id: params.almacenId,
        producto_id: params.productoId,
        lote_id: params.loteId,
      },
    });

    if (!existing) {
      if (params.delta < 0 && !params.allowNegative) {
        throw new BadRequestException(
          'Stock insuficiente en el almacén de origen (no existe existencia registrada)',
        );
      }

      const codigoExistencia = await this.generateStockCodeInTx(
        tx,
        params.productoId,
        params.loteId,
        params.almacenId,
      );

      await tx.stock_almacen.create({
        data: {
          almacen_id: params.almacenId,
          producto_id: params.productoId,
          lote_id: params.loteId,
          codigo_existencia: codigoExistencia,
          cantidad_actual: params.delta,
          cantidad_reservada: 0,
        },
      });
      return;
    }

    const availableAfter = existing.cantidad_actual - existing.cantidad_reservada + params.delta;
    if (params.delta < 0 && availableAfter < 0 && !params.allowNegative) {
      throw new BadRequestException(
        `Stock insuficiente (disponible: ${existing.cantidad_actual - existing.cantidad_reservada}, requerido: ${Math.abs(params.delta)})`,
      );
    }

    await tx.stock_almacen.update({
      where: { id: existing.id },
      data: {
        cantidad_actual: existing.cantidad_actual + params.delta,
        updated_at: new Date(),
      },
    });
  }

  private async updateWeightedAverageCostInTx(
    tx: Prisma.TransactionClient,
    productoId: string,
    incomingQty: number,
    incomingNetUnitCost: number,
  ): Promise<void> {
    if (incomingQty <= 0 || incomingNetUnitCost < 0) {
      return;
    }

    const producto = await tx.producto.findUniqueOrThrow({ where: { id: productoId } });
    const stockAgg = await tx.stock_almacen.aggregate({
      where: { producto_id: productoId },
      _sum: { cantidad_actual: true },
    });

    const currentStock = Math.max(0, stockAgg._sum.cantidad_actual ?? 0);
    const currentAvg = Number(producto.costo_promedio ?? 0);
    const totalQty = currentStock + incomingQty;
    const newAvg =
      totalQty > 0
        ? (currentStock * currentAvg + incomingQty * incomingNetUnitCost) / totalQty
        : incomingNetUnitCost;

    await tx.producto.update({
      where: { id: productoId },
      data: {
        costo_promedio: Number(newAvg.toFixed(4)),
        updated_at: new Date(),
      },
    });
  }

  private async generateStockCodeInTx(
    tx: Prisma.TransactionClient,
    productoId: string,
    loteId: string | null,
    almacenId: string,
  ): Promise<string> {
    const producto = await tx.producto.findUnique({
      where: { id: productoId },
      select: { sku: true },
    });
    const lote = loteId
      ? await tx.producto_lote.findUnique({
          where: { id: loteId },
          select: { codigo_lote: true },
        })
      : null;

    const skuPart = (producto?.sku || productoId.slice(0, 6))
      .replace(/[^A-Za-z0-9]/g, '')
      .toUpperCase()
      .slice(0, 16);
    const lotePart = (lote?.codigo_lote || 'STD')
      .replace(/[^A-Za-z0-9]/g, '')
      .toUpperCase()
      .slice(0, 16);
    const almPart = almacenId.replace(/-/g, '').toUpperCase().slice(0, 8);

    const base = `${skuPart}-${lotePart}-${almPart}`;
    const clash = await tx.stock_almacen.findUnique({ where: { codigo_existencia: base } });
    if (!clash) {
      return base;
    }

    return `${base}-${Date.now().toString(36).toUpperCase()}`.slice(0, 80);
  }
}

