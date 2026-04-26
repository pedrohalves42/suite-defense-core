// get-check-status.ts - Use case to retrieve monitoring check details
import { ICheckRepository } from '../repositories/check.repository.ts';

export class GetCheckStatusUseCase {
  constructor(private readonly checkRepository: ICheckRepository) {}

  async execute(checkId: string) {
    const check = await this.checkRepository.getCheckById(checkId);
    if (!check) {
      throw new Error(`Check not found: ${checkId}`);
    }
    return { success: true, check };
  }
}
