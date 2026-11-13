import { Body, Controller, Delete, Get, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentTenant } from '../../core/decorators/current-tenant.decorator.js';
import { CurrentUser } from '../../core/decorators/current-user.decorator.js';
import { TenantAuth } from '../../core/decorators/tenant-auth.decorator.js';
import { JwtAuthGuard } from '../../core/guards/jwt-auth.guard.js';
import type { AuthenticatedUser, TenantContext } from '../../core/types/auth.types.js';
import {
  CreateNegocioDto,
  UpdateConfiguracionNegocioDto,
  UpdateNegocioDto,
} from './dto/negocio.dto.js';
import { NegocioService } from './negocio.service.js';

@ApiTags('Negocios')
@Controller('negocios')
export class NegocioController {
  constructor(private readonly negocioService: NegocioService) {}

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @Post()
  @ApiOperation({
    summary: 'Crear negocio (crea sucursal principal, almacén principal y asigna PROPIETARIO)',
  })
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateNegocioDto) {
    return this.negocioService.create(user.id, dto);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @Get()
  @ApiOperation({ summary: 'Listar los negocios donde el usuario autenticado es miembro' })
  findMyBusinesses(@CurrentUser() user: AuthenticatedUser) {
    return this.negocioService.findMyBusinesses(user.id);
  }

  @TenantAuth('negocio:read')
  @Get('actual')
  @ApiOperation({ summary: 'Obtener detalle y configuración del negocio activo (x-negocio-id)' })
  findCurrent(@CurrentTenant() tenant: TenantContext) {
    return this.negocioService.findOne(tenant.negocioId);
  }

  @TenantAuth('negocio:write')
  @Patch('actual')
  @ApiOperation({ summary: 'Actualizar datos generales del negocio activo' })
  updateCurrent(@CurrentTenant() tenant: TenantContext, @Body() dto: UpdateNegocioDto) {
    return this.negocioService.update(tenant.negocioId, dto);
  }

  @TenantAuth('negocio:write')
  @Patch('actual/configuracion')
  @ApiOperation({ summary: 'Actualizar feature flags del negocio activo' })
  updateConfig(
    @CurrentTenant() tenant: TenantContext,
    @Body() dto: UpdateConfiguracionNegocioDto,
  ) {
    return this.negocioService.updateConfig(tenant.negocioId, dto);
  }

  @TenantAuth('negocio:write')
  @Delete('actual')
  @ApiOperation({ summary: 'Desactivar negocio mediante soft delete' })
  removeCurrent(@CurrentTenant() tenant: TenantContext) {
    return this.negocioService.softDelete(tenant.negocioId);
  }
}

