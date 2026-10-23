# Estamparia — publicação no Neon + Vercel

## Situação da migração (23/10/2026)

A restauração do backup PostgreSQL do Supabase no Neon foi realizada pelo operador e as contagens das 10 tabelas foram confirmadas no terminal:

| Tabela | Registros |
|---|---:|
| est_alocacoes | 444 |
| est_apontamentos | 170 |
| est_estado | 1 |
| est_importacoes | 3 |
| est_limites | 3 |
| est_ops | 84 |
| est_programacoes | 111 |
| est_requisicoes | 173 |
| est_saldos_base | 336 |
| est_subsetores | 4 |
| **Total** | **1.329** |

**Isso verifica a cópia de dados, não o funcionamento ponta a ponta da aplicação.** Mantenha o Supabase antigo até concluir os testes.

## Configuração na Vercel

1. Importe a pasta `ESTAMPARIA` como raiz do projeto (Next.js), em uma hospedagem cujo acesso seja **realmente restrito**, inclusive em `/api/*`.
2. Em *Settings > Environment Variables*, defina no ambiente **Production**:
   - `DATABASE_URL`: copie de **Neon > Connect** a string **pooled** (host com `-pooler`), com SSL. Não use a senha em código, arquivos versionados ou no navegador.
   - `APP_ORIGIN`: URL pública exata do aplicativo, por exemplo `https://SEU-PROJETO.vercel.app` (sem `/` no fim).
   - `ACCESS_RESTRICTION_CONFIRMED`: `true` **somente após ativar e verificar proteção real** de acesso à aplicação e todas as APIs. Esse valor **não** bloqueia visitantes por si só.
3. Remova variáveis `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY`, se existirem no projeto antigo.
4. Publique e abra o domínio configurado. Se usar domínio customizado, ajuste `APP_ORIGIN` para corresponder ao domínio acessado.
5. A aplicação não oferece cadastro/login. Sem a restrição na infraestrutura, qualquer visitante que alcançar as APIs poderá consultar e **alterar apontamentos e importações**. Não libere o projeto publicamente.
6. Se a senha da string de conexão foi compartilhada em mensagens, **rotacione-a no Neon** e atualize `DATABASE_URL` antes de publicar.

## Testes após a publicação

- A página abre e o indicador informa `Conectado`.
- OPs e dias separados aparecem corretamente. Uma OP com mais de uma data deve manter a programação de cada dia.
- A prévia de importação do Excel funciona, mas não confirme uma importação de teste sem querer substituir dados reais.
- Faça um apontamento real autorizado em **Corpo, Fundo, Tampa e Tampa Bordeada**, confira a atualização e, quando aplicável, a correção.
- Revise o histórico, as restrições de quantidade e a reabertura/atualização da página.
- Em Neon, acompanhe **Queries, Compute, Connections** com usuários reais antes de avaliar a economia.

## Desenvolvimento / diagnóstico

Instale Node.js 22 ou 24 e rode na pasta do aplicativo:

```sh
npm ci
npm run typecheck
npm test
npm run build
```

`/api/health` consulta `SELECT 1`, que acrescenta uma leitura a cada acesso; use apenas quando necessário. A listagem utiliza snapshot SQL com cache de 2 minutos por instância, e não possui atualização automática contínua. A consistência entre instâncias depende de nova leitura/`fresh=1` e da validade do cache.

**Status da validação neste pacote:** inspeção estática dos arquivos e conferência de rotas e dependências. Sem credenciais de teste do Neon, sem conexão remota e sem instalação bem-sucedida de todas as dependências neste ambiente, não foi possível executar testes de integração, typecheck nem build local. Nenhuma regra de produção foi alterada nesta preparação.
