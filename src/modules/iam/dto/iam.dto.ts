import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsEmail,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class CreateRolDto {
  @ApiProperty({ example: 'CAJERO_TURNO' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  nombre: string;

  @ApiPropertyOptional({ example: 'Puede emitir ventas y ver catálogo' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  descripcion?: string;

  @ApiProperty({ example: 25, minimum: 1, maximum: 99 })
  @IsInt()
  @Min(1)
  @Max(99)
  nivelJerarquia: number;

  @ApiProperty({ example: ['catalogo:read', 'venta:read', 'venta:create'], type: [String] })
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  permisoClaves: string[];
}

export class UpdateRolDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  nombre?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  descripcion?: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 99 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(99)
  nivelJerarquia?: number;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  permisoClaves?: string[];
}

export class InviteMemberDto {
  @ApiProperty({ example: 'operario@empresa.com' })
  @IsEmail()
  @MaxLength(120)
  correo: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  rolId: string;

  @ApiPropertyOptional({
    example: 'Carlos Mendoza',
    description: 'Requerido solo si el correo aún no tiene cuenta global',
  })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  nombre?: string;

  @ApiPropertyOptional({
    example: 'Temp1234!',
    description: 'Contraseña inicial si se crea usuario nuevo',
  })
  @IsOptional()
  @IsString()
  @MinLength(6)
  @MaxLength(72)
  password?: string;
}

export class UpdateMemberDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  rolId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  activo?: boolean;
}

