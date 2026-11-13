import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service.js';
import { SeedService } from './seed.service.js';

@Global()
@Module({
  providers: [PrismaService, SeedService],
  exports: [PrismaService],
})
export class PrismaModule {}
