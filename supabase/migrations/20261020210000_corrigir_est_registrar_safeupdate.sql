-- ESTAMPARIA - Correcao pontual e idempotente do apontamento (erro 21000).
-- Executar UMA VEZ no SQL Editor do PROJETO DA ESTAMPARIA; repetir e seguro.
-- Nao altera dados, tabelas, importacao do Excel, alocacoes ou regras FIFO.
-- Apenas substitui uma instrucao UPDATE sem WHERE na funcao est_registrar.
BEGIN;

DO $corrigir$
DECLARE
  v_assinatura regprocedure;
  v_definicao text;
  v_sem_where constant text := 'UPDATE public.est_estado SET revisao=revisao+1;';
  v_where_id constant text := 'UPDATE public.est_estado SET revisao=revisao+1 WHERE id = true;';
  v_where_anterior constant text := 'UPDATE public.est_estado SET revisao=revisao+1 WHERE revisao IS NOT NULL;';
BEGIN
  v_assinatura := to_regprocedure(
    'public.est_registrar(uuid,bigint,smallint,integer,text,bigint,text)'
  );

  IF v_assinatura IS NULL THEN
    RAISE EXCEPTION 'Funcao est_registrar nao encontrada. Confira se o projeto Supabase e o correto.';
  END IF;

  SELECT pg_get_functiondef(v_assinatura) INTO v_definicao;

  IF position(v_where_id IN v_definicao) > 0 OR
     position(v_where_anterior IN v_definicao) > 0 THEN
    RAISE NOTICE 'A funcao est_registrar ja tem WHERE na atualizacao da revisao; nenhuma mudanca necessaria.';
  ELSIF position(v_sem_where IN v_definicao) > 0 THEN
    -- Atualiza SOMENTE a funcao, mantendo parametros, seguranca e demais regras.
    v_definicao := replace(v_definicao, v_sem_where, v_where_id);
    EXECUTE v_definicao;
    RAISE NOTICE 'A funcao est_registrar foi corrigida com WHERE id = true.';
  ELSE
    RAISE EXCEPTION 'A funcao est_registrar difere da versao esperada; nenhuma alteracao foi feita.';
  END IF;
END
$corrigir$;

COMMIT;

-- Resultado esperado: correcao_aplicada = true.
SELECT
  position('UPDATE public.est_estado SET revisao=revisao+1 WHERE id = true;'
           IN pg_get_functiondef(
             'public.est_registrar(uuid,bigint,smallint,integer,text,bigint,text)'::regprocedure
           )) > 0
  OR
  position('UPDATE public.est_estado SET revisao=revisao+1 WHERE revisao IS NOT NULL;'
           IN pg_get_functiondef(
             'public.est_registrar(uuid,bigint,smallint,integer,text,bigint,text)'::regprocedure
           )) > 0
  AS correcao_aplicada;
