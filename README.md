## Correção do erro 503 em `/api/ops` (22/10/2026)

**Sintoma observado:** a Vercel registra `Database operation failed`,
`operation: est_limitar` e `TimeoutError` após 45 segundos. Antes de consultar
as OPs, o middleware tentava gravar no banco para contabilizar cada GET.
Se o contador SQL estava lento/bloqueado, a listagem inteira falhava.

**Alteração aplicada:** requisições GET agora usam um contador por instância
em memória, sem executar `est_limitar`. POSTs de produção e importação **continuam**
utilizando `est_limitar` no Supabase para o limite centralizado. Mantiveram-se
intactos os filtros, cálculo de programações, apontamentos, regras FIFO,
importação, tabelas, migrações e PWA. Não é necessário executar SQL para
aplicar esta correção.

**Publicação:** atualizar o código do projeto na Vercel, executar novo deploy
e acessar a página novamente. Se persistir HTTP 503, olhar o **novo** log: se
o erro agora for na consulta das tabelas (`est_estado`, `est_ops`,
`est_programacoes`, `est_alocacoes`), há outro problema de conexão/desempenho
no Supabase que o ZIP não pode consertar por si só.

**Atenção:** a limitação de GET em memória vale **por instância**, portanto
não é um rate limit distribuído contra ataques. É imprescindível manter o
aplicativo e **todas as rotas `/api/*`** protegidos pelo controle de acesso
corporativo/proteção de deployment. Não confundir
`ACCESS_RESTRICTION_CONFIRMED=true` com um mecanismo real de autenticação.
O modo local para GET é uma medida de disponibilidade, não substitui proteção
no proxy ou um rate limiter distribuído não dependente desse RPC.

Para verificar o estado do banco sem alterar nada, execute as consultas em
`docs/diagnostico-timeout.sql` pelo SQL Editor do projeto correto no Supabase.

---

## Visualização por programação diária (atualização)

A tela principal mostra uma **tabela** por padrão; use o alternador para mostrar **cards**.
Cada registro representa **uma OP em uma data**. Ex.: OP com 20 peças em 21/10
mais 20 em 22/10 aparece em duas entradas de 20, nunca uma entrada de 40.
Quando houver faixas múltiplas na mesma data, o formulário identifica a faixa
para realizar o apontamento com o limite correspondente.

Não são necessárias migrações SQL para essa atualização visual. A importação
existente permanece inalterada. Detalhes: `docs/visao-programacao-diaria.md`.

---

## CORREÇÃO 21000 — PROJETO SUPABASE JÁ CRIADO

**Antes de importar o Excel no projeto existente**, execute **somente** o arquivo
`supabase/migrations/20261020193000_corrigir_importacao_ops_repetidas.sql`
no **Supabase → SQL Editor → Run**. Ele atualiza `public.est_importar` com
`CREATE OR REPLACE FUNCTION`, sem apagar tabelas, programações ou apontamentos.

- Não execute novamente `sql/estrutura-original.sql`.
- Não repita a migração `20261020174107_alocacoes_e_operacoes_atomicas.sql` se já foi aplicada.
- Faça um backup antes de modificar funções do banco.
- Ao instalar em um **projeto novo e vazio**, use a estrutura original e **todas**
  as migrações em ordem crescente de nome.
- O ZIP **não altera automaticamente** o projeto Supabase remoto: é necessário
  executar o SQL acima. O código Next.js atualizado exibe uma mensagem explícita
  se o banco ainda retornar o erro 21000.

**Após a correção**: na pasta `estamparia`, rode
`npm install`, `npm run verify:connection`, `npm run dev` e importe a planilha.
Os comandos de testes locais são `npm test`, `npm run typecheck`,
`npm run test:database` e `npm run test:api`.

**Segurança:** se a chave `sb_secret_...` foi exibida em uma captura de tela,
revogue-a no painel do Supabase e crie outra. Nunca inclua a chave em ZIP,
repositório ou captura de tela.

---

# Estamparia

Sistema de acompanhamento da produção com apontamentos independentes de **CORPO, FUNDO, TAMPA e TAMPA BORDEADA**, por OP e programação diária.

Frontend e backend: Next.js, React e TypeScript. Persistência de produção: exclusivamente Supabase PostgreSQL. A aplicação não utiliza localStorage para produção e não carrega dados demonstrativos. O arquivo Excel enviado foi utilizado apenas em testes isolados.

## Executar no computador

Requisitos: Node.js 22 ou 24 e npm.

```bash
npm ci
npm run dev
```

Abra `http://localhost:3000`. Sem credenciais, a interface apresenta o estado vazio e permite **validar um arquivo Excel em Configurações**. Apontamentos, listagem persistida e confirmação da importação dependem do Supabase.

### Testar simultaneamente no PC e em outro computador (rede interna)

Execute **somente** `npm run dev`. O terminal mostra `Seu computador: http://localhost:3000` e as URLs `Rede (Wi-Fi/Ethernet): http://IP-ATUAL:3000` detectadas automaticamente. Compartilhe a URL da interface de rede que conecta os dois computadores; não utilize `http://0.0.0.0:3000` no navegador.

Em desenvolvimento, a API aceita requisições **da mesma origem** nos endereços `localhost`, `127.0.0.1` e IPs IPv4 ativos deste computador. Não é necessário trocar `APP_ORIGIN`, duplicá-la ou criar `APP_ALLOWED_ORIGINS`. A proteção por `APP_ORIGIN` exata **continua ativa na produção**, separadamente. O Next.js também recebe automaticamente esses endereços em `allowedDevOrigins`.

O apontamento e o painel de importação usam identificadores UUID compatíveis com HTTP na rede local, sem abrir exceções para sites externos. Nenhuma regra SQL, quantidade, OP ou importação foi alterada para habilitar esses testes.

**Se não abrir no outro PC:** confirme que os dois equipamentos estão em uma rede que permite a comunicação, que `npm run dev` permanece aberto e que a TI/Firewall autoriza conexões TCP de entrada na porta 3000. Não desative o Firewall. Como não há login, utilize somente uma rede de teste interna autorizada, sem encaminhamento de portas para a internet.

Para validar especificamente o acesso e a geração de UUID (não acessa Supabase): `npm run test:network`.


No Windows PowerShell, copie o modelo de configuração:

```powershell
Copy-Item .env.example .env.local
```

No Linux/macOS:

```bash
cp .env.example .env.local
```

Preencha diretamente no arquivo local, nunca em código de frontend:

```dotenv
SUPABASE_URL=https://SEU-PROJETO.supabase.co
SUPABASE_SERVICE_ROLE_KEY=SUA_CHAVE_PRIVADA_DE_SERVIDOR
APP_ORIGIN=http://localhost:3000
ACCESS_RESTRICTION_CONFIRMED=false
```

A chave é utilizada somente pelo servidor. Nenhuma variável administrativa tem prefixo `NEXT_PUBLIC_`. Arquivos `.env` são ignorados pelo Git e não estão no ZIP.

## Conectar o Supabase existente

1. Faça um backup do projeto existente antes da correção.
2. Como a migração inicial já foi executada neste projeto, no SQL Editor execute **somente** `supabase/migrations/20261020193000_corrigir_importacao_ops_repetidas.sql`.
3. Configure `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` no `.env.local` ou nas variáveis privadas da hospedagem.
4. Reinicie a aplicação e execute a verificação somente de leitura:

```bash
npm run verify:connection
```

5. Em **Configurações**, selecione o Excel, valide a prévia e confirme a substituição.
6. Valide os primeiros apontamentos e uma reimportação em ambiente de homologação antes do uso operacional.

**Não execute `sql/estrutura-original.sql` no banco existente.** Esse arquivo é uma cópia do SQL recebido, incluída para referência e criação dos bancos de teste. A migração complementar **original** já está instalada no seu banco e não deve ser reaplicada. A nova migração de correção usa `CREATE OR REPLACE FUNCTION`, podendo ser reaplicada sem recriar tabelas. Se o banco real tiver alterações além do SQL anexado, compare o esquema antes de aplicar.

A migração preserva as tabelas existentes, o histórico e os totais FIFO atuais, cria alocações persistentes e substitui a lógica das duas views. Não abre políticas para `anon` ou `authenticated`.

## Publicar na Vercel

1. Extraia o ZIP e crie um repositório com esta pasta como raiz. Inclua `package-lock.json`.
2. Importe o repositório na Vercel com o framework **Next.js** e Node.js 22 ou 24.
3. Configure as variáveis privadas de servidor. Defina `APP_ORIGIN` como a origem exata do endereço utilizado, por exemplo `https://seu-projeto.vercel.app`, sem barra final. Ambientes de preview precisam da própria origem.
4. Restrinja o acesso ao aplicativo na hospedagem/rede, incluindo **todas as rotas `/api/*`**, por proteção de deployment apropriada ao plano, proxy de identidade corporativa ou rede privada. Proteja também domínios alternativos e URLs de preview.
5. Somente depois de verificar essa proteção, defina `ACCESS_RESTRICTION_CONFIRMED=true`.
6. Faça o deploy. O build padrão é `npm run build`; para testar o build local, use `npm start` após configurar as variáveis.

`ACCESS_RESTRICTION_CONFIRMED` é uma declaração de implantação, **não é autenticação**. Em modo de produção, a API responde 503 enquanto essa declaração e `APP_ORIGIN` não estiverem configuradas. O aplicativo deliberadamente não tem contas ou login próprio. Quem passar pela proteção externa poderá ler, apontar, corrigir e substituir a programação. CORS, URL oculta, validação de Origin e rate limiting não identificam usuários. Não publique o aplicativo abertamente com a API administrativa acessível.

A região da Function deve ser escolhida próxima à região do Supabase. Uploads são limitados a 4 MB, abaixo do limite de payload documentado da Vercel (4,5 MB). A importação usa uma função SQL única; não depende de tarefas em background após a resposta.

## Como operar

- **Pesquisar:** OP, referência, cliente ou uma série contida em qualquer intervalo real, inclusive seus extremos. Lacunas entre intervalos não são consideradas séries válidas.
- **Filtrar:** OP, série, cliente, potência, linha, período e situação podem ser combinados. Série e período devem corresponder à mesma programação. O card continua mostrando a OP completa; o filtro não altera a base do progresso.
- **Apontar:** escolha OP → programação (data e intervalo de séries) → subsetor → quantidade deste lançamento. O novo lançamento soma ao anterior naquela programação.
- **Editar:** informe o **novo total** daquela programação/subsetor, inclusive zero. Não é a diferença. O backend calcula o ajuste.
- **Expandir o card:** o botão de seta apresenta todas as programações individualmente, inclusive quando há mais de um intervalo no mesmo dia.
- **Importar:** a operação fica exclusivamente em Configurações. A prévia mostra linhas, OPs, unidades, período, amostra, observações e impacto das exclusões.
- **Atualização concorrente:** se outra pessoa alterar a programação durante uma edição, a operação é rejeitada. Feche o formulário, atualize os dados e confira o saldo antes de tentar novamente.
- **Prévia obsoleta:** se houver produção ou outra importação após a prévia, valide novamente o arquivo antes de confirmar.

O fuso é `America/Manaus`. Data programada é um `date`; o lançamento registra `timestamptz` real. O card é considerado atrasado se qualquer programação de data anterior a hoje tiver pendência. Conclusão exige os quatro subsetores completos em todas as programações.

Há 12 OPs por página. A busca tem debounce e cancelamento de requisições anteriores; a tela atualiza a cada 60 segundos enquanto estiver visível e após gravações confirmadas.

## Reimportação e histórico

A regra detalhada está em [docs/arquitetura.md](docs/arquitetura.md).

- Substitui integralmente as programações atuais.
- Mantém histórico das OPs presentes e remove OPs ausentes com seus apontamentos.
- Redistribui a produção por subsetor em data, série inicial e identificador crescentes.
- Fora da importação, nenhum FIFO automático muda o dia escolhido pelo operador.
- Uma redução limita a produção efetiva à capacidade atual, sem bloquear a importação.
- Um aumento posterior recupera o excedente válido preservado, se aquele subsetor não tiver sido alterado após a redução.
- **Uma correção efetiva posterior à redução redefine a base válida daquele subsetor para o total efetivamente alocado.** Assim o excedente oculto não desfaz a correção. O histórico bruto anterior permanece disponível internamente. Salvar exatamente o mesmo valor é uma operação sem alteração e não invalida excedentes.

Exemplo: 50 produzidos → programação reduzida a 40 → tela mostra 40. Se aumentar diretamente para 60, volta a mostrar 50. Se antes corrigir 40 para 35, o aumento posterior mantém 35. Cada subsetor tem sua própria base.

## Testes

```bash
npm test
npm run test:database
npm run test:api
npm run typecheck
npm run build
```

- `npm test`: leitura XLS/XLSX, validações, formatos, datas e classificação.
- `test:database`: executa o SQL original, todas as migrações em ordem e as funções reais em PGlite (PostgreSQL embutido de teste). Exercita as regras, rollback, RLS/permissões e idempotência. PGlite não é utilizado no aplicativo.
- `test:api`: executa os Route Handlers e o cliente Supabase reais, interceptando o transporte HTTP para as funções SQL do banco de testes. Não conecta a um projeto externo.
- `typecheck` e `build`: tipos e compilação de produção.

Para validar também seu Excel nos testes, defina `EXCEL_PATH` com o caminho local. O XLS original não foi incluído no código-fonte nem no banco de produção. Exemplo no PowerShell:

```powershell
$env:EXCEL_PATH = 'C:\Arquivos\arquivo.xls'
npm run test:database
npm run test:api
npm run inspect:excel -- 'C:\Arquivos\arquivo.xls'
```

O relatório de execução e as limitações estão em [docs/relatorio-testes.md](docs/relatorio-testes.md). Não há declaração de validação do Supabase real.

### Concorrência PostgreSQL real (homologação)

Há um teste pronto para múltiplas conexões independentes, que não pôde ser executado neste ambiente. Ele exige um banco **descartável**, com nome terminado em `_estamparia_test`, e autorização explícita para resetar seu schema `public`.

Crie `.env.test` localmente:

```dotenv
TEST_DATABASE_URL=postgresql://usuario:senha@localhost:5432/local_estamparia_test
ALLOW_TEST_RESET=yes
```

```bash
npm run test:concurrency
```

Esse script apaga o schema `public` **somente no banco de testes informado**, recria a estrutura e testa disputas entre apontamentos, retries e importação. Nunca aponte esse arquivo para um banco operacional. O usuário de teste precisa poder criar o schema e as roles auxiliares, ou usar roles já existentes.

## Estrutura

```text
src/app/                 Página principal e rotas API
src/components/          Cards, formulários e modais
src/lib/                 Importador, tipos, validações e acesso de servidor
supabase/migrations/     Migração inicial (já aplicada) + SQL corretivo de 21000
sql/estrutura-original.sql  SQL recebido; referência e testes
tests/                   Testes automatizados do importador e das regras
scripts/                 Testes SQL/API, conexão e execução local
docs/                    Arquitetura, execução e limites verificados
.env.example             Modelo sem credenciais
vercel.json              Configuração de deploy
```

## Referências técnicas consultadas

- [Supabase RPC](https://supabase.com/docs/reference/javascript/rpc)
- [Supabase: mudanças de TLS](https://supabase.com/changelog/cbc-tls-ciphers-deprecated)
- [SheetJS: pacote oficial Node.js](https://docs.sheetjs.com/docs/getting-started/installation/nodejs/)
- [Next.js Route Handlers](https://nextjs.org/docs/app/getting-started/route-handlers)
- [Vercel: limites de Functions](https://vercel.com/docs/functions/limitations)

O pacote SheetJS vem da distribuição oficial 0.20.3, com integridade registrada no lockfile; não utiliza o pacote npm antigo 0.18.5.
