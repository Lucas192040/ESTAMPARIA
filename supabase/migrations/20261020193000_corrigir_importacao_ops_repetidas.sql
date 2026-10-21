-- CORREÇÃO PARA BASE EXISTENTE: erro PostgreSQL 21000 ao importar OPs repetidas.
-- EXECUTAR no Supabase SQL Editor UMA VEZ (o CREATE OR REPLACE é reexecutável).
-- Não recria tabelas e não apaga OPs ou apontamentos.
-- A correção se aplica à função de importação, preservando validação e FIFO.
BEGIN;
SELECT pg_advisory_xact_lock(82411001);
CREATE OR REPLACE FUNCTION public.est_importar(p_rows jsonb,p_nome text,p_revision bigint,p_request uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE old public.est_requisicoes; payload jsonb; result jsonb; current_revision bigint; input_count integer;
BEGIN
 PERFORM pg_advisory_xact_lock(82411001);
 IF p_request IS NULL OR p_revision IS NULL OR p_rows IS NULL OR jsonb_typeof(p_rows)<>'array' THEN RAISE EXCEPTION 'Importação inválida.' USING ERRCODE='22023'; END IF;
 input_count=jsonb_array_length(p_rows);
 IF input_count<1 OR input_count>10000 OR p_nome IS NULL OR length(p_nome)>255 THEN RAISE EXCEPTION 'Arquivo vazio, grande demais ou nome inválido.' USING ERRCODE='22023'; END IF;
 payload=jsonb_build_object('tipo','importacao','digest',md5(p_rows::text),'nome',p_nome,'revision',p_revision);
 SELECT * INTO old FROM public.est_requisicoes WHERE id=p_request;
 IF FOUND THEN
 IF old.payload<>payload THEN RAISE EXCEPTION 'Identificador reutilizado.' USING ERRCODE='22023'; END IF; RETURN old.resultado; END IF;
 SELECT revisao INTO current_revision FROM public.est_estado FOR UPDATE;
 IF current_revision<>p_revision THEN RAISE EXCEPTION 'A produção mudou desde a prévia. Valide o arquivo novamente.' USING ERRCODE='40001'; END IF;
 CREATE TEMP TABLE est_input ON COMMIT DROP AS SELECT * FROM jsonb_to_recordset(p_rows) AS r(op_pai text,referencia_prod text,potencia_pa numeric,linha_prod text,nome_cliente text,qtd_op_pai integer,data_programada date,qtd_programada integer,serie_inicial bigint,serie_final bigint);
 IF EXISTS(SELECT 1 FROM est_input WHERE op_pai IS NULL OR btrim(op_pai)='' OR length(op_pai)>80 OR referencia_prod IS NULL OR btrim(referencia_prod)='' OR length(referencia_prod)>300 OR nome_cliente IS NULL OR btrim(nome_cliente)='' OR length(nome_cliente)>300 OR linha_prod IS NULL OR btrim(linha_prod)='' OR length(linha_prod)>300 OR potencia_pa IS NULL OR potencia_pa<=0 OR potencia_pa>=1e9 OR round(potencia_pa,3)<>potencia_pa OR qtd_op_pai IS NULL OR qtd_op_pai<=0 OR qtd_programada IS NULL OR qtd_programada<=0 OR data_programada IS NULL OR data_programada<'1900-01-01' OR data_programada>'2200-12-31' OR serie_inicial IS NULL OR serie_final IS NULL OR serie_inicial<0 OR serie_final>9007199254740991 OR serie_final-serie_inicial+1<>qtd_programada) THEN
 RAISE EXCEPTION 'Há linhas inválidas na programação.' USING ERRCODE='22023'; END IF;
 IF EXISTS(SELECT 1 FROM est_input GROUP BY op_pai HAVING COUNT(DISTINCT (referencia_prod,potencia_pa,linha_prod,nome_cliente,qtd_op_pai))>1 OR SUM(qtd_programada)>MAX(qtd_op_pai)) THEN RAISE EXCEPTION 'Dados inconsistentes ou quantidade acima da OP.' USING ERRCODE='22023'; END IF;
 IF EXISTS(SELECT 1 FROM (SELECT serie_inicial,MAX(serie_final) OVER(PARTITION BY op_pai ORDER BY serie_inicial,serie_final ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING) AS anterior FROM est_input) x WHERE serie_inicial<=anterior) THEN RAISE EXCEPTION 'Séries sobrepostas ou duplicadas.' USING ERRCODE='22023'; END IF;
 result=public.est_previa_importacao((SELECT jsonb_agg(DISTINCT op_pai) FROM est_input));
 DELETE FROM public.est_ops o WHERE NOT EXISTS(SELECT 1 FROM est_input i WHERE i.op_pai=o.op_pai);
 INSERT INTO public.est_ops(op_pai,referencia_prod,potencia_pa,linha_prod,nome_cliente,qtd_op_pai)
 -- Uma OP pode estar dividida em várias datas. O UPSERT recebe somente
 -- UMA linha por op_pai; as programações diárias são gravadas separadamente.
 -- A validação anterior continua rejeitando dados cadastrais inconsistentes.
 SELECT DISTINCT ON (op_pai)
        op_pai,referencia_prod,potencia_pa,linha_prod,nome_cliente,qtd_op_pai
 FROM est_input
 ORDER BY op_pai,data_programada,serie_inicial
 ON CONFLICT(op_pai) DO UPDATE SET referencia_prod=excluded.referencia_prod,potencia_pa=excluded.potencia_pa,linha_prod=excluded.linha_prod,nome_cliente=excluded.nome_cliente,qtd_op_pai=excluded.qtd_op_pai,atualizado_em=now();
 INSERT INTO public.est_saldos_base SELECT o.id,s.id,0 FROM public.est_ops o CROSS JOIN public.est_subsetores s ON CONFLICT DO NOTHING;
 DELETE FROM public.est_programacoes;
 INSERT INTO public.est_programacoes(op_id,data_programada,qtd_programada,serie_inicial,serie_final)
 SELECT o.id,i.data_programada,i.qtd_programada,i.serie_inicial,i.serie_final FROM est_input i JOIN public.est_ops o USING(op_pai) ORDER BY o.id,i.data_programada,i.serie_inicial;
 INSERT INTO public.est_alocacoes(programacao_id,subsetor_id,quantidade)
 SELECT p.id,b.subsetor_id,GREATEST(0,LEAST(p.qtd_programada,b.quantidade-p.anteriores))::integer
 FROM (SELECT p.*,COALESCE(SUM(qtd_programada) OVER(PARTITION BY op_id ORDER BY data_programada,serie_inicial,id ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING),0) AS anteriores FROM public.est_programacoes p) p
 JOIN public.est_saldos_base b ON b.op_id=p.op_id;
 INSERT INTO public.est_importacoes(nome_arquivo,qtd_linhas,qtd_ops) VALUES(p_nome,input_count,(SELECT COUNT(*) FROM public.est_ops));
 UPDATE public.est_estado SET revisao=revisao+1;
 result=result||jsonb_build_object('revision',current_revision+1,'rows',input_count,'ops',(SELECT COUNT(*) FROM public.est_ops));
 -- Respostas idempotentes por 7 dias; trilha de produção não é eliminada.
 DELETE FROM public.est_requisicoes WHERE criado_em<now()-interval '7 days';
 INSERT INTO public.est_requisicoes(id,payload,resultado) VALUES(p_request,payload,result);
 RETURN result;
END $$;
NOTIFY pgrst, 'reload schema';
COMMIT;
