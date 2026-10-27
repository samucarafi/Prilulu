# Prilulu Festas

Loja independente em Next.js para kits de festa pegue e monte. A referência de fluxo e organização é o projeto `ecommercenext`; os dados, identidade e aplicação desta loja ficam neste diretório.

## Começar

1. Instale Node.js 20.9 ou superior.
2. Copie `.env.example` para `.env.local` e configure `MONGODB_URI`.
3. Configure também `ADMIN_PASSWORD` e `ADMIN_SESSION_SECRET` para abrir o painel proprietário.
4. Configure `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY` e `CLOUDINARY_API_SECRET` para habilitar upload de imagens. As credenciais ficam somente no servidor.
5. Execute `npm install` e `npm run dev`.
6. Acesse `http://localhost:3002`.

## Dados de demonstração

Para inserir exemplos de estruturas internas, peças decorativas vinculadas às estruturas, adicionais com opções e kits fixos/personalizáveis no banco configurado em `.env.local`, execute `node --env-file=.env.local scripts/seed-exemplos.mjs`. A carga é repetível: usa IDs próprios e estáveis, atualiza somente esses documentos demonstrativos e não remove outros registros. Os nomes terminam com “· EXEMPLO”; os exemplos ficam ativos para aparecer na home durante testes e usam a imagem local `/images/hero-pega-monte.png`. Revise preços, estoque e disponibilidade antes de usar como catálogo real; substitua as imagens pelo admin via Cloudinary.

O app inclui vitrine ligada ao catálogo MongoDB, adicionais do inventário, validação de cupons ativos, solicitação de reserva e painel do proprietário para cadastrar peças, kits, cupons e divulgações e acompanhar reservas. Os pedidos ficam pendentes até a confirmação manual da loja. O cliente vê o total e o sinal de 50%; nenhum pagamento é processado pelo site nesta etapa.

O painel envia imagens PNG, JPG e WebP de até 5 MB para a pasta `prilulu-festas/catalogo` no Cloudinary. O MongoDB guarda a URL segura e o identificador da imagem; imagens não são gravadas no código nem em `public/uploads`. Sem as três variáveis Cloudinary configuradas, o upload fica desativado.

Adicionais podem ter grupos configuráveis de opções (por exemplo, tipo, cor e tamanho), com foto ilustrativa por opção, acréscimo ou desconto e estoque opcional por valor. A loja mantém também o estoque geral do adicional; os dois limites são conferidos no envio e na confirmação do pedido.

Peças de kit usam registros de estoque independentes por categoria, cor e tamanho. Por exemplo, cadastre “Capa de cilindro” com categoria “Capas de cilindro”, cor “Rosa”, tamanho “P · 60 cm”, quantidade física e foto. Cadastre cada outra combinação em uma linha separada e selecione a peça exata na composição do kit. O mesmo registro pode ser compartilhado por vários kits; o preço comercial fica somente no kit, sem preço adicional nas peças.

Kits prontos permitem personalização automaticamente: no carrinho, o cliente pode trocar ou retirar peças visíveis incluídas e escolher variações da mesma categoria. Também pode acrescentar peças de categorias que não estavam no kit, como uma mesa diferente ou LED. Peças que dependam de uma estrutura só aparecem quando o kit já inclui a estrutura compatível; estruturas nunca são expostas nem removidas pelo cliente. O preço do kit continua sendo o preço-base, com acréscimos configurados nas peças escolhidas; alterações ficam registradas no pedido e entram no controle compartilhado de estoque. Em kits montáveis do zero, a loja continua definindo as opções permitidas no admin.

## Modelo de reserva e inventário

O catálogo usa documentos `Kit`; cada kit aponta para peças em `InventoryItem`. A consulta preliminar compara peças compartilhadas com reservas confirmadas na data informada e falha fechada quando MongoDB não responde. Solicitações preliminares não bloqueiam estoque. A loja deve verificar retirada, devolução e tempo de preparação antes de confirmar. Implemente holds com expiração e bloqueio transacional antes de automatizar confirmações ou cobranças.

## Pagamentos

Regra apresentada ao cliente: 50% para reservar e 50% na retirada. Nesta versão, a loja combina o sinal manualmente depois de confirmar a disponibilidade. A integração Mercado Pago e o parcelamento ficam para uma etapa futura; nenhuma credencial desse serviço é necessária agora.

## Operação e segurança

O painel exige `ADMIN_PASSWORD` e `ADMIN_SESSION_SECRET`. A vitrine publica itens ativos com quantidade registrada, e a consulta de data confere componentes compartilhados nessa data. Configure endereço de retirada, período real de locação, tempo de higienização, regras de caução, contato e termos da loja. Antes de produção, automatize o bloqueio de inventário por intervalo de datas e proteja confirmações contra reservas concorrentes.
