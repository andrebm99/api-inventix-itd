import {
  Body,
  Controller,
  Get,
  Param,
  ParseEnumPipe,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { cierre_inventario_periodo_tipo_periodo } from '@prisma/client';
import { CurrentTenant } from '../../core/decorators/current-tenant.decorator.js';
import { TenantAuth } from '../../core/decorators/tenant-auth.decorator.js';
import type { TenantContext } from '../../core/types/auth.types.js';
import { ExecuteCloseDto } from './dto/snapshots.dto.js';
import { SnapshotsService } from './snapshots.service.js';

@ApiTags('Cierres Diarios y Snapshots')
@Controller('cierres')
export class SnapshotsController {
  constructor(private readonly snapshotsService: SnapshotsService) {}

  @TenantAuth('cierre:read')
  @Get()
  @ApiOperation({ summary: 'Listar cierres históricos de inventario' })
  @ApiQuery({ name: 'almacenId', required: false, type: String })
  @ApiQuery({
    name: 'tipoPeriodo',
    required: false,
    enum: cierre_inventario_periodo_tipo_periodo,
  })
  listCloses(
    @CurrentTenant() tenant: TenantContext,
    @Query('almacenId', new ParseUUIDPipe({ optional: true })) almacenId?: string,
    @Query('tipoPeriodo', new ParseEnumPipe(cierre_inventario_periodo_tipo_periodo, { optional: true }))
    tipoPeriodo?: cierre_inventario_periodo_tipo_periodo,
  ) {
    return this.snapshotsService.listCloses(tenant.negocioId, { almacenId, tipoPeriodo });
  }

  @TenantAuth('cierre:read')
  @Get('resumen-rapido/:almacenId')
  @ApiOperation({
    summary: 'Consulta optimizada: último cierre + movimientos posteriores del almacén',
  })
  getFastSummary(
    @CurrentTenant() tenant: TenantContext,
    @Param('almacenId', ParseUUIDPipe) almacenId: string,
  ) {
    return this.snapshotsService.getFastInventorySummary(tenant.negocioId, almacenId);
  }

  @TenantAuth('cierre:read')
  @Get(':id')
  @ApiOperation({ summary: 'Obtener detalle por producto y lote de un cierre de inventario' })
  getCloseDetail(@CurrentTenant() tenant: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.snapshotsService.getCloseDetail(tenant.negocioId, id);
  }

  @TenantAuth('cierre:execute')
  @Post('ejecutar')
  @ApiOperation({
    summary: 'Ejecutar cierre de inventario manualmente (complementa el cron diario de las 23:59)',
  })
  executeManualClose(@CurrentTenant() tenant: TenantContext, @Body() dto: ExecuteCloseDto) {
    return this.snapshotsService.executeManualClose(tenant, dto);
  }
}

