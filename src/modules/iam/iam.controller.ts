import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentTenant } from '../../core/decorators/current-tenant.decorator.js';
import { TenantAuth } from '../../core/decorators/tenant-auth.decorator.js';
import type { TenantContext } from '../../core/types/auth.types.js';
import { CreateRolDto, InviteMemberDto, UpdateMemberDto, UpdateRolDto } from './dto/iam.dto.js';
import { IamService } from './iam.service.js';

@ApiTags('IAM - Roles y Miembros')
@Controller()
export class IamController {
  constructor(private readonly iamService: IamService) {}

  @TenantAuth('rol:read')
  @Get('roles/permisos')
  @ApiOperation({ summary: 'Listar catálogo de permisos disponibles en el sistema' })
  listPermissions() {
    return this.iamService.listPermissions();
  }

  @TenantAuth('rol:read')
  @Get('roles')
  @ApiOperation({ summary: 'Listar roles globales y personalizados del negocio' })
  listRoles(@CurrentTenant() tenant: TenantContext) {
    return this.iamService.listRoles(tenant.negocioId);
  }

  @TenantAuth('rol:write')
  @Post('roles')
  @ApiOperation({ summary: 'Crear rol personalizado para el negocio respetando jerarquía' })
  createRole(@CurrentTenant() tenant: TenantContext, @Body() dto: CreateRolDto) {
    return this.iamService.createRole(tenant, dto);
  }

  @TenantAuth('rol:write')
  @Patch('roles/:id')
  @ApiOperation({ summary: 'Actualizar rol personalizado del negocio' })
  updateRole(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateRolDto,
  ) {
    return this.iamService.updateRole(tenant, id, dto);
  }

  @TenantAuth('usuario:read')
  @Get('usuarios-negocio')
  @ApiOperation({ summary: 'Listar miembros del negocio y trazabilidad de invitación' })
  listMembers(@CurrentTenant() tenant: TenantContext) {
    return this.iamService.listMembers(tenant.negocioId);
  }

  @TenantAuth('usuario:invite')
  @Post('usuarios-negocio/invitar')
  @ApiOperation({ summary: 'Invitar o crear subusuario dentro del negocio' })
  inviteMember(@CurrentTenant() tenant: TenantContext, @Body() dto: InviteMemberDto) {
    return this.iamService.inviteMember(tenant, dto);
  }

  @TenantAuth('usuario:manage')
  @Patch('usuarios-negocio/:id')
  @ApiOperation({ summary: 'Cambiar rol o estado activo de un miembro del negocio' })
  updateMember(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateMemberDto,
  ) {
    return this.iamService.updateMember(tenant, id, dto);
  }
}

