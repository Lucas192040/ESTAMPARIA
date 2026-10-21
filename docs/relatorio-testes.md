# Relatório de testes

Execução: 20/10/2026, referência de data America/Manaus.

## Executado

| Verificação                                                          | Resultado                                                          |
| -------------------------------------------------------------------- | ------------------------------------------------------------------ |
| TypeScript (`npm run typecheck`)                                     | Aprovado                                                           |
| Compilação Next.js de produção (`npm run build`)                     | Aprovada                                                           |
| Testes do importador e regras (`npm test`)                           | 14 testes aprovados                                                |
| SQL original + migração + funções PostgreSQL em PGlite               | 23 cenários aprovados                                              |
| Route Handlers + cliente Supabase + SQL, com transporte HTTP isolado | 7 cenários aprovados                                               |
| Arquivo XLS real                                                     | 115 programações, 84 OPs, 2.663 unidades                           |
| Cabeçalho real                                                       | Terceira linha; 10 colunas localizadas em 20 colunas da exportação |
| Período real                                                         | 01/10/2026 a 26/10/2026                                            |
| OP 43107                                                             | 60 programadas / lote 90; aceita                                   |
| Prévia local                                                         | Servidor iniciou; acesso visual bloqueado pelo ambiente            |

Os resultados individuais estão em `database-results.json` e `api-results.json`. Dados usados nesses testes permanecem em memória no processo isolado e não são gravados em Supabase externo.

## Cenários solicitados

| Nº  | Cenário                                      | Resultado e escopo                                                                                                                |
| --- | -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Parcial 20 + 15                              | 35 produzidos; aprovado em SQL                                                                                                    |
| 2   | Exceder saldo 5 com lançamento 10            | Rejeitado; aprovado em SQL e API                                                                                                  |
| 3   | Lançar hoje para programação anterior        | Data original e timestamp real preservados                                                                                        |
| 4   | Lançar somente no segundo dia                | Primeiro dia não alterado                                                                                                         |
| 5   | Redistribuição FIFO em cinco dias            | Quatro subsetores conferidos independentemente                                                                                    |
| 6   | Redução 60 para 40, com 50 produzidos        | 40 efetivos e histórico preservado                                                                                                |
| 7   | OP ausente na nova importação                | Exclusão em cascata conferida                                                                                                     |
| 8   | Mudança de datas                             | Quantidades preservadas sem duplicação                                                                                            |
| 9   | Corrigir 20 para 15                          | Total 15 e limites respeitados                                                                                                    |
| 10  | Apenas TAMPA pendente em programação vencida | ATRASADA; CONCLUÍDA após completar                                                                                                |
| 11  | Programação parcial 60 de 90                 | Importação aceita                                                                                                                 |
| 12  | Erro no meio da substituição                 | Trigger de teste falhou após exclusões; estado anterior integralmente restaurado                                                  |
| 13  | Concorrência e duplicidade                   | Chamadas simultâneas em PGlite serializado: versão obsoleta rejeitada, retry não duplica. **Múltiplas conexões reais pendentes.** |
| 14  | Redução seguida de correção                  | Correção respeitada sem excedente indevido                                                                                        |
| 15  | Aumento posterior                            | Excedente válido restaurado; correções não desfeitas                                                                              |

Verificações adicionais: migração de histórico já existente; séries nos extremos e lacunas; filtros combinados; importação obsoleta; permissões de anon/service_role; RLS; limite de requisições; XLS/XLSX; cabeçalhos deslocados/reordenados; unidades com vírgula decimal; zeros à esquerda; datas formatadas e timezone; fórmulas e arquivos inválidos; limites de upload; origem estrangeira; chave não exposta na resposta.

## Limitações concretas

1. **Supabase remoto não conectado.** Não foram verificados o esquema real além do SQL fornecido, o PostgREST real, as permissões do projeto remoto, latência, região ou execução na Vercel.
2. **Concorrência real entre sessões PostgreSQL não executada.** O ambiente impediu a inicialização do servidor PostgreSQL separado. PGlite executa PostgreSQL real embutido, mas em sessão única. Há um script específico `test:concurrency` para homologação em banco descartável.
3. **Revisão visual no navegador não concluída.** A prévia iniciou, mas a política do navegador bloqueou o acesso. Não houve validação visual em desktop/celular nem teste completo de cliques em navegador. Responsividade, foco e contraste foram implementados, mas não são declarados como aprovados visualmente.
4. Não houve teste de carga com usuários reais nem de indisponibilidade/reconexão do Supabase. Limites e mensagens de falha estão implementados; desempenho depende da hospedagem e do volume.

## Próxima validação operacional

Aplicar a migração complementar em homologação, configurar as variáveis de servidor, rodar `verify:connection`, executar o teste de concorrência em banco descartável e validar o fluxo no navegador: importação → apontamento no segundo dia → correção → reimportação → conferência dos totais e atrasos. Depois, publicar com restrição de acesso externa ativa.
