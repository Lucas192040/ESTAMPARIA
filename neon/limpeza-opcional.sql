-- EXECUTAR SOMENTE NO NEON, APÓS RESTAURAÇÃO COMPLETA E TESTES.
-- Não execute no Supabase original. Este arquivo não é executado automaticamente.
-- Remove apenas objetos que o aplicativo Next.js ENXUTO NÃO USA.
-- Preserve todas as demais tabelas para manter histórico, FIFO e idempotência.
-- O comando não usa CASCADE: se houver dependências imprevistas, abortará.
BEGIN;
DROP FUNCTION IF EXISTS public.est_limitar(text, integer);
DROP FUNCTION IF EXISTS public.est_listar(jsonb);
DROP VIEW IF EXISTS public.est_resumo;
DROP VIEW IF EXISTS public.est_acompanhamento;
DROP VIEW IF EXISTS public.est_totais_subsetores;
DROP TABLE IF EXISTS public.est_limites;
COMMIT;
