import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { TenantContext } from '../types/auth.types.js';

export const PERMISSIONS_KEY = 'requiredPermissions';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredPermissions = this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredPermissions || requiredPermissions.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<{ tenant?: TenantContext }>();
    const tenant = request.tenant;

    if (!tenant) {
      throw new ForbiddenException('Contexto de negocio no resuelto');
    }

    if (tenant.rol.nivelJerarquia >= 100) {
      return true;
    }

    const hasAll = requiredPermissions.every((perm) => tenant.permisos.includes(perm));
    if (!hasAll) {
      throw new ForbiddenException(
        `Permisos insuficientes. Requiere: ${requiredPermissions.join(', ')}`,
      );
    }

    return true;
  }
}

