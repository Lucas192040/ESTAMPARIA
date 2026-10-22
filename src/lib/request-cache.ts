/** Cache de curta duração para respostas de leitura do servidor.
 * Mantém somente a última projeção, compartilha consultas concorrentes e
 * impede novas tentativas contínuas durante uma indisponibilidade do banco.
 * Em funções serverless a memória é por instância (não distribuída).
 */
export function createRequestCache<T>(
  fetchValue: () => Promise<T>,
  { ttlMs, failureCooldownMs, now = Date.now }: {
    ttlMs: number;
    failureCooldownMs: number;
    now?: () => number;
  },
) {
  let value: T | undefined;
  let expiresAt = 0;
  let pending: Promise<T> | null = null;
  let failure: unknown = null;
  let blockedUntil = 0;
  let generation = 0;

  function invalidate() {
    generation++;
    value = undefined;
    expiresAt = 0;
    pending = null;
    failure = null;
    blockedUntil = 0;
  }

  return {
    async get(force = false): Promise<T> {
      if (force) invalidate();
      const current = now();
      if (value !== undefined && current < expiresAt) return value;
      if (pending) return pending;
      if (failure !== null && current < blockedUntil) throw failure;
      const ownGeneration = generation;
      const task = fetchValue().then(
        (result) => {
          if (ownGeneration === generation) {
            value = result;
            expiresAt = now() + ttlMs;
            failure = null;
            blockedUntil = 0;
          }
          return result;
        },
        (error: unknown) => {
          if (ownGeneration === generation) {
            value = undefined;
            expiresAt = 0;
            failure = error;
            blockedUntil = now() + failureCooldownMs;
          }
          throw error;
        },
      );
      pending = task;
      void task.finally(() => {
        if (pending === task) pending = null;
      }).catch(() => {});
      return task;
    },
    invalidate,
  };
}
