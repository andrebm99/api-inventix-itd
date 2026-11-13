import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { CurrentTenant } from '../../core/decorators/current-tenant.decorator.js';
import { TenantAuth } from '../../core/decorators/tenant-auth.decorator.js';
import type { TenantContext } from '../../core/types/auth.types.js';
import {
  CreateProveedorDto,
  UpdateProveedorDto,
  UpsertProductoProveedorDto,
} from './dto/supplier.dto.js';
import { SuppliersService } from './suppliers.service.js';

@ApiTags('Proveedores y Convenios')
@Controller()
export class SuppliersController {
  constructor(private readonly suppliersService: SuppliersService) {}

  @TenantAuth('proveedor:read')
  @Get('proveedores')
  @ApiOperation({ summary: 'Listar proveedores del negocio' })
  @ApiQuery({ name: 'search', required: false, type: String })
  listSuppliers(@CurrentTenant() tenant: TenantContext, @Query('search') search?: string) {
    return this.suppliersService.listSuppliers(tenant.negocioId, search);
  }

  @TenantAuth('proveedor:read')
  @Get('proveedores/:id')
  @ApiOperation({ summary: 'Obtener proveedor y sus productos convenidos' })
  getSupplier(@CurrentTenant() tenant: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.suppliersService.getSupplier(tenant.negocioId, id);
  }

  @TenantAuth('proveedor:write')
  @Post('proveedores')
  @ApiOperation({ summary: 'Registrar proveedor' })
  createSupplier(@CurrentTenant() tenant: TenantContext, @Body() dto: CreateProveedorDto) {
    return this.suppliersService.createSupplier(tenant.negocioId, dto);
  }

  @TenantAuth('proveedor:write')
  @Patch('proveedores/:id')
  @ApiOperation({ summary: 'Actualizar datos o lead time del proveedor' })
  updateSupplier(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateProveedorDto,
  ) {
    return this.suppliersService.updateSupplier(tenant.negocioId, id, dto);
  }

  @TenantAuth('proveedor:write')
  @Delete('proveedores/:id')
  @ApiOperation({ summary: 'Eliminar proveedor (soft delete)' })
  deleteSupplier(@CurrentTenant() tenant: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.suppliersService.softDeleteSupplier(tenant.negocioId, id);
  }

  @TenantAuth('proveedor:read')
  @Get('productos/:productoId/proveedores')
  @ApiOperation({ summary: 'Consultar convenios de compra de un producto' })
  listProductSuppliers(
    @CurrentTenant() tenant: TenantContext,
    @Param('productoId', ParseUUIDPipe) productoId: string,
  ) {
    return this.suppliersService.listProductSuppliers(tenant.negocioId, productoId);
  }

  @TenantAuth('proveedor:write')
  @Put('productos/:productoId/proveedores')
  @ApiOperation({ summary: 'Crear o actualizar convenio de compra producto-proveedor' })
  upsertProductSupplier(
    @CurrentTenant() tenant: TenantContext,
    @Param('productoId', ParseUUIDPipe) productoId: string,
    @Body() dto: UpsertProductoProveedorDto,
  ) {
    return this.suppliersService.upsertProductSupplier(tenant.negocioId, productoId, dto);
  }

  @TenantAuth('proveedor:write')
  @Delete('productos/:productoId/proveedores/:proveedorId')
  @ApiOperation({ summary: 'Desvincular proveedor de un producto' })
  removeProductSupplier(
    @CurrentTenant() tenant: TenantContext,
    @Param('productoId', ParseUUIDPipe) productoId: string,
    @Param('proveedorId', ParseUUIDPipe) proveedorId: string,
  ) {
    return this.suppliersService.removeProductSupplier(tenant.negocioId, productoId, proveedorId);
  }
}

