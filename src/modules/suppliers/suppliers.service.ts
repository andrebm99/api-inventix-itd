import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../core/database/prisma.service.js';
import type {
  CreateProveedorDto,
  UpdateProveedorDto,
  UpsertProductoProveedorDto,
} from './dto/supplier.dto.js';

@Injectable()
export class SuppliersService {
  constructor(private readonly prisma: PrismaService) {}

  async listSuppliers(negocioId: string, search?: string) {
    const q = search?.trim();
    return this.prisma.proveedor.findMany({
      where: {
        negocio_id: negocioId,
        deleted_at: null,
        ...(q
          ? {
              OR: [{ razon_social: { contains: q } }, { ruc: { contains: q } }],
            }
          : {}),
      },
      orderBy: { razon_social: 'asc' },
    });
  }

  async getSupplier(negocioId: string, id: string) {
    const proveedor = await this.prisma.proveedor.findFirst({
      where: { id, negocio_id: negocioId, deleted_at: null },
      include: {
        producto_proveedor: {
          include: {
            producto: { select: { id: true, nombre: true, sku: true, costo_promedio: true } },
          },
        },
      },
    });

    if (!proveedor) {
      throw new NotFoundException('Proveedor no encontrado');
    }

    return proveedor;
  }

  async createSupplier(negocioId: string, dto: CreateProveedorDto) {
    const ruc = dto.ruc.trim();
    const dup = await this.prisma.proveedor.findFirst({
      where: { negocio_id: negocioId, ruc, deleted_at: null },
    });
    if (dup) {
      throw new ConflictException(`Ya existe un proveedor con RUC ${ruc} en este negocio`);
    }

    return this.prisma.proveedor.create({
      data: {
        negocio_id: negocioId,
        razon_social: dto.razonSocial.trim(),
        ruc,
        telefono: dto.telefono?.trim() ?? null,
        correo: dto.correo?.trim() ?? null,
        lead_time_promedio_dias: dto.leadTimePromedioDias ?? 3,
      },
    });
  }

  async updateSupplier(negocioId: string, id: string, dto: UpdateProveedorDto) {
    await this.getSupplierBasic(negocioId, id);

    return this.prisma.proveedor.update({
      where: { id },
      data: {
        ...(dto.razonSocial !== undefined ? { razon_social: dto.razonSocial.trim() } : {}),
        ...(dto.ruc !== undefined ? { ruc: dto.ruc.trim() } : {}),
        ...(dto.telefono !== undefined ? { telefono: dto.telefono.trim() } : {}),
        ...(dto.correo !== undefined ? { correo: dto.correo.trim() } : {}),
        ...(dto.leadTimePromedioDias !== undefined
          ? { lead_time_promedio_dias: dto.leadTimePromedioDias }
          : {}),
        ...(dto.activo !== undefined ? { activo: dto.activo } : {}),
      },
    });
  }

  async softDeleteSupplier(negocioId: string, id: string) {
    await this.getSupplierBasic(negocioId, id);

    return this.prisma.proveedor.update({
      where: { id },
      data: {
        activo: false,
        deleted_at: new Date(),
      },
      select: { id: true, razon_social: true, deleted_at: true },
    });
  }

  // ==================== CONVENIOS PRODUCTO - PROVEEDOR ====================

  async listProductSuppliers(negocioId: string, productoId: string) {
    const producto = await this.prisma.producto.findFirst({
      where: { id: productoId, negocio_id: negocioId, deleted_at: null },
    });
    if (!producto) {
      throw new NotFoundException('Producto no encontrado');
    }

    return this.prisma.producto_proveedor.findMany({
      where: {
        producto_id: productoId,
        proveedor: { deleted_at: null },
      },
      include: {
        proveedor: {
          select: {
            id: true,
            razon_social: true,
            ruc: true,
            telefono: true,
            correo: true,
            lead_time_promedio_dias: true,
          },
        },
      },
      orderBy: [{ es_preferente: 'desc' }, { costo_compra: 'asc' }],
    });
  }

  async upsertProductSupplier(
    negocioId: string,
    productoId: string,
    dto: UpsertProductoProveedorDto,
  ) {
    const producto = await this.prisma.producto.findFirst({
      where: { id: productoId, negocio_id: negocioId, deleted_at: null },
    });
    if (!producto) {
      throw new NotFoundException('Producto no encontrado');
    }

    const proveedor = await this.getSupplierBasic(negocioId, dto.proveedorId);

    return this.prisma.$transaction(async (tx) => {
      if (dto.esPreferente) {
        await tx.producto_proveedor.updateMany({
          where: {
            producto_id: productoId,
            proveedor_id: { not: dto.proveedorId },
          },
          data: { es_preferente: false },
        });
      }

      return tx.producto_proveedor.upsert({
        where: {
          producto_id_proveedor_id: {
            producto_id: productoId,
            proveedor_id: dto.proveedorId,
          },
        },
        update: {
          ...(dto.codigoProveedor !== undefined
            ? { codigo_proveedor: dto.codigoProveedor.trim() }
            : {}),
          costo_compra: dto.costoCompra,
          ...(dto.leadTimeDias !== undefined ? { lead_time_dias: dto.leadTimeDias } : {}),
          ...(dto.esPreferente !== undefined ? { es_preferente: dto.esPreferente } : {}),
          updated_at: new Date(),
        },
        create: {
          producto_id: productoId,
          proveedor_id: dto.proveedorId,
          codigo_proveedor: dto.codigoProveedor?.trim() ?? null,
          costo_compra: dto.costoCompra,
          lead_time_dias: dto.leadTimeDias ?? proveedor.lead_time_promedio_dias ?? 3,
          es_preferente: dto.esPreferente ?? false,
        },
        include: {
          proveedor: { select: { id: true, razon_social: true, ruc: true } },
        },
      });
    });
  }

  async removeProductSupplier(negocioId: string, productoId: string, proveedorId: string) {
    const agreement = await this.prisma.producto_proveedor.findFirst({
      where: {
        producto_id: productoId,
        proveedor_id: proveedorId,
        producto: { negocio_id: negocioId, deleted_at: null },
      },
    });
    if (!agreement) {
      throw new NotFoundException('Convenio producto-proveedor no encontrado');
    }

    await this.prisma.producto_proveedor.delete({
      where: {
        producto_id_proveedor_id: {
          producto_id: productoId,
          proveedor_id: proveedorId,
        },
      },
    });

    return { deleted: true, productoId, proveedorId };
  }

  private async getSupplierBasic(negocioId: string, id: string) {
    const proveedor = await this.prisma.proveedor.findFirst({
      where: { id, negocio_id: negocioId, deleted_at: null },
    });
    if (!proveedor) {
      throw new NotFoundException('Proveedor no encontrado');
    }
    return proveedor;
  }
}

