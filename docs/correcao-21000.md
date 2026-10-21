# Correção da importação — PostgreSQL 21000

## Problema observado

Na confirmação de um Excel com OPs repetidas em programações de dias diferentes,
o backend retornava `Database operation failed { operation: 'est_importar', code: '21000' }`.
A planilha era analisada na prévia e o Supabase era acessível (`connected: true`).

O código de importação usava um `INSERT ... SELECT DISTINCT ... ON CONFLICT(op_pai) DO UPDATE`.
O erro 21000 é consistente com uma tentativa de atingir a mesma linha duas vezes
em um comando de `UPSERT`. Como a função também contém validação de metadados,
esta é a hipótese mais forte, **não uma reprodução confirmada na instância remota**.

## Alteração

- Deduplicar a origem da inserção com `DISTINCT ON (op_pai)` e ordenação
  determinística, produzindo exatamente uma linha por OP para o UPSERT.
- Preservar integralmente os registros diários de `est_programacoes`.
- Manter as validações de quantidade, sobreposição de séries, controle
  transacional e redistribuição FIFO, sem alterar o fluxo de apontamentos.
- Registrar mensagem, detalhes e dica dos erros do PostgREST **somente** no terminal
  do servidor, para identificar falhas futuras sem mostrar credenciais.
- Aplicar as duas migrações por ordem nos testes locais.
- Acrescentar regressão com sete datas da mesma OP.

## Aplicação no Supabase existente

Faça backup e execute no SQL Editor **somente**:

`supabase/migrations/20261020193000_corrigir_importacao_ops_repetidas.sql`

O script usa `BEGIN`, `CREATE OR REPLACE FUNCTION` e `COMMIT`, não contém
`DROP TABLE`, `TRUNCATE` nem exclusão de dados. Não é necessário reaplicar a
migração inicial, que já existe no seu projeto.

## Como verificar depois

1. Atualize o projeto local com o novo ZIP, preservando seu `.env.local` existente
   no computador (ele **não está** no ZIP).
2. Rode `npm ci`, `npm run verify:connection`, `npm run dev`.
3. Reabra a tela, selecione o XLS, valide a prévia e confirme a importação.
4. Verifique a quantidade de OPs e linhas; depois faça um apontamento pequeno
   e uma reimportação de teste para verificar o FIFO.
5. Se ocorrer outro erro, envie a saída `Database operation failed`
   do terminal **sem chaves privadas**; agora o erro contém `message`, `details`, `hint`.

## Validação nesta entrega

Verificações estáticas dos arquivos foram realizadas. Não foi possível instalar
dependências npm nesta sessão (cache incompleto e indisponibilidade de rede),
portanto os testes runtime em PGlite/Next.js e contra o Supabase remoto **não**
foram executados nesta correção. O relatório original (`relatorio-testes.md`)
se refere ao pacote anterior e não valida automaticamente esta atualização.
