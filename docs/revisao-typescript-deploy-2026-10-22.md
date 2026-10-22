# Revisão do deploy e compatibilidade TypeScript — 22/10/2026

## Problema relatado

O build da Vercel retornou `TS2339` (`abortSignal` indisponível no tipo `PostgrestBuilder`) nas rotas `/api/health` e `daily-server.ts`, além de `TS2345` (argumentos de `rpc` incompatíveis com `undefined`) em `server.ts`. A revisão anterior havia usado `args as undefined`, que mascara a tipagem e prejudica a manutenção.

## Implementação entregue

- `src/lib/db-timeout.ts` (novo): `supabaseFetch` usa a opção oficial `global.fetch` do cliente Supabase e combina sinal de cancelamento do chamador, timeout por chamada HTTP e timeout da sequência de leitura com `AbortSignal.any` e `AsyncLocalStorage` do Node.
- `src/lib/server.ts`: conexão com Supabase usa `global.fetch`. A chamada RPC passa os argumentos reais, e uma adaptação estrutural isolada tipa somente a fronteira dinâmica das funções SQL. **Não** há `as undefined`, nem alteração nos parâmetros enviados para importação, limite ou apontamento.
- `src/lib/daily-server.ts`: todas as leituras compartilham o mesmo sinal de tempo limite; não usa mais o método `abortSignal` nos builders. Regras de agrupamento, consulta paginada, revisão antes/depois, cache e invalidação mantidas.
- `src/app/api/health/route.ts`: consulta leve `est_estado` com prazo de rede de 8 segundos via contexto, sem o método de builder incompatível.
- `tests/db-timeout.node.test.mjs`: três testes sem dependências de terceiros para interrupção por tempo limite, isolamento de requisições e preservação do sinal do chamador.
- `package.json`: script `npm run test:timeout`.

**Observação:** quando o SDK executa retentativas automáticas e backoff, o tempo de conclusão da operação ainda pode exceder a janela nominal. O sinal aborta chamadas HTTP assim que elas são iniciadas. Não é um cronômetro absoluto para todo o processamento JavaScript.

## Validações realmente executadas

1. **3/3** testes novos de tempo limite passaram (`node --experimental-strip-types --test tests/db-timeout.node.test.mjs`).
2. **10/10** testes de restrição de rede e migração SQL passaram (`node --experimental-strip-types --test tests/network-access.test.mjs tests/sql-safeupdate.test.mjs`).
3. **11/11** testes existentes de domínio, listagem e cache passaram com transpilação nativa do Node sobre cópias temporárias **com apenas o sufixo de extensão dos imports adaptado**. Os arquivos do projeto foram preservados.
4. `scripts/check-migrations.mjs` passou.
5. Um teste **isolado** do compilador TypeScript contra simulações de assinaturas estreitas do PostgREST/Supabase usadas nos erros originais passou. **Não equivale à validação com os tipos reais das dependências**.
6. Transpilação sintática TypeScript de todos os arquivos `.ts`/`.tsx` sem erros de parser.

## O que não foi possível verificar

Não foi possível executar `npm ci`, `npm run typecheck` ou `npm run build` completos com os pacotes do projeto: `registry.npmjs.org` está inacessível neste ambiente (`EAI_AGAIN`), e `npm ci --offline` retorna `ENOTCACHED`. **Logo, não há alegação de build aprovado na Vercel nem de aplicação operacional.** Também não há teste integrado contra o Supabase de produção, teste de importação real ou monitoramento de CPU em produção.

## Como validar antes de publicar

Na raiz extraída `ESTAMPARIA/`, usando Node 22:

```bash
npm ci
npm run typecheck
npm run test:timeout
npm run test:network
npm run test:sql
npm run test:migration
npm run build
```

Somente após esses comandos passarem, publique em uma URL de preview da Vercel, preserve as variáveis de ambiente existentes, confirme `/api/health`, `/api/ops`, filtros, prévia de importação e um apontamento autorizado de teste. Monitore os códigos de erro PostgREST antes de promover a versão para produção.

## Segurança e banco

Não houve alteração de banco, migrations, estrutura SQL ou credenciais. **Não troque de banco** para solucionar uma falha de TypeScript, pois ela acontece antes da publicação. `ACCESS_RESTRICTION_CONFIRMED=true` não bloqueia visitantes nem substitui autenticação real; garanta proteção externa adequada para a API, que usa uma chave privilegiada do Supabase no servidor.

## Referência técnica

A documentação do Supabase descreve `global.fetch` como ponto de extensão suportado no cliente: https://supabase.com/docs/reference/javascript/initializing
