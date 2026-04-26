// @ts-nocheck
import { ICheckRepository } from '../repositories/check.repository.ts';

export class ToggleCheckActiveUseCase {
  constructor(private readonly checkRepository: ICheckRepository) {}

  async execute(checkId: string, isActive: boolean) {
    await this.checkRepository.updateCheckStatus(checkId, { is_active: isActive });
    return { success: true, checkId, isActive };
  }
}
