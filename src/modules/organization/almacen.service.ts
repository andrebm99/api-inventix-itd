import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { almacen_tipo } from '@prisma/client';
import { PrismaService } from '../../core/database/prisma.service.js';
import type { TenantContext } from '../../core/types/auth.types.js';
import type { CreateAlmacenDto, UpdateAlmacenDto } from './dto/almacen.dto.js';

@Injectable()
export class AlmacenService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(negocioId: string, filters?: { sucursalId?: string; tipo?: almacen_tipo }) {
    return this.prisma.almacen.findMany({
      where: {
        deleted_at: null,
        sucursal: {
          negocio_id: negocioId,
          deleted_at: null,
        },
        ...(filters?.sucursalId ? { sucursal_id: filters.sucursalId } : {}),
        ...(filters?.tipo ? { tipo: filters.tipo } : {}),
      },
      include: {
        sucursal: {
          select: {
            id: true,
            nombre: true,
          },
        },
      },
      orderBy: { created_at: 'asc' },
    });
  }

  async findOne(negocioId: string, id: string) {
    const almacen = await this.prisma.almacen.findFirst({
      where: {
        id,
        deleted_at: null,
        sucursal: {
          negocio_id: negocioId,
          deleted_at: null,
        },
      },
      include: {
        sucursal: {
          select: {
            id: true,
            nombre: true,
          },
        },
      },
    });

    if (!almacen) {
      throw new NotFoundException('Almacén no encontrado');
    }

    return almacen;
  }

  async create(tenant: TenantContext, dto: CreateAlmacenDto) {
    const sucursal = await this.prisma.sucursal.findFirst({
      where: {
        id: dto.sucursalId,
        negocio_id: tenant.negocioId,
        deleted_at: null,
      },
    });

    if (!sucursal) {
      throw new NotFoundException('La sucursal especificada no pertenece a este negocio');
    }

    if (tenant.config && tenant.config.usa_multi_almacen === false) {
      const existingCount = await this.prisma.almacen.count({
        where: {
          deleted_at: null,
          sucursal: {
            negocio_id: tenant.negocioId,
            deleted_at: null,
          },
        },
      });
      if (existingCount >= 1) {
        throw new BadRequestException(
          'El negocio tiene deshabilitado el modo multi-almacén en su configuración',
        );
      }
    }

    return this.prisma.almacen.create({
      data: {
        sucursal_id: dto.sucursalId,
        nombre: dto.nombre.trim(),
        tipo: dto.tipo,
        descripcion: dto.descripcion?.trim() ?? null,
      },
    });
  }

  async update(negocioId: string, id: string, dto: UpdateAlmacenDto) {
    await this.findOne(negocioId, id);

    return this.prisma.almacen.update({
      where: { id },
      data: {
        ...(dto.nombre !== undefined ? { nombre: dto.nombre.trim() } : {}),
        ...(dto.tipo !== undefined ? { tipo: dto.tipo } : {}),
        ...(dto.descripcion !== undefined ? { descripcion: dto.descripcion.trim() } : {}),
        ...(dto.activo !== undefined ? { activo: dto.activo } : {}),
      },
    });
  }

  async softDelete(negocioId: string, id: string) {
    await this.findOne(negocioId, id);

    const stockSum = await this.prisma.stock_almacen.aggregate({
      where: { almacen_id: id },
      _sum: { cantidad_actual: true },
    });
    const currentStock = stockSum._sum.cantidad_actual ?? 0;
    if (currentStock > 0) {
      throw new BadRequestException(
        `No se puede eliminar el almacén porque aún tiene ${currentStock} unidades físicas en existencia`,
      );
    }

    const totalActive = await this.prisma.almacen.count({
      where: {
        deleted_at: null,
        sucursal: {
          negocio_id: negocioId,
          deleted_at: null,
        },
      },
    });
    if (totalActive <= 1) {
      throw new BadRequestException('El negocio debe conservar al menos un almacén activo');
    }

    return this.prisma.almacen.update({
      where: { id },
      data: {
        activo: false,
        deleted_at: new Date(),
      },
      select: {
        id: true,
        nombre: true,
        deleted_at: true,
      },
    });
  }
}

