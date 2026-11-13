import {
  BadRequestException,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { PrismaService } from '../database/prisma.service.js';
import type { AuthenticatedUser, TenantContext } from '../types/auth.types.js';

@Injectable()
export class TenantGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<{
      headers: Record<string, string | string[] | undefined>;
      user?: AuthenticatedUser;
      tenant?: TenantContext;
    }>();

    const user = request.user;
    if (!user) {
      throw new ForbiddenException('Usuario no autenticado');
    }

    const rawHeader = request.headers['x-negocio-id'];
    const negocioId = Array.isArray(rawHeader) ? rawHeader[0] : rawHeader;

    if (!negocioId || typeof negocioId !== 'string' || !negocioId.trim()) {
      throw new BadRequestException('El header x-negocio-id es obligatorio');
    }

    const trimmedNegocioId = negocioId.trim();

    const membership = await this.prisma.usuario_negocio.findUnique({
      where: {
        usuario_id_negocio_id: {
          usuario_id: user.id,
          negocio_id: trimmedNegocioId,
        },
      },
      include: {
        negocio: {
          include: {
            configuracion_negocio: true,
          },
        },
        rol: {
          include: {
            rol_permiso: {
              include: {
                permiso: true,
              },
            },
          },
        },
      },
    });

    if (
      !membership ||
      !membership.activo ||
      membership.negocio.deleted_at !== null ||
      !membership.negocio.activo
    ) {
      throw new ForbiddenException('No tienes acceso activo a este negocio');
    }

    request.tenant = {
      negocioId: trimmedNegocioId,
      usuarioId: user.id,
      rol: {
        id: membership.rol.id,
        nombre: membership.rol.nombre,
        nivelJerarquia: membership.rol.nivel_jerarquia ?? 1,
      },
      permisos: membership.rol.rol_permiso.map((rp) => rp.permiso.clave),
      config: membership.negocio.configuracion_negocio,
    };

    return true;
  }
}

