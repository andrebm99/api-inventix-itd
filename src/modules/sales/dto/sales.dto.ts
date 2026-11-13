import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class DetalleVentaItemDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  productoId: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  loteId?: string;

  @ApiProperty({ example: 2, minimum: 1 })
  @IsInt()
  @Min(1)
  cantidad: number;

  @ApiPropertyOptional({
    example: 5.2,
    description: 'Si se omite, usa precio_venta_base del producto',
  })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  precioUnitario?: number;

  @ApiPropertyOptional({ example: 0, minimum: 0 })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  descuento?: number;
}

export class PagoVentaItemDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  metodoPagoId: string;

  @ApiProperty({ example: 10.4, minimum: 0.01 })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  monto: number;

  @ApiPropertyOptional({ example: 'OP-998811' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  referencia?: string;
}

export class CreateVentaDto {
  @ApiProperty({ format: 'uuid', description: 'Almacén desde donde se despacha la venta' })
  @IsUUID()
  almacenDespachoId: string;

  @ApiPropertyOptional({ example: 'B001-000012' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  numeroComprobante?: string;

  @ApiPropertyOptional({ example: 0, minimum: 0 })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  descuentoGlobal?: number;

  @ApiPropertyOptional({ example: 0.18, minimum: 0, maximum: 1, default: 0 })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  @Max(1)
  tasaImpuesto?: number;

  @ApiProperty({ type: [DetalleVentaItemDto] })
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => DetalleVentaItemDto)
  detalles: DetalleVentaItemDto[];

  @ApiProperty({ type: [PagoVentaItemDto] })
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => PagoVentaItemDto)
  pagos: PagoVentaItemDto[];
}

export class AnularVentaDto {
  @ApiPropertyOptional({ example: 'Devolución total del cliente' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  motivo?: string;
}

