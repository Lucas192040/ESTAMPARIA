import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const base = readFileSync('supabase/migrations/20261020174107_alocacoes_e_operacoes_atomicas.sql', 'utf8');
const fix = readFileSync('supabase/migrations/20261020210000_corrigir_est_registrar_safeupdate.sql', 'utf8');
const importer = readFileSync('supabase/migrations/20261020193000_corrigir_importacao_ops_repetidas.sql', 'utf8');
const reg = base.split('CREATE FUNCTION public.est_registrar(')[1].split('CREATE FUNCTION public.est_previa_importacao(')[0];
test('apontamento original tem apenas um UPDATE sem WHERE, correspondente ao erro 21000', () => {
  const stmts = reg.match(/UPDATE public\.est_[\s\S]*?;/g) || [];
  assert.equal(stmts.length, 3);
  assert.equal(stmts.filter(s => !/\bWHERE\b/i.test(s)).length, 1);
  assert.match(stmts.find(s => !/\bWHERE\b/i.test(s)), /UPDATE public\.est_estado SET revisao=revisao\+1;/);
});
test('patch corrige apenas a atualização da revisão, com filtro na chave primária', () => {
  assert.match(fix, /replace\(v_definicao, v_sem_where, v_where_id\)/);
  assert.match(fix, /WHERE id = true;/);
  assert.match(base, /CREATE TABLE public\.est_estado \(id boolean PRIMARY KEY DEFAULT true CHECK\(id\)/);
  assert.doesNotMatch(fix, /\b(?:DELETE FROM|TRUNCATE|DROP TABLE|ALTER TABLE|UPDATE public\.est_ops)\b/i);
});
test('patch trata estados original e já corrigido, falhando em função inesperada', () => {
  assert.match(fix, /position\(v_where_id IN v_definicao\)/);
  assert.match(fix, /position\(v_where_anterior IN v_definicao\)/);
  assert.match(fix, /position\(v_sem_where IN v_definicao\)/);
  assert.match(fix, /RAISE EXCEPTION 'A funcao est_registrar difere/);
});
test('patch não modifica funções de importação nem seu conteúdo SQL', () => {
  assert.doesNotMatch(fix, /(?:CREATE|REPLACE)\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+public\.est_importar/i);
  assert.match(importer, /CREATE OR REPLACE FUNCTION public\.est_importar/);
});
