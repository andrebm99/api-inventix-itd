import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import {
  DEFAULT_GLOBAL_UNITS,
  DEFAULT_PAYMENT_METHODS,
  SYSTEM_PERMISSIONS,
  SYSTEM_ROLES,
} from '../constants/permissions.constants.js';
import { PrismaService } from './prisma.service.js';

/**
 * Seeds global RBAC permissions/roles, payment methods and base units idempotently.
 */
@Injectable()
export class SeedService implements OnModuleInit {
  private readonly logger = new Logger(SeedService.name);

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit(): Promise<void> {
    await this.ensureBaseData();
  }

  async ensureBaseData(): Promise<void> {
    await this.seedPermissionsAndRoles();

    const existingPaymentCount = await this.prisma.metodo_pago.count();
    if (existingPaymentCount === 0) {
      await this.prisma.metodo_pago.createMany({
        data: DEFAULT_PAYMENT_METHODS.map((nombre) => ({ nombre, activo: true })),
      });
      this.logger.log('Default payment methods seeded');
    }

    const existingUnitCount = await this.prisma.unidad_medida.count({
      where: { negocio_id: null },
    });
    if (existingUnitCount === 0) {
      await this.prisma.unidad_medida.createMany({
        data: DEFAULT_GLOBAL_UNITS.map((unit) => ({
          negocio_id: null,
          nombre: unit.nombre,
          simbolo: unit.simbolo,
        })),
      });
      this.logger.log('Default global measurement units seeded');
    }
  }

  private async seedPermissionsAndRoles(): Promise<void> {
    for (const perm of SYSTEM_PERMISSIONS) {
      await this.prisma.permiso.upsert({
        where: { clave: perm.clave },
        update: { descripcion: perm.descripcion },
        create: { clave: perm.clave, descripcion: perm.descripcion },
      });
    }

    const allPermissions = await this.prisma.permiso.findMany();
    const permByKey = new Map(allPermissions.map((p) => [p.clave, p.id]));

    for (const roleDef of SYSTEM_ROLES) {
      let role = await this.prisma.rol.findFirst({
        where: { negocio_id: null, nombre: roleDef.nombre },
      });

      if (!role) {
        role = await this.prisma.rol.create({
          data: {
            negocio_id: null,
            nombre: roleDef.nombre,
            descripcion: roleDef.descripcion,
            nivel_jerarquia: roleDef.nivelJerarquia,
          },
        });
      }

      const rolePerms = roleDef.permisos
        .map((clave) => permByKey.get(clave))
        .filter((id): id is string => Boolean(id))
        .map((permiso_id) => ({ rol_id: role.id, permiso_id }));

      if (rolePerms.length > 0) {
        await this.prisma.rol_permiso.createMany({
          data: rolePerms,
          skipDuplicates: true,
        });
      }
    }
  }
}

