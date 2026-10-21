// Read-only verification, safe after filling .env.local and applying the migration.
import { createClient } from "@supabase/supabase-js";
const url = process.env.SUPABASE_URL,
  key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key)
  throw Error("Configure as variáveis de servidor no .env.local.");
const client = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const { data: sectors, error: sectorsError } = await client
  .from("est_subsetores")
  .select("id,nome")
  .order("id");
if (sectorsError)
  throw Error(
    `Falha na leitura dos subsetores (${sectorsError.code}). Verifique configuração/permissões.`,
  );
if (
  JSON.stringify(sectors?.map((s) => s.nome)) !==
  JSON.stringify(["CORPO", "FUNDO", "TAMPA", "TAMPA BORDEADA"])
)
  throw Error("Os quatro subsetores não correspondem ao esquema esperado.");
const { data, error } = await client.rpc("est_listar", {
  p_filters: { pagina: 1 },
});
if (error)
  throw Error(
    `Falha na função est_listar (${error.code}). Verifique a migração complementar.`,
  );
console.log(
  JSON.stringify(
    {
      connected: true,
      subsetores: sectors.length,
      ops: data.total,
      revision: data.revision,
      date: data.today,
    },
    null,
    2,
  ),
);
