import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseBoolPipe,
  ParseIntPipe,
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
import { CatalogService } from './catalog.service.js';
import {
  CreateCategoriaDto,
  CreateLoteDto,
  CreateProductoDto,
  CreateUnidadMedidaDto,
  UpdateCategoriaDto,
  UpdateLoteEstadoDto,
  UpdateProductoDto,
  UpsertUbicacionDto,
} from './dto/catalog.dto.js';

@ApiTags('Catálogo, Lotes y Ubicaciones')
@Controller()
export class CatalogController {
  constructor(private readonly catalogService: CatalogService) {}

  // ==================== CATEGORÍAS ====================

  @TenantAuth('catalogo:read')
  @Get('categorias')
  @ApiOperation({ summary: 'Listar categorías del negocio' })
  listCategories(@CurrentTenant() tenant: TenantContext) {
    return this.catalogService.listCategories(tenant.negocioId);
  }

  @TenantAuth('catalogo:write')
  @Post('categorias')
  @ApiOperation({ summary: 'Crear categoría' })
  createCategory(@CurrentTenant() tenant: TenantContext, @Body() dto: CreateCategoriaDto) {
    return this.catalogService.createCategory(tenant.negocioId, dto);
  }

  @TenantAuth('catalogo:write')
  @Patch('categorias/:id')
  @ApiOperation({ summary: 'Actualizar categoría' })
  updateCategory(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCategoriaDto,
  ) {
    return this.catalogService.updateCategory(tenant.negocioId, id, dto);
  }

  @TenantAuth('catalogo:write')
  @Delete('categorias/:id')
  @ApiOperation({ summary: 'Eliminar categoría (soft delete)' })
  deleteCategory(@CurrentTenant() tenant: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.catalogService.softDeleteCategory(tenant.negocioId, id);
  }

  // ==================== UNIDADES DE MEDIDA ====================

  @TenantAuth('catalogo:read')
  @Get('unidades-medida')
  @ApiOperation({ summary: 'Listar unidades de medida globales y del negocio' })
  listUnits(@CurrentTenant() tenant: TenantContext) {
    return this.catalogService.listUnits(tenant.negocioId);
  }

  @TenantAuth('catalogo:write')
  @Post('unidades-medida')
  @ApiOperation({ summary: 'Crear unidad de medida personalizada para el negocio' })
  createUnit(@CurrentTenant() tenant: TenantContext, @Body() dto: CreateUnidadMedidaDto) {
    return this.catalogService.createUnit(tenant.negocioId, dto);
  }

  // ==================== PRODUCTOS ====================

  @TenantAuth('catalogo:read')
  @Get('productos')
  @ApiOperation({ summary: 'Listar productos del negocio (búsqueda por nombre, SKU o código de barras)' })
  @ApiQuery({ name: 'search', required: false, type: String })
  @ApiQuery({ name: 'categoriaId', required: false, type: String })
  @ApiQuery({ name: 'activo', required: false, type: Boolean })
  listProducts(
    @CurrentTenant() tenant: TenantContext,
    @Query('search') search?: string,
    @Query('categoriaId', new ParseUUIDPipe({ optional: true })) categoriaId?: string,
    @Query('activo', new ParseBoolPipe({ optional: true })) activo?: boolean,
  ) {
    return this.catalogService.listProducts(tenant.negocioId, { search, categoriaId, activo });
  }

  @TenantAuth('catalogo:read')
  @Get('productos/:id')
  @ApiOperation({ summary: 'Obtener ficha completa del producto (lotes, ubicaciones, proveedores y stock)' })
  getProduct(@CurrentTenant() tenant: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.catalogService.getProduct(tenant.negocioId, id);
  }

  @TenantAuth('catalogo:write')
  @Post('productos')
  @ApiOperation({ summary: 'Crear producto en el catálogo maestro' })
  createProduct(@CurrentTenant() tenant: TenantContext, @Body() dto: CreateProductoDto) {
    return this.catalogService.createProduct(tenant, dto);
  }

  @TenantAuth('catalogo:write')
  @Patch('productos/:id')
  @ApiOperation({ summary: 'Actualizar producto' })
  updateProduct(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateProductoDto,
  ) {
    return this.catalogService.updateProduct(tenant, id, dto);
  }

  @TenantAuth('catalogo:write')
  @Delete('productos/:id')
  @ApiOperation({ summary: 'Eliminar producto (soft delete)' })
  deleteProduct(@CurrentTenant() tenant: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.catalogService.softDeleteProduct(tenant.negocioId, id);
  }

  // ==================== LOTES ====================

  @TenantAuth('catalogo:write')
  @Post('lotes/actualizar-vencimientos')
  @ApiOperation({
    summary: 'Actualizar masivamente estados de lotes a POR_VENCER o VENCIDO según calendario',
  })
  updateExpiredLots(@CurrentTenant() tenant: TenantContext) {
    return this.catalogService.updateExpiredLots(tenant.negocioId);
  }

  @TenantAuth('catalogo:read')
  @Get('lotes/por-vencer')
  @ApiOperation({ summary: 'Listar lotes próximos a vencer según configuración del negocio' })
  @ApiQuery({ name: 'dias', required: false, type: Number })
  listExpiringLots(
    @CurrentTenant() tenant: TenantContext,
    @Query('dias', new ParseIntPipe({ optional: true })) dias?: number,
  ) {
    return this.catalogService.listExpiringLots(tenant, dias);
  }

  @TenantAuth('catalogo:read')
  @Get('lotes')
  @ApiOperation({ summary: 'Listar lotes de productos perecibles' })
  @ApiQuery({ name: 'productoId', required: false, type: String })
  listLots(
    @CurrentTenant() tenant: TenantContext,
    @Query('productoId', new ParseUUIDPipe({ optional: true })) productoId?: string,
  ) {
    return this.catalogService.listLots(tenant.negocioId, productoId);
  }

  @TenantAuth('catalogo:write')
  @Post('lotes')
  @ApiOperation({ summary: 'Registrar lote para un producto que maneja lotes' })
  createLot(@CurrentTenant() tenant: TenantContext, @Body() dto: CreateLoteDto) {
    return this.catalogService.createLot(tenant, dto);
  }

  @TenantAuth('catalogo:write')
  @Patch('lotes/:id/estado')
  @ApiOperation({ summary: 'Actualizar estado sanitario/comercial de un lote' })
  updateLotStatus(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateLoteEstadoDto,
  ) {
    return this.catalogService.updateLotStatus(tenant.negocioId, id, dto);
  }

  // ==================== UBICACIONES ESPACIALES ====================

  @TenantAuth('catalogo:read')
  @Get('ubicaciones')
  @ApiOperation({ summary: 'Consultar ubicaciones físicas (pasillo, estante, X/Y) en almacenes' })
  @ApiQuery({ name: 'almacenId', required: false, type: String })
  @ApiQuery({ name: 'productoId', required: false, type: String })
  listLocations(
    @CurrentTenant() tenant: TenantContext,
    @Query('almacenId', new ParseUUIDPipe({ optional: true })) almacenId?: string,
    @Query('productoId', new ParseUUIDPipe({ optional: true })) productoId?: string,
  ) {
    return this.catalogService.listLocations(tenant.negocioId, { almacenId, productoId });
  }

  @TenantAuth('catalogo:write')
  @Put('ubicaciones')
  @ApiOperation({ summary: 'Asignar o actualizar ubicación espacial de un producto en un almacén' })
  upsertLocation(@CurrentTenant() tenant: TenantContext, @Body() dto: UpsertUbicacionDto) {
    return this.catalogService.upsertLocation(tenant.negocioId, dto);
  }
}

