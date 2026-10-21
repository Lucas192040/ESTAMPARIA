# Revisão final — Apontamento 21000 (`UPDATE requires a WHERE clause`)

## Diagnóstico

A conexão com Supabase funciona e as consultas `GET /api/ops` retornam HTTP 200.
O último `POST /api/production` chega ao banco e é recusado por `est_registrar` com SQLSTATE `21000`,
mensagem `UPDATE requires a WHERE clause`. A função original contém um único `UPDATE` sem `WHERE`:

```sql
UPDATE public.est_estado SET revisao=revisao+1;
```

Não é erro de rede, Next.js, UUID, importação do Excel ou credencial. A política de segurança
`safeupdate` exige uma condição explícita. A linha corrigida usa `WHERE id = true`, porque
`public.est_estado.id` é uma chave primária booleana com `CHECK(id)` (há somente uma linha).

## Aplicar no Supabase da Estamparia

1. Confirme que é o projeto da Estamparia, **não** outro projeto Supabase.
2. Abra SQL Editor e execute o arquivo `CORRIGIR_APONTAMENTO_SUPABASE.sql` na raiz do ZIP.
3. Confira `correcao_aplicada = true`.
4. Execute `VERIFICAR_FUNCOES_SUPABASE.sql` (somente leitura); todos os campos devem estar `true`.
   Se um campo da **importação** aparecer `false`, **não** reexecute migrações antigas sem antes
   diagnosticar o banco: a importação atual está funcionando e deve ser preservada.
5. Teste adicionar 1 unidade numa programação de teste e confira a alteração na interface;
   depois teste uma correção e acesso tanto em localhost quanto pelo IP interno.

**O SQL é idempotente**: detecta a função já corrigida e não a modifica novamente.
**O ZIP, por si só, não muda o Supabase remoto.** A correção precisa ser aplicada no projeto certo.

## Auditoria de escopo

- Arquivos TypeScript/TSX, importador Excel, UI e funções SQL de importação: **inalterados**.
- Apenas o script SQL de correção do apontamento foi fortalecido e adicionados arquivos de
  verificação/documentação. Não há DDL de tabela, exclusão de dados nem alteração FIFO.
- A função `est_registrar` tem dois outros `UPDATE` que já possuem `WHERE`:
  `est_saldos_base` por `(op_id, subsetor_id)` e `est_alocacoes` por `(programacao_id, subsetor_id)`.
- `est_limitar` já tem `DELETE ... WHERE`.

## Testes que não substituem a validação real

`npm run test:network` e `npm run test:migration` verificam rede, UUID e padrões de código.
No ambiente de revisão não foi possível instalar dependências para executar a bateria PGlite/Next.js.
O SQL não foi aplicado no Supabase remoto porque o projeto Estamparia não está acessível
pela conexão de ferramentas disponível. A verificação real deve ser feita após executar o SQL.
