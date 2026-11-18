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

  @ApiPropertyOptional({ example: 'LOT-2026-A' })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  numeroLote?: string;

  @ApiPropertyOptional({ example: 'LOT-2026-A' })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  codigoLote?: string;

  @ApiPropertyOptional({ example: '2026-12-31' })
  @IsOptional()
  @IsString()
  fechaVencimiento?: string;

  @ApiPropertyOptional({ example: '2026-01-01' })
  @IsOptional()
  @IsString()
  fechaFabricacion?: string;

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

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  sucursalId?: string;

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

  @ApiPropertyOptional({ example: 'Movimiento de inventario' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  motivo?: string;

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

export class UpdateMovimientoDto {
  @ApiPropertyOptional({ enum: movimiento_tipo })
  @IsOptional()
  @IsEnum(movimiento_tipo)
  tipo?: movimiento_tipo;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  almacenOrigenId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  almacenDestinoId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  proveedorId?: string;

  @ApiPropertyOptional({ example: 'Actualización de motivo' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  motivo?: string;

  @ApiPropertyOptional({ example: 'TRF-2026-001' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  codigoTransferencia?: string;

  @ApiPropertyOptional({ type: [DetalleMovimientoItemDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DetalleMovimientoItemDto)
  detalles?: DetalleMovimientoItemDto[];
}

