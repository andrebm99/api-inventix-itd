import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { TenantContext } from '../types/auth.types.js';

export const CurrentTenant = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): TenantContext => {
    const request = ctx.switchToHttp().getRequest<{ tenant: TenantContext }>();
    return request.tenant;
  },
);

