import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import {
  almacen_tipo,
  clasificacion_abc_clase,
  movimiento_estado,
  movimiento_tipo,
  recomendacion_reposicion_ia_estado,
} from '@prisma/client';
import { PrismaService } from '../../core/database/prisma.service.js';
import type { TenantContext } from '../../core/types/auth.types.js';
import { InventoryService } from '../inventory/inventory.service.js';
import {
  EXPLANATION_GENERATOR_PORT,
  type ExplanationGeneratorPort,
} from './domain/explanation.port.js';
import {
  type DecideRecommendationDto,
  DecisionRecomendacion,
  type RunForecastDto,
} from './dto/ai-assistant.dto.js';

@Injectable()
export class AiAssistantService {
  private readonly logger = new Logger(AiAssistantService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly inventoryService: InventoryService,
    @Inject(EXPLANATION_GENERATOR_PORT)
    private readonly explanationGenerator: ExplanationGeneratorPort,
  ) {}

  /**
   * Ejecución automática diaria a las 00:15 tras el cierre de las 23:59.
   */
  @Cron('15 0 * * *')
  async handleDailyForecastJob(): Promise<void> {
    this.logger.log('Ejecutando análisis predictivo diario de reposición IA');
    const businesses = await this.prisma.negocio.findMany({
      where: { deleted_at: null, activo: true },
      select: { id: true },
    });

    for (const business of businesses) {
      try {
        await this.runAnalysisForBusiness(business.id, {
          ventanaDias: 30,
          diasCoberturaObjetivo: 14,
        });
      } catch (error) {
        this.logger.error(
          `Error en análisis predictivo para negocio ${business.id}`,
          error instanceof Error ? error.stack : String(error),
        );
      }
    }
  }

  async runAnalysis(tenant: TenantContext, dto: RunForecastDto) {
    return this.runAnalysisForBusiness(tenant.negocioId, dto);
  }

  async listRecommendations(
    negocioId: string,
    filters?: { estado?: recomendacion_reposicion_ia_estado; sucursalId?: string },
  ) {
    return this.prisma.recomendacion_reposicion_ia.findMany({
      where: {
        negocio_id: negocioId,
        ...(filters?.estado ? { estado: filters.estado } : {}),
        ...(filters?.sucursalId ? { sucursal_id: filters.sucursalId } : {}),
      },
      include: {
        sucursal: { select: { id: true, nombre: true } },
        producto: {
          select: {
            id: true,
            nombre: true,
            sku: true,
            costo_promedio: true,
            precio_venta_base: true,
            maneja_lotes: true,
          },
        },
        proveedor: {
          select: {
            id: true,
            razon_social: true,
            ruc: true,
            lead_time_promedio_dias: true,
          },
        },
      },
      orderBy: [{ estado: 'asc' }, { fecha_generacion: 'desc' }],
    });
  }

  async listAbcClassification(negocioId: string) {
    return this.prisma.clasificacion_abc.findMany({
      where: { negocio_id: negocioId },
      include: {
        producto: { select: { id: true, nombre: true, sku: true, precio_venta_base: true } },
      },
      orderBy: [{ calculado_el: 'desc' }, { valor_consumo: 'desc' }],
    });
  }

  async listPolicies(negocioId: string, almacenId?: string) {
    return this.prisma.politica_reposicion.findMany({
      where: {
        almacen: {
          deleted_at: null,
          sucursal: { negocio_id: negocioId, deleted_at: null },
          ...(almacenId ? { id: almacenId } : {}),
        },
      },
      include: {
        producto: { select: { id: true, nombre: true, sku: true } },
        almacen: {
          select: {
            id: true,
            nombre: true,
            tipo: true,
            sucursal: { select: { id: true, nombre: true } },
          },
        },
      },
      orderBy: { calculado_el: 'desc' },
    });
  }

  async decideRecommendation(tenant: TenantContext, id: string, dto: DecideRecommendationDto) {
    const rec = await this.prisma.recomendacion_reposicion_ia.findFirst({
      where: { id, negocio_id: tenant.negocioId },
      include: {
        producto: true,
      },
    });

    if (!rec) {
      throw new NotFoundException('Recomendación de reposición no encontrada');
    }

    if (rec.estado !== recomendacion_reposicion_ia_estado.PENDIENTE) {
      throw new BadRequestException(
        `La recomendación ya fue atendida en estado ${rec.estado}`,
      );
    }

    const nextStatus =
      dto.decision === DecisionRecomendacion.ACEPTADA
        ? recomendacion_reposicion_ia_estado.ACEPTADA
        : recomendacion_reposicion_ia_estado.DESCARTADA;

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.recomendacion_reposicion_ia.update({
        where: { id },
        data: {
          estado: nextStatus,
          fecha_respuesta: new Date(),
        },
      });

      if (dto.decision === DecisionRecomendacion.DESCARTADA) {
        return {
          recomendacion: updated,
          borradorCompraCreado: null,
          aviso: null,
        };
      }

      if (rec.producto.maneja_lotes) {
        return {
          recomendacion: updated,
          borradorCompraCreado: null,
          aviso:
            'Recomendación aceptada. El producto maneja lotes; registra el lote de ingreso al crear el movimiento ENTRADA_COMPRA.',
        };
      }

      let targetAlmacenId = dto.almacenDestinoId;
      if (targetAlmacenId) {
        const alm = await tx.almacen.findFirst({
          where: {
            id: targetAlmacenId,
            deleted_at: null,
            sucursal: { id: rec.sucursal_id, negocio_id: tenant.negocioId, deleted_at: null },
          },
        });
        if (!alm) {
          throw new NotFoundException(
            'El almacén destino no pertenece a la sucursal de esta recomendación',
          );
        }
      } else {
        const defaultWarehouse = await tx.almacen.findFirst({
          where: {
            sucursal_id: rec.sucursal_id,
            deleted_at: null,
            activo: true,
            tipo: { in: [almacen_tipo.RECEPCION, almacen_tipo.PRINCIPAL] },
          },
          orderBy: { created_at: 'asc' },
        });
        targetAlmacenId = defaultWarehouse?.id;
      }

      if (!targetAlmacenId) {
        return {
          recomendacion: updated,
          borradorCompraCreado: null,
          aviso: 'No se encontró almacén activo en la sucursal para generar borrador automático',
        };
      }

      let unitCost = Number(rec.producto.costo_promedio ?? 0);
      if (rec.proveedor_sugerido_id) {
        const agreement = await tx.producto_proveedor.findUnique({
          where: {
            producto_id_proveedor_id: {
              producto_id: rec.producto_id,
              proveedor_id: rec.proveedor_sugerido_id,
            },
          },
        });
        if (agreement) {
          unitCost = Number(agreement.costo_compra);
        }
      }

      const cantidad = dto.cantidadAjustada ?? rec.cantidad_sugerida_comprar;
      const borrador = await this.inventoryService.createDraftMovementInTx(tx, {
        negocioId: tenant.negocioId,
        sucursalId: rec.sucursal_id,
        usuarioId: tenant.usuarioId,
        tipo: movimiento_tipo.ENTRADA_COMPRA,
        almacenOrigenId: null,
        almacenDestinoId: targetAlmacenId,
        proveedorId: rec.proveedor_sugerido_id,
        motivo: `Reposición sugerida por IA (${rec.id.slice(0, 8)})`,
        codigoTransferencia: null,
        detalles: [
          {
            productoId: rec.producto_id,
            loteId: null,
            cantidad,
            costoUnitario: unitCost,
            descuentoUnitario: 0,
          },
        ],
      });

      return {
        recomendacion: updated,
        borradorCompraCreado: borrador,
        aviso: null,
      };
    });
  }

  // ==================== MOTOR DE ANÁLISIS PREDICTIVO ====================

  private async runAnalysisForBusiness(negocioId: string, dto: RunForecastDto) {
    const ventanaDias = dto.ventanaDias ?? 30;
    const diasCoberturaObjetivo = dto.diasCoberturaObjetivo ?? 14;

    const periodoFin = new Date();
    const periodoInicio = new Date();
    periodoInicio.setDate(periodoFin.getDate() - ventanaDias);

    const productos = await this.prisma.producto.findMany({
      where: { negocio_id: negocioId, deleted_at: null, activo: true },
      include: {
        producto_proveedor: {
          where: { proveedor: { deleted_at: null, activo: true } },
          include: {
            proveedor: {
              select: { id: true, razon_social: true, lead_time_promedio_dias: true },
            },
          },
        },
      },
    });

    if (productos.length === 0) {
      return {
        clasificacionesAbcActualizadas: 0,
        politicasActualizadas: 0,
        recomendacionesGeneradas: [],
      };
    }

    // 1. Obtener salidas recientes por sucursal y producto (desde movimientos SALIDA_VENTA completados)
    const saleMovements = await this.prisma.movimiento.findMany({
      where: {
        negocio_id: negocioId,
        tipo: movimiento_tipo.SALIDA_VENTA,
        estado: movimiento_estado.COMPLETADO,
        fecha_aplicacion: { gte: periodoInicio },
        ...(dto.sucursalId ? { sucursal_id: dto.sucursalId } : {}),
      },
      include: {
        detalle_movimiento: true,
      },
    });

    // También consultar snapshots de cierre diario recientes para enriquecer densidad histórica
    const recentSnapshots = await this.prisma.cierre_inventario_periodo.findMany({
      where: {
        negocio_id: negocioId,
        fecha_cierre: { gte: periodoInicio },
        ...(dto.sucursalId ? { sucursal_id: dto.sucursalId } : {}),
      },
      select: {
        sucursal_id: true,
        fecha_cierre: true,
      },
    });

    const totalOutByProduct = new Map<string, number>();
    const outByBranchProduct = new Map<string, number>();
    const activeDaysByBranchProduct = new Map<string, Set<string>>();

    for (const mov of saleMovements) {
      const dayKey = (mov.fecha_aplicacion ?? mov.fecha_registro ?? new Date())
        .toISOString()
        .slice(0, 10);
      for (const det of mov.detalle_movimiento) {
        totalOutByProduct.set(
          det.producto_id,
          (totalOutByProduct.get(det.producto_id) ?? 0) + det.cantidad,
        );
        const bpKey = `${mov.sucursal_id}::${det.producto_id}`;
        outByBranchProduct.set(bpKey, (outByBranchProduct.get(bpKey) ?? 0) + det.cantidad);

        const daysSet = activeDaysByBranchProduct.get(bpKey) ?? new Set<string>();
        daysSet.add(dayKey);
        activeDaysByBranchProduct.set(bpKey, daysSet);
      }
    }

    // 2. Clasificación ABC por valor de consumo
    const abcItems = productos
      .map((p) => {
        const qty = totalOutByProduct.get(p.id) ?? 0;
        const valorConsumo = Number((qty * Number(p.precio_venta_base)).toFixed(4));
        return { productoId: p.id, valorConsumo };
      })
      .sort((a, b) => b.valorConsumo - a.valorConsumo);

    const totalValorConsumo = abcItems.reduce((acc, item) => acc + item.valorConsumo, 0);
    const abcClassMap = new Map<string, clasificacion_abc_clase>();
    let cumulative = 0;

    await this.prisma.clasificacion_abc.deleteMany({
      where: { negocio_id: negocioId },
    });

    const abcToCreate = abcItems.map((item) => {
      cumulative += item.valorConsumo;
      const pctIndividual =
        totalValorConsumo > 0 ? Number(((item.valorConsumo / totalValorConsumo) * 100).toFixed(2)) : 0;
      const pctCum = totalValorConsumo > 0 ? (cumulative / totalValorConsumo) * 100 : 100;

      let clase: clasificacion_abc_clase = clasificacion_abc_clase.C;
      if (item.valorConsumo > 0) {
        if (pctCum <= 80) {
          clase = clasificacion_abc_clase.A;
        } else if (pctCum <= 95) {
          clase = clasificacion_abc_clase.B;
        }
      }
      abcClassMap.set(item.productoId, clase);

      return {
        negocio_id: negocioId,
        producto_id: item.productoId,
        periodo_inicio: periodoInicio,
        periodo_fin: periodoFin,
        clase,
        valor_consumo: item.valorConsumo,
        porcentaje_participacion: pctIndividual,
      };
    });

    if (abcToCreate.length > 0) {
      await this.prisma.clasificacion_abc.createMany({ data: abcToCreate });
    }

    // 3. Evaluar políticas ROP y generar recomendaciones por sucursal
    const sucursales = await this.prisma.sucursal.findMany({
      where: {
        negocio_id: negocioId,
        deleted_at: null,
        activo: true,
        ...(dto.sucursalId ? { id: dto.sucursalId } : {}),
      },
      include: {
        almacen: {
          where: { deleted_at: null, activo: true },
        },
      },
    });

    let politicasActualizadas = 0;
    const recomendacionesGeneradas = [];

    for (const sucursal of sucursales) {
      if (sucursal.almacen.length === 0) {
        continue;
      }

      const almacenIds = sucursal.almacen.map((a) => a.id);
      const branchStocks = await this.prisma.stock_almacen.findMany({
        where: { almacen_id: { in: almacenIds } },
      });

      const stockByProduct = new Map<string, number>();
      for (const st of branchStocks) {
        const disp = Math.max(0, st.cantidad_actual - st.cantidad_reservada);
        stockByProduct.set(st.producto_id, (stockByProduct.get(st.producto_id) ?? 0) + disp);
      }

      const branchSnapshotDays = new Set(
        recentSnapshots
          .filter((s) => s.sucursal_id === sucursal.id)
          .map((s) => s.fecha_cierre.toISOString().slice(0, 10)),
      ).size;

      for (const producto of productos) {
        const bpKey = `${sucursal.id}::${producto.id}`;
        const totalSold = outByBranchProduct.get(bpKey) ?? 0;
        const avgDailyDemand = totalSold / ventanaDias;

        // Elegir proveedor óptimo: preferente > menor lead time > menor costo
        const sortedSuppliers = [...producto.producto_proveedor].sort((a, b) => {
          if (Boolean(a.es_preferente) !== Boolean(b.es_preferente)) {
            return a.es_preferente ? -1 : 1;
          }
          const ltA = a.lead_time_dias ?? a.proveedor.lead_time_promedio_dias ?? 3;
          const ltB = b.lead_time_dias ?? b.proveedor.lead_time_promedio_dias ?? 3;
          if (ltA !== ltB) return ltA - ltB;
          return Number(a.costo_compra) - Number(b.costo_compra);
        });

        const bestAgreement = sortedSuppliers[0] ?? null;
        const leadTimeDias =
          bestAgreement?.lead_time_dias ??
          bestAgreement?.proveedor.lead_time_promedio_dias ??
          3;

        const stockSeguridad = Math.ceil(avgDailyDemand * Math.max(1, Math.round(leadTimeDias * 0.5)));
        const puntoReorden = Math.ceil(avgDailyDemand * leadTimeDias) + stockSeguridad;
        const stockMaximo = puntoReorden + Math.ceil(avgDailyDemand * diasCoberturaObjetivo);

        // Actualizar política en el almacén principal (o primero) de la sucursal
        const primaryWarehouse =
          sucursal.almacen.find((a) => a.tipo === almacen_tipo.PRINCIPAL) ?? sucursal.almacen[0];

        await this.prisma.politica_reposicion.upsert({
          where: {
            producto_id_almacen_id: {
              producto_id: producto.id,
              almacen_id: primaryWarehouse.id,
            },
          },
          update: {
            stock_seguridad: stockSeguridad,
            punto_reorden: puntoReorden,
            stock_maximo: stockMaximo,
            calculado_el: new Date(),
          },
          create: {
            producto_id: producto.id,
            almacen_id: primaryWarehouse.id,
            stock_seguridad: stockSeguridad,
            punto_reorden: puntoReorden,
            stock_maximo: stockMaximo,
          },
        });
        politicasActualizadas += 1;

        const stockActual = stockByProduct.get(producto.id) ?? 0;
        if (avgDailyDemand <= 0 || stockActual > puntoReorden) {
          continue;
        }

        const existingPending = await this.prisma.recomendacion_reposicion_ia.findFirst({
          where: {
            negocio_id: negocioId,
            sucursal_id: sucursal.id,
            producto_id: producto.id,
            estado: recomendacion_reposicion_ia_estado.PENDIENTE,
          },
        });

        if (existingPending) {
          continue;
        }

        const demandaProyectada = Math.ceil(
          avgDailyDemand * (leadTimeDias + diasCoberturaObjetivo),
        );
        const cantidadSugerida = Math.max(1, stockMaximo - stockActual);
        const activeSaleDays = activeDaysByBranchProduct.get(bpKey)?.size ?? 0;
        const dataPoints = activeSaleDays + branchSnapshotDays;

        let confianzaModelo = 0.68;
        if (dataPoints >= 15) confianzaModelo = 0.92;
        else if (dataPoints >= 6) confianzaModelo = 0.82;

        const diasCoberturaActual = avgDailyDemand > 0 ? stockActual / avgDailyDemand : 0;
        const claseAbc = abcClassMap.get(producto.id) ?? clasificacion_abc_clase.C;

        const { explanation } = await this.explanationGenerator.generateReplenishmentExplanation({
          productoNombre: producto.nombre,
          sku: producto.sku,
          sucursalNombre: sucursal.nombre,
          claseAbc,
          stockActual,
          demandaDiariaPromedio: avgDailyDemand,
          diasCoberturaActual,
          puntoReorden,
          stockSeguridad,
          cantidadSugerida,
          proveedorNombre: bestAgreement?.proveedor.razon_social ?? null,
          leadTimeDias,
          costoUnitarioReferencia: bestAgreement ? Number(bestAgreement.costo_compra) : null,
        });

        const rec = await this.prisma.recomendacion_reposicion_ia.create({
          data: {
            negocio_id: negocioId,
            sucursal_id: sucursal.id,
            producto_id: producto.id,
            proveedor_sugerido_id: bestAgreement?.proveedor_id ?? null,
            stock_actual_evaluado: stockActual,
            demanda_proyectada_proximos_dias: demandaProyectada,
            cantidad_sugerida_comprar: cantidadSugerida,
            confianza_modelo: confianzaModelo,
            motivo_explicacion: explanation,
            estado: recomendacion_reposicion_ia_estado.PENDIENTE,
          },
          include: {
            producto: { select: { id: true, nombre: true, sku: true } },
            proveedor: { select: { id: true, razon_social: true } },
          },
        });

        recomendacionesGeneradas.push(rec);
      }
    }

    return {
      clasificacionesAbcActualizadas: abcToCreate.length,
      politicasActualizadas,
      recomendacionesGeneradas,
    };
  }
}
