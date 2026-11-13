import { applyDecorators, SetMetadata, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiSecurity } from '@nestjs/swagger';
import { JwtAuthGuard } from '../guards/jwt-auth.guard.js';
import { PERMISSIONS_KEY, PermissionsGuard } from '../guards/permissions.guard.js';
import { TenantGuard } from '../guards/tenant.guard.js';

export function TenantAuth(...permissions: string[]) {
  return applyDecorators(
    SetMetadata(PERMISSIONS_KEY, permissions),
    UseGuards(JwtAuthGuard, TenantGuard, PermissionsGuard),
    ApiBearerAuth('access-token'),
    ApiSecurity('tenant-id'),
  );
}

