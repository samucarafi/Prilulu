# Guia do proprietário — Painel Prilulu Festas

Este guia explica como manter o catálogo, controlar o estoque e acompanhar os pedidos pelo painel da loja.

## 1. Entrar no painel

1. Abra o site e acesse **Área da loja** no rodapé ou vá diretamente para `/admin`.
2. Informe a senha de administração configurada para a loja.
3. Use **Atualizar** para buscar os dados mais recentes. Ao terminar, use **Sair** para encerrar a sessão.

Se o acesso não estiver configurado, o responsável técnico precisa definir `ADMIN_PASSWORD` e `ADMIN_SESSION_SECRET` no ambiente do site. Não compartilhe essas credenciais com clientes.

## 2. Entenda o inventário antes de cadastrar

O inventário tem três áreas:

- **Estruturas internas:** equipamentos reutilizáveis, como a estrutura de um painel ou cilindro. Elas consomem estoque, mas ficam ocultas para o cliente.
- **Peças dos kits:** itens de decoração que podem aparecer no kit, como capas, mesas e tapetes. Cada variação tem estoque próprio e pode ser usada em vários kits.
- **Adicionais:** itens oferecidos à parte no pedido, como balões extras. Podem ter preço, opções e limites de estoque separados por opção.

### Estoque físico compartilhado

Cadastre uma unidade de estoque por peça ou variação, ainda que ela apareça em vários kits. Exemplo: se houver 3 capas de cilindro rosa, cadastre essa variação com quantidade 3 e reutilize o mesmo item nas composições dos kits. **Não duplique o cadastro para cada kit**, pois isso faria o sistema contar o mesmo material mais de uma vez.

O campo **Estoque** é a quantidade física da loja. O sistema compara essa quantidade com todos os pedidos que se sobrepõem entre retirada e devolução. Ele não exige que você dê baixa manualmente ao criar um kit: a composição do kit informa quantas unidades serão necessárias por pedido.

## 3. Cadastrar estruturas, peças e adicionais

Na seção **Inventário organizado**, abra **Criar item** e escolha o tipo correto. Nome, tipo e quantidade são obrigatórios; foto e classificações são opcionais.

### Para uma estrutura oculta

1. Escolha **Estrutura física oculta**.
2. Dê um nome claro, por exemplo, `Estrutura de painel redondo`.
3. Informe quantas estruturas físicas existem.
4. Salve. Não é preciso imagem para cadastrar.

### Para uma peça decorativa

Exemplo de capa que veste uma estrutura:

1. Escolha **Peça que compõe ou personaliza kit**.
2. Nome: `Capa de painel`.
3. Categoria: `Capas de painel`.
4. Preencha, se fizer sentido, temática (por exemplo, `Homem-Aranha`), cor e tamanho.
5. Em **Exige estrutura**, selecione a estrutura compatível, como `Estrutura de painel redondo`.
6. Informe o número de capas daquela variação e, se quiser, envie uma foto.

Cadastre cada combinação com estoque independente. Por exemplo: `Capa de painel · Homem-Aranha · azul · 1,5 m` e `Capa de painel · Lisa · rosa · 1,5 m` são variações distintas. Categorias, temas, cores e tamanhos já usados aparecem como sugestões; também é possível digitar um novo valor. Não preencha o que não for necessário.

Preço comercial do **kit** é definido no cadastro do kit. Peças incluídas não têm preço próprio. O campo de acréscimo da peça só serve quando o cliente adiciona ou troca aquela peça ao personalizar o kit.

### Para um adicional com opções

1. Escolha **Adicional para cliente**, informe nome, preço-base e estoque geral.
2. Em **Personalização do adicional**, adicione os grupos de opções que desejar, como `Tipo`, `Cor` ou `Tamanho`.
3. Dentro de cada grupo, cadastre os valores possíveis. Marque **Obrigatório** quando o cliente precisar escolher um valor.
4. Para cada opção, pode informar acréscimo ou desconto, quantidade específica e foto ilustrativa.

O estoque geral limita o adicional como um todo. O estoque de uma opção limita aquela variação. Se deixar o estoque da opção vazio, vale o estoque geral do adicional.

## 4. Criar e organizar kits

Em **Kits pegue e monte**, abra **Criar um kit**.

### Kit pronto

1. Informe nome, identificador URL exclusivo (por exemplo, `homem-aranha`) e tema.
2. Informe o **preço total por evento**.
3. Adicione as peças decorativas que o cliente verá e as estruturas que o kit consome. Defina a quantidade de cada item necessária para um kit.
4. Selecione uma foto, se houver, e marque **Destacar na vitrine** se quiser dar destaque.
5. Salve. O cliente poderá trocar/remover peças visíveis e acrescentar outras opções conforme o estoque; estruturas permanecem ocultas e protegidas.

### Kit montável do zero

1. Marque **Criar como kit montável do zero**.
2. Na composição-base, escolha somente as estruturas ocultas necessárias.
3. Informe o preço-base.
4. Escolha as peças decorativas que o cliente poderá selecionar.
5. Salve. O cliente deverá selecionar pelo menos uma peça para montar o pedido.

Abra **Ver composição e estoque** em um kit para conferir os itens e quantidades. Use **Editar composição** para corrigir a configuração e **Publicado/Oculto** para controlar se o kit aparece na vitrine. Ao editar um kit com reservas em andamento, alterações na composição podem ser bloqueadas para preservar os pedidos existentes; nesse caso, crie um novo kit ou aguarde a resolução dos pedidos.

## 5. Fotos pelo Cloudinary

O painel aceita PNG, JPG e WebP de até 5 MB. A imagem é enviada ao Cloudinary; o catálogo guarda o endereço da imagem, não um arquivo dentro do código do site. Para habilitar o envio, o ambiente precisa ter `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY` e `CLOUDINARY_API_SECRET` configurados.

Envie fotos nítidas do kit, peça ou opção. A imagem da opção de um adicional é usada como prévia da variação para o cliente. Se não tiver foto, deixe o campo vazio.

## 6. Cupons e divulgações

### Cupons

Na seção **Cupons**, informe código, percentual de desconto e limite total de usos. O cliente aplica o código no pedido. Acompanhe o contador de usos e use **Ativo/Pausado** para interromper ou reativar o cupom. Nesta tela não são configurados prazo de validade nem valor mínimo.

### Divulgações

Em **Divulgações**, cadastre título e texto de apoio e selecione **Publicar na home**. Use **Na home/Oculta** para controlar a exibição. Revise o título antes de publicar; ele aparece no anúncio da página inicial.

## 7. Organizar e atender pedidos

Na seção **Solicitações e reservas**, cada linha mostra cliente e contatos, kit e personalizações, data da festa, data de devolução, total, sinal e etapa.

Use os filtros para:

- pesquisar por nome, telefone, e-mail ou kit;
- ver uma etapa específica;
- separar festas futuras e passadas.

### Etapas e estoque

- **Aguardando contato:** solicitação recebida, ainda não confirmada e ainda não ocupa o estoque como reserva ativa. Entre em contato e confira o pedido.
- **Indisponível:** alguma peça ou opção não pode ser atendida na data. Edite os itens, substitua ou retire unidades; o sistema recalcula preço e disponibilidade. Se o pedido puder ser atendido após a edição, ele volta para a etapa de contato.
- **Aguardando sinal:** etapa de reserva ativa; ao selecioná-la, o servidor confere novamente o estoque e impede a alteração se houver conflito.
- **Confirmada:** reserva ativa e disponibilidade revalidada.
- **Retirada:** material saiu com o cliente e continua comprometendo o estoque até a devolução.
- **Devolvida:** marque somente depois que os itens retornarem e forem conferidos; o período reservado termina.
- **Cancelada:** encerra a solicitação/reserva e libera o estoque futuro correspondente.

O sistema considera a data de retirada até a devolução. Por padrão, a devolução é prevista para o dia seguinte à festa. Para ajustar, edite a data de devolução na linha do pedido. O servidor exige o dia seguinte ou uma data posterior e confere novamente o estoque antes de aceitar mudanças que afetem uma reserva ativa.

### Editar os itens de um pedido

Abra **Editar itens** na coluna do kit. É possível retirar, substituir ou adicionar item e informar quantidade. A substituição precisa ser da mesma categoria do item substituído. O estoque é conferido para o período completo e o total/sinal são recalculados. Alterar a composição de um pedido já confirmado ou retirado afeta o material que será entregue: converse com o cliente e confira a separação física antes de salvar.

As alterações no pedido não mudam a quantidade física cadastrada no inventário. Elas mudam quais unidades ficam comprometidas naquela reserva. Atualize o **Estoque** do inventário apenas quando a quantidade física da loja realmente mudar, por exemplo, por compra, perda ou descarte.

## 8. Avisos de indisponibilidade pelo WhatsApp

Para um pedido **Indisponível**, **Preparar aviso** abre o WhatsApp do cliente com uma mensagem individual preenchida. Confira o texto e toque em **Enviar** no WhatsApp. O envio é manual; o site não usa WhatsApp Cloud API nem encaminha mensagens sozinho.

Depois de realmente enviar, clique em **Marcar aviso enviado** para registrar a data no painel. Esse registro não cancela o pedido. Se o cliente escolher uma alternativa, use **Editar itens** e mantenha o pedido ativo. Use **Cancelar pedido** somente se a solicitação tiver sido cancelada com o cliente.

Quando uma solicitação passa a uma etapa de reserva ativa, o sistema verifica outras solicitações pendentes que ficaram sem estoque e as marca como indisponíveis, identificando a peça em conflito quando possível. O proprietário precisa preparar e enviar cada aviso manualmente. Se o pedido for resolvido por edição, revise novamente a etapa e os itens antes de confirmar.

## 9. Pagamento e atendimento

O site calcula o total e o sinal de 50%, mas não cobra nem processa pagamentos. Depois de conferir a disponibilidade, combine diretamente com o cliente o pagamento do sinal e o meio de pagamento. O restante é previsto para a retirada, conforme informado no site e confirmado pela loja.

O cliente também precisa tocar em **Enviar** na mensagem do WhatsApp que abre após a solicitação; o cadastro no site, sozinho, não envia essa mensagem para a loja. Se ele disser que enviou, localize o pedido pelo número, nome ou telefone no painel.

## 10. Rotina recomendada

1. Revise solicitações novas e indisponíveis todos os dias.
2. Confirme itens, opções, data da festa e data de devolução com o cliente.
3. Só avance para **Aguardando sinal** ou **Confirmada** depois de combinar as condições; o sistema fará a validação de estoque.
4. Antes da retirada, separe as peças conforme o pedido e registre **Retirada**.
5. Na devolução, confira o material e só então marque **Devolvida**.
6. Atualize o estoque físico quando houver mudança real na quantidade da loja.
7. Confira os itens de baixo estoque no resumo do painel e ajuste kit/divulgação quando necessário.

## Limites atuais

- O Mercado Pago ainda não está integrado; pagamentos são combinados diretamente com a loja.
- O WhatsApp é aberto com mensagens prontas, mas o proprietário precisa enviá-las manualmente e registrar o aviso no painel.
- A solicitação inicial não bloqueia o estoque até que a loja avance o pedido para **Aguardando sinal**, **Confirmada** ou **Retirada**. Atenda rapidamente solicitações concorrentes para evitar que uma data seja ocupada por outro pedido.
- A disponibilidade final depende das datas, quantidades, variações e pedidos ativos cadastrados corretamente.
