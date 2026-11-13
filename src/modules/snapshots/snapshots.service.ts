import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Cron } from '@nestjs/schedule';
import {
  cierre_inventario_periodo_tipo_periodo,
  movimiento_estado,
} from '@prisma/client';
import { PrismaService } from '../../core/database/prisma.service.js';
import type { TenantContext } from '../../core/types/auth.types.js';
import type { ExecuteCloseDto } from './dto/snapshots.dto.js';

@Injectable()
export class SnapshotsService {
  private readonly logger = new Logger(SnapshotsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  /**
   * Ejecución automática diaria a las 23:59 para todos los negocios activos.
   */
  @Cron('59 23 * * *')
  async handleDailyMidnightClose(): Promise<void> {
    this.logger.log('Iniciando cierre diario automático de inventario (23:59)');
    const businesses = await this.prisma.negocio.findMany({
      where: { deleted_at: null, activo: true },
      select: { id: true },
    });

    const today = this.toDateOnly(new Date());
    for (const business of businesses) {
      try {
        await this.executeCloseForBusiness(business.id, null, {
          fechaCierre: today,
          tipoPeriodo: cierre_inventario_periodo_tipo_periodo.DIARIO,
          observaciones: 'Cierre automático programado 23:59',
        });
      } catch (error) {
        this.logger.error(
          `Error en cierre automático para negocio ${business.id}`,
          error instanceof Error ? error.stack : String(error),
        );
      }
    }
  }

  async executeManualClose(tenant: TenantContext, dto: ExecuteCloseDto) {
    const fecha = dto.fechaCierre ? this.toDateOnly(new Date(dto.fechaCierre)) : this.toDateOnly(new Date());

    return this.executeCloseForBusiness(tenant.negocioId, tenant.usuarioId, {
      fechaCierre: fecha,
      almacenId: dto.almacenId,
      tipoPeriodo: dto.tipoPeriodo ?? cierre_inventario_periodo_tipo_periodo.DIARIO,
      observaciones: dto.observaciones?.trim() ?? 'Cierre manual ejecutado por usuario',
    });
  }

  async listCloses(
    negocioId: string,
    filters?: {
      almacenId?: string;
      tipoPeriodo?: cierre_inventario_periodo_tipo_periodo;
    },
  ) {
    return this.prisma.cierre_inventario_periodo.findMany({
      where: {
        negocio_id: negocioId,
        ...(filters?.almacenId ? { almacen_id: filters.almacenId } : {}),
        ...(filters?.tipoPeriodo ? { tipo_periodo: filters.tipoPeriodo } : {}),
      },
      include: {
        sucursal: { select: { id: true, nombre: true } },
        almacen: { select: { id: true, nombre: true, tipo: true } },
        usuario: { select: { id: true, nombre: true } },
      },
      orderBy: [{ fecha_cierre: 'desc' }, { created_at: 'desc' }],
    });
  }

  async getCloseDetail(negocioId: string, id: string) {
    const cierre = await this.prisma.cierre_inventario_periodo.findFirst({
      where: { id, negocio_id: negocioId },
      include: {
        sucursal: { select: { id: true, nombre: true } },
        almacen: { select: { id: true, nombre: true, tipo: true } },
        usuario: { select: { id: true, nombre: true } },
        cierre_inventario_detalle: {
          include: {
            producto: { select: { id: true, nombre: true, sku: true } },
            producto_lote: { select: { id: true, codigo_lote: true, fecha_vencimiento: true } },
          },
          orderBy: { valor_total_linea: 'desc' },
        },
      },
    });

    if (!cierre) {
      throw new NotFoundException('Cierre de inventario no encontrado');
    }

    return cierre;
  }

  /**
   * Consulta optimizada: último cierre anterior + movimientos posteriores sin escanear todo el histórico.
   */
  async getFastInventorySummary(negocioId: string, almacenId: string) {
    const almacen = await this.prisma.almacen.findFirst({
      where: {
        id: almacenId,
        deleted_at: null,
        sucursal: { negocio_id: negocioId, deleted_at: null },
      },
    });
    if (!almacen) {
      throw new NotFoundException('Almacén no encontrado en este negocio');
    }

    const lastClose = await this.prisma.cierre_inventario_periodo.findFirst({
      where: { negocio_id: negocioId, almacen_id: almacenId },
      orderBy: { fecha_cierre: 'desc' },
      include: {
        cierre_inventario_detalle: true,
      },
    });

    const sinceDate = lastClose
      ? new Date(lastClose.fecha_cierre.getTime() + 24 * 60 * 60 * 1000)
      : new Date(0);

    const recentMovements = await this.prisma.movimiento.findMany({
      where: {
        negocio_id: negocioId,
        estado: movimiento_estado.COMPLETADO,
        fecha_aplicacion: { gte: sinceDate },
        OR: [{ almacen_origen_id: almacenId }, { almacen_destino_id: almacenId }],
      },
      include: {
        detalle_movimiento: true,
      },
    });

    return {
      almacenId,
      ultimoCierre: lastClose
        ? {
            id: lastClose.id,
            fecha_cierre: lastClose.fecha_cierre,
            total_unidades_cerradas: lastClose.total_unidades_cerradas,
            valor_total_inventario: lastClose.valor_total_inventario,
          }
        : null,
      movimientosPosteriores: recentMovements.length,
    };
  }

  private async executeCloseForBusiness(
    negocioId: string,
    usuarioId: string | null,
    opts: {
      fechaCierre: Date;
      almacenId?: string;
      tipoPeriodo: cierre_inventario_periodo_tipo_periodo;
      observaciones: string;
    },
  ) {
    const almacenes = await this.prisma.almacen.findMany({
      where: {
        deleted_at: null,
        activo: true,
        ...(opts.almacenId ? { id: opts.almacenId } : {}),
        sucursal: { negocio_id: negocioId, deleted_at: null },
      },
      select: { id: true, sucursal_id: true, nombre: true },
    });

    if (opts.almacenId && almacenes.length === 0) {
      throw new NotFoundException('Almacén no encontrado en este negocio');
    }

    const dayStart = new Date(opts.fechaCierre);
    dayStart.setUTCHours(0, 0, 0, 0);
    const dayEnd = new Date(opts.fechaCierre);
    dayEnd.setUTCHours(23, 59, 59, 999);

    const results = [];

    for (const almacen of almacenes) {
      const existing = await this.prisma.cierre_inventario_periodo.findFirst({
        where: {
          almacen_id: almacen.id,
          fecha_cierre: opts.fechaCierre,
          tipo_periodo: opts.tipoPeriodo,
        },
      });

      if (existing) {
        results.push({ almacenId: almacen.id, status: 'ALREADY_CLOSED', cierreId: existing.id });
        continue;
      }

      const cierre = await this.closeSingleWarehouse(negocioId, almacen, usuarioId, {
        fechaCierre: opts.fechaCierre,
        dayStart,
        dayEnd,
        tipoPeriodo: opts.tipoPeriodo,
        observaciones: opts.observaciones,
      });

      results.push({ almacenId: almacen.id, status: 'CLOSED', cierreId: cierre.id });

      this.eventEmitter.emit('snapshots.period.closed', {
        negocioId,
        almacenId: almacen.id,
        cierreId: cierre.id,
        fechaCierre: opts.fechaCierre,
      });
    }

    return {
      fechaCierre: opts.fechaCierre.toISOString().slice(0, 10),
      tipoPeriodo: opts.tipoPeriodo,
      resultados: results,
    };
  }

  private async closeSingleWarehouse(
    negocioId: string,
    almacen: { id: string; sucursal_id: string },
    usuarioId: string | null,
    opts: {
      fechaCierre: Date;
      dayStart: Date;
      dayEnd: Date;
      tipoPeriodo: cierre_inventario_periodo_tipo_periodo;
      observaciones: string;
    },
  ) {
    const previousClose = await this.prisma.cierre_inventario_periodo.findFirst({
      where: {
        almacen_id: almacen.id,
        tipo_periodo: opts.tipoPeriodo,
        fecha_cierre: { lt: opts.fechaCierre },
      },
      orderBy: { fecha_cierre: 'desc' },
      include: { cierre_inventario_detalle: true },
    });

    const prevMap = new Map<string, number>();
    if (previousClose) {
      for (const det of previousClose.cierre_inventario_detalle) {
        prevMap.set(this.keyOf(det.producto_id, det.lote_id), det.cantidad_final);
      }
    }

    const dayMovements = await this.prisma.movimiento.findMany({
      where: {
        negocio_id: negocioId,
        estado: movimiento_estado.COMPLETADO,
        fecha_aplicacion: { gte: opts.dayStart, lte: opts.dayEnd },
        OR: [{ almacen_origen_id: almacen.id }, { almacen_destino_id: almacen.id }],
      },
      include: { detalle_movimiento: true },
    });

    const entradasMap = new Map<string, number>();
    const salidasMap = new Map<string, number>();
    const allKeys = new Set<string>(prevMap.keys());

    for (const mov of dayMovements) {
      for (const line of mov.detalle_movimiento) {
        const key = this.keyOf(line.producto_id, line.lote_id);
        allKeys.add(key);
        if (mov.almacen_destino_id === almacen.id) {
          entradasMap.set(key, (entradasMap.get(key) ?? 0) + line.cantidad);
        }
        if (mov.almacen_origen_id === almacen.id) {
          salidasMap.set(key, (salidasMap.get(key) ?? 0) + line.cantidad);
        }
      }
    }

    const currentStocks = await this.prisma.stock_almacen.findMany({
      where: { almacen_id: almacen.id },
      include: { producto: { select: { id: true, costo_promedio: true } } },
    });

    const stockMap = new Map<string, { cantidad: number; costoPromedio: number }>();
    for (const s of currentStocks) {
      const key = this.keyOf(s.producto_id, s.lote_id);
      allKeys.add(key);
      stockMap.set(key, {
        cantidad: s.cantidad_actual,
        costoPromedio: Number(s.producto.costo_promedio ?? 0),
      });
    }

    const missingProductIds = [...allKeys]
      .filter((k) => !stockMap.has(k))
      .map((k) => k.split('::')[0]);

    const extraProducts =
      missingProductIds.length > 0
        ? await this.prisma.producto.findMany({
            where: { id: { in: missingProductIds } },
            select: { id: true, costo_promedio: true },
          })
        : [];
    const extraCostMap = new Map(extraProducts.map((p) => [p.id, Number(p.costo_promedio ?? 0)]));

    const detailRows: Array<{
      producto_id: string;
      lote_id: string | null;
      cantidad_inicial: number;
      cantidad_entradas: number;
      cantidad_salidas: number;
      cantidad_final: number;
      costo_unitario_corte: number;
      valor_total_linea: number;
    }> = [];

    let totalUnidades = 0;
    let valorTotalInventario = 0;

    for (const key of allKeys) {
      const [productoId, loteRaw] = key.split('::');
      const loteId = loteRaw === 'NULL' ? null : loteRaw;
      const entradas = entradasMap.get(key) ?? 0;
      const salidas = salidasMap.get(key) ?? 0;
      const stockInfo = stockMap.get(key);
      const cantidadFinal =
        stockInfo !== undefined
          ? stockInfo.cantidad
          : (prevMap.get(key) ?? 0) + entradas - salidas;
      const cantidadInicial = previousClose
        ? (prevMap.get(key) ?? 0)
        : cantidadFinal - entradas + salidas;
      const costoUnitario = stockInfo?.costoPromedio ?? extraCostMap.get(productoId) ?? 0;
      const valorLinea = Number((cantidadFinal * costoUnitario).toFixed(4));

      totalUnidades += cantidadFinal;
      valorTotalInventario += valorLinea;

      detailRows.push({
        producto_id: productoId,
        lote_id: loteId,
        cantidad_inicial: cantidadInicial,
        cantidad_entradas: entradas,
        cantidad_salidas: salidas,
        cantidad_final: cantidadFinal,
        costo_unitario_corte: costoUnitario,
        valor_total_linea: valorLinea,
      });
    }

    return this.prisma.cierre_inventario_periodo.create({
      data: {
        negocio_id: negocioId,
        sucursal_id: almacen.sucursal_id,
        almacen_id: almacen.id,
        fecha_cierre: opts.fechaCierre,
        tipo_periodo: opts.tipoPeriodo,
        total_unidades_cerradas: totalUnidades,
        valor_total_inventario: Number(valorTotalInventario.toFixed(4)),
        ejecutado_por_usuario_id: usuarioId,
        observaciones: opts.observaciones,
        cierre_inventario_detalle: {
          create: detailRows,
        },
      },
    });
  }

  private keyOf(productoId: string, loteId: string | null): string {
    return `${productoId}::${loteId ?? 'NULL'}`;
  }

  private toDateOnly(date: Date): Date {
    const d = new Date(date);
    d.setUTCHours(0, 0, 0, 0);
    return d;
  }
}
