import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { movimiento_tipo } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class DetalleMovimientoItemDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  productoId: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  loteId?: string;

  @ApiProperty({ example: 10, minimum: 1 })
  @IsInt()
  @Min(1)
  cantidad: number;

  @ApiPropertyOptional({ example: 3.5, minimum: 0 })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  costoUnitario?: number;

  @ApiPropertyOptional({ example: 0, minimum: 0 })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  descuentoUnitario?: number;
}

export class CreateMovimientoDto {
  @ApiProperty({ enum: movimiento_tipo })
  @IsEnum(movimiento_tipo)
  tipo: movimiento_tipo;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  sucursalId: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Requerido en TRASLADO_INTERNO, SALIDA_VENTA, SALIDA_MERMA o ajuste negativo',
  })
  @IsOptional()
  @IsUUID()
  almacenOrigenId?: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Requerido en ENTRADA_COMPRA, TRASLADO_INTERNO o ajuste positivo',
  })
  @IsOptional()
  @IsUUID()
  almacenDestinoId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  proveedorId?: string;

  @ApiProperty({ example: 'Compra semanal a proveedor principal' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  motivo: string;

  @ApiPropertyOptional({ example: 'TRF-2026-001' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  codigoTransferencia?: string;

  @ApiPropertyOptional({
    default: false,
    description: 'Si es true, intenta completar el movimiento inmediatamente al crearlo',
  })
  @IsOptional()
  @IsBoolean()
  completarInmediato?: boolean;

  @ApiProperty({ type: [DetalleMovimientoItemDto] })
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => DetalleMovimientoItemDto)
  detalles: DetalleMovimientoItemDto[];
}

export class AnularMovimientoDto {
  @ApiPropertyOptional({ example: 'Error en cantidad digitada' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  motivo?: string;
}

