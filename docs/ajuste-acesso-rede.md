# Acesso para testes na rede local — correção pontual

## Problemas identificados no ZIP original

- `guard()` exigia uma única URL `APP_ORIGIN` para todas as escritas, o que provocava HTTP 403 ao alternar entre `localhost` e IP.
- `allowedDevOrigins` não estava configurado e o HMR do Next.js 16 bloqueava o acesso pelo IP.
- `ProductionModal.tsx` e `ImportPanel.tsx` dependiam de `crypto.randomUUID()`, indisponível em HTTP por endereço IP nos navegadores.
- O comando `npm run dev` exibia `0.0.0.0` no campo Network, mas não mostrava o IP utilizável pelo colega.

## Correções

1. `scripts/dev.mjs` identifica os endereços IPv4 ativos e imprime os links do computador e da rede. Mantém o bind `0.0.0.0`.
2. `next.config.ts` calcula `allowedDevOrigins` automaticamente ao iniciar. Todos os headers originais foram mantidos.
3. `src/lib/server.ts` usa `isLocalDevelopmentOrigin()` apenas fora de `NODE_ENV=production`. Confere presença do header Origin, igualdade exata com a origem da URL requisitada e hostname na lista de interfaces locais. Sites de outras origens continuam bloqueados.
4. `src/lib/browser-id.ts` mantém `crypto.randomUUID` quando disponível e usa `crypto.getRandomValues` para gerar UUID v4 no HTTP da LAN. Mesmos payloads e retries anteriores.
5. O bloqueio original de produção por `APP_ORIGIN` e `ACCESS_RESTRICTION_CONFIRMED` foi preservado.

## O que não foi alterado

- **Importação Excel:** parsing, validação, prévia, confirmação, reimportação, operações RPC SQL e tabelas intactas. Somente a criação do ID de requisição da interface ganhou compatibilidade com HTTP LAN.
- **Apontamentos:** o corpo enviado à API, os limites por programação, a proteção contra duplicidades e as regras SQL seguem iguais.
- **Configurações de segurança:** cabeçalhos HTTP, limitação de requisições, serviço Supabase e controles da hospedagem foram preservados.

## Validação

- `npm run test:network`: quatro cenários (localhost, IPv4 local, rejeição de origens inválidas, UUID v4 em HTTP): passaram neste ambiente.
- Testes completos `npm test`, `npm run test:api`, `npm run typecheck`, `npm run build`: dependem da instalação de pacotes via `npm ci`. Esta instalação não pôde ser concluída no ambiente de edição; execute-os no computador com acesso às dependências.
- Acesso em dois computadores reais na rede da empresa precisa de teste no local; o firewall e a política da rede são externos à aplicação.

## Executar

Se o `.env.local` já funciona com o Supabase, **mantenha-o**; não o substitua pelo exemplo do ZIP. Em `npm run dev`, não é necessário editar `APP_ORIGIN` para alternar os dois links. Em implantação de produção, continue utilizando uma única `APP_ORIGIN` exata, com acesso externo realmente restrito.
