import { ApiPropertyOptional } from '@nestjs/swagger';
import { cierre_inventario_periodo_tipo_periodo } from '@prisma/client';
import { IsDateString, IsEnum, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class ExecuteCloseDto {
  @ApiPropertyOptional({
    example: '2026-11-11',
    description: 'Fecha de cierre YYYY-MM-DD (por defecto hoy)',
  })
  @IsOptional()
  @IsDateString()
  fechaCierre?: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'Si se omite, cierra todos los almacenes activos del negocio' })
  @IsOptional()
  @IsUUID()
  almacenId?: string;

  @ApiPropertyOptional({
    enum: cierre_inventario_periodo_tipo_periodo,
    default: cierre_inventario_periodo_tipo_periodo.DIARIO,
  })
  @IsOptional()
  @IsEnum(cierre_inventario_periodo_tipo_periodo)
  tipoPeriodo?: cierre_inventario_periodo_tipo_periodo;

  @ApiPropertyOptional({ example: 'Cierre manual fin de turno' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  observaciones?: string;
}

