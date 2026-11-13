import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseEnumPipe,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { almacen_tipo } from '@prisma/client';
import { CurrentTenant } from '../../core/decorators/current-tenant.decorator.js';
import { TenantAuth } from '../../core/decorators/tenant-auth.decorator.js';
import type { TenantContext } from '../../core/types/auth.types.js';
import { AlmacenService } from './almacen.service.js';
import { CreateAlmacenDto, UpdateAlmacenDto } from './dto/almacen.dto.js';

@ApiTags('Almacenes')
@Controller('almacenes')
export class AlmacenController {
  constructor(private readonly almacenService: AlmacenService) {}

  @TenantAuth('almacen:read')
  @Get()
  @ApiOperation({ summary: 'Listar almacenes del negocio (filtrable por sucursal y tipo)' })
  @ApiQuery({ name: 'sucursalId', required: false, type: String })
  @ApiQuery({ name: 'tipo', required: false, enum: almacen_tipo })
  findAll(
    @CurrentTenant() tenant: TenantContext,
    @Query('sucursalId', new ParseUUIDPipe({ optional: true })) sucursalId?: string,
    @Query('tipo', new ParseEnumPipe(almacen_tipo, { optional: true })) tipo?: almacen_tipo,
  ) {
    return this.almacenService.findAll(tenant.negocioId, { sucursalId, tipo });
  }

  @TenantAuth('almacen:read')
  @Get(':id')
  @ApiOperation({ summary: 'Obtener detalle de un almacén' })
  findOne(@CurrentTenant() tenant: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.almacenService.findOne(tenant.negocioId, id);
  }

  @TenantAuth('almacen:write')
  @Post()
  @ApiOperation({ summary: 'Crear nuevo almacén dentro de una sucursal' })
  create(@CurrentTenant() tenant: TenantContext, @Body() dto: CreateAlmacenDto) {
    return this.almacenService.create(tenant, dto);
  }

  @TenantAuth('almacen:write')
  @Patch(':id')
  @ApiOperation({ summary: 'Actualizar datos o tipo de un almacén' })
  update(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateAlmacenDto,
  ) {
    return this.almacenService.update(tenant.negocioId, id, dto);
  }

  @TenantAuth('almacen:write')
  @Delete(':id')
  @ApiOperation({ summary: 'Eliminar almacén (soft delete)' })
  remove(@CurrentTenant() tenant: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.almacenService.softDelete(tenant.negocioId, id);
  }
}

