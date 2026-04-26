import { ICheckRepository, Check } from '../repositories/check.repository.ts';

export class GetCheckStatusUseCase {
  constructor(private readonly checkRepository: ICheckRepository) {}

  async execute(checkId: string): Promise<{ success: boolean; check: Check }> {
    const check = await this.checkRepository.getCheckById(checkId);
    if (!check) {
      throw new Error(`Check not found: ${checkId}`);
    }
    return { success: true, check };
  }
}

