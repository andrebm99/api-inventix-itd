import { Module } from '@nestjs/common';
import { InventoryModule } from '../inventory/inventory.module.js';
import { AiAssistantController } from './ai-assistant.controller.js';
import { AiAssistantService } from './ai-assistant.service.js';
import { EXPLANATION_GENERATOR_PORT } from './domain/explanation.port.js';
import { GeminiExplanationAdapter } from './infrastructure/gemini-explanation.adapter.js';

@Module({
  imports: [InventoryModule],
  controllers: [AiAssistantController],
  providers: [
    AiAssistantService,
    {
      provide: EXPLANATION_GENERATOR_PORT,
      useClass: GeminiExplanationAdapter,
    },
  ],
  exports: [AiAssistantService],
})
export class AiAssistantModule {}

