import {
  Body,
  Controller,
  Get,
  Param,
  ParseEnumPipe,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { recomendacion_reposicion_ia_estado } from '@prisma/client';
import { CurrentTenant } from '../../core/decorators/current-tenant.decorator.js';
import { TenantAuth } from '../../core/decorators/tenant-auth.decorator.js';
import type { TenantContext } from '../../core/types/auth.types.js';
import { AiAssistantService } from './ai-assistant.service.js';
import { DecideRecommendationDto, RunForecastDto } from './dto/ai-assistant.dto.js';

@ApiTags('Asistente Predictivo IA')
@Controller('ia')
export class AiAssistantController {
  constructor(private readonly aiAssistantService: AiAssistantService) {}

  @TenantAuth('ia:read')
  @Get('recomendaciones')
  @ApiOperation({ summary: 'Listar recomendaciones de reposición IA' })
  @ApiQuery({ name: 'estado', required: false, enum: recomendacion_reposicion_ia_estado })
  @ApiQuery({ name: 'sucursalId', required: false, type: String })
  listRecommendations(
    @CurrentTenant() tenant: TenantContext,
    @Query('estado', new ParseEnumPipe(recomendacion_reposicion_ia_estado, { optional: true }))
    estado?: recomendacion_reposicion_ia_estado,
    @Query('sucursalId', new ParseUUIDPipe({ optional: true })) sucursalId?: string,
  ) {
    return this.aiAssistantService.listRecommendations(tenant.negocioId, { estado, sucursalId });
  }

  @TenantAuth('ia:read')
  @Get('clasificacion-abc')
  @ApiOperation({ summary: 'Consultar clasificación ABC calculada del catálogo' })
  listAbcClassification(@CurrentTenant() tenant: TenantContext) {
    return this.aiAssistantService.listAbcClassification(tenant.negocioId);
  }

  @TenantAuth('ia:read')
  @Get('politicas-reposicion')
  @ApiOperation({ summary: 'Consultar puntos de reorden (ROP) y stock de seguridad por almacén' })
  @ApiQuery({ name: 'almacenId', required: false, type: String })
  listPolicies(
    @CurrentTenant() tenant: TenantContext,
    @Query('almacenId', new ParseUUIDPipe({ optional: true })) almacenId?: string,
  ) {
    return this.aiAssistantService.listPolicies(tenant.negocioId, almacenId);
  }

  @TenantAuth('ia:decide')
  @Post('analizar')
  @ApiOperation({
    summary: 'Ejecutar análisis ABC, cálculo ROP y generación de recomendaciones IA bajo demanda',
  })
  runAnalysis(@CurrentTenant() tenant: TenantContext, @Body() dto: RunForecastDto) {
    return this.aiAssistantService.runAnalysis(tenant, dto);
  }

  @TenantAuth('ia:decide')
  @Post('recomendaciones/:id/decidir')
  @ApiOperation({
    summary:
      'Aceptar o descartar recomendación (Human-in-the-Loop; al aceptar genera borrador ENTRADA_COMPRA)',
  })
  decideRecommendation(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: DecideRecommendationDto,
  ) {
    return this.aiAssistantService.decideRecommendation(tenant, id, dto);
  }
}

