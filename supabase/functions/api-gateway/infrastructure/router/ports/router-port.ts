/**
 * Hexagonal Port: API Router
 * 
 * Defines the contract for looking up and executing actions.
 */

export interface ActionMetadata {
  namespace: string;
  actionName: string;
  isProxy: boolean;
  target?: string;
  handler?: Function;
}

export interface RouterPort {
  /** Find metadata for a specific action string (e.g. "admin:create-user") */
  getAction(action: string): ActionMetadata | null;
  
  /** Execute an action proxy (HTTP call to another edge function) */
  proxyAction(target: string, payload: unknown, headers: Record<string, string>): Promise<Response>;
}
