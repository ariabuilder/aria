export type D1QueryRow = Record<string, unknown>;

export type D1MutationResult = {
  results?: D1QueryRow[];
  meta?: { changes?: number };
};

export type D1PreparedStatementLike = {
  bind(...values: unknown[]): D1PreparedStatementLike;
  first<T extends D1QueryRow = D1QueryRow>(): Promise<T | null>;
  all<T extends D1QueryRow = D1QueryRow>(): Promise<{
    results?: T[];
  }>;
  run(): Promise<D1MutationResult>;
};

export type RemoteD1DatabaseLike = {
  prepare(sql: string): D1PreparedStatementLike;
  batch(
    statements: D1PreparedStatementLike[],
  ): Promise<Array<{ results?: D1QueryRow[] }>>;
};
