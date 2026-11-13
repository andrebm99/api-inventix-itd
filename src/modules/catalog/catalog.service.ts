import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { producto_lote_estado } from '@prisma/client';
import { PrismaService } from '../../core/database/prisma.service.js';
import type { TenantContext } from '../../core/types/auth.types.js';
import type {
  CreateCategoriaDto,
  CreateLoteDto,
  CreateProductoDto,
  CreateUnidadMedidaDto,
  UpdateCategoriaDto,
  UpdateLoteEstadoDto,
  UpdateProductoDto,
  UpsertUbicacionDto,
} from './dto/catalog.dto.js';

@Injectable()
export class CatalogService {
  private readonly logger = new Logger(CatalogService.name);

  constructor(private readonly prisma: PrismaService) {}

  @Cron('0 1 * * *')
  async handleDailyLotExpirationCron(): Promise<void> {
    this.logger.log('Ejecutando actualización programada de estados de vencimiento de lotes');
    await this.updateExpiredLots();
  }

  async updateExpiredLots(negocioId?: string) {
    const now = new Date();

    const expiredRes = await this.prisma.producto_lote.updateMany({
      where: {
        fecha_vencimiento: { lte: now },
        estado: { notIn: [producto_lote_estado.VENCIDO, producto_lote_estado.AGOTADO] },
        ...(negocioId ? { producto: { negocio_id: negocioId } } : {}),
      },
      data: { estado: producto_lote_estado.VENCIDO },
    });

    const alertLimit = new Date();
    alertLimit.setDate(alertLimit.getDate() + 30);

    const expiringRes = await this.prisma.producto_lote.updateMany({
      where: {
        fecha_vencimiento: { gt: now, lte: alertLimit },
        estado: producto_lote_estado.DISPONIBLE,
        ...(negocioId ? { producto: { negocio_id: negocioId } } : {}),
      },
      data: { estado: producto_lote_estado.POR_VENCER },
    });

    return {
      lotesVencidos: expiredRes.count,
      lotesPorVencer: expiringRes.count,
    };
  }

  // ==================== CATEGORÍAS ====================

  async listCategories(negocioId: string) {
    return this.prisma.categoria.findMany({
      where: { negocio_id: negocioId, deleted_at: null },
      orderBy: { nombre: 'asc' },
    });
  }

  async createCategory(negocioId: string, dto: CreateCategoriaDto) {
    return this.prisma.categoria.create({
      data: {
        negocio_id: negocioId,
        nombre: dto.nombre.trim(),
      },
    });
  }

  async updateCategory(negocioId: string, id: string, dto: UpdateCategoriaDto) {
    const existing = await this.prisma.categoria.findFirst({
      where: { id, negocio_id: negocioId, deleted_at: null },
    });
    if (!existing) {
      throw new NotFoundException('Categoría no encontrada');
    }

    return this.prisma.categoria.update({
      where: { id },
      data: {
        ...(dto.nombre !== undefined ? { nombre: dto.nombre.trim() } : {}),
        ...(dto.activo !== undefined ? { activo: dto.activo } : {}),
      },
    });
  }

  async softDeleteCategory(negocioId: string, id: string) {
    const existing = await this.prisma.categoria.findFirst({
      where: { id, negocio_id: negocioId, deleted_at: null },
    });
    if (!existing) {
      throw new NotFoundException('Categoría no encontrada');
    }

    return this.prisma.categoria.update({
      where: { id },
      data: { activo: false, deleted_at: new Date() },
      select: { id: true, nombre: true, deleted_at: true },
    });
  }

  // ==================== UNIDADES DE MEDIDA ====================

  async listUnits(negocioId: string) {
    return this.prisma.unidad_medida.findMany({
      where: {
        OR: [{ negocio_id: null }, { negocio_id: negocioId }],
      },
      orderBy: { nombre: 'asc' },
    });
  }

  async createUnit(negocioId: string, dto: CreateUnidadMedidaDto) {
    return this.prisma.unidad_medida.create({
      data: {
        negocio_id: negocioId,
        nombre: dto.nombre.trim(),
        simbolo: dto.simbolo.trim().toUpperCase(),
      },
    });
  }

  // ==================== PRODUCTOS ====================

  async listProducts(
    negocioId: string,
    filters?: { search?: string; categoriaId?: string; activo?: boolean },
  ) {
    const search = filters?.search?.trim();

    return this.prisma.producto.findMany({
      where: {
        negocio_id: negocioId,
        deleted_at: null,
        ...(filters?.categoriaId ? { categoria_id: filters.categoriaId } : {}),
        ...(filters?.activo !== undefined ? { activo: filters.activo } : {}),
        ...(search
          ? {
              OR: [
                { nombre: { contains: search } },
                { sku: { contains: search } },
                { codigo_barras: { contains: search } },
              ],
            }
          : {}),
      },
      include: {
        categoria: { select: { id: true, nombre: true } },
        unidad_medida: { select: { id: true, nombre: true, simbolo: true } },
      },
      orderBy: { nombre: 'asc' },
    });
  }

  async getProduct(negocioId: string, id: string) {
    const producto = await this.prisma.producto.findFirst({
      where: { id, negocio_id: negocioId, deleted_at: null },
      include: {
        categoria: { select: { id: true, nombre: true } },
        unidad_medida: { select: { id: true, nombre: true, simbolo: true } },
        producto_lote: { orderBy: { fecha_vencimiento: 'asc' } },
        producto_ubicacion_almacen: {
          include: {
            almacen: { select: { id: true, nombre: true, tipo: true } },
          },
        },
        producto_proveedor: {
          include: {
            proveedor: { select: { id: true, razon_social: true, ruc: true } },
          },
        },
        stock_almacen: {
          include: {
            almacen: { select: { id: true, nombre: true, tipo: true } },
            producto_lote: { select: { id: true, codigo_lote: true, fecha_vencimiento: true } },
          },
        },
      },
    });

    if (!producto) {
      throw new NotFoundException('Producto no encontrado');
    }

    return producto;
  }

  async createProduct(tenant: TenantContext, dto: CreateProductoDto) {
    if (dto.manejaLotes && tenant.config?.usa_lotes === false) {
      throw new BadRequestException(
        'El negocio tiene deshabilitado el uso de lotes en su configuración',
      );
    }

    await this.validateCategoryAndUnit(tenant.negocioId, dto.categoriaId, dto.unidadMedidaId);

    const sku = dto.sku?.trim() || null;
    if (sku) {
      const dup = await this.prisma.producto.findFirst({
        where: { negocio_id: tenant.negocioId, sku },
      });
      if (dup) {
        throw new ConflictException(`Ya existe un producto con el SKU "${sku}"`);
      }
    }

    const codigoBarras = dto.codigoBarras?.trim() || null;
    if (codigoBarras) {
      const dupBarcode = await this.prisma.producto.findFirst({
        where: { negocio_id: tenant.negocioId, codigo_barras: codigoBarras, deleted_at: null },
      });
      if (dupBarcode) {
        throw new ConflictException(
          `Ya existe un producto activo con el código de barras "${codigoBarras}"`,
        );
      }
    }

    return this.prisma.producto.create({
      data: {
        negocio_id: tenant.negocioId,
        categoria_id: dto.categoriaId ?? null,
        unidad_medida_id: dto.unidadMedidaId ?? null,
        sku,
        codigo_barras: dto.codigoBarras?.trim() ?? null,
        nombre: dto.nombre.trim(),
        descripcion: dto.descripcion?.trim() ?? null,
        costo_promedio: dto.costoPromedio ?? 0,
        precio_venta_base: dto.precioVentaBase,
        maneja_lotes: dto.manejaLotes ?? false,
      },
      include: {
        categoria: { select: { id: true, nombre: true } },
        unidad_medida: { select: { id: true, nombre: true, simbolo: true } },
      },
    });
  }

  async updateProduct(tenant: TenantContext, id: string, dto: UpdateProductoDto) {
    await this.getProductBasic(tenant.negocioId, id);

    if (dto.manejaLotes && tenant.config?.usa_lotes === false) {
      throw new BadRequestException(
        'El negocio tiene deshabilitado el uso de lotes en su configuración',
      );
    }

    await this.validateCategoryAndUnit(tenant.negocioId, dto.categoriaId, dto.unidadMedidaId);

    const sku = dto.sku?.trim();
    if (sku) {
      const dup = await this.prisma.producto.findFirst({
        where: {
          negocio_id: tenant.negocioId,
          sku,
          id: { not: id },
        },
      });
      if (dup) {
        throw new ConflictException(`Ya existe otro producto con el SKU "${sku}"`);
      }
    }

    const codigoBarras = dto.codigoBarras !== undefined ? dto.codigoBarras.trim() || null : undefined;
    if (codigoBarras) {
      const dupBarcode = await this.prisma.producto.findFirst({
        where: {
          negocio_id: tenant.negocioId,
          codigo_barras: codigoBarras,
          deleted_at: null,
          id: { not: id },
        },
      });
      if (dupBarcode) {
        throw new ConflictException(
          `Ya existe otro producto activo con el código de barras "${codigoBarras}"`,
        );
      }
    }

    return this.prisma.producto.update({
      where: { id },
      data: {
        ...(dto.categoriaId !== undefined ? { categoria_id: dto.categoriaId } : {}),
        ...(dto.unidadMedidaId !== undefined ? { unidad_medida_id: dto.unidadMedidaId } : {}),
        ...(dto.sku !== undefined ? { sku: sku || null } : {}),
        ...(dto.codigoBarras !== undefined ? { codigo_barras: dto.codigoBarras.trim() } : {}),
        ...(dto.nombre !== undefined ? { nombre: dto.nombre.trim() } : {}),
        ...(dto.descripcion !== undefined ? { descripcion: dto.descripcion.trim() } : {}),
        ...(dto.precioVentaBase !== undefined ? { precio_venta_base: dto.precioVentaBase } : {}),
        ...(dto.manejaLotes !== undefined ? { maneja_lotes: dto.manejaLotes } : {}),
        ...(dto.activo !== undefined ? { activo: dto.activo } : {}),
        updated_at: new Date(),
      },
    });
  }

  async softDeleteProduct(negocioId: string, id: string) {
    await this.getProductBasic(negocioId, id);

    const stockSum = await this.prisma.stock_almacen.aggregate({
      where: { producto_id: id },
      _sum: { cantidad_actual: true },
    });
    const totalStock = stockSum._sum.cantidad_actual ?? 0;
    if (totalStock > 0) {
      throw new BadRequestException(
        `No se puede eliminar el producto porque aún cuenta con ${totalStock} unidades en existencia en los almacenes`,
      );
    }

    return this.prisma.producto.update({
      where: { id },
      data: {
        activo: false,
        deleted_at: new Date(),
        updated_at: new Date(),
      },
      select: { id: true, nombre: true, deleted_at: true },
    });
  }

  // ==================== LOTES ====================

  async listLots(negocioId: string, productoId?: string) {
    return this.prisma.producto_lote.findMany({
      where: {
        producto: {
          negocio_id: negocioId,
          deleted_at: null,
        },
        ...(productoId ? { producto_id: productoId } : {}),
      },
      include: {
        producto: { select: { id: true, nombre: true, sku: true } },
      },
      orderBy: { fecha_vencimiento: 'asc' },
    });
  }

  async listExpiringLots(tenant: TenantContext, overrideDias?: number) {
    const dias = overrideDias ?? tenant.config?.dias_alerta_vencimiento ?? 30;
    const limitDate = new Date();
    limitDate.setDate(limitDate.getDate() + dias);

    return this.prisma.producto_lote.findMany({
      where: {
        producto: {
          negocio_id: tenant.negocioId,
          deleted_at: null,
        },
        fecha_vencimiento: { lte: limitDate },
        estado: { in: [producto_lote_estado.DISPONIBLE, producto_lote_estado.POR_VENCER] },
      },
      include: {
        producto: { select: { id: true, nombre: true, sku: true } },
      },
      orderBy: { fecha_vencimiento: 'asc' },
    });
  }

  async createLot(tenant: TenantContext, dto: CreateLoteDto) {
    if (tenant.config?.usa_lotes === false) {
      throw new BadRequestException(
        'El negocio tiene deshabilitado el uso de lotes en su configuración',
      );
    }

    const producto = await this.getProductBasic(tenant.negocioId, dto.productoId);
    if (!producto.maneja_lotes) {
      throw new BadRequestException(
        'Este producto está configurado sin manejo de lotes (maneja_lotes = false)',
      );
    }

    const codigoLote = dto.codigoLote.trim();
    const dup = await this.prisma.producto_lote.findUnique({
      where: {
        producto_id_codigo_lote: {
          producto_id: dto.productoId,
          codigo_lote: codigoLote,
        },
      },
    });
    if (dup) {
      throw new ConflictException(`El lote "${codigoLote}" ya existe para este producto`);
    }

    return this.prisma.producto_lote.create({
      data: {
        producto_id: dto.productoId,
        codigo_lote: codigoLote,
        fecha_fabricacion: dto.fechaFabricacion ? new Date(dto.fechaFabricacion) : null,
        fecha_vencimiento: new Date(dto.fechaVencimiento),
        estado: dto.estado ?? producto_lote_estado.DISPONIBLE,
      },
    });
  }

  async updateLotStatus(negocioId: string, lotId: string, dto: UpdateLoteEstadoDto) {
    const lote = await this.prisma.producto_lote.findFirst({
      where: {
        id: lotId,
        producto: { negocio_id: negocioId, deleted_at: null },
      },
    });

    if (!lote) {
      throw new NotFoundException('Lote no encontrado');
    }

    return this.prisma.producto_lote.update({
      where: { id: lotId },
      data: { estado: dto.estado },
    });
  }

  // ==================== UBICACIÓN ESPACIAL ====================

  async listLocations(negocioId: string, filters?: { almacenId?: string; productoId?: string }) {
    return this.prisma.producto_ubicacion_almacen.findMany({
      where: {
        producto: { negocio_id: negocioId, deleted_at: null },
        almacen: { deleted_at: null, sucursal: { negocio_id: negocioId, deleted_at: null } },
        ...(filters?.almacenId ? { almacen_id: filters.almacenId } : {}),
        ...(filters?.productoId ? { producto_id: filters.productoId } : {}),
      },
      include: {
        producto: { select: { id: true, nombre: true, sku: true, codigo_barras: true } },
        almacen: { select: { id: true, nombre: true, tipo: true } },
      },
      orderBy: [{ pasillo: 'asc' }, { estante: 'asc' }],
    });
  }

  async upsertLocation(negocioId: string, dto: UpsertUbicacionDto) {
    await this.getProductBasic(negocioId, dto.productoId);

    const almacen = await this.prisma.almacen.findFirst({
      where: {
        id: dto.almacenId,
        deleted_at: null,
        sucursal: { negocio_id: negocioId, deleted_at: null },
      },
    });
    if (!almacen) {
      throw new NotFoundException('Almacén no encontrado en este negocio');
    }

    return this.prisma.producto_ubicacion_almacen.upsert({
      where: {
        producto_id_almacen_id: {
          producto_id: dto.productoId,
          almacen_id: dto.almacenId,
        },
      },
      update: {
        ...(dto.pasillo !== undefined ? { pasillo: dto.pasillo.trim() } : {}),
        ...(dto.estante !== undefined ? { estante: dto.estante.trim() } : {}),
        ...(dto.coordenadaX !== undefined ? { coordenada_x: dto.coordenadaX } : {}),
        ...(dto.coordenadaY !== undefined ? { coordenada_y: dto.coordenadaY } : {}),
        ...(dto.zonaRotulo !== undefined ? { zona_rotulo: dto.zonaRotulo.trim() } : {}),
      },
      create: {
        producto_id: dto.productoId,
        almacen_id: dto.almacenId,
        pasillo: dto.pasillo?.trim() ?? null,
        estante: dto.estante?.trim() ?? null,
        coordenada_x: dto.coordenadaX ?? 0,
        coordenada_y: dto.coordenadaY ?? 0,
        zona_rotulo: dto.zonaRotulo?.trim() ?? null,
      },
      include: {
        producto: { select: { id: true, nombre: true, sku: true } },
        almacen: { select: { id: true, nombre: true, tipo: true } },
      },
    });
  }

  // ==================== HELPERS ====================

  private async getProductBasic(negocioId: string, id: string) {
    const producto = await this.prisma.producto.findFirst({
      where: { id, negocio_id: negocioId, deleted_at: null },
    });
    if (!producto) {
      throw new NotFoundException('Producto no encontrado');
    }
    return producto;
  }

  private async validateCategoryAndUnit(
    negocioId: string,
    categoriaId?: string,
    unidadMedidaId?: string,
  ): Promise<void> {
    if (categoriaId) {
      const cat = await this.prisma.categoria.findFirst({
        where: { id: categoriaId, negocio_id: negocioId, deleted_at: null },
      });
      if (!cat) {
        throw new NotFoundException('La categoría no existe en este negocio');
      }
    }

    if (unidadMedidaId) {
      const unit = await this.prisma.unidad_medida.findFirst({
        where: {
          id: unidadMedidaId,
          OR: [{ negocio_id: null }, { negocio_id: negocioId }],
        },
      });
      if (!unit) {
        throw new NotFoundException('La unidad de medida no es válida para este negocio');
      }
    }
  }
}

