declare global {
  interface Response {
    readonly webSocket?: WebSocket;
  }

  interface WebSocket {
    accept(): void;
  }
}

export {};
