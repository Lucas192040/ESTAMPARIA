# Arquitetura e integridade

## Fluxo

Navegador → Route Handler Node.js → cliente Supabase privado → função SQL transacional → PostgreSQL.

O frontend não se conecta diretamente ao banco. Consultas SQL são funções estáticas parametrizadas; o servidor não constrói SQL a partir do conteúdo do Excel. Importações são revalidadas no servidor, inclusive na confirmação, e novamente verificadas no banco.

## Persistência

| Estrutura          | Responsabilidade                                                                      |
| ------------------ | ------------------------------------------------------------------------------------- |
| `est_ops`          | Identidade estável por OP-Pai e atributos da OP                                       |
| `est_programacoes` | Capacidade, data e intervalo atuais; substituídos na importação                       |
| `est_subsetores`   | Quatro subsetores fixos                                                               |
| `est_apontamentos` | Lançamentos e ajustes históricos; não dependem da sobrevivência da programação antiga |
| `est_saldos_base`  | Quantidade válida a redistribuir por OP/subsetor                                      |
| `est_alocacoes`    | Quantidade efetiva e versão por programação/subsetor                                  |
| `est_estado`       | Revisão global para proteger a confirmação da prévia                                  |
| `est_requisicoes`  | Resposta e payload de operações idempotentes                                          |
| `est_importacoes`  | Metadados das importações realizadas                                                  |
| `est_limites`      | Contadores compartilhados de limite de requisições                                    |

`programacao_id` no histórico usa `ON DELETE SET NULL`. `data_programada_original` permanece. Lançamentos anteriores à migração não ganham uma data histórica inventada. Campos de ajuste registram quantidade efetiva e base antes/depois. O horário de uma migração ou reimportação não é utilizado para falsificar o horário de um apontamento antigo.

A view `est_acompanhamento` lê alocações persistentes. `est_totais_subsetores` distingue soma histórica bruta da quantidade efetivamente alocada. Depois de uma correção após redução, a soma histórica bruta pode diferir da base válida; isso é intencional. `est_saldos_base` é a fonte para reimportações futuras.

## Excedente após redução

Sem alteração operacional, o excedente permanece elegível e reaparece se a capacidade aumentar. Uma alteração efetiva de um subsetor sincroniza sua base com o total alocado atualizado, encerrando a elegibilidade do excedente oculto **somente nesse subsetor**. Seu histórico bruto é preservado. Uma gravação que não muda o total não mexe na base nem na versão.

Esse comportamento evita que uma correção de 40 para 35 seja neutralizada por 10 unidades antigas ocultas. O histórico não é truncado, mas deixa de ser usado diretamente para calcular o saldo operacional.

## Transações e concorrência

- `est_importar`: lock advisory exclusivo global, verificação da revisão, validação integral, exclusões, atualização de OPs, recriação de programações, distribuição FIFO e auditoria dentro da mesma transação RPC.
- `est_registrar`: lock global compartilhado (bloqueia importação concorrente), lock por requisição e lock da OP, checagem de versão, validação de capacidade e escrita atômica.
- Duas OPs podem ser trabalhadas simultaneamente; revisões globais são incrementadas com UPDATE atômico.
- Edições com versão obsoleta retornam conflito; a aplicação não tenta sobrescrevê-las silenciosamente.
- A mesma chave UUID com o mesmo payload retorna a resposta anterior. Reutilizar a chave com outro payload é rejeitado.
- O formulário conserva a chave durante retries do mesmo payload. Ao mudar os campos, utiliza nova chave.
- O hash SHA-256 do arquivo conecta prévia e confirmação; a revisão global protege contra alterações de produção nesse intervalo.
- Falhas no meio da importação revertem inclusive exclusões já executadas.

Respostas idempotentes com mais de sete dias são limpas durante importações. Os dados históricos de produção só são removidos quando a OP está ausente da nova programação. O teste multiusuário com conexões independentes ainda precisa ser executado na homologação; os locks foram exercitados em PostgreSQL embutido de sessão única.

## Importador

Aceita XLS binário OLE e XLSX ZIP. Identifica a linha de cabeçalho entre as primeiras 100 linhas, ignora colunas adicionais e usa os nomes das dez colunas obrigatórias. Um arquivo com mais de uma aba candidata é rejeitado para evitar escolher a programação errada. Nenhuma linha de dados não vazia é descartada silenciosamente.

Limites: arquivo de 4 MB, 10.000 linhas, 40 MB declarados de conteúdo XLSX descompactado, até 2.000 entradas ZIP. Fórmulas nas colunas obrigatórias são rejeitadas; a exportação original de valores é aceita. Código textual mantém zeros; formatos de código numérico compostos por zeros são preservados. Séries são inteiros seguros de JavaScript. O banco continua usando bigint.

Datas numéricas são interpretadas pelo calendário Excel 1900/1904. A leitura usa o valor numérico bruto da célula para impedir conversões de timezone feitas por `sheet_to_json`. Datas não são convertidas por UTC antes de serem salvas como `date`.

A validação detecta campos obrigatórios, potência fora de `numeric(12,3)`, datas inválidas, quantidades não inteiras, soma superior ao lote, inconsistências da OP, linhas duplicadas e sobreposições. Soma inferior ao lote gera observação e é aceita. Não há qualquer correspondência entre o progresso inventado da imagem e a produção persistida.

## Consulta e paginação

A função `est_listar` filtra no servidor e retorna até 12 OPs com suas programações e alocações, em uma chamada. A interface não dispara consultas individuais por card. Séries e período precisam coincidir na mesma programação; o resultado traz a OP completa para não apresentar uma visão parcial como se fosse o lote inteiro.

Os indicadores superiores refletem a seleção atual. Os extremos de séries do card são identificados como extremos; a consulta e a expansão usam os intervalos reais, sem preencher lacunas.

## Segurança

Todas as tabelas têm RLS; roles públicas não recebem políticas nem execução das funções. As views usam `security_invoker`. As funções também usam `SECURITY INVOKER` com `search_path` definido; somente `service_role` recebe os grants necessários. A chave existe exclusivamente no servidor.

O limite compartilhado usa um HMAC do identificador de origem e tipo de operação. Na Vercel, lê o cabeçalho de IP fornecido pela plataforma; fora dela, usa um contador comum para todos os clientes, sem confiar em `X-Forwarded-For` arbitrário. O limite é de 180 leituras, 60 gravações e 8 chamadas de importação por minuto. O limite local em memória só é utilizado enquanto o banco não está configurado e não é uma proteção distribuída.

Não há identidade do operador porque o escopo exclui login. A trilha registra horários e alterações, mas não atribui ações a uma pessoa. Uma barreira de acesso externa é necessária antes de publicar. A chave administrativa possui amplos privilégios: restrinja o projeto e mantenha a configuração em ambiente privado.
