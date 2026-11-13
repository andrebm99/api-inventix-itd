import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEmail,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateNegocioDto {
  @ApiProperty({ example: 'Ferretería El Constructor S.A.C.' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  nombre: string;

  @ApiProperty({ example: '20601234567' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  ruc: string;

  @ApiPropertyOptional({ example: 'contacto@constructor.com' })
  @IsOptional()
  @IsEmail()
  @MaxLength(120)
  correoContacto?: string;

  @ApiPropertyOptional({ example: '999888777' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  telefono?: string;

  @ApiPropertyOptional({ example: 'Sucursal Principal' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  sucursalPrincipalNombre?: string;

  @ApiPropertyOptional({ example: 'Almacén Principal' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  almacenPrincipalNombre?: string;
}

export class UpdateNegocioDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  nombre?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  @MaxLength(120)
  correoContacto?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(20)
  telefono?: string;
}

export class UpdateConfiguracionNegocioDto {
  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  usa_lotes?: boolean;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  usa_multi_almacen?: boolean;

  @ApiPropertyOptional({ default: 30, minimum: 1, maximum: 365 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(365)
  dias_alerta_vencimiento?: number;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  permite_stock_negativo?: boolean;
}

