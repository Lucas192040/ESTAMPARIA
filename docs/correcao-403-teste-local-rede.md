# Correção do apontamento 403 nos testes locais e pela rede

## Escopo

Esta revisão altera exclusivamente a validação da origem no modo desenvolvimento, a identificação da porta do comando `npm run dev`, e seus testes. As regras de apontamento, importação, FIFO, SQL, estrutura do banco e limites de produção permanecem intactas.

## Problema

Ao receber `POST /api/production`, o Next.js pode fornecer a URL interna (`localhost`, `0.0.0.0`, ou outra porta) em vez da URL acessada pelo navegador. Comparar o `Origin` recebido com `Host` ou `request.url` causava `403 Origem da requisição não permitida.` mesmo quando o acesso era local.

## Correção

- O comando `npm run dev` determina a porta usada no desenvolvimento e passa `EST_DEV_PORT` ao Next.js automaticamente.
- Somente em desenvolvimento, as requisições de escrita são aceitas se o navegador enviar `Origin` válido com host do próprio computador (`localhost`, loopback ou IPv4 **privado** de interface local) e porta de desenvolvimento correta. A decisão não depende do hostname normalizado de `request.url` nem do `Host` da requisição.
- Origens externas e sem cabeçalho `Origin` continuam bloqueadas. Quando uma escrita for recusada em desenvolvimento, o terminal registra origem, host e origem da URL interna, sem dados sensíveis.
- Em produção, permanece a exigência original de `APP_ORIGIN` exato e `ACCESS_RESTRICTION_CONFIRMED=true`.

## Instruções

1. Extraia o ZIP em uma pasta nova e copie para `estamparia/.env.local` o arquivo do projeto que já está conectado ao Supabase. Não envie ou compartilhe a chave secreta.
2. Em `.env.local`, mantenha **apenas uma** linha `APP_ORIGIN=http://localhost:3000`. Durante `npm run dev`, o sistema libera automaticamente o link de rede exibido no terminal.
3. No CMD, dentro da pasta `estamparia`, execute `npm ci`, depois `npm run dev`.
4. Abra `http://localhost:3000` ou o endereço de rede informado no terminal. Faça um apontamento pequeno de teste e confira o lançamento, depois teste pelo outro endereço.
5. Se o navegador carregar mas o apontamento falhar, envie a **mensagem textual do terminal** (não envie credenciais). Caso o outro computador nem carregue o sistema, verifique o firewall e a política de isolamento do Wi-Fi corporativo.

## Validação automatizada

- `npm run test:network`: 6 testes aprovados (origens locais, interfaces de rede privadas, origens externas, portas, UUID no navegador HTTP, normalização da URL).
- `npm run test:migration`: aprovado.
- Análise sintática de arquivos modificados: aprovada.
- Não foi possível completar `npm ci` nem testar uma operação real no Supabase neste ambiente; a integração deve ser verificada no computador com as credenciais e a rede da empresa.

## Segurança

O acesso por IP é para testes na rede **interna autorizada**. Não exponha o servidor de desenvolvimento à internet. O sistema não possui autenticação por usuário; quem puder alcançar o endereço pode utilizar as funcionalidades. Para uso permanente, configure autenticação, HTTPS, controle de acesso à rede e uma implantação de produção.
