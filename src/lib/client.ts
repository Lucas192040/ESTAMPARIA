export async function fetchJson<T>(
  url: string,
  options?: RequestInit,
): Promise<T> {
  const response = await fetch(url, { cache: "no-store", ...options });
  const data: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message = data && typeof data === "object" && "error" in data
      && typeof data.error === "string" ? data.error : null;
    throw new Error(message || (response.status === 503
      ? "Banco temporariamente indisponível. Tente novamente mais tarde."
      : `Não foi possível concluir a operação (HTTP ${response.status}).`));
  }
  if (data === null) throw new Error("Resposta inválida do servidor.");
  return data as T;
}
