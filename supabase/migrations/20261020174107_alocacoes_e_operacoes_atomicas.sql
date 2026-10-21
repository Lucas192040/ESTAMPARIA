-- Complemento da estrutura existente. Execute UMA vez, após backup.
-- Não execute estrutura-original.sql no projeto que já contém as tabelas.
BEGIN;
SELECT pg_advisory_xact_lock(82411001);
CREATE TABLE public.est_estado (id boolean PRIMARY KEY DEFAULT true CHECK(id), revisao bigint NOT NULL DEFAULT 0);
INSERT INTO public.est_estado DEFAULT VALUES;
CREATE TABLE public.est_saldos_base (
 op_id bigint NOT NULL REFERENCES public.est_ops(id) ON DELETE CASCADE,
 subsetor_id smallint NOT NULL REFERENCES public.est_subsetores(id),
 quantidade bigint NOT NULL CHECK(quantidade>=0), PRIMARY KEY(op_id,subsetor_id)
);
CREATE TABLE public.est_alocacoes (
 programacao_id bigint NOT NULL REFERENCES public.est_programacoes(id) ON DELETE CASCADE,
 subsetor_id smallint NOT NULL REFERENCES public.est_subsetores(id),
 quantidade integer NOT NULL DEFAULT 0 CHECK(quantidade>=0),
 versao bigint NOT NULL DEFAULT 0, PRIMARY KEY(programacao_id,subsetor_id)
);
ALTER TABLE public.est_apontamentos ADD COLUMN programacao_id bigint REFERENCES public.est_programacoes(id) ON DELETE SET NULL,
 ADD COLUMN data_programada_original date, ADD COLUMN tipo text NOT NULL DEFAULT 'LEGADO',
 ADD COLUMN efetivo_anterior integer, ADD COLUMN efetivo_novo integer,
 ADD COLUMN base_anterior bigint, ADD COLUMN base_nova bigint;
CREATE TABLE public.est_requisicoes (
 id uuid PRIMARY KEY, payload jsonb NOT NULL, resultado jsonb NOT NULL,
 criado_em timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.est_limites (chave text PRIMARY KEY, janela bigint NOT NULL, quantidade integer NOT NULL);
INSERT INTO public.est_saldos_base
 SELECT o.id,s.id,GREATEST(COALESCE(SUM(a.quantidade),0),0)
 FROM public.est_ops o CROSS JOIN public.est_subsetores s
 LEFT JOIN public.est_apontamentos a ON a.op_id=o.id AND a.subsetor_id=s.id GROUP BY o.id,s.id;
-- Preserve a alocação FIFO visível antes de substituir a view.
INSERT INTO public.est_alocacoes(programacao_id,subsetor_id,quantidade)
 SELECT programacao_id,subsetor_id,qtd_apontada FROM public.est_acompanhamento;
CREATE OR REPLACE VIEW public.est_acompanhamento WITH(security_invoker=true) AS
 SELECT p.id AS programacao_id,p.op_id,p.data_programada,p.qtd_programada,p.serie_inicial,p.serie_final,
 s.id AS subsetor_id,s.nome AS subsetor,COALESCE(a.quantidade,0)::integer AS qtd_apontada,
 (p.qtd_programada-COALESCE(a.quantidade,0))::integer AS qtd_pendente,
 CASE WHEN a.quantidade=p.qtd_programada THEN 'CONCLUIDA'
 WHEN p.data_programada<(now() AT TIME ZONE 'America/Manaus')::date THEN 'ATRASADA'
 WHEN COALESCE(a.quantidade,0)=0 THEN 'NAO_INICIADA' ELSE 'EM_ANDAMENTO' END AS situacao_subsetor
 FROM public.est_programacoes p CROSS JOIN public.est_subsetores s
 LEFT JOIN public.est_alocacoes a ON a.programacao_id=p.id AND a.subsetor_id=s.id;
CREATE OR REPLACE VIEW public.est_totais_subsetores WITH(security_invoker=true) AS
 SELECT o.id AS op_id,o.op_pai,s.id AS subsetor_id,s.nome AS subsetor,
 COALESCE((SELECT SUM(h.quantidade) FROM public.est_apontamentos h WHERE h.op_id=o.id AND h.subsetor_id=s.id),0)::bigint AS qtd_historica,
 COALESCE((SELECT SUM(a.quantidade) FROM public.est_alocacoes a JOIN public.est_programacoes p ON p.id=a.programacao_id WHERE p.op_id=o.id AND a.subsetor_id=s.id),0)::bigint AS qtd_considerada
 FROM public.est_ops o CROSS JOIN public.est_subsetores s;
CREATE VIEW public.est_resumo WITH(security_invoker=true) AS
 WITH diario AS (
 SELECT p.id,p.op_id,p.data_programada,p.qtd_programada,p.serie_inicial,p.serie_final,
 bool_and(a.quantidade=p.qtd_programada) AS completo, SUM(a.quantidade) AS produzido
 FROM public.est_programacoes p JOIN public.est_alocacoes a ON a.programacao_id=p.id GROUP BY p.id
 )
 SELECT o.*,SUM(d.qtd_programada)::bigint AS qtd_programada,MIN(d.data_programada) AS data_inicial,MAX(d.data_programada) AS data_final,
 CASE WHEN bool_and(d.completo) THEN 'CONCLUIDA'
 WHEN bool_or(d.data_programada<(now() AT TIME ZONE 'America/Manaus')::date AND NOT d.completo) THEN 'ATRASADA'
 WHEN SUM(d.produzido)=0 THEN 'NAO_INICIADA' ELSE 'EM_ANDAMENTO' END AS situacao
 FROM public.est_ops o JOIN diario d ON d.op_id=o.id GROUP BY o.id;

-- Database-side cap also protects privileged accidental direct writes.
CREATE FUNCTION public.est_validar_alocacao() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE cap integer;
BEGIN
 SELECT qtd_programada INTO cap FROM public.est_programacoes WHERE id=NEW.programacao_id FOR UPDATE;
 IF cap IS NULL OR NEW.quantidade<0 OR NEW.quantidade>cap THEN RAISE EXCEPTION 'Quantidade fora do limite da programação.' USING ERRCODE='22023'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER est_alocacao_limite BEFORE INSERT OR UPDATE ON public.est_alocacoes FOR EACH ROW EXECUTE FUNCTION public.est_validar_alocacao();

CREATE FUNCTION public.est_registrar(p_request uuid,p_programacao bigint,p_subsetor smallint,p_quantidade integer,p_modo text,p_versao bigint,p_observacao text DEFAULT '') RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE prog public.est_programacoes; atual public.est_alocacoes; novo integer; delta integer; total bigint; base bigint; payload jsonb; old public.est_requisicoes; result jsonb;
BEGIN
 PERFORM pg_advisory_xact_lock_shared(82411001);
 IF p_request IS NULL OR p_modo NOT IN ('adicionar','corrigir') OR p_modo IS NULL OR p_quantidade IS NULL OR p_quantidade<0 OR (p_modo='adicionar' AND p_quantidade=0) OR p_versao IS NULL OR p_subsetor NOT BETWEEN 1 AND 4 OR p_subsetor IS NULL OR length(p_observacao)>500 THEN
 RAISE EXCEPTION 'Parâmetros de apontamento inválidos.' USING ERRCODE='22023'; END IF;
 payload=jsonb_build_object('programacao',p_programacao,'subsetor',p_subsetor,'quantidade',p_quantidade,'modo',p_modo,'versao',p_versao,'observacao',p_observacao);
 PERFORM pg_advisory_xact_lock(hashtextextended(p_request::text,8241));
 SELECT * INTO old FROM public.est_requisicoes WHERE id=p_request;
 IF FOUND THEN
  IF old.payload<>payload THEN RAISE EXCEPTION 'Identificador já utilizado em outra operação.' USING ERRCODE='22023'; END IF;
  RETURN old.resultado;
 END IF;
 SELECT * INTO prog FROM public.est_programacoes WHERE id=p_programacao;
 IF NOT FOUND THEN RAISE EXCEPTION 'Programação substituída. Atualize a tela.' USING ERRCODE='P0002'; END IF;
 PERFORM 1 FROM public.est_ops WHERE id=prog.op_id FOR UPDATE;
 SELECT * INTO atual FROM public.est_alocacoes WHERE programacao_id=p_programacao AND subsetor_id=p_subsetor FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Subsetor inválido.' USING ERRCODE='22023'; END IF;
 IF atual.versao<>p_versao THEN RAISE EXCEPTION 'Outro lançamento alterou esta programação. Atualize a tela e tente novamente.' USING ERRCODE='40001'; END IF;
 IF p_modo='adicionar' AND p_quantidade>prog.qtd_programada-atual.quantidade THEN RAISE EXCEPTION 'Saldo disponível: % unidades.',prog.qtd_programada-atual.quantidade USING ERRCODE='22023'; END IF;
 novo=CASE WHEN p_modo='adicionar' THEN atual.quantidade+p_quantidade ELSE p_quantidade END;
 IF novo<0 OR novo>prog.qtd_programada THEN RAISE EXCEPTION 'O total deve estar entre 0 e %.',prog.qtd_programada USING ERRCODE='22023'; END IF;
 delta=novo-atual.quantidade;
 IF delta=0 THEN
 result=jsonb_build_object('quantidade',novo,'pendente',prog.qtd_programada-novo,'versao',atual.versao,'sem_alteracao',true);
 INSERT INTO public.est_requisicoes(id,payload,resultado) VALUES(p_request,payload,result);
 RETURN result;
 END IF;
 SELECT quantidade INTO base FROM public.est_saldos_base WHERE op_id=prog.op_id AND subsetor_id=p_subsetor;
 SELECT COALESCE(SUM(a.quantidade),0) INTO total FROM public.est_alocacoes a JOIN public.est_programacoes p ON p.id=a.programacao_id WHERE p.op_id=prog.op_id AND a.subsetor_id=p_subsetor;
 -- Uma alteração efetiva passa a valer sobre a produção alocada; histórico bruto permanece.
 UPDATE public.est_saldos_base SET quantidade=total+delta WHERE op_id=prog.op_id AND subsetor_id=p_subsetor;
 UPDATE public.est_alocacoes SET quantidade=novo,versao=versao+1 WHERE programacao_id=p_programacao AND subsetor_id=p_subsetor;
 IF delta<>0 THEN
 INSERT INTO public.est_apontamentos(op_id,subsetor_id,quantidade,observacao,programacao_id,data_programada_original,tipo,efetivo_anterior,efetivo_novo,base_anterior,base_nova)
 VALUES(prog.op_id,p_subsetor,delta,p_observacao,p_programacao,prog.data_programada,upper(p_modo),atual.quantidade,novo,base,total+delta);
 END IF;
 UPDATE public.est_estado SET revisao=revisao+1;
 result=jsonb_build_object('quantidade',novo,'pendente',prog.qtd_programada-novo,'versao',atual.versao+1,'registrado_em',clock_timestamp());
 INSERT INTO public.est_requisicoes(id,payload,resultado) VALUES(p_request,payload,result);
 RETURN result;
END $$;

CREATE FUNCTION public.est_previa_importacao(p_ops jsonb) RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path=public,pg_temp AS $$
 SELECT jsonb_build_object('revision',(SELECT revisao FROM public.est_estado),'removed',COUNT(*) FILTER(WHERE NOT p_ops ? o.op_pai),
 'preserved',COUNT(*) FILTER(WHERE p_ops ? o.op_pai),'created',jsonb_array_length(p_ops)-COUNT(*) FILTER(WHERE p_ops ? o.op_pai),
 'removed_records',(SELECT COUNT(*) FROM public.est_apontamentos a JOIN public.est_ops x ON x.id=a.op_id WHERE NOT p_ops ? x.op_pai)) FROM public.est_ops o;
$$;

CREATE FUNCTION public.est_importar(p_rows jsonb,p_nome text,p_revision bigint,p_request uuid) RETURNS jsonb
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

CREATE FUNCTION public.est_listar(p_filters jsonb DEFAULT '{}') RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path=public,pg_temp AS $$
 WITH params AS (SELECT LEAST(GREATEST(COALESCE((p_filters->>'pagina')::integer,1),1),100000) AS page),
 filtered AS (SELECT r.* FROM public.est_resumo r WHERE
 (COALESCE(p_filters->>'q','')='' OR position(lower(p_filters->>'q') in lower(r.op_pai||' '||r.nome_cliente||' '||r.referencia_prod))>0 OR
 (CASE WHEN p_filters->>'q' ~ '^\d{1,15}$' THEN EXISTS(SELECT 1 FROM public.est_programacoes p WHERE p.op_id=r.id AND (p_filters->>'q')::bigint BETWEEN p.serie_inicial AND p.serie_final) ELSE false END))
 AND (COALESCE(p_filters->>'op','')='' OR position(lower(p_filters->>'op') in lower(r.op_pai))>0)
 AND (COALESCE(p_filters->>'cliente','')='' OR r.nome_cliente=p_filters->>'cliente')
 AND (COALESCE(p_filters->>'linha','')='' OR r.linha_prod=p_filters->>'linha')
 AND (COALESCE(p_filters->>'potencia','')='' OR r.potencia_pa=NULLIF(p_filters->>'potencia','')::numeric)
 AND (COALESCE(p_filters->>'situacao','')='' OR r.situacao=p_filters->>'situacao')
 AND EXISTS(SELECT 1 FROM public.est_programacoes p WHERE p.op_id=r.id
 AND (COALESCE(p_filters->>'serie','')='' OR NULLIF(p_filters->>'serie','')::bigint BETWEEN p.serie_inicial AND p.serie_final)
 AND (COALESCE(p_filters->>'inicio','')='' OR p.data_programada>=NULLIF(p_filters->>'inicio','')::date)
 AND (COALESCE(p_filters->>'fim','')='' OR p.data_programada<=NULLIF(p_filters->>'fim','')::date))),
 page AS (SELECT r.*,ROW_NUMBER() OVER(ORDER BY
 CASE WHEN p_filters->>'ordem'='data_desc' THEN data_final END DESC,
 CASE WHEN p_filters->>'ordem'='op_asc' AND op_pai ~ '^\d+$' THEN op_pai::numeric END ASC,
 CASE WHEN p_filters->>'ordem'='op_asc' THEN op_pai END ASC,
 CASE WHEN p_filters->>'ordem'='op_desc' AND op_pai ~ '^\d+$' THEN op_pai::numeric END DESC,
 CASE WHEN p_filters->>'ordem'='op_desc' THEN op_pai END DESC,
 CASE WHEN p_filters->>'ordem'='situacao' THEN situacao END ASC,
 data_inicial ASC,id ASC) AS rn FROM filtered r),
 selected AS (SELECT * FROM page ORDER BY rn LIMIT 12 OFFSET (SELECT (page-1)*12 FROM params)),
 rendered AS (SELECT r.rn,to_jsonb(r)-'rn'||jsonb_build_object('programacoes',
 (SELECT jsonb_agg(to_jsonb(p)||jsonb_build_object('setores',
 (SELECT jsonb_agg(jsonb_build_object('subsetor_id',a.subsetor_id,'qtd_apontada',a.quantidade,'versao',a.versao) ORDER BY a.subsetor_id) FROM public.est_alocacoes a WHERE a.programacao_id=p.id)) ORDER BY p.data_programada,p.serie_inicial,p.id)
 FROM public.est_programacoes p WHERE p.op_id=r.id)) AS obj FROM selected r)
 SELECT jsonb_build_object('items',COALESCE((SELECT jsonb_agg(obj ORDER BY rn) FROM rendered),'[]'::jsonb),'total',(SELECT COUNT(*) FROM filtered),'pagina',(SELECT page FROM params),'paginas',CEIL((SELECT COUNT(*) FROM filtered)/12.0),
 'revision',(SELECT revisao FROM public.est_estado),'today',(now() AT TIME ZONE 'America/Manaus')::date,
 'counts',(SELECT jsonb_build_object('ATRASADA',COUNT(*) FILTER(WHERE situacao='ATRASADA'),'CONCLUIDA',COUNT(*) FILTER(WHERE situacao='CONCLUIDA'),'EM_ANDAMENTO',COUNT(*) FILTER(WHERE situacao='EM_ANDAMENTO'),'NAO_INICIADA',COUNT(*) FILTER(WHERE situacao='NAO_INICIADA')) FROM filtered),
 'options',jsonb_build_object('clientes',COALESCE((SELECT jsonb_agg(x.nome_cliente ORDER BY x.nome_cliente) FROM (SELECT DISTINCT nome_cliente FROM public.est_ops) x),'[]'::jsonb),'linhas',COALESCE((SELECT jsonb_agg(x.linha_prod ORDER BY x.linha_prod) FROM (SELECT DISTINCT linha_prod FROM public.est_ops) x),'[]'::jsonb),'potencias',COALESCE((SELECT jsonb_agg(x.potencia_pa ORDER BY x.potencia_pa) FROM (SELECT DISTINCT potencia_pa FROM public.est_ops) x),'[]'::jsonb)),
 'ultima_importacao',(SELECT to_jsonb(i) FROM public.est_importacoes i ORDER BY id DESC LIMIT 1));
$$;
CREATE FUNCTION public.est_limitar(p_chave text,p_max integer) RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE win bigint; count_now integer;
BEGIN
 win=floor(extract(epoch FROM clock_timestamp())/60);
 INSERT INTO public.est_limites(chave,janela,quantidade) VALUES(p_chave,win,1)
 ON CONFLICT(chave) DO UPDATE SET janela=win,quantidade=CASE WHEN est_limites.janela=win THEN est_limites.quantidade+1 ELSE 1 END RETURNING quantidade INTO count_now;
 DELETE FROM public.est_limites WHERE janela<win-5;
 RETURN count_now<=p_max;
END $$;
ALTER TABLE public.est_estado ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.est_saldos_base ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.est_alocacoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.est_requisicoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.est_limites ENABLE ROW LEVEL SECURITY;
-- Só o backend confiável pode executar as funções e ler as views.
REVOKE ALL ON public.est_estado,public.est_saldos_base,public.est_alocacoes,public.est_requisicoes,public.est_limites,public.est_resumo FROM PUBLIC,anon,authenticated;
REVOKE ALL ON public.est_ops,public.est_programacoes,public.est_subsetores,public.est_apontamentos,public.est_importacoes,public.est_acompanhamento,public.est_totais_subsetores FROM PUBLIC,anon,authenticated;
DO $$ DECLARE f record; BEGIN
 FOR f IN SELECT oid::regprocedure AS signature FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname IN('est_validar_alocacao','est_registrar','est_previa_importacao','est_importar','est_listar','est_limitar') LOOP
 EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated',f.signature);
 EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role',f.signature);
 END LOOP;
END $$;
GRANT ALL ON public.est_estado,public.est_saldos_base,public.est_alocacoes,public.est_requisicoes,public.est_limites,public.est_ops,public.est_programacoes,public.est_subsetores,public.est_apontamentos,public.est_importacoes TO service_role;
GRANT SELECT ON public.est_resumo,public.est_acompanhamento,public.est_totais_subsetores TO service_role;
GRANT USAGE,SELECT ON SEQUENCE public.est_ops_id_seq,public.est_programacoes_id_seq,public.est_apontamentos_id_seq,public.est_importacoes_id_seq TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
