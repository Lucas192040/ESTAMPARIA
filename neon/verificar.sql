-- Rodar no banco NOVO, depois de restaurar o .dump.
SELECT table_name FROM information_schema.tables
WHERE table_schema='public' AND table_name LIKE 'est_%'
ORDER BY table_name;
SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS parametros
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.proname IN ('est_registrar','est_importar','est_previa_importacao')
ORDER BY p.proname;
SELECT 'est_ops' AS tabela, COUNT(*) FROM public.est_ops
UNION ALL SELECT 'est_programacoes',COUNT(*) FROM public.est_programacoes
UNION ALL SELECT 'est_alocacoes',COUNT(*) FROM public.est_alocacoes
UNION ALL SELECT 'est_apontamentos',COUNT(*) FROM public.est_apontamentos
UNION ALL SELECT 'est_saldos_base',COUNT(*) FROM public.est_saldos_base
UNION ALL SELECT 'est_subsetores',COUNT(*) FROM public.est_subsetores
UNION ALL SELECT 'est_importacoes',COUNT(*) FROM public.est_importacoes
UNION ALL SELECT 'est_estado',COUNT(*) FROM public.est_estado
UNION ALL SELECT 'est_requisicoes',COUNT(*) FROM public.est_requisicoes
UNION ALL SELECT 'est_limites',COUNT(*) FROM public.est_limites;
