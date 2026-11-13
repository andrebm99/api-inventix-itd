import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../core/database/prisma.service.js';
import type { TenantContext } from '../../core/types/auth.types.js';
import type { CreateSucursalDto, UpdateSucursalDto } from './dto/sucursal.dto.js';

@Injectable()
export class SucursalService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(negocioId: string) {
    return this.prisma.sucursal.findMany({
      where: {
        negocio_id: negocioId,
        deleted_at: null,
      },
      include: {
        almacen: {
          where: { deleted_at: null },
          orderBy: { created_at: 'asc' },
        },
      },
      orderBy: { created_at: 'asc' },
    });
  }

  async findOne(negocioId: string, id: string) {
    const sucursal = await this.prisma.sucursal.findFirst({
      where: {
        id,
        negocio_id: negocioId,
        deleted_at: null,
      },
      include: {
        almacen: {
          where: { deleted_at: null },
        },
      },
    });

    if (!sucursal) {
      throw new NotFoundException('Sucursal no encontrada');
    }

    return sucursal;
  }

  async create(tenant: TenantContext, dto: CreateSucursalDto) {
    if (tenant.config && tenant.config.usa_multi_almacen === false) {
      const count = await this.prisma.sucursal.count({
        where: { negocio_id: tenant.negocioId, deleted_at: null },
      });
      if (count >= 1) {
        throw new BadRequestException(
          'La configuración del negocio no permite crear múltiples sucursales/almacenes',
        );
      }
    }

    return this.prisma.sucursal.create({
      data: {
        negocio_id: tenant.negocioId,
        nombre: dto.nombre.trim(),
        direccion: dto.direccion?.trim() ?? null,
        ciudad: dto.ciudad?.trim() ?? null,
        telefono: dto.telefono?.trim() ?? null,
      },
    });
  }

  async update(negocioId: string, id: string, dto: UpdateSucursalDto) {
    await this.findOne(negocioId, id);

    return this.prisma.sucursal.update({
      where: { id },
      data: {
        ...(dto.nombre !== undefined ? { nombre: dto.nombre.trim() } : {}),
        ...(dto.direccion !== undefined ? { direccion: dto.direccion.trim() } : {}),
        ...(dto.ciudad !== undefined ? { ciudad: dto.ciudad.trim() } : {}),
        ...(dto.telefono !== undefined ? { telefono: dto.telefono.trim() } : {}),
        ...(dto.activo !== undefined ? { activo: dto.activo } : {}),
      },
    });
  }

  async softDelete(negocioId: string, id: string) {
    await this.findOne(negocioId, id);

    const activeCount = await this.prisma.sucursal.count({
      where: { negocio_id: negocioId, deleted_at: null },
    });
    if (activeCount <= 1) {
      throw new BadRequestException('El negocio debe conservar al menos una sucursal activa');
    }

    return this.prisma.sucursal.update({
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

