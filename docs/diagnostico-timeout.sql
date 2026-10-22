-- Diagnóstico SOMENTE LEITURA para o timeout de est_limitar.
-- Execute no SQL Editor do projeto Estamparia no Supabase.
-- Não altera nem apaga registros. Evite compartilhar resultados com dados sensíveis.

-- Volume de entradas acumuladas no limitador.
SELECT count(*) AS total_limites,
       count(*) FILTER (WHERE janela < floor(extract(epoch FROM now()) / 60) - 5)
         AS limites_antigos
FROM public.est_limites;

-- Operações atualmente em execução/espera (sem exibir texto de consultas).
SELECT pid, state, wait_event_type, wait_event,
       now() - query_start AS duracao_consulta,
       now() - xact_start AS duracao_transacao
FROM pg_stat_activity
WHERE datname = current_database()
  AND pid <> pg_backend_pid()
ORDER BY query_start NULLS LAST
LIMIT 30;

-- Locks pendentes em tabelas do projeto.
SELECT a.pid, a.state, a.wait_event_type, a.wait_event,
       c.relname AS tabela, l.mode, l.granted
FROM pg_locks l
JOIN pg_stat_activity a ON a.pid = l.pid
LEFT JOIN pg_class c ON c.oid = l.relation
WHERE l.database = (SELECT oid FROM pg_database WHERE datname = current_database())
  AND (c.relname LIKE 'est_%' OR NOT l.granted)
ORDER BY l.granted, a.pid
LIMIT 60;

-- Retorno rápido do servidor de banco (sem executar funções de escrita).
SELECT now() AS hora_servidor,
       (SELECT revisao FROM public.est_estado WHERE id = true) AS revisao;
