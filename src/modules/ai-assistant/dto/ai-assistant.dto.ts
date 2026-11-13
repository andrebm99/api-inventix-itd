import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { recomendacion_reposicion_ia_estado } from '@prisma/client';
import { IsEnum, IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';

export class RunForecastDto {
  @ApiPropertyOptional({
    example: 30,
    default: 30,
    minimum: 7,
    maximum: 180,
    description: 'Ventana histórica en días para analizar demanda y clasificación ABC',
  })
  @IsOptional()
  @IsInt()
  @Min(7)
  @Max(180)
  ventanaDias?: number;

  @ApiPropertyOptional({
    example: 14,
    default: 14,
    minimum: 3,
    maximum: 90,
    description: 'Días objetivo de cobertura al calcular la cantidad sugerida',
  })
  @IsOptional()
  @IsInt()
  @Min(3)
  @Max(90)
  diasCoberturaObjetivo?: number;

  @ApiPropertyOptional({ format: 'uuid', description: 'Limitar análisis a una sucursal específica' })
  @IsOptional()
  @IsUUID()
  sucursalId?: string;
}

export enum DecisionRecomendacion {
  ACEPTADA = 'ACEPTADA',
  DESCARTADA = 'DESCARTADA',
}

export class DecideRecommendationDto {
  @ApiProperty({ enum: DecisionRecomendacion })
  @IsEnum(DecisionRecomendacion)
  decision: DecisionRecomendacion;

  @ApiPropertyOptional({
    format: 'uuid',
    description:
      'Almacén destino para el borrador ENTRADA_COMPRA si se acepta (si se omite, elige RECEPCION o PRINCIPAL de la sucursal)',
  })
  @IsOptional()
  @IsUUID()
  almacenDestinoId?: string;

  @ApiPropertyOptional({
    example: 50,
    minimum: 1,
    description: 'Permite al comerciante ajustar la cantidad sugerida al aceptar',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  cantidadAjustada?: number;
}

export type RecommendationStatusFilter = recomendacion_reposicion_ia_estado;

