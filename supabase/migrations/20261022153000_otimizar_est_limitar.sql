-- Aplicar somente após as migrações de criação das tabelas/funções.
-- Mantém a semântica do contador e o limite em janela de 1 minuto.
-- Elimina a varredura DELETE feita a cada requisição de escrita.
-- A retenção de registros antigos deve ser gerenciada fora do caminho crítico.
CREATE OR REPLACE FUNCTION public.est_limitar(p_chave text, p_max integer)
RETURNS boolean
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  win bigint;
  count_now integer;
BEGIN
  win := floor(extract(epoch FROM clock_timestamp()) / 60);
  INSERT INTO public.est_limites(chave, janela, quantidade)
  VALUES(p_chave, win, 1)
  ON CONFLICT (chave)
  DO UPDATE SET
    janela = win,
    quantidade = CASE
      WHEN est_limites.janela = win THEN est_limites.quantidade + 1
      ELSE 1
    END
  RETURNING quantidade INTO count_now;
  RETURN count_now <= p_max;
END;
$function$;
