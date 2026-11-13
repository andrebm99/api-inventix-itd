import {
  Body,
  Controller,
  Get,
  Param,
  ParseBoolPipe,
  ParseEnumPipe,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { movimiento_estado, movimiento_tipo } from '@prisma/client';
import { CurrentTenant } from '../../core/decorators/current-tenant.decorator.js';
import { TenantAuth } from '../../core/decorators/tenant-auth.decorator.js';
import type { TenantContext } from '../../core/types/auth.types.js';
import { AnularMovimientoDto, CreateMovimientoDto } from './dto/inventory.dto.js';
import { InventoryService } from './inventory.service.js';

@ApiTags('Inventario, Stock (LPN) y Kárdex')
@Controller()
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  // ==================== STOCK EN TIEMPO REAL ====================

  @TenantAuth('inventario:read')
  @Get('stock/codigo/:codigoExistencia')
  @ApiOperation({ summary: 'Búsqueda directa O(1) de existencia por codigo_existencia (LPN/QR)' })
  findStockByCode(
    @CurrentTenant() tenant: TenantContext,
    @Param('codigoExistencia') codigoExistencia: string,
  ) {
    return this.inventoryService.findStockByCode(tenant.negocioId, codigoExistencia);
  }

  @TenantAuth('inventario:read')
  @Get('stock')
  @ApiOperation({ summary: 'Consultar stock en tiempo real por almacén, sucursal o producto' })
  @ApiQuery({ name: 'almacenId', required: false, type: String })
  @ApiQuery({ name: 'sucursalId', required: false, type: String })
  @ApiQuery({ name: 'productoId', required: false, type: String })
  @ApiQuery({ name: 'soloConStock', required: false, type: Boolean })
  listStock(
    @CurrentTenant() tenant: TenantContext,
    @Query('almacenId', new ParseUUIDPipe({ optional: true })) almacenId?: string,
    @Query('sucursalId', new ParseUUIDPipe({ optional: true })) sucursalId?: string,
    @Query('productoId', new ParseUUIDPipe({ optional: true })) productoId?: string,
    @Query('soloConStock', new ParseBoolPipe({ optional: true })) soloConStock?: boolean,
  ) {
    return this.inventoryService.listStock(tenant.negocioId, {
      almacenId,
      sucursalId,
      productoId,
      soloConStock,
    });
  }

  // ==================== MOVIMIENTOS DE KÁRDEX ====================

  @TenantAuth('inventario:read')
  @Get('movimientos')
  @ApiOperation({ summary: 'Listar movimientos de kárdex con filtros' })
  @ApiQuery({ name: 'tipo', required: false, enum: movimiento_tipo })
  @ApiQuery({ name: 'estado', required: false, enum: movimiento_estado })
  @ApiQuery({ name: 'sucursalId', required: false, type: String })
  @ApiQuery({ name: 'almacenId', required: false, type: String })
  @ApiQuery({ name: 'productoId', required: false, type: String })
  listMovements(
    @CurrentTenant() tenant: TenantContext,
    @Query('tipo', new ParseEnumPipe(movimiento_tipo, { optional: true })) tipo?: movimiento_tipo,
    @Query('estado', new ParseEnumPipe(movimiento_estado, { optional: true }))
    estado?: movimiento_estado,
    @Query('sucursalId', new ParseUUIDPipe({ optional: true })) sucursalId?: string,
    @Query('almacenId', new ParseUUIDPipe({ optional: true })) almacenId?: string,
    @Query('productoId', new ParseUUIDPipe({ optional: true })) productoId?: string,
  ) {
    return this.inventoryService.listMovements(tenant.negocioId, {
      tipo,
      estado,
      sucursalId,
      almacenId,
      productoId,
    });
  }

  @TenantAuth('inventario:read')
  @Get('movimientos/:id')
  @ApiOperation({ summary: 'Obtener detalle de un movimiento de kárdex' })
  getMovement(@CurrentTenant() tenant: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.inventoryService.getMovement(tenant.negocioId, id);
  }

  @TenantAuth('inventario:write')
  @Post('movimientos')
  @ApiOperation({
    summary: 'Registrar movimiento de kárdex (BORRADOR o COMPLETADO inmediato si tiene permiso)',
  })
  createMovement(@CurrentTenant() tenant: TenantContext, @Body() dto: CreateMovimientoDto) {
    return this.inventoryService.createMovement(tenant, dto);
  }

  @TenantAuth('inventario:approve')
  @Post('movimientos/:id/aprobar')
  @ApiOperation({ summary: 'Aprobar un movimiento en estado BORRADOR' })
  approveMovement(@CurrentTenant() tenant: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.inventoryService.approveMovement(tenant, id);
  }

  @TenantAuth('inventario:approve')
  @Post('movimientos/:id/completar')
  @ApiOperation({ summary: 'Aplicar movimiento físicamente al stock y costo promedio' })
  completeMovement(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.inventoryService.completeMovement(tenant, id);
  }

  @TenantAuth('inventario:cancel')
  @Post('movimientos/:id/anular')
  @ApiOperation({
    summary: 'Anular movimiento (si estaba COMPLETADO genera contra-movimiento de reversión)',
  })
  cancelMovement(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AnularMovimientoDto,
  ) {
    return this.inventoryService.cancelMovement(tenant, id, dto);
  }
}

