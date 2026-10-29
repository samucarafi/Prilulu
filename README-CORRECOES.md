# Correções Prilulu Festas

Este pacote contém somente arquivos alterados para substituir os arquivos correspondentes no projeto existente.

## Arquivos incluídos
- `app/api/availability/route.ts`: tipagem explícita e compatibilidade com kits antigos que guardavam as peças visíveis em `customizableItemIds`.
- `app/api/bookings/route.ts`: compatibilidade com a mesma composição legada ao validar e reservar estoque.
- `app/api/admin/catalog/route.ts`: carrega `customizableItemIds` para permitir editar kits antigos.
- `components/AdminWorkspace.tsx`: ao editar kit, preenche a composição com as peças visíveis dos kits antigos, rola a tela até o formulário e remove o texto redundante "Peça visível".
- `lib/storefront-data.ts`: carrega as peças incluídas nos kits antigos para exibi-las no carrinho.
- `seed-kits-prilulu-categorias.ts`: corrige o erro de tipagem na busca de estruturas.

## Aplicação
1. Faça backup do projeto e do banco.
2. Extraia este ZIP sobre a raiz do projeto, preservando as pastas.
3. Confirme que `.env.local` continua fora do ZIP e intacto.
4. Execute `npm run build`.

O ZIP do projeto enviado para análise não continha `package.json`, `tsconfig.json` nem `node_modules`; por isso não foi possível executar a build completa aqui. As alterações foram feitas com base nos arquivos-fonte enviados. Faça primeiro a build local antes de aplicar qualquer alteração de banco.
