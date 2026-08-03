declare module "cloudflare:workers" {
  export interface DurableObjectWebSocket extends WebSocket {
    serializeAttachment(attachment: unknown): void;
    deserializeAttachment(): unknown;
  }

  export interface WebSocketRequestResponsePair {
    readonly request: string;
    readonly response: string;
  }

  export interface DurableObjectState {
    acceptWebSocket(socket: DurableObjectWebSocket, tags?: string[]): void;
    getWebSockets(tag?: string): DurableObjectWebSocket[];
    setWebSocketAutoResponse(
      pair: WebSocketRequestResponsePair | undefined,
    ): void;
  }

  export abstract class DurableObject<Env = Record<string, unknown>> {
    protected readonly ctx: DurableObjectState;
    protected readonly env: Env;
    constructor(ctx: DurableObjectState, env: Env);
  }

  export interface CachePurgeOptions {
    tags?: string[];
    pathPrefixes?: string[];
    purgeEverything?: boolean;
  }

  export interface CachePurgeResult {
    success: boolean;
    errors: Array<{ code: number; message: string }>;
  }

  export const cache: {
    purge(options: CachePurgeOptions): Promise<CachePurgeResult>;
  };
}
