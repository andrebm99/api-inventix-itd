import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { almacen_tipo } from '@prisma/client';
import { IsBoolean, IsEnum, IsNotEmpty, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class CreateAlmacenDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  sucursalId: string;

  @ApiProperty({ example: 'Mostrador Piso 1' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  nombre: string;

  @ApiProperty({ enum: almacen_tipo, default: almacen_tipo.PRINCIPAL })
  @IsEnum(almacen_tipo)
  tipo: almacen_tipo;

  @ApiPropertyOptional({ example: 'Vitrinas de atención directa al público' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  descripcion?: string;
}

export class UpdateAlmacenDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  nombre?: string;

  @ApiPropertyOptional({ enum: almacen_tipo })
  @IsOptional()
  @IsEnum(almacen_tipo)
  tipo?: almacen_tipo;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  descripcion?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  activo?: boolean;
}

