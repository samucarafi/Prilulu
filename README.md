# Prilulu Festas

Loja independente em Next.js para kits de festa pegue e monte. A referência de fluxo e organização é o projeto `ecommercenext`; os dados, identidade e aplicação desta loja ficam neste diretório.

## Começar

1. Instale Node.js 20.9 ou superior.
2. Copie `.env.example` para `.env.local` e configure `MONGODB_URI`.
3. Configure também `ADMIN_PASSWORD` e `ADMIN_SESSION_SECRET` para abrir o painel proprietário.
4. Execute `npm install` e `npm run dev`.
5. Acesse `http://localhost:3002`.

O app inclui vitrine ligada ao catálogo MongoDB, adicionais do inventário, validação de cupons ativos, solicitação de reserva e painel do proprietário para cadastrar peças, kits, cupons e divulgações e acompanhar reservas. Os pedidos ficam pendentes até a confirmação manual da loja. O cliente vê o total e o sinal de 50%; nenhum pagamento é processado pelo site nesta etapa.

O painel aceita upload e troca de imagens PNG, JPG e WebP até 5 MB para kits e itens do inventário. Os arquivos ficam em `public/uploads` e o caminho fica registrado no MongoDB; em hospedagem com filesystem efêmero, migre os uploads para armazenamento persistente antes de publicar.

## Modelo de reserva e inventário

O catálogo usa documentos `Kit`; cada kit aponta para peças em `InventoryItem`. A consulta preliminar compara peças compartilhadas com reservas confirmadas na data informada e falha fechada quando MongoDB não responde. Solicitações preliminares não bloqueiam estoque. A loja deve verificar retirada, devolução e tempo de preparação antes de confirmar. Implemente holds com expiração e bloqueio transacional antes de automatizar confirmações ou cobranças.

## Pagamentos

Regra apresentada ao cliente: 50% para reservar e 50% na retirada. Nesta versão, a loja combina o sinal manualmente depois de confirmar a disponibilidade. A integração Mercado Pago e o parcelamento ficam para uma etapa futura; nenhuma credencial desse serviço é necessária agora.

## Operação e segurança

O painel exige `ADMIN_PASSWORD` e `ADMIN_SESSION_SECRET`. A vitrine publica itens ativos com quantidade registrada, e a consulta de data confere componentes compartilhados nessa data. Configure endereço de retirada, período real de locação, tempo de higienização, regras de caução, contato e termos da loja. Antes de produção, automatize o bloqueio de inventário por intervalo de datas e proteja confirmações contra reservas concorrentes.
