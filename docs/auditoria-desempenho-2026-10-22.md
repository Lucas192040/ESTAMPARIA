# Auditoria de desempenho — Estamparia (22/10/2026)

## Contexto e limite do diagnóstico

Origem analisada: `ESTAMPARIA(1).zip` e a versão `ESTAMPARIA_CORRIGIDA_TIMEOUT.zip`, fornecidas na conversa.
Erros relatados na Vercel: HTTP 503 em `/api/ops` e `/api/import`; no Supabase, `PGRST002` (PostgREST não conseguiu consultar o banco ao criar o cache de esquema) e `PGRST003` (timeout ao adquirir conexão). Os prints mostraram CPU de 90,21% e ingestão de logs de 10,38 GB no período. `pg_stat_statements` registrou ~125 milhões de execuções da rotina interna `set_config` e apenas 556 leituras de `est_ops` nos dados apresentados. **Esses dados não provam que a Estamparia gerou o volume total.** Outros clientes do mesmo projeto, requisições diretas à API e efeitos de sobrecarga precisam ser examinados.

A consulta `pg_stat_statements` contém contadores acumulados, não taxas instantâneas. A associação causal entre CPU, banco e aplicação **não foi comprovada**. Nenhum comando foi executado no banco de produção nesta auditoria.

## Problemas objetivos encontrados no código anterior

1. `src/lib/daily-server.ts` carregava *todas* as OPs, programações e alocações a cada troca de filtro, página e atualização. Isso equivale a no mínimo 6 chamadas REST ao Supabase para cada GET `/api/ops` sem paginar; em tabelas maiores, ainda mais.
2. A chamada acima disparava 4 acessos paralelos à API, aumentando a concorrência sobre um banco com pool saturado.
3. `src/app/api/health/route.ts` executava `est_previa_importacao` para verificar conexão, função cujo propósito real é analisar impacto da importação, não fazer health check.
4. `src/components/Dashboard.tsx` continuava tentando atualizar a cada minuto, mesmo se a resposta anterior fosse erro 503. Outras abas do mesmo usuário também continuavam consultando.
5. As consultas de leitura não possuíam prazo total de cancelamento, ao contrário dos RPCs que tinham 45 segundos; ao perder a conexão, a função podia ficar aguardando dezenas de segundos.
6. Na migração original, a função `est_limitar` inclui um DELETE de registros antigos a cada tentativa de escrita. A função foi alterada manualmente no Supabase durante o diagnóstico; uma nova base receberia o código antigo se aplicasse apenas os SQLs originais.

## Alterações implementadas

- Snapshot de leitura em memória por instância serverless, TTL de 30 segundos, separado da lógica de filtros. Filtros, páginas e ordenação continuam processados por `dailyListing` **sem reler o banco** enquanto o snapshot estiver válido.
- Requisições simultâneas à mesma instância passam a compartilhar a mesma Promise de carregamento (single-flight).
- Falhas de carregamento geram janela de 15 segundos sem novas tentativas de consulta, evitando avalanche de erros.
- A leitura da programação passa a fazer chamadas sequenciais, minimizando conexões PostgREST simultâneas.
- Todas as consultas do carregamento respeitam o mesmo `AbortSignal.timeout(18000)`, inclusive as leituras paginadas.
- Após apontamento/importação bem-sucedidos: invalidação do snapshot local e GET explícito com `fresh=1` para obter os dados atualizados, inclusive quando gravação e leitura estiverem em instâncias diferentes.
- Dashboard preserva o refresh de 60 segundos quando saudável e desacelera para 2/4/8/16 minutos após falhas. Não consulta automaticamente se a aba estiver oculta ou offline.
- Health check agora consulta só `est_estado.revisao` (uma linha), com timeout de 8 segundos e cache de 20 segundos.
- Melhor mensagem de erro para respostas de API não JSON.
- Migração adicional `20261022153000_otimizar_est_limitar.sql`: mantém a contagem e limite da função, mas remove o DELETE em cada chamada. **Não executada na base real.**

## Comparação de chamadas (exemplo teórico)

Cenário: uma instância do backend recebe dez consultas sequenciais à listagem em menos de 30 segundos, sem importações nem apontamentos e com tabelas menores que 500 linhas cada.

| Comportamento | Antes | Depois |
| --- | ---: | ---: |
| Leitura inicial / revisão | 6 chamadas REST | 6 chamadas REST |
| 9 requisições seguintes | 54 chamadas REST | 0 chamadas REST |
| Total aproximado | 60 | 6 |

São valores derivados do fluxo de código, **não medição no servidor real**. Outras instâncias mantêm seus próprios caches. O custo real depende de linhas, TTL, concorrência e tráfego externo.

## Compatibilidade de regras

A função `dailyListing`, regras de situação, agrupamento OP + data, faixas de séries, indicadores, paginação e cálculo por subsetor não foram alterados. A importação do Excel e os parâmetros das funções de apontamento/importação não foram modificados. As validações de Origem/ambiente/limites de acesso foram mantidas. Os arquivos PWA, service worker, manifest e ícones foram mantidos.

Por causa do cache de 30 segundos **outras abas/dispositivos podem enxergar uma mudança com até aproximadamente 30 segundos de atraso** (ou até o próximo refresh do navegador). Na aba que realizou uma gravação, o refresh forçado busca os dados imediatamente. Os dados de produção não são armazenados no navegador nem em cache do service worker.

## Testes concluídos

- Verificação de sintaxe/transpilação dos 40 arquivos `.ts`/`.tsx`: **sem erro sintático**.
- 11 testes automatizados de lógica de OP/data/status/paginação e do novo cache: **11 aprovados**.
- 6 testes existentes de origens de rede: **6 aprovados**.
- 4 testes existentes de migração SafeUpdate: **4 aprovados**.
- Validador de integridade da migração: **aprovado**.

**Não validado:** build completo do Next.js, typecheck completo com dependências instaladas, integração real com Supabase, testes de carga e execução final na Vercel. A instalação completa das dependências não foi possível neste ambiente. Assim, não se declara que o sistema está operacional em produção até o deploy e a verificação.

## Publicação e recuperação

1. Faça backup de banco + código/repositório antes de alterar produção.
2. Publique o conteúdo da pasta `ESTAMPARIA/` deste ZIP **sobre o mesmo projeto Git/Vercel** ou faça um deploy de teste; não publique o ZIP diretamente sem extrair.
3. Preserve as variáveis atuais válidas `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `APP_ORIGIN` e `ACCESS_RESTRICTION_CONFIRMED`. Nunca exponha a chave `SERVICE_ROLE` no frontend.
4. Não crie um novo banco apenas pelos códigos `PGRST002`/`PGRST003`. Primeiro investigue a CPU e quem está enviando requisições à Data API no Supabase.
5. Se a base atual permanecer indisponível, restaure a partir de backup ou crie base nova com esquema e migrações completos em ordem, inclusive `20261022153000_otimizar_est_limitar.sql`, e migre os dados conscientemente. A migração nova isoladamente NÃO recupera dados.
6. Testes pós-deploy: `/api/health`, `/api/ops`, filtros, atualização, prévia de importação, apontamento pequeno autorizado, verificação de refletir a alteração imediatamente, e novas métricas da CPU/PostgREST.
7. Verifique *Deployment Protection*/WAF e regras corporativas de acesso na Vercel. A flag `ACCESS_RESTRICTION_CONFIRMED=true` apenas declara que uma proteção externa foi instalada — não autentica nem restringe usuários por si só.

**Critério de sucesso:** CPU estável em nível aceitável, sem novas sequências `PGRST002`/`PGRST003`, dados de OP retornando, importação/apontamento funcionando e nenhuma avalanche de chamadas na aba Network/Logs.

## Atenções futuras

- Cache em memória serverless não é distribuído; se o uso crescer significativamente, considerar cache externo com invalidação centralizada ou consulta paginada no banco sem quebrar as regras de cálculo.
- O `est_limitar` corrigido acumula uma linha por chave distinta; planejar limpeza periódica fora do caminho crítico, caso haja muitas chaves. Não é necessário limpar a cada requisição.
- O projeto não implementa autenticação empresarial no código. Apenas validar `Origin` e ativar uma flag não torna um site público acessível só para a empresa.
