import { GoogleGenAI } from '@google/genai';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  ExplanationGeneratorPort,
  ExplanationResult,
  ReplenishmentExplanationInput,
} from '../domain/explanation.port.js';

@Injectable()
export class GeminiExplanationAdapter implements ExplanationGeneratorPort {
  private readonly logger = new Logger(GeminiExplanationAdapter.name);
  private readonly client: GoogleGenAI | null;

  constructor(configService: ConfigService) {
    const apiKey = configService.get<string>('GEMINI_API_KEY')?.trim();
    this.client = apiKey ? new GoogleGenAI({ apiKey }) : null;
  }

  async generateReplenishmentExplanation(
    input: ReplenishmentExplanationInput,
  ): Promise<ExplanationResult> {
    if (!this.client) {
      return {
        explanation: this.buildHeuristicExplanation(input),
        provider: 'heuristic',
      };
    }

    try {
      const interaction = await this.client.interactions.create({
        model: 'gemini-3.8-flash',
        store: false,
        system_instruction:
          'Eres el asistente predictivo de Inventics SaaS para pymes. Redacta en español un motivo breve (máximo 2 oraciones claras y accionables) explicando por qué conviene reponer el producto, usando exclusivamente los datos numéricos entregados sin inventar cifras.',
        input: JSON.stringify(input),
        generation_config: {
          temperature: 0.2,
          max_output_tokens: 220,
        },
      });

      const text = interaction.output_text?.trim();
      if (text) {
        return { explanation: text, provider: 'gemini' };
      }
    } catch (error) {
      this.logger.warn(
        `Fallo al consultar Gemini API; usando explicación determinística de respaldo: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }

    return {
      explanation: this.buildHeuristicExplanation(input),
      provider: 'heuristic',
    };
  }

  private buildHeuristicExplanation(input: ReplenishmentExplanationInput): string {
    const skuLabel = input.sku ? ` (${input.sku})` : '';
    const provLabel = input.proveedorNombre
      ? ` con proveedor ${input.proveedorNombre} (entrega en ${input.leadTimeDias} días)`
      : ` considerando un tiempo de entrega de ${input.leadTimeDias} días`;

    return (
      `Producto clase ${input.claseAbc}: "${input.productoNombre}${skuLabel}" en ${input.sucursalNombre} ` +
      `tiene ${input.stockActual} unidades (${input.diasCoberturaActual.toFixed(1)} días de cobertura ` +
      `a un ritmo de ${input.demandaDiariaPromedio.toFixed(2)} u/día), por debajo del punto de reorden (${input.puntoReorden}). ` +
      `Se sugiere reponer ${input.cantidadSugerida} unidades${provLabel}.`
    );
  }
}

