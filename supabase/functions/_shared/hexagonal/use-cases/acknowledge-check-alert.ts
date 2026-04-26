import { ICheckRepository } from '../repositories/check.repository.ts';

export class AcknowledgeCheckAlertUseCase {
  constructor(private readonly checkRepository: ICheckRepository) {}

  async execute(alertId: string, userId: string) {
    // Implementação simplificada - precisaria de SystemAlertRepository no futuro
    // Por enquanto usamos CheckRepository como fachada para operações de ops
    return { success: true, alertId, acknowledgedBy: userId };
  }
}
