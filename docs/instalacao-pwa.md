# Instalar Estamparia como aplicativo (PWA)

Esta atualização adiciona **somente o suporte de instalação PWA**. Apontamento,
importação, saldo, tabelas, consultas e SQL permanecem inalterados.

## Publicação

1. Publique normalmente na Vercel sob HTTPS. As variáveis já exigidas pelo
   sistema continuam sendo necessárias; **PWA não modifica as regras de acesso**.
2. Abra a URL publicada no Chrome ou Edge e use **Instalar aplicativo** no menu
   do navegador (o convite automático varia por plataforma).
3. No Android (Chrome), use **Instalar aplicativo** ou **Adicionar à tela inicial**.
4. No iPhone (Safari), use **Compartilhar → Adicionar à Tela de Início**.
5. Abra o aplicativo instalado pelo ícone **Estamparia**.

## Comportamento de rede

- Conexão com a internet **continua obrigatória** para importações, consultas,
  apontamentos e qualquer operação que acesse Supabase.
- O Service Worker faz cache apenas de ícones, recursos estáticos versionados
  de `/_next/static/` e uma página de aviso para perda de conexão.
- Respostas das rotas `/api/`, HTML de páginas e dados de produção **não são
  armazenados em cache**. Se a rede falhar ao abrir uma página, mostra-se
  `/offline.html`, sem permitir registros offline.
- Em ambiente local HTTP, o PWA normalmente só funciona em `localhost`;
  abrir pelo IP da rede local sem HTTPS não habilita Service Worker.

## Arquivos adicionados

- `src/app/manifest.ts`: manifesto installable do Next.js.
- `src/components/PwaRegistration.tsx`: registro do Service Worker em produção.
- `public/sw.js`: cache controlado e fallback offline.
- `public/offline.html`: aviso de ausência de conexão.
- `public/icons/`: variantes geradas a partir do conceito industrial 3 aprovado.

## Conferência

- Manifesto: `https://SEU-DOMINIO/manifest.webmanifest`.
- Service Worker: `https://SEU-DOMINIO/sw.js`.
- DevTools do navegador → **Application → Manifest / Service workers**.
- A opção instalar depende de critérios do navegador e do ambiente de acesso.
