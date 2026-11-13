export const EXPLANATION_GENERATOR_PORT = Symbol('EXPLANATION_GENERATOR_PORT');

export interface ReplenishmentExplanationInput {
  productoNombre: string;
  sku: string | null;
  sucursalNombre: string;
  claseAbc: 'A' | 'B' | 'C';
  stockActual: number;
  demandaDiariaPromedio: number;
  diasCoberturaActual: number;
  puntoReorden: number;
  stockSeguridad: number;
  cantidadSugerida: number;
  proveedorNombre: string | null;
  leadTimeDias: number;
  costoUnitarioReferencia: number | null;
}

export interface ExplanationResult {
  explanation: string;
  provider: 'gemini' | 'heuristic';
}

export interface ExplanationGeneratorPort {
  generateReplenishmentExplanation(
    input: ReplenishmentExplanationInput,
  ): Promise<ExplanationResult>;
}

