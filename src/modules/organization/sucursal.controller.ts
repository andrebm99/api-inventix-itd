import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentTenant } from '../../core/decorators/current-tenant.decorator.js';
import { TenantAuth } from '../../core/decorators/tenant-auth.decorator.js';
import type { TenantContext } from '../../core/types/auth.types.js';
import { CreateSucursalDto, UpdateSucursalDto } from './dto/sucursal.dto.js';
import { SucursalService } from './sucursal.service.js';

@ApiTags('Sucursales')
@Controller('sucursales')
export class SucursalController {
  constructor(private readonly sucursalService: SucursalService) {}

  @TenantAuth('sucursal:read')
  @Get()
  @ApiOperation({ summary: 'Listar sucursales activas del negocio' })
  findAll(@CurrentTenant() tenant: TenantContext) {
    return this.sucursalService.findAll(tenant.negocioId);
  }

  @TenantAuth('sucursal:read')
  @Get(':id')
  @ApiOperation({ summary: 'Obtener detalle de una sucursal' })
  findOne(@CurrentTenant() tenant: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.sucursalService.findOne(tenant.negocioId, id);
  }

  @TenantAuth('sucursal:write')
  @Post()
  @ApiOperation({ summary: 'Crear nueva sucursal' })
  create(@CurrentTenant() tenant: TenantContext, @Body() dto: CreateSucursalDto) {
    return this.sucursalService.create(tenant, dto);
  }

  @TenantAuth('sucursal:write')
  @Patch(':id')
  @ApiOperation({ summary: 'Actualizar una sucursal' })
  update(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateSucursalDto,
  ) {
    return this.sucursalService.update(tenant.negocioId, id, dto);
  }

  @TenantAuth('sucursal:write')
  @Delete(':id')
  @ApiOperation({ summary: 'Eliminar sucursal (soft delete)' })
  remove(@CurrentTenant() tenant: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.sucursalService.softDelete(tenant.negocioId, id);
  }
}

