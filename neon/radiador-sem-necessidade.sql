CREATE TABLE IF NOT EXISTS public.rad_sem_necessidade (
  programacao_id bigint PRIMARY KEY
    REFERENCES public.est_programacoes(id) ON DELETE CASCADE,
  marcado_em timestamptz NOT NULL DEFAULT now()
);
