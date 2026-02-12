export interface RollbackUpdateCommand {
  updateId: string;
  reason: string;
}

export interface RollbackUpdateResult {
  updateId: string;
  rolledBackFromStatus: string;
}

/**
 * Input port: Rolls back a completed update on an agent.
 */
export interface RollbackUpdateUseCase {
  execute(command: RollbackUpdateCommand): Promise<RollbackUpdateResult>;
}
