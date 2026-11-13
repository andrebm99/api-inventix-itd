import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ScheduleModule } from '@nestjs/schedule';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { PrismaModule } from './core/database/prisma.module.js';
import { AiAssistantModule } from './modules/ai-assistant/ai-assistant.module.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { CatalogModule } from './modules/catalog/catalog.module.js';
import { IamModule } from './modules/iam/iam.module.js';
import { InventoryModule } from './modules/inventory/inventory.module.js';
import { OrganizationModule } from './modules/organization/organization.module.js';
import { ReportsModule } from './modules/reports/reports.module.js';
import { SalesModule } from './modules/sales/sales.module.js';
import { SnapshotsModule } from './modules/snapshots/snapshots.module.js';
import { SuppliersModule } from './modules/suppliers/suppliers.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    EventEmitterModule.forRoot(),
    ScheduleModule.forRoot(),
    PrismaModule,
    AuthModule,
    OrganizationModule,
    IamModule,
    CatalogModule,
    SuppliersModule,
    InventoryModule,
    SalesModule,
    SnapshotsModule,
    AiAssistantModule,
    ReportsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
