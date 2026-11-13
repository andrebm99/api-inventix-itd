import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { producto_lote_estado } from '@prisma/client';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateCategoriaDto {
  @ApiProperty({ example: 'Bebidas y Lácteos' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  nombre: string;
}

export class UpdateCategoriaDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  nombre?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  activo?: boolean;
}

export class CreateUnidadMedidaDto {
  @ApiProperty({ example: 'Botella' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  nombre: string;

  @ApiProperty({ example: 'BOT' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(10)
  simbolo: string;
}

export class CreateProductoDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  categoriaId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  unidadMedidaId?: string;

  @ApiPropertyOptional({ example: 'BEB-001' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  sku?: string;

  @ApiPropertyOptional({ example: '7750123456789' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  codigoBarras?: string;

  @ApiProperty({ example: 'Leche Entera 1L' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  nombre: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  descripcion?: string;

  @ApiPropertyOptional({ example: 3.5, minimum: 0 })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  costoPromedio?: number;

  @ApiProperty({ example: 5.2, minimum: 0 })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  precioVentaBase: number;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  manejaLotes?: boolean;
}

export class UpdateProductoDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  categoriaId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  unidadMedidaId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(64)
  sku?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(64)
  codigoBarras?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  nombre?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  descripcion?: string;

  @ApiPropertyOptional({ minimum: 0 })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  precioVentaBase?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  manejaLotes?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  activo?: boolean;
}

export class CreateLoteDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  productoId: string;

  @ApiProperty({ example: 'LOTE-2026-A' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  codigoLote: string;

  @ApiPropertyOptional({ example: '2026-10-01' })
  @IsOptional()
  @IsDateString()
  fechaFabricacion?: string;

  @ApiProperty({ example: '2027-03-15' })
  @IsDateString()
  fechaVencimiento: string;

  @ApiPropertyOptional({ enum: producto_lote_estado, default: producto_lote_estado.DISPONIBLE })
  @IsOptional()
  @IsEnum(producto_lote_estado)
  estado?: producto_lote_estado;
}

export class UpdateLoteEstadoDto {
  @ApiProperty({ enum: producto_lote_estado })
  @IsEnum(producto_lote_estado)
  estado: producto_lote_estado;
}

export class UpsertUbicacionDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  productoId: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  almacenId: string;

  @ApiPropertyOptional({ example: 'P-03' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  pasillo?: string;

  @ApiPropertyOptional({ example: 'E-02' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  estante?: string;

  @ApiPropertyOptional({ example: 12 })
  @IsOptional()
  @IsInt()
  coordenadaX?: number;

  @ApiPropertyOptional({ example: 4 })
  @IsOptional()
  @IsInt()
  coordenadaY?: number;

  @ApiPropertyOptional({ example: 'Góndola Lácteos Frente' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  zonaRotulo?: string;
}

