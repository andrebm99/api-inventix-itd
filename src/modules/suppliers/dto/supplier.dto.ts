import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEmail,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateProveedorDto {
  @ApiProperty({ example: 'Distribuidora Andina S.A.' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  razonSocial: string;

  @ApiProperty({ example: '20554433221' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  ruc: string;

  @ApiPropertyOptional({ example: '987654321' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  telefono?: string;

  @ApiPropertyOptional({ example: 'ventas@andina.com' })
  @IsOptional()
  @IsEmail()
  @MaxLength(120)
  correo?: string;

  @ApiPropertyOptional({ example: 4, default: 3, minimum: 1, maximum: 180 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(180)
  leadTimePromedioDias?: number;
}

export class UpdateProveedorDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  razonSocial?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  ruc?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(20)
  telefono?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  @MaxLength(120)
  correo?: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 180 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(180)
  leadTimePromedioDias?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  activo?: boolean;
}

export class UpsertProductoProveedorDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  proveedorId: string;

  @ApiPropertyOptional({ example: 'PROV-LECHE-1L' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  codigoProveedor?: string;

  @ApiProperty({ example: 3.45, minimum: 0 })
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  costoCompra: number;

  @ApiPropertyOptional({ example: 3, minimum: 1, maximum: 180 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(180)
  leadTimeDias?: number;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  esPreferente?: boolean;
}

