-- SISTEMA ESTAMPARIA | Supabase PostgreSQL
-- Execute uma unica vez no SQL Editor de um projeto NOVO.
-- Acesso: somente backend confiavel (service role no servidor); sem acesso direto anon/authenticated.
BEGIN;

CREATE TABLE public.est_ops (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  op_pai text NOT NULL UNIQUE,
  referencia_prod text,
  potencia_pa numeric(12,3),
  linha_prod text,
  nome_cliente text,
  qtd_op_pai integer NOT NULL CHECK (qtd_op_pai >= 0),
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.est_programacoes (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  op_id bigint NOT NULL REFERENCES public.est_ops(id) ON DELETE CASCADE,
  data_programada date NOT NULL,
  qtd_programada integer NOT NULL CHECK (qtd_programada > 0),
  serie_inicial bigint NOT NULL,
  serie_final bigint NOT NULL,
  CHECK (serie_final >= serie_inicial),
  CHECK (serie_final - serie_inicial + 1 = qtd_programada),
  UNIQUE (op_id, data_programada, serie_inicial, serie_final)
);

CREATE INDEX est_programacoes_op_data_idx ON public.est_programacoes(op_id, data_programada, serie_inicial);
CREATE INDEX est_programacoes_series_idx ON public.est_programacoes(serie_inicial, serie_final);

CREATE TABLE public.est_subsetores (
  id smallint PRIMARY KEY,
  nome text NOT NULL UNIQUE
);
INSERT INTO public.est_subsetores (id, nome) VALUES
(1,'CORPO'), (2,'FUNDO'), (3,'TAMPA'), (4,'TAMPA BORDEADA');

-- Lancamentos independentes das datas programadas: a reimportacao nao perde historico.
-- Quantidade positiva = producao; negativa = correcao/estorno.
CREATE TABLE public.est_apontamentos (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  op_id bigint NOT NULL REFERENCES public.est_ops(id) ON DELETE CASCADE,
  subsetor_id smallint NOT NULL REFERENCES public.est_subsetores(id),
  quantidade integer NOT NULL CHECK (quantidade <> 0),
  registrado_em timestamptz NOT NULL DEFAULT now(),
  observacao text
);
CREATE INDEX est_apontamentos_op_subsetor_idx ON public.est_apontamentos(op_id, subsetor_id);

-- Uma importacao pode ser auditada sem guardar arquivos grandes.
CREATE TABLE public.est_importacoes (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  nome_arquivo text,
  realizado_em timestamptz NOT NULL DEFAULT now(),
  qtd_linhas integer NOT NULL DEFAULT 0,
  qtd_ops integer NOT NULL DEFAULT 0
);

-- Total historico por OP e subsetor. A aplicacao deve impedir saldo negativo.
CREATE VIEW public.est_totais_subsetores WITH (security_invoker = true) AS
SELECT o.id AS op_id, o.op_pai, s.id AS subsetor_id, s.nome AS subsetor,
       COALESCE(SUM(a.quantidade),0)::bigint AS qtd_historica,
       LEAST(GREATEST(COALESCE(SUM(a.quantidade),0),0),
             COALESCE((SELECT SUM(p.qtd_programada) FROM public.est_programacoes p WHERE p.op_id=o.id),0))::bigint AS qtd_considerada
FROM public.est_ops o CROSS JOIN public.est_subsetores s
LEFT JOIN public.est_apontamentos a ON a.op_id=o.id AND a.subsetor_id=s.id
GROUP BY o.id,o.op_pai,s.id,s.nome;

-- Redistribuicao FIFO automatica: cada subsetor ocupa as datas mais antigas primeiro.
-- Exemplo: 35 pecas e programacoes 10/10/10/10/10 => 10/10/10/5/0.
CREATE VIEW public.est_acompanhamento WITH (security_invoker = true) AS
WITH blocos AS (
  SELECT p.*,
    SUM(p.qtd_programada) OVER (PARTITION BY p.op_id ORDER BY p.data_programada,p.serie_inicial,p.id ROWS UNBOUNDED PRECEDING) AS acumulado
  FROM public.est_programacoes p
), alocacao AS (
  SELECT b.id AS programacao_id, b.op_id, b.data_programada,
         b.qtd_programada,b.serie_inicial,b.serie_final,
         t.subsetor_id,t.subsetor,
         GREATEST(0::bigint, LEAST(b.qtd_programada::bigint,
           t.qtd_considerada - (b.acumulado - b.qtd_programada)))::integer AS qtd_apontada
  FROM blocos b JOIN public.est_totais_subsetores t ON t.op_id=b.op_id
)
SELECT a.*, (a.qtd_programada-a.qtd_apontada) AS qtd_pendente,
  CASE WHEN a.qtd_apontada=a.qtd_programada THEN 'CONCLUIDA'
       WHEN a.data_programada < CURRENT_DATE AND a.qtd_apontada < a.qtd_programada THEN 'ATRASADA'
       WHEN a.qtd_apontada=0 THEN 'NAO_INICIADA'
       ELSE 'EM_ANDAMENTO' END AS situacao_subsetor
FROM alocacao a;

-- Protecao: nao disponibilizar as tabelas ao navegador sem autenticacao.
ALTER TABLE public.est_ops ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.est_programacoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.est_subsetores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.est_apontamentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.est_importacoes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.est_ops,public.est_programacoes,public.est_subsetores,
 public.est_apontamentos,public.est_importacoes FROM anon,authenticated;
REVOKE ALL ON public.est_totais_subsetores,public.est_acompanhamento FROM anon,authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon,authenticated;

COMMIT;

-- Teste de verificacao apos executar:
-- SELECT * FROM public.est_subsetores ORDER BY id;
-- SELECT * FROM public.est_acompanhamento LIMIT 5;
-- As views ficarao vazias ate a primeira importacao.
-- IMPORTANTE: o frontend NAO deve conter service_role. Implementar importacao atomica,
-- validacao de dados, exclusao de OPs ausentes e lancamentos por API backend segura.
-- Historico acima da nova capacidade continua registrado; a view limita o exibido.
-- Para edicoes, registrar a diferenca (+/-) no historico, validando saldo e capacidade no backend.
