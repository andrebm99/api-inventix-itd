import type { configuracion_negocio } from '@prisma/client';

export interface AuthenticatedUser {
  id: string;
  correo: string;
  nombre: string;
}

export interface JwtPayload {
  sub: string;
  correo: string;
  nombre: string;
}

export interface TenantContext {
  negocioId: string;
  usuarioId: string;
  rol: {
    id: string;
    nombre: string;
    nivelJerarquia: number;
  };
  permisos: string[];
  config: configuracion_negocio | null;
}

