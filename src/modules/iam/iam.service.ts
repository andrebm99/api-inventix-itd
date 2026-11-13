import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../core/database/prisma.service.js';
import type { TenantContext } from '../../core/types/auth.types.js';
import type { CreateRolDto, InviteMemberDto, UpdateMemberDto, UpdateRolDto } from './dto/iam.dto.js';

@Injectable()
export class IamService {
  constructor(private readonly prisma: PrismaService) {}

  async listPermissions() {
    return this.prisma.permiso.findMany({
      orderBy: { clave: 'asc' },
    });
  }

  async listRoles(negocioId: string) {
    const roles = await this.prisma.rol.findMany({
      where: {
        OR: [{ negocio_id: null }, { negocio_id: negocioId }],
      },
      include: {
        rol_permiso: {
          include: {
            permiso: true,
          },
        },
      },
      orderBy: [{ nivel_jerarquia: 'desc' }, { nombre: 'asc' }],
    });

    return roles.map((r) => ({
      id: r.id,
      negocio_id: r.negocio_id,
      esGlobal: r.negocio_id === null,
      nombre: r.nombre,
      descripcion: r.descripcion,
      nivel_jerarquia: r.nivel_jerarquia,
      permisos: r.rol_permiso.map((rp) => rp.permiso.clave),
    }));
  }

  async createRole(tenant: TenantContext, dto: CreateRolDto) {
    this.assertHierarchy(tenant.rol.nivelJerarquia, dto.nivelJerarquia, 'crear un rol');

    const nombre = dto.nombre.trim();
    const dup = await this.prisma.rol.findFirst({
      where: {
        nombre,
        OR: [{ negocio_id: null }, { negocio_id: tenant.negocioId }],
      },
    });
    if (dup) {
      throw new ConflictException(`Ya existe un rol con el nombre "${nombre}"`);
    }

    const permisos = await this.prisma.permiso.findMany({
      where: { clave: { in: dto.permisoClaves } },
    });
    if (permisos.length !== new Set(dto.permisoClaves).size) {
      throw new BadRequestException('Uno o más permisos especificados no existen');
    }

    return this.prisma.$transaction(async (tx) => {
      const role = await tx.rol.create({
        data: {
          negocio_id: tenant.negocioId,
          nombre,
          descripcion: dto.descripcion?.trim() ?? null,
          nivel_jerarquia: dto.nivelJerarquia,
        },
      });

      await tx.rol_permiso.createMany({
        data: permisos.map((p) => ({ rol_id: role.id, permiso_id: p.id })),
      });

      return {
        ...role,
        permisos: permisos.map((p) => p.clave),
      };
    });
  }

  async updateRole(tenant: TenantContext, rolId: string, dto: UpdateRolDto) {
    const role = await this.prisma.rol.findUnique({ where: { id: rolId } });
    if (!role) {
      throw new NotFoundException('Rol no encontrado');
    }
    if (role.negocio_id !== tenant.negocioId) {
      throw new ForbiddenException('No puedes modificar roles globales o de otro negocio');
    }

    const currentLevel = role.nivel_jerarquia ?? 1;
    this.assertHierarchy(tenant.rol.nivelJerarquia, currentLevel, 'modificar este rol');
    if (dto.nivelJerarquia !== undefined) {
      this.assertHierarchy(tenant.rol.nivelJerarquia, dto.nivelJerarquia, 'asignar este nivel');
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.rol.update({
        where: { id: rolId },
        data: {
          ...(dto.nombre !== undefined ? { nombre: dto.nombre.trim() } : {}),
          ...(dto.descripcion !== undefined ? { descripcion: dto.descripcion.trim() } : {}),
          ...(dto.nivelJerarquia !== undefined ? { nivel_jerarquia: dto.nivelJerarquia } : {}),
        },
      });

      if (dto.permisoClaves !== undefined) {
        const permisos = await tx.permiso.findMany({
          where: { clave: { in: dto.permisoClaves } },
        });
        if (permisos.length !== new Set(dto.permisoClaves).size) {
          throw new BadRequestException('Uno o más permisos especificados no existen');
        }
        await tx.rol_permiso.deleteMany({ where: { rol_id: rolId } });
        if (permisos.length > 0) {
          await tx.rol_permiso.createMany({
            data: permisos.map((p) => ({ rol_id: rolId, permiso_id: p.id })),
          });
        }
      }

      return updated;
    });
  }

  async listMembers(negocioId: string) {
    const members = await this.prisma.usuario_negocio.findMany({
      where: { negocio_id: negocioId },
      include: {
        usuario_usuario_negocio_usuario_idTousuario: {
          select: { id: true, nombre: true, correo: true, activo: true, deleted_at: true },
        },
        usuario_usuario_negocio_invitado_por_usuario_idTousuario: {
          select: { id: true, nombre: true, correo: true },
        },
        rol: {
          select: { id: true, nombre: true, nivel_jerarquia: true },
        },
      },
      orderBy: { created_at: 'asc' },
    });

    return members
      .filter((m) => m.usuario_usuario_negocio_usuario_idTousuario.deleted_at === null)
      .map((m) => ({
        id: m.id,
        activo: m.activo,
        created_at: m.created_at,
        usuario: {
          id: m.usuario_usuario_negocio_usuario_idTousuario.id,
          nombre: m.usuario_usuario_negocio_usuario_idTousuario.nombre,
          correo: m.usuario_usuario_negocio_usuario_idTousuario.correo,
        },
        rol: m.rol,
        invitadoPor: m.usuario_usuario_negocio_invitado_por_usuario_idTousuario,
      }));
  }

  async inviteMember(tenant: TenantContext, dto: InviteMemberDto) {
    const rol = await this.prisma.rol.findFirst({
      where: {
        id: dto.rolId,
        OR: [{ negocio_id: null }, { negocio_id: tenant.negocioId }],
      },
    });
    if (!rol) {
      throw new NotFoundException('El rol especificado no existe para este negocio');
    }

    this.assertHierarchy(
      tenant.rol.nivelJerarquia,
      rol.nivel_jerarquia ?? 1,
      'asignar este rol',
    );

    const email = dto.correo.trim().toLowerCase();

    return this.prisma.$transaction(async (tx) => {
      let usuario = await tx.usuario.findFirst({ where: { correo: email } });

      if (usuario && usuario.deleted_at !== null) {
        throw new BadRequestException('La cuenta de usuario asociada fue dada de baja');
      }

      if (!usuario) {
        if (!dto.nombre || !dto.password) {
          throw new BadRequestException(
            'El correo no está registrado; envía nombre y password para crear la cuenta del subusuario',
          );
        }
        const passwordHash = await bcrypt.hash(dto.password, 10);
        usuario = await tx.usuario.create({
          data: {
            nombre: dto.nombre.trim(),
            correo: email,
            password_hash: passwordHash,
          },
        });
      }

      const existingMembership = await tx.usuario_negocio.findUnique({
        where: {
          usuario_id_negocio_id: {
            usuario_id: usuario.id,
            negocio_id: tenant.negocioId,
          },
        },
      });

      if (existingMembership) {
        throw new ConflictException('El usuario ya pertenece a este negocio');
      }

      const membership = await tx.usuario_negocio.create({
        data: {
          usuario_id: usuario.id,
          negocio_id: tenant.negocioId,
          rol_id: rol.id,
          invitado_por_usuario_id: tenant.usuarioId,
          activo: true,
        },
        include: {
          rol: { select: { id: true, nombre: true, nivel_jerarquia: true } },
        },
      });

      return {
        id: membership.id,
        activo: membership.activo,
        usuario: { id: usuario.id, nombre: usuario.nombre, correo: usuario.correo },
        rol: membership.rol,
        invitado_por_usuario_id: membership.invitado_por_usuario_id,
      };
    });
  }

  async updateMember(tenant: TenantContext, membershipId: string, dto: UpdateMemberDto) {
    const target = await this.prisma.usuario_negocio.findFirst({
      where: { id: membershipId, negocio_id: tenant.negocioId },
      include: { rol: true },
    });

    if (!target) {
      throw new NotFoundException('Membresía no encontrada en este negocio');
    }

    if (target.usuario_id === tenant.usuarioId) {
      throw new BadRequestException('No puedes modificar tu propia membresía o rol');
    }

    this.assertHierarchy(
      tenant.rol.nivelJerarquia,
      target.rol.nivel_jerarquia ?? 1,
      'modificar a este miembro',
    );

    if (dto.rolId) {
      const newRole = await this.prisma.rol.findFirst({
        where: {
          id: dto.rolId,
          OR: [{ negocio_id: null }, { negocio_id: tenant.negocioId }],
        },
      });
      if (!newRole) {
        throw new NotFoundException('El nuevo rol no existe para este negocio');
      }
      this.assertHierarchy(
        tenant.rol.nivelJerarquia,
        newRole.nivel_jerarquia ?? 1,
        'asignar el nuevo rol',
      );
    }

    return this.prisma.usuario_negocio.update({
      where: { id: membershipId },
      data: {
        ...(dto.rolId !== undefined ? { rol_id: dto.rolId } : {}),
        ...(dto.activo !== undefined ? { activo: dto.activo } : {}),
      },
      include: {
        rol: { select: { id: true, nombre: true, nivel_jerarquia: true } },
      },
    });
  }

  private assertHierarchy(callerLevel: number, targetLevel: number, action: string): void {
    const allowed = callerLevel >= 100 ? targetLevel <= callerLevel : targetLevel < callerLevel;
    if (!allowed) {
      throw new ForbiddenException(
        `Restricción de jerarquía: tu nivel (${callerLevel}) no permite ${action} de nivel ${targetLevel}`,
      );
    }
  }
}

