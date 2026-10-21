# Atualização: tabela padrão e cartões por OP + data

## O que mudou
- Tabela é o modo padrão; o seletor no canto superior direito alterna entre **Tabela** e **Cartões**.
- Cada linha/cartão representa uma combinação única **OP + data programada**, e não a soma das datas de uma OP.
- Exemplo: OP 43107, 20 peças em 21/10 e 20 em 22/10 -> **duas** entradas de 20, em ambos os modos.
- Se o arquivo Excel contém mais de uma faixa de séries da mesma OP no mesmo dia, a tabela/card soma a quantidade diária e preserva as faixas internas. No formulário, selecione a faixa correspondente antes de apontar.
- Status, barras dos quatro subsetores, indicadores, filtros, ordenação e paginação agora refletem **programações diárias**.
- A quantidade total da OP permanece visível apenas como dado informativo, separada da quantidade programada no dia.

## Banco de dados / importação
A importação do Excel, o endpoint POST /api/import, as funções do Supabase,
as migrações SQL e o endpoint POST /api/production não foram modificados.
A GET /api/ops passa a consultar tabelas de leitura existentes e agrupar as
programações no servidor, sem instalar uma nova função SQL. A consulta é
paginada em lotes de 500 registros para evitar truncamento do PostgREST;
se ocorrer importação/apontamento simultâneo com mudança de revisão, refaz a
leitura antes de exibir os dados. A página exibe até 12 programações diárias.

## Testes
`node --test tests/daily-listing.test.mjs` não existe no ZIP; rode o conjunto
padrão com `npm test` depois de `npm ci`. Os novos testes estão em
`tests/daily-listing.test.ts` e cobrem separação por dia, faixas na mesma data,
status, filtros de série/data e paginação. Use também `npm run typecheck`
e `npm run build` para validar o projeto na máquina com dependências instaladas.

## Verificação manual
1. `npm ci` e `npm run dev`.
2. Busque uma OP programada em duas datas e confirme duas linhas de quantidades independentes.
3. Troque para Cartões e confirme as mesmas duas entradas, não uma soma.
4. Abra "Apontar" na data desejada; confira a data/faixa e o limite antes de registrar.
5. Confirme o progresso do dia correspondente após atualizar.

**Observação:** esta revisão altera a consulta de leitura e a interface, sem executar
comandos de escrita no Supabase. O processamento da programação existente
continua no banco; o sistema não reimporta arquivos automaticamente.
