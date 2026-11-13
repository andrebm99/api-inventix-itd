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
import { venta_estado } from '@prisma/client';
import { CurrentTenant } from '../../core/decorators/current-tenant.decorator.js';
import { TenantAuth } from '../../core/decorators/tenant-auth.decorator.js';
import type { TenantContext } from '../../core/types/auth.types.js';
import { AnularVentaDto, CreateVentaDto } from './dto/sales.dto.js';
import { SalesService } from './sales.service.js';

@ApiTags('Ventas y POS')
@Controller()
export class SalesController {
  constructor(private readonly salesService: SalesService) {}

  @TenantAuth('venta:read')
  @Get('metodos-pago')
  @ApiOperation({ summary: 'Listar métodos de pago activos' })
  listPaymentMethods() {
    return this.salesService.listPaymentMethods();
  }

  @TenantAuth('venta:read')
  @Get('ventas')
  @ApiOperation({ summary: 'Listar ventas del negocio' })
  @ApiQuery({ name: 'sucursalId', required: false, type: String })
  @ApiQuery({ name: 'estado', required: false, enum: venta_estado })
  listSales(
    @CurrentTenant() tenant: TenantContext,
    @Query('sucursalId', new ParseUUIDPipe({ optional: true })) sucursalId?: string,
    @Query('estado', new ParseEnumPipe(venta_estado, { optional: true })) estado?: venta_estado,
  ) {
    return this.salesService.listSales(tenant.negocioId, { sucursalId, estado });
  }

  @TenantAuth('venta:read')
  @Get('ventas/:id')
  @ApiOperation({ summary: 'Obtener detalle de una venta con pagos y movimiento de kárdex' })
  getSale(@CurrentTenant() tenant: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.salesService.getSale(tenant.negocioId, id);
  }

  @TenantAuth('venta:create')
  @Post('ventas')
  @ApiOperation({
    summary: 'Registrar venta (genera movimiento SALIDA_VENTA y descuenta stock automáticamente)',
  })
  createSale(@CurrentTenant() tenant: TenantContext, @Body() dto: CreateVentaDto) {
    return this.salesService.createSale(tenant, dto);
  }

  @TenantAuth('venta:cancel')
  @Post('ventas/:id/anular')
  @ApiOperation({
    summary: 'Anular venta y generar contra-movimiento de reversión de stock',
  })
  cancelSale(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AnularVentaDto,
  ) {
    return this.salesService.cancelSale(tenant, id, dto);
  }
}

