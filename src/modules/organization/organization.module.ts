import { Module } from '@nestjs/common';
import { AlmacenController } from './almacen.controller.js';
import { AlmacenService } from './almacen.service.js';
import { NegocioController } from './negocio.controller.js';
import { NegocioService } from './negocio.service.js';
import { SucursalController } from './sucursal.controller.js';
import { SucursalService } from './sucursal.service.js';

@Module({
  controllers: [NegocioController, SucursalController, AlmacenController],
  providers: [NegocioService, SucursalService, AlmacenService],
  exports: [NegocioService, SucursalService, AlmacenService],
})
export class OrganizationModule {}

