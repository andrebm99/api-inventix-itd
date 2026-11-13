import {
  ConflictException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { almacen_tipo } from '@prisma/client';
import { PrismaService } from '../../core/database/prisma.service.js';
import type {
  CreateNegocioDto,
  UpdateConfiguracionNegocioDto,
  UpdateNegocioDto,
} from './dto/negocio.dto.js';

@Injectable()
export class NegocioService {
  constructor(private readonly prisma: PrismaService) {}

  async create(usuarioId: string, dto: CreateNegocioDto) {
    const ruc = dto.ruc.trim();
    const existingRuc = await this.prisma.negocio.findUnique({ where: { ruc } });
    if (existingRuc) {
      throw new ConflictException(`Ya existe un negocio registrado con el RUC ${ruc}`);
    }

    const ownerRole = await this.prisma.rol.findFirst({
      where: { negocio_id: null, nombre: 'PROPIETARIO' },
    });

    if (!ownerRole) {
      throw new InternalServerErrorException('Rol global PROPIETARIO no inicializado');
    }

    return this.prisma.$transaction(async (tx) => {
      const negocio = await tx.negocio.create({
        data: {
          nombre: dto.nombre.trim(),
          ruc,
          correo_contacto: dto.correoContacto?.trim() ?? null,
          telefono: dto.telefono?.trim() ?? null,
        },
      });

      const configuracion = await tx.configuracion_negocio.create({
        data: {
          negocio_id: negocio.id,
          usa_lotes: true,
          usa_multi_almacen: true,
          dias_alerta_vencimiento: 30,
          permite_stock_negativo: false,
        },
      });

      const sucursalPrincipal = await tx.sucursal.create({
        data: {
          negocio_id: negocio.id,
          nombre: dto.sucursalPrincipalNombre?.trim() || 'Sucursal Principal',
        },
      });

      const almacenPrincipal = await tx.almacen.create({
        data: {
          sucursal_id: sucursalPrincipal.id,
          nombre: dto.almacenPrincipalNombre?.trim() || 'Almacén Principal',
          tipo: almacen_tipo.PRINCIPAL,
          descripcion: 'Almacén principal creado automáticamente',
        },
      });

      await tx.usuario_negocio.create({
        data: {
          usuario_id: usuarioId,
          negocio_id: negocio.id,
          rol_id: ownerRole.id,
          invitado_por_usuario_id: null,
        },
      });

      return {
        ...negocio,
        configuracion_negocio: configuracion,
        sucursalPrincipal: {
          ...sucursalPrincipal,
          almacenes: [almacenPrincipal],
        },
      };
    });
  }

  async findMyBusinesses(usuarioId: string) {
    const memberships = await this.prisma.usuario_negocio.findMany({
      where: {
        usuario_id: usuarioId,
        activo: true,
        negocio: {
          deleted_at: null,
          activo: true,
        },
      },
      include: {
        negocio: {
          include: {
            configuracion_negocio: true,
          },
        },
        rol: {
          select: {
            id: true,
            nombre: true,
            nivel_jerarquia: true,
          },
        },
      },
      orderBy: { created_at: 'asc' },
    });

    return memberships.map((m) => ({
      ...m.negocio,
      rol: m.rol,
    }));
  }

  async findOne(negocioId: string) {
    const negocio = await this.prisma.negocio.findFirst({
      where: { id: negocioId, deleted_at: null },
      include: {
        configuracion_negocio: true,
      },
    });

    if (!negocio) {
      throw new NotFoundException('Negocio no encontrado');
    }

    return negocio;
  }

  async update(negocioId: string, dto: UpdateNegocioDto) {
    await this.findOne(negocioId);

    return this.prisma.negocio.update({
      where: { id: negocioId },
      data: {
        ...(dto.nombre !== undefined ? { nombre: dto.nombre.trim() } : {}),
        ...(dto.correoContacto !== undefined
          ? { correo_contacto: dto.correoContacto.trim() }
          : {}),
        ...(dto.telefono !== undefined ? { telefono: dto.telefono.trim() } : {}),
        updated_at: new Date(),
      },
      include: {
        configuracion_negocio: true,
      },
    });
  }

  async updateConfig(negocioId: string, dto: UpdateConfiguracionNegocioDto) {
    await this.findOne(negocioId);

    return this.prisma.configuracion_negocio.upsert({
      where: { negocio_id: negocioId },
      update: {
        ...(dto.usa_lotes !== undefined ? { usa_lotes: dto.usa_lotes } : {}),
        ...(dto.usa_multi_almacen !== undefined
          ? { usa_multi_almacen: dto.usa_multi_almacen }
          : {}),
        ...(dto.dias_alerta_vencimiento !== undefined
          ? { dias_alerta_vencimiento: dto.dias_alerta_vencimiento }
          : {}),
        ...(dto.permite_stock_negativo !== undefined
          ? { permite_stock_negativo: dto.permite_stock_negativo }
          : {}),
        updated_at: new Date(),
      },
      create: {
        negocio_id: negocioId,
        usa_lotes: dto.usa_lotes ?? true,
        usa_multi_almacen: dto.usa_multi_almacen ?? true,
        dias_alerta_vencimiento: dto.dias_alerta_vencimiento ?? 30,
        permite_stock_negativo: dto.permite_stock_negativo ?? false,
      },
    });
  }

  async softDelete(negocioId: string) {
    await this.findOne(negocioId);

    return this.prisma.negocio.update({
      where: { id: negocioId },
      data: {
        activo: false,
        deleted_at: new Date(),
        updated_at: new Date(),
      },
      select: {
        id: true,
        nombre: true,
        deleted_at: true,
      },
    });
  }
}

