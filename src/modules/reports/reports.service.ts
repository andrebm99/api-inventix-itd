import { Injectable, NotFoundException } from '@nestjs/common';
import {
  almacen_tipo,
  movimiento_estado,
  movimiento_tipo,
  producto_lote_estado,
  recomendacion_reposicion_ia_estado,
  venta_estado,
} from '@prisma/client';
import { PrismaService } from '../../core/database/prisma.service.js';
import type {
  KardexFilterDto,
  MermasReportFilterDto,
  VentasReportFilterDto,
} from './dto/reports.dto.js';

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  // ==================== DASHBOARD RESUMEN ====================

  async getDashboardSummary(negocioId: string) {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const [
      totalProductosActivos,
      stocks,
      ventasHoyAgg,
      lotesPorVencer,
      lotesVencidos,
      recomPendientes,
    ] = await Promise.all([
      this.prisma.producto.count({
        where: { negocio_id: negocioId, deleted_at: null, activo: true },
      }),
      this.prisma.stock_almacen.findMany({
        where: {
          almacen: {
            deleted_at: null,
            sucursal: { negocio_id: negocioId, deleted_at: null },
          },
          producto: {
            deleted_at: null,
            activo: true,
          },
        },
        select: {
          producto_id: true,
          cantidad_actual: true,
          cantidad_reservada: true,
          producto: { select: { costo_promedio: true } },
        },
      }),
      this.prisma.venta.aggregate({
        where: {
          negocio_id: negocioId,
          estado: venta_estado.EMITIDA,
          fecha_venta: { gte: todayStart },
        },
        _sum: { total: true },
        _count: { id: true },
      }),
      this.prisma.producto_lote.count({
        where: {
          producto: { negocio_id: negocioId, deleted_at: null },
          estado: producto_lote_estado.POR_VENCER,
        },
      }),
      this.prisma.producto_lote.count({
        where: {
          producto: { negocio_id: negocioId, deleted_at: null },
          estado: producto_lote_estado.VENCIDO,
        },
      }),
      this.prisma.recomendacion_reposicion_ia.count({
        where: {
          negocio_id: negocioId,
          estado: recomendacion_reposicion_ia_estado.PENDIENTE,
        },
      }),
    ]);

    let totalUnidadesFisicas = 0;
    let valorTotalInventario = 0;
    const stockByProduct = new Map<string, number>();

    for (const s of stocks) {
      totalUnidadesFisicas += s.cantidad_actual;
      const unitCost = Number(s.producto.costo_promedio ?? 0);
      valorTotalInventario += Math.max(0, s.cantidad_actual) * unitCost;

      const current = stockByProduct.get(s.producto_id) ?? 0;
      stockByProduct.set(s.producto_id, current + s.cantidad_actual);
    }

    const policies = await this.prisma.politica_reposicion.findMany({
      where: {
        producto: { negocio_id: negocioId, deleted_at: null, activo: true },
      },
      select: { producto_id: true, punto_reorden: true },
    });
    const ropByProduct = new Map<string, number>();
    for (const p of policies) {
      ropByProduct.set(p.producto_id, p.punto_reorden ?? 0);
    }

    let productosSinStock = 0;
    let productosStockBajo = 0;

    const allActiveProductIds = await this.prisma.producto.findMany({
      where: { negocio_id: negocioId, deleted_at: null, activo: true },
      select: { id: true },
    });

    for (const p of allActiveProductIds) {
      const stock = stockByProduct.get(p.id) ?? 0;
      const rop = ropByProduct.get(p.id) ?? 0;

      if (stock <= 0) {
        productosSinStock += 1;
      } else if (stock <= rop) {
        productosStockBajo += 1;
      }
    }

    // Top 5 productos vendidos en los últimos 30 días
    const topSalesLines = await this.prisma.detalle_venta.findMany({
      where: {
        venta: {
          negocio_id: negocioId,
          estado: venta_estado.EMITIDA,
          fecha_venta: { gte: thirtyDaysAgo },
        },
      },
      select: {
        producto_id: true,
        cantidad: true,
        subtotal_linea: true,
        producto: { select: { nombre: true, sku: true } },
      },
    });

    const topMap = new Map<
      string,
      { nombre: string; sku: string | null; unidadesVendidas: number; montoTotal: number }
    >();

    for (const line of topSalesLines) {
      const prev = topMap.get(line.producto_id) ?? {
        nombre: line.producto.nombre,
        sku: line.producto.sku,
        unidadesVendidas: 0,
        montoTotal: 0,
      };
      prev.unidadesVendidas += line.cantidad;
      prev.montoTotal += Number(line.subtotal_linea);
      topMap.set(line.producto_id, prev);
    }

    const topProductos = [...topMap.entries()]
      .map(([productoId, data]) => ({
        productoId,
        nombre: data.nombre,
        sku: data.sku,
        unidadesVendidas: data.unidadesVendidas,
        montoTotal: Number(data.montoTotal.toFixed(2)),
      }))
      .sort((a, b) => b.unidadesVendidas - a.unidadesVendidas)
      .slice(0, 5);

    return {
      inventario: {
        totalProductosActivos,
        totalUnidadesFisicas,
        valorTotalInventario: Number(valorTotalInventario.toFixed(2)),
      },
      ventasHoy: {
        totalVendido: Number((ventasHoyAgg._sum.total ?? 0).toFixed(2)),
        cantidadComprobantes: ventasHoyAgg._count.id,
      },
      alertas: {
        productosSinStock,
        productosStockBajo,
        lotesPorVencer,
        lotesVencidos,
        recomendacionesPendientes: recomPendientes,
      },
      topProductosMasVendidos: topProductos,
    };
  }

  // ==================== KÁRDEX CRONOLÓGICO VALORIZADO ====================

  async getChronologicalKardex(
    negocioId: string,
    productoId: string,
    filter?: KardexFilterDto,
  ) {
    const producto = await this.prisma.producto.findFirst({
      where: { id: productoId, negocio_id: negocioId, deleted_at: null },
      select: { id: true, nombre: true, sku: true, costo_promedio: true, precio_venta_base: true },
    });

    if (!producto) {
      throw new NotFoundException('Producto no encontrado en este negocio');
    }

    const startDate = filter?.fechaInicio ? new Date(filter.fechaInicio) : undefined;
    const endDate = filter?.fechaFin ? new Date(`${filter.fechaFin}T23:59:59.999Z`) : undefined;

    const movements = await this.prisma.movimiento.findMany({
      where: {
        negocio_id: negocioId,
        estado: movimiento_estado.COMPLETADO,
        detalle_movimiento: {
          some: { producto_id: productoId },
        },
        ...(filter?.almacenId
          ? {
              OR: [
                { almacen_origen_id: filter.almacenId },
                { almacen_destino_id: filter.almacenId },
              ],
            }
          : {}),
        ...(startDate || endDate
          ? {
              fecha_aplicacion: {
                ...(startDate ? { gte: startDate } : {}),
                ...(endDate ? { lte: endDate } : {}),
              },
            }
          : {}),
      },
      include: {
        sucursal: { select: { id: true, nombre: true } },
        almacen_movimiento_almacen_origen_idToalmacen: { select: { id: true, nombre: true } },
        almacen_movimiento_almacen_destino_idToalmacen: { select: { id: true, nombre: true } },
        proveedor: { select: { id: true, razon_social: true } },
        detalle_movimiento: {
          where: { producto_id: productoId },
          include: {
            producto_lote: { select: { id: true, codigo_lote: true } },
          },
        },
      },
      orderBy: [{ fecha_aplicacion: 'asc' }, { fecha_registro: 'asc' }],
    });

    let runningStock = 0;
    let runningAverageCost = Number(producto.costo_promedio ?? 0);
    const lineasKardex = [];

    for (const mov of movements) {
      for (const line of mov.detalle_movimiento) {
        const isEntry = mov.almacen_destino_id !== null && mov.almacen_origen_id === null;
        const isExit = mov.almacen_origen_id !== null && mov.almacen_destino_id === null;
        const isTransfer = mov.almacen_origen_id !== null && mov.almacen_destino_id !== null;

        let entradaCantidad = 0;
        let entradaCostoUnitario = 0;
        let salidaCantidad = 0;
        let salidaCostoUnitario = 0;

        if (filter?.almacenId) {
          if (mov.almacen_destino_id === filter.almacenId) {
            entradaCantidad = line.cantidad;
            entradaCostoUnitario = Number(line.costo_unitario);
          } else if (mov.almacen_origen_id === filter.almacenId) {
            salidaCantidad = line.cantidad;
            salidaCostoUnitario = runningAverageCost;
          }
        } else {
          if (isEntry) {
            entradaCantidad = line.cantidad;
            entradaCostoUnitario = Number(line.costo_unitario);
          } else if (isExit) {
            salidaCantidad = line.cantidad;
            salidaCostoUnitario = runningAverageCost;
          } else if (isTransfer) {
            // Traslado interno global: neutro en cantidad total del negocio
            entradaCantidad = line.cantidad;
            entradaCostoUnitario = runningAverageCost;
            salidaCantidad = line.cantidad;
            salidaCostoUnitario = runningAverageCost;
          }
        }

        const prevStock = runningStock;
        if (entradaCantidad > 0 && !isTransfer) {
          const totalNewUnits = prevStock + entradaCantidad;
          if (totalNewUnits > 0) {
            runningAverageCost =
              (prevStock * runningAverageCost + entradaCantidad * entradaCostoUnitario) /
              totalNewUnits;
          }
          runningStock += entradaCantidad;
        }

        if (salidaCantidad > 0 && !isTransfer) {
          runningStock = Math.max(0, runningStock - salidaCantidad);
        }

        const saldoValorizado = runningStock * runningAverageCost;

        lineasKardex.push({
          movimientoId: mov.id,
          fecha: mov.fecha_aplicacion ?? mov.fecha_registro,
          tipo: mov.tipo,
          motivo: mov.motivo,
          codigoTransferencia: mov.codigo_transferencia,
          sucursal: mov.sucursal.nombre,
          almacenOrigen: mov.almacen_movimiento_almacen_origen_idToalmacen?.nombre ?? null,
          almacenDestino: mov.almacen_movimiento_almacen_destino_idToalmacen?.nombre ?? null,
          proveedor: mov.proveedor?.razon_social ?? null,
          lote: line.producto_lote?.codigo_lote ?? null,
          entrada: {
            cantidad: entradaCantidad,
            costoUnitario: Number(entradaCostoUnitario.toFixed(4)),
            total: Number((entradaCantidad * entradaCostoUnitario).toFixed(2)),
          },
          salida: {
            cantidad: salidaCantidad,
            costoUnitario: Number(salidaCostoUnitario.toFixed(4)),
            total: Number((salidaCantidad * salidaCostoUnitario).toFixed(2)),
          },
          saldo: {
            cantidad: runningStock,
            costoPromedio: Number(runningAverageCost.toFixed(4)),
            valorTotal: Number(saldoValorizado.toFixed(2)),
          },
        });
      }
    }

    return {
      producto: {
        id: producto.id,
        nombre: producto.nombre,
        sku: producto.sku,
        costoPromedioActual: Number(producto.costo_promedio ?? 0),
        precioVentaBase: Number(producto.precio_venta_base),
      },
      filtroAplicado: filter ?? {},
      totalMovimientos: lineasKardex.length,
      lineasKardex,
    };
  }

  // ==================== REPORTE DE VENTAS ====================

  async getSalesReport(negocioId: string, filter?: VentasReportFilterDto) {
    const startDate = filter?.fechaInicio ? new Date(filter.fechaInicio) : undefined;
    const endDate = filter?.fechaFin ? new Date(`${filter.fechaFin}T23:59:59.999Z`) : undefined;

    const ventas = await this.prisma.venta.findMany({
      where: {
        negocio_id: negocioId,
        estado: venta_estado.EMITIDA,
        ...(filter?.sucursalId ? { sucursal_id: filter.sucursalId } : {}),
        ...(startDate || endDate
          ? {
              fecha_venta: {
                ...(startDate ? { gte: startDate } : {}),
                ...(endDate ? { lte: endDate } : {}),
              },
            }
          : {}),
      },
      include: {
        sucursal: { select: { id: true, nombre: true } },
        almacen: { select: { id: true, nombre: true } },
        pago_venta: {
          include: { metodo_pago: { select: { id: true, nombre: true } } },
        },
      },
      orderBy: { fecha_venta: 'desc' },
    });

    let totalSubtotal = 0;
    let totalImpuesto = 0;
    let totalDescuento = 0;
    let totalFacturado = 0;
    const pagosPorMetodo = new Map<string, { metodo: string; monto: number; cantidad: number }>();

    for (const v of ventas) {
      totalSubtotal += Number(v.subtotal);
      totalImpuesto += Number(v.impuesto);
      totalDescuento += Number(v.descuento_global ?? 0);
      totalFacturado += Number(v.total);

      for (const p of v.pago_venta) {
        const metodoNombre = p.metodo_pago.nombre;
        const prev = pagosPorMetodo.get(metodoNombre) ?? {
          metodo: metodoNombre,
          monto: 0,
          cantidad: 0,
        };
        prev.monto += Number(p.monto);
        prev.cantidad += 1;
        pagosPorMetodo.set(metodoNombre, prev);
      }
    }

    return {
      totales: {
        cantidadVentas: ventas.length,
        subtotal: Number(totalSubtotal.toFixed(2)),
        impuesto: Number(totalImpuesto.toFixed(2)),
        descuento: Number(totalDescuento.toFixed(2)),
        totalFacturado: Number(totalFacturado.toFixed(2)),
      },
      desglosePorMetodoPago: [...pagosPorMetodo.values()].map((p) => ({
        ...p,
        monto: Number(p.monto.toFixed(2)),
      })),
      ventas: ventas.map((v) => ({
        id: v.id,
        numeroComprobante: v.numero_comprobante,
        fecha: v.fecha_venta,
        sucursal: v.sucursal.nombre,
        almacen: v.almacen.nombre,
        total: Number(v.total),
      })),
    };
  }

  // ==================== REPORTE DE MERMAS Y CUARENTENA ====================

  async getWasteReport(negocioId: string, filter?: MermasReportFilterDto) {
    const startDate = filter?.fechaInicio ? new Date(filter.fechaInicio) : undefined;
    const endDate = filter?.fechaFin ? new Date(`${filter.fechaFin}T23:59:59.999Z`) : undefined;

    const mermas = await this.prisma.movimiento.findMany({
      where: {
        negocio_id: negocioId,
        estado: movimiento_estado.COMPLETADO,
        OR: [
          { tipo: movimiento_tipo.SALIDA_MERMA },
          { almacen_movimiento_almacen_destino_idToalmacen: { tipo: almacen_tipo.MERMAS_CUARENTENA } },
        ],
        ...(filter?.sucursalId ? { sucursal_id: filter.sucursalId } : {}),
        ...(startDate || endDate
          ? {
              fecha_aplicacion: {
                ...(startDate ? { gte: startDate } : {}),
                ...(endDate ? { lte: endDate } : {}),
              },
            }
          : {}),
      },
      include: {
        sucursal: { select: { id: true, nombre: true } },
        almacen_movimiento_almacen_origen_idToalmacen: { select: { id: true, nombre: true, tipo: true } },
        almacen_movimiento_almacen_destino_idToalmacen: { select: { id: true, nombre: true, tipo: true } },
        usuario: { select: { id: true, nombre: true } },
        detalle_movimiento: {
          include: {
            producto: { select: { id: true, nombre: true, sku: true, costo_promedio: true } },
            producto_lote: { select: { id: true, codigo_lote: true, fecha_vencimiento: true } },
          },
        },
      },
      orderBy: { fecha_aplicacion: 'desc' },
    });

    let totalUnidadesMermadas = 0;
    let valorTotalPerdida = 0;

    const detalle = [];
    for (const mov of mermas) {
      for (const line of mov.detalle_movimiento) {
        const costoUnit = Number(line.costo_unitario || line.producto.costo_promedio || 0);
        const valorPerdida = line.cantidad * costoUnit;

        totalUnidadesMermadas += line.cantidad;
        valorTotalPerdida += valorPerdida;

        detalle.push({
          movimientoId: mov.id,
          fecha: mov.fecha_aplicacion ?? mov.fecha_registro,
          tipo: mov.tipo,
          motivo: mov.motivo,
          sucursal: mov.sucursal.nombre,
          almacenOrigen: mov.almacen_movimiento_almacen_origen_idToalmacen?.nombre ?? null,
          almacenDestino: mov.almacen_movimiento_almacen_destino_idToalmacen?.nombre ?? null,
          responsable: mov.usuario.nombre,
          producto: {
            id: line.producto.id,
            nombre: line.producto.nombre,
            sku: line.producto.sku,
          },
          lote: line.producto_lote?.codigo_lote ?? null,
          fechaVencimientoLote: line.producto_lote?.fecha_vencimiento ?? null,
          cantidad: line.cantidad,
          costoUnitario: Number(costoUnit.toFixed(4)),
          valorPerdida: Number(valorPerdida.toFixed(2)),
        });
      }
    }

    return {
      resumen: {
        totalMovimientos: mermas.length,
        totalUnidadesMermadas,
        valorTotalPerdida: Number(valorTotalPerdida.toFixed(2)),
      },
      detalle,
    };
  }
}

