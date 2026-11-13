import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentTenant } from '../../core/decorators/current-tenant.decorator.js';
import { TenantAuth } from '../../core/decorators/tenant-auth.decorator.js';
import type { TenantContext } from '../../core/types/auth.types.js';
import {
  KardexFilterDto,
  MermasReportFilterDto,
  VentasReportFilterDto,
} from './dto/reports.dto.js';
import { ReportsService } from './reports.service.js';

@ApiTags('Reportes y Dashboard')
@Controller('reportes')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @TenantAuth('reporte:read')
  @Get('dashboard')
  @ApiOperation({
    summary: 'Dashboard ejecutivo: valorización de stock, ventas de hoy, alertas y top productos',
  })
  getDashboard(@CurrentTenant() tenant: TenantContext) {
    return this.reportsService.getDashboardSummary(tenant.negocioId);
  }

  @TenantAuth('reporte:read')
  @Get('kardex/:productoId')
  @ApiOperation({
    summary:
      'Kárdex cronológico valorizado: entradas, salidas, costo promedio móvil y saldo acumulado',
  })
  getKardex(
    @CurrentTenant() tenant: TenantContext,
    @Param('productoId', ParseUUIDPipe) productoId: string,
    @Query() filter: KardexFilterDto,
  ) {
    return this.reportsService.getChronologicalKardex(tenant.negocioId, productoId, filter);
  }

  @TenantAuth('reporte:read')
  @Get('ventas')
  @ApiOperation({
    summary: 'Reporte consolidado de ventas y arqueo por método de pago (Efectivo, Tarjeta, etc.)',
  })
  getSalesReport(@CurrentTenant() tenant: TenantContext, @Query() filter: VentasReportFilterDto) {
    return this.reportsService.getSalesReport(tenant.negocioId, filter);
  }

  @TenantAuth('reporte:read')
  @Get('mermas')
  @ApiOperation({
    summary: 'Reporte de pérdidas y mermas por rotura o vencimiento en almacén de cuarentena',
  })
  getWasteReport(@CurrentTenant() tenant: TenantContext, @Query() filter: MermasReportFilterDto) {
    return this.reportsService.getWasteReport(tenant.negocioId, filter);
  }
}

