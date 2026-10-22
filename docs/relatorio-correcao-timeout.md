# Relatório — Correção do timeout em `/api/ops` (22/10/2026)

## Evidência recebida

- Vercel: GET `/api/ops` → HTTP 503.
- Mensagem: `Database operation failed`, operação `est_limitar`.
- Detalhe: `TimeoutError: The operation was aborted due to timeout`.
- Tempo observado: 45,02 s; código anterior usa `AbortSignal.timeout(45000)`.

## Causa no fluxo

A rota de leitura chamava `guard(req, "read")`, que invocava a função remota
`est_limitar` antes de qualquer consulta da programação. A função SQL grava
em `est_limites` e executa um `DELETE` de limpeza a cada chamada.
O log confirma que **esta operação** atingiu o timeout; não permite concluir
se a causa subjacente é bloqueio no banco, lentidão de rede ou indisponibilidade
do projeto Supabase.

## Correção localizada

- `src/lib/server.ts`: GET usa limite local por instância e deixa de chamar
  `est_limitar`; POST mantém RPC com limite distribuído, conferência de origem
  e mesmas cotas de escrita/importação.
- `scripts/test-api.ts`: inclui verificações explícitas de que a leitura
  não chama RPC e de que escrita segue chamando.
- `README.md`: orientação de deploy e limitação do rate limit em memória.
- `docs/diagnostico-timeout.sql`: consultas apenas de leitura para diagnóstico.
- Este relatório de comparação.

## Preservação

**Não alterados:** componentes React, dashboard, PWA, Excel, importação,
limites de produção, regras FIFO, funções SQL, migrações, esquema de banco,
variáveis de ambiente, rotas além do middleware comum.

Nenhuma alteração foi aplicada ao Supabase remoto ou à Vercel.

## Testes locais realizados

- Teste isolado da função guard compilada do TypeScript: 180 GETs sem RPC,
  181º GET com HTTP 429, POST usando est_limitar: **PASS**.
- `node scripts/check-migrations.mjs`: **PASS**.
- `node --experimental-strip-types --test tests/network-access.test.mjs tests/sql-safeupdate.test.mjs`:
  **10 testes PASS**.
- Build Next.js e integração completa com Supabase real: **não executados**,
  pois não foi possível instalar dependências npm neste ambiente e não há
  conexão ao banco da Estamparia. A mudança precisa ser validada em deploy.

## Advertência de segurança

O limite de GET por memória NÃO é distribuído entre instâncias Vercel. É
essencial ter controle de acesso real para a aplicação e todas as rotas `/api`.
A variável ACCESS_RESTRICTION_CONFIRMED não implementa esse controle.
