export interface ProcessUpdateStatusCommand {
  updateId: string;
  newStatus: 'downloading' | 'applying' | 'completed' | 'failed';
  errorMessage?: string;
}

export interface ProcessUpdateStatusResult {
  updateId: string;
  previousStatus: string;
  currentStatus: string;
}

/**
 * Input port: Processes a status update reported by an agent during
 * the download/apply lifecycle.
 */
export interface ProcessUpdateStatusUseCase {
  execute(command: ProcessUpdateStatusCommand): Promise<ProcessUpdateStatusResult>;
}
