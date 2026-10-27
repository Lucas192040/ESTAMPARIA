# Implantação — Radiador / Estamparia

## Funcionalidades

- Login em `/login`, escolha de setor e senha. Sessão assinada com cookie `HttpOnly`, `SameSite=Lax`, `Secure` em produção, com 12 horas de validade.
- Login Estamparia: `/estamparia`, apontamentos antigos, importação e correções, sem acesso à tela `/radiador`.
- Login Radiador: `/radiador`, apontamentos e correções independentes, sem acesso à tela `/estamparia` nem à importação.
- Ambas as telas exibem CORPO, FUNDO, TAMPA, TAMPA BORDEADA e RADIADOR (este independente).
- Uma unidade de Radiador apontada corresponde a um transformador com o conjunto completo de radiadores. Sem cadastro de número de radiadores.
- Os filtros e o progresso são calculados no navegador a partir de um snapshot consolidado. Uma leitura SQL traz Estamparia e Radiador; o Neon mantém pooling e cache de 120 segundos por instância.

## Variáveis de ambiente — Vercel

**Não modifique** `DATABASE_URL`, `APP_ORIGIN` e `ACCESS_RESTRICTION_CONFIRMED` se já estão corretas.

- `ESTAMPARIA_PASSWORD`: `estamp123` (se ausente, este é o padrão no servidor).
- `RADIADOR_PASSWORD`: `rad123` (se ausente, este é o padrão no servidor).
- `AUTH_SESSION_SECRET`: recomendada uma string secreta aleatória longa (mínimo 32 caracteres); deve ser a mesma entre instâncias. Sem ela, a aplicação deriva um segredo de `DATABASE_URL` para não exigir nova configuração imediata. Para segurança, configure a variável explicitamente.

As duas senhas pedidas são simples e compartilhadas. Para maior segurança, troque-as por valores fortes nas variáveis de ambiente após alinhamento com os operadores. As senhas não são expostas ao navegador.

## Requisitos do banco

A migração `migracao_neon_radiador.sql` deve ter sido executada antes de implantar o ZIP:
- `rad_estado`, `rad_saldos_base`, `rad_alocacoes`, `rad_apontamentos`, `rad_requisicoes`;
- `rad_registrar` e `rad_validar_alocacao`;
- `rad_acompanhamento`, `rad_resumo`;
- `est_importar` e `est_previa_importacao` estendidas para preservar Radiador.

O ZIP não executa migrations automaticamente. Para verificar as tabelas, use consultas SELECT no Neon. Não execute comandos de reversão em produção sem fazer antes outro backup, pois apagariam apontamentos criados no Radiador após o último backup.

## Verificações realizadas nesta entrega

- ZIP base `ESTAMPARIA(6).zip` é idêntico ao `ESTAMPARIA(5).zip` em conteúdo.
- 20 testes de regra de negócio compatíveis com Node foram executados e aprovados (arquivos TS transpilados sem dependências externas), incluindo 3 novos testes Radiador.
- Verificações isoladas de autenticação (papéis, senhas, cookies assinados, adulteração e logout) aprovadas.
- Pré-verificação do projeto `node scripts/check-deploy.mjs` aprovada.
- Todos os arquivos TS/TSX processados sintaticamente pelo compilador TypeScript.

**Limitações de validação:** `npm ci` não concluiu neste ambiente por indisponibilidade das dependências externas; assim `npm run build`/`npm run typecheck` e testes que dependem de `xlsx` não foram executados. Também não houve conexão live com o Neon ou teste da Vercel. Recomenda-se rodar os comandos abaixo no ambiente de homologação com rede e antes de publicar em produção:

```
npm ci
npm run typecheck
npm test
npm run build
```

## Fluxos de homologação recomendados

1. Logar em cada setor, confirmar o acesso somente à respectiva tela e bloqueio das APIs de escrita com sessão do outro setor.
2. Com OP programada com 10 unidades, registrar 4 em Radiador; confirmar Radiador 4/10 e Estamparia inalterada.
3. Completar Radiador e verificar conclusão exclusiva desse setor.
4. Apontar e corrigir Estamparia e validar os 4 subsetores continuam separados.
5. Reimportar a mesma OP com datas alteradas e verificar redistribuição do saldo Radiador sem perda do histórico.
6. Prévia de importação com exclusão de OP deve exibir quantidade de históricos Radiador afetados.
7. Repetir chamadas do mesmo `requestId` e concorrência, para verificar a idempotência e controle de versões com banco real.
8. Confirmar URL de produção e conexões Neon existentes inalteradas.
