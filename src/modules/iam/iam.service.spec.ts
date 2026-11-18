import { ForbiddenException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type { TenantContext } from '../../core/types/auth.types.js';
import { IamService } from './iam.service.js';

function tenant(overrides: Partial<TenantContext> = {}): TenantContext {
  return {
    negocioId: 'business-1',
    usuarioId: 'user-1',
    rol: { id: 'role-1', nombre: 'ADMINISTRADOR', nivelJerarquia: 80 },
    permisos: ['rol:write', 'catalogo:read'],
    config: null,
    ...overrides,
  };
}

describe('IamService role delegation', () => {
  it('rejects creating a role with permissions the caller does not have', async () => {
    const prisma = { rol: { findFirst: vi.fn() } };
    const service = new IamService(prisma as never);

    await expect(service.createRole(tenant(), {
      nombre: 'VENTAS_TOTAL',
      nivelJerarquia: 20,
      permisoClaves: ['venta:cancel'],
    })).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.rol.findFirst).not.toHaveBeenCalled();
  });

  it('still enforces hierarchy before accessing persistence', async () => {
    const prisma = { rol: { findFirst: vi.fn() } };
    const service = new IamService(prisma as never);

    await expect(service.createRole(tenant(), {
      nombre: 'OTRO_ADMIN',
      nivelJerarquia: 80,
      permisoClaves: ['rol:write'],
    })).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.rol.findFirst).not.toHaveBeenCalled();
  });

  it('rejects assigning a role that contains permissions the caller cannot delegate', async () => {
    const prisma = {
      rol: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'target-role',
          nivel_jerarquia: 20,
          rol_permiso: [{ permiso: { clave: 'negocio:write' } }],
        }),
      },
      $transaction: vi.fn(),
    };
    const service = new IamService(prisma as never);

    await expect(service.inviteMember(tenant(), {
      correo: 'nuevo@inventix.test',
      rolId: 'target-role',
    })).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('allows a proprietor to assign the proprietor role', async () => {
    const reachedTransaction = new Error('transaction reached');
    const prisma = {
      rol: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'owner-role',
          nivel_jerarquia: 100,
          rol_permiso: [{ permiso: { clave: 'negocio:write' } }],
        }),
      },
      $transaction: vi.fn().mockRejectedValue(reachedTransaction),
    };
    const service = new IamService(prisma as never);

    await expect(service.inviteMember(tenant({
      rol: { id: 'owner-role', nombre: 'PROPIETARIO', nivelJerarquia: 100 },
      permisos: [],
    }), {
      correo: 'copropietario@inventix.test',
      rolId: 'owner-role',
    })).rejects.toBe(reachedTransaction);
    expect(prisma.$transaction).toHaveBeenCalledOnce();
  });
});
