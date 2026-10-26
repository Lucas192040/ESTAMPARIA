# Estamparia — versão enxuta para Neon

## O que faz

- Recebe planilhas `.xls`/`.xlsx` com OP, quantidade, séries e **data programada**.
- Mostra cada **OP + dia** separadamente; faixas no mesmo dia mantêm IDs próprios.
- Permite **apontar vários subsetores simultaneamente**, com quantidades independentes para **CORPO, FUNDO, TAMPA, TAMPA BORDEADA**; a correção individual continua disponível.
- Mantém o saldo por subprocesso, histórico, revisão concorrente e prévia antes de substituir a programação.
- O apontamento múltiplo usa uma transação PostgreSQL: se um subsetor falhar, todos os registros do envio são revertidos. Usa a função atual `est_registrar`, sem migração de banco.
- Cabeçalho utiliza `public/logo-itam.png`, cópia fiel do logotipo ITAM recebido.
- PWA, tabela/cards, busca, filtros e indicadores continuam disponíveis.

## O que foi simplificado

- **Sem SDK Supabase, REST/PostgREST ou RPC via HTTP:** Next.js acessa Neon PostgreSQL pelo servidor usando `pg`.
- Listagem: **uma instrução SELECT por atualização de snapshot**, em vez de múltiplas requisições REST paginadas/revisões.
- Cache em memória de 2 minutos por instância; filtros/páginas usam o snapshot. Cache invalidado depois de apontar/importar; o navegador usa `fresh=1` nesse caso.
- **Sem polling por minuto:** atualização manual, após apontamento/importação e ao retornar para uma aba inativa por mais de dois minutos.
- **Sem escrita no banco para rate limiting:** contador em memória por instância (não substitui um limite distribuído nem autenticação).
- Dependências e arquivos históricos de diagnóstico/migrações antigas retirados do pacote. O frontend e as regras de validação da planilha continuam preservados.

## Importante sobre o banco de dados

A versão **usa as 10 tabelas do backup** e as funções `est_registrar`, `est_importar`, `est_previa_importacao`. Manter a estrutura é proposital para não destruir histórico nem mudar as regras FIFO, idempotência, revisão e correção de apontamentos. Algumas tabelas parecem redundantes, mas têm finalidade (histórico, saldo-base, alocações, controle de concorrência e importações). A tabela `est_limites`, a função `est_limitar`, a função `est_listar` e as três views auxiliares não são utilizadas pela versão nova. O arquivo `neon/limpeza-opcional.sql` permite eliminá-las **somente depois** de validar a restauração (nunca no Supabase antigo). O banco de origem não é modificado por este ZIP.

A restauração do arquivo `estamparia_backup.dump` pode exigir adaptações pontuais em objetos gerados originalmente pelo Supabase. O ZIP não contém o `.dump` (ele está no seu computador).

## Instalação

1. Crie um projeto **Neon** e copie a **connection string pooled**, com SSL.
2. Restaure o backup do PostgreSQL **em um banco novo**. Não restaure por cima de dados existentes. Verifique logs de `pg_restore` e compare contagens com a origem antes de usar.
3. Execute `neon/verificar.sql` no Neon (antes de eventual limpeza) e confirme as 10 tabelas e as funções: `public.est_registrar`, `public.est_importar`, `public.est_previa_importacao`.
4. Configure no Vercel as variáveis de `.env.example` (**não** deixe credenciais no repositório). Remova as antigas `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY`.
5. Execute `npm ci`, `npm run typecheck`, `npm test`, `npm run build` e publique.
6. Faça os testes de ponta a ponta abaixo **antes** de migrar usuários ou excluir o Supabase.
7. Depois da aprovação, **opcionalmente** execute `neon/limpeza-opcional.sql` no banco Neon para remover objetos que este aplicativo não consulta.

**Segurança:** o sistema utiliza conexão de banco privilegiada exclusivamente no backend e valida a origem dos POSTs, mas **não tem autenticação de usuário**. `ACCESS_RESTRICTION_CONFIRMED=true` não habilita proteção por si só. Restrinja efetivamente o site **e todas as rotas `/api/*`** na infraestrutura/deployment antes de torná-lo público. A limitação de requisições em memória não é compartilhada entre instâncias Vercel.

## Teste de aceitação antes do corte

- Backup restaurado sem erros e contagens de linhas conferidas nas 10 tabelas.
- OPs com mais de um dia mantêm quantidades independentes por programação.
- OP com duas faixas no mesmo dia mostra um agrupamento e aponta no ID correto.
- Os quatro subprocessos registram valores distintos, inclusive em um único envio, e respeitam o limite `qtd_programada` em cada subsetor.
- Deixar campos vazios/zero: esses subsetores não devem ser incluídos. Um envio com todos vazios não é permitido.
- Testar rollback: se um subsetor ultrapassar o saldo ou tiver versão desatualizada, nenhuma quantidade do lote deve ser registrada.
- Reenvio do mesmo lote não deve duplicar peças (IDs derivados por subsetor).
- Correção altera somente o subprocesso/faixa escolhidos, mantendo histórico e versão.
- Reenvio da mesma requisição não duplica apontamento ou importação.
- Prévia importa dados válidos e rejeita linhas duplicadas, séries sobrepostas e dados inválidos.
- Reimportar preserva saldos conforme a lógica antiga de distribuição e mostra o aviso de registros removidos.
- Filtros, paginação, indicadores, cards, PWA e acesso em ambiente de produção funcionam.
- Verificar CPU, conexões, leituras e tempo das consultas no Neon com uso real por vários dias.

**Não há testes de integração com Neon ainda**, pois a base de destino e a connection string não foram fornecidas. Não interpretar o build local como validação de integração.

## Atualização: apontamento múltiplo e logotipo (26/10/2026)

- Para **adicionar produção**, selecione a programação/faixa e digite a quantidade independente de cada subsetor. Não é necessário selecionar um de cada vez.
- Cada quantidade deve ser um inteiro positivo dentro do respectivo saldo. Campos com zero ou vazios são ignorados.
- Ao confirmar, o backend valida formato, unicidade dos subsetores e versões enviadas, e executa a função de registro já existente de forma sequencial na **mesma conexão e transação**.
- A validação de saldo e concorrência permanece a cargo de `public.est_registrar`. Erro em qualquer subsetor causa `ROLLBACK` do conjunto. A repetição de uma mesma tentativa usa UUIDs derivados do UUID de lote para evitar registros duplicados.
- Para **corrigir produção**, a tela e API de correção individual continuam operando como antes.
- O logotipo aparece no cabeçalho desktop/mobile; os ícones PWA não foram alterados.

**Verificação:** `node --experimental-strip-types --test tests/production-batch.test.ts` testa a orquestração da transação sem conexão real. Ainda é obrigatório fazer teste de integração com a base Neon de homologação antes da publicação.

## Otimização de navegação e uso do Neon (26/10/2026)

- A interface solicita `GET /api/ops?dataset=1` **uma vez ao abrir** e depois de atualizações explícitas ou da visibilidade da aba conforme política anterior. A projeção diária é construída a partir da mesma consulta SQL e do mesmo cache de 120 segundos já existentes.
- Pesquisa, cliente, período, OP, série, potência, linha, situação, ordenação e paginação rodam **localmente no navegador** (`filterDailyDataset`), mantendo as mesmas regras da consulta `/api/ops` antiga. Essas interações não acionam novas chamadas à API nem ao Neon.
- `GET /api/ops` sem `dataset=1` continua funcionando com os mesmos parâmetros, formato e paginação (compatibilidade de clientes antigos).
- Após apontamentos e importações, a tela solicita `fresh=1`, que invalida o cache de leitura e consulta novamente os dados após a transação para obter saldos atualizados. Regras de validação/SQL, redistribuição e rollback são mantidas.
- Modais de apontamento e importação passam a ser carregados sob demanda, reduzindo o JavaScript inicial. O logotipo apresentado no cabeçalho utiliza WebP transparente de 480 px (arquivo original PNG também preservado).
- Não há polling periódico, gravações adicionais nem mudança de pool, tabelas ou procedures do PostgreSQL. **A redução real de CU, memória do Neon e tempo até a primeira tela precisa ser confirmada com métricas da hospedagem sob carga equivalente.** O carregamento inicial transfere todas as programações diárias para o navegador; monitore o tamanho da resposta se o volume de dados crescer muito.
