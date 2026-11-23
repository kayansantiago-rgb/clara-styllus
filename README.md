# Clara Styllus · PDV

Sistema de ponto de venda **offline e local** da loja de roupas Clara Styllus.
Roda em um computador da loja, sem internet, e é usado pelo navegador.

## O que ele faz

- **Acabamento profissional**: o mesmo padrão em todas as telas (quadros de números, cartões, abas, botões,
  campos, tabelas, menu e barras de rolagem), cores das formas de pagamento iguais em todo o sistema e sem
  emojis nos textos do sistema.

- **Site da loja ainda mais bonito**:
  - **Giro de 360°** só nas peças escolhidas: na ficha da peça, **Giro 360°** recebe de 12 a 36 fotos tiradas em
    volta do manequim. No site, a peça ganha o selo **360°** e a cliente arrasta o dedo para girar a roupa.
  - **Foto de capa**: em Site da loja → Capa e tema, uma foto da loja ou da coleção fica atrás do título.
  - **Temas de época**: no automático, Black Friday, Natal, Dia das Mães e Dia dos Namorados entram sozinhos na
    época, com cores próprias, frases na faixa e **contagem regressiva**; depois o site volta ao clássico sozinho.
    Também dá para fixar um tema (inclusive Verão) com ou sem data de fim.
  - **Link direto da peça**: na ficha da peça, **Link no site** copia o link de uma roupa só, para mandar no
    WhatsApp da cliente. O link mostra a foto e o preço na conversa e abre o catálogo já na peça. No site, o botão
    **Compartilhar** faz o mesmo.

- **Loja online com pedidos no sistema**: o site da loja pode ficar no **GitHub Pages** (o sistema cria o
  repositório e liga o Pages sozinho) ou na Netlify. Com a **caixa de pedidos** ligada (um Google Apps Script grátis,
  com os pedidos numa planilha só da loja), a cliente finaliza a sacola no site com nome e WhatsApp e o pedido cai
  na tela **Pedidos online**: a cliente é achada pelo WhatsApp (ou cadastrada), as peças são **separadas numa
  reserva** e aparece um aviso. Dali dá para confirmar no WhatsApp, passar no caixa quando ela vier ou cancelar
  (as peças voltam ao estoque). O sistema busca os pedidos de 2 em 2 minutos.

- **Site da loja (catálogo online 3D)**: em Produtos → **Site da loja**, o sistema monta um site animado com todas
  as peças em estoque (carrossel 3D, cartões que inclinam, fotos por cor, tamanhos, preços De/Por e parcelas) e
  publica na Netlify (grátis) com um clique. A cliente abre o link no celular, escolhe tamanho e cor, monta a
  sacola e manda o pedido pronto no WhatsApp da loja. Para atualizar, é só clicar em **Atualizar o site**: o link
  continua o mesmo. Custo, quantidade em estoque e dados de clientes nunca vão para o site.

- **Produtos e relatórios mais visuais**:
  - **Ficha da peça**: clique na foto ou no nome para ver a foto grande, a grade de tamanhos colorida, quanto
    vendeu em 30 dias, há quanto tempo está na loja, o lucro por peça e as vendas das últimas 8 semanas.
  - **Selos** nos produtos: Novidade (até 15 dias), Mais vendida (top 5 do mês), Última peça e Parada (60 dias sem vender).
  - **Gráficos animados** (barras crescem, rosca gira, bolinha no ponto ao passar o mouse).
  - **Calendário de vendas** nos Relatórios: um quadradinho por dia, mais escuro onde vendeu mais, com estrela no melhor dia.
  - **Carregamento suave**: blocos cinza animados enquanto a tela busca os dados.

- **Valor da parcela na hora**: no pagamento em crédito ou crediário, cada opção de parcelas já mostra quanto
  fica ("3x de R$ 50,00 sem juros"), e a parcela escolhida aparece em destaque no total.

- **Várias peças, preço único**: no cadastro, escolha "Várias peças, preço único" para brincos, meias,
  bijuterias… Um código só para todas, o estoque com a quantidade que chegou e **uma etiqueta** com
  "PREÇO ÚNICO" e o preço bem grande (dá para imprimir mais na fila). No caixa, bipe uma vez por peça vendida.

- **Relatórios pelo dinheiro que entrou**: venda no crediário não conta como faturamento; ela entra quando a
  cliente paga a parcela (inclusive débitos antigos lançados à mão). O relatório mostra à parte quanto foi
  **vendido no crediário** (a receber) e o **crediário recebido** aparece nas formas de pagamento. A meta do mês
  e o resumo do mês em imagem seguem a mesma conta.

- **Caixa ainda mais esperto**: a foto da peça "voa" até a sacola quando entra na venda; a busca pelo nome mostra
  cartões com foto (as variações do mesmo modelo juntas); se o modelo tem vários tamanhos/cores, abre a **grade**
  com o estoque de cada um para tocar no certo; sacola animada no caixa livre e atalhos do topo com ícones coloridos.

- **Mais capricho visual**:
  - **Menu** com ícone colorido para cada tela e **bolinhas de aviso** (crediário atrasado, condicional para devolver,
    reserva vencida e peça da lista de espera que chegou).
  - **Modo escuro**: botão "Escuro/Claro" no rodapé do menu, ao lado de "Recolher" (fica guardado no computador).
  - **Abertura** com a logo ao ligar o sistema e **transição suave** entre as telas, com barrinha dourada enquanto carrega.
  - **Condicional e Reservas**: foto da cliente, barra do prazo que vai ficando vermelha e botão de WhatsApp no cartão.
  - **Vendas**: fotinhas das peças e foto da cliente em cada venda; o detalhe parece um cupom de verdade.
  - **Início**: frase do dia, atalhos coloridos, medalhas nas mais vendidas e fotos das aniversariantes.
  - **Etiquetas**: miniatura de cada etiqueta da fila, do jeito que vai sair (clique para ver grande).
  - **Lista de espera** em cartões com a foto da peça e da cliente, com a fita verde "Chegou!".

- **Visual caprichado no sistema todo**:
  - **Clientes** em cartões com selos (VIP, Nova, Sumida, Crediário/Atrasada, Aniversário), números no topo, filtros
    e botões de WhatsApp e Vender; a ficha tem cabeçalho com as ações e **linha do tempo** das compras com as fotos das peças.
  - **Venda concluída** com confete, "Obrigada, Ana!", as fotos das peças e o botão **Enviar no WhatsApp** com
    mensagem de agradecimento pronta (o texto pode ser mudado em Configurações).
  - **Foto da cliente** (quando cadastrada) no caixa (PDV), na tela de pagamento, no Crediário e no "Obrigada" da venda concluída.
  - **Crediário** com barra de quanto já pagou e as parcelas em bolinhas (paga, vencida, a vencer).
  - **Fechar o caixa** com o desenho de cada nota (nas cores do Real) e de cada moeda.
  - **Login** com "Bom dia/Boa tarde/Boa noite" e o nome de quem entrou por último, brilhos dourados no fundo.
  - **Telas vazias** com ilustração e uma frase do que fazer.
  - **Relatórios** com a meta do mês em anel (quanto falta por dia e previsão do mês), comparação com o período
    anterior em setas coloridas e ranking das mais vendidas com foto e medalhas.

- **Ícones de pagamento de verdade**: símbolo oficial do Pix, cédula de real, cartões de débito e crédito com
  chip, caderninho do crediário e vale-troca, no caixa, na tela de pagamento, nas vendas e nas reservas.

- **Pagamento mais profissional**: selo do caixa menor no topo, formas de pagamento com a cor de cada uma
  (acendem ao passar o mouse) e tela de pagamento enxuta: a forma escolhida fica colorida, troco em destaque
  verde, botões "Exato" e notas rápidas, e sem textos de explicação sobrando.

- **Caixa ainda mais bonito**: com o caixa livre aparece uma **vitrine rápida** com as peças mais vendidas e as
  novidades (um toque coloca na venda), a cliente aparece com as **iniciais** (em vermelho se tem parcela
  atrasada), o total mostra **quanto a cliente está economizando** com liquidação e descontos, e o cartão de
  "último item" só aparece quando tem peça na sacola.

- **Caixa remodelado**: barra de cima na cor da marca, leitor grande, "último item" com foto para conferir o
  que bipou, sacola em cartões, total em destaque, formas de pagamento com cores próprias e a lista de atalhos
  de teclado sempre visível. Telas de **pagamento** e de **venda concluída** no mesmo estilo (formas coloridas,
  fotos das peças da sacola, troco em destaque). **Vendas em espera** (F3 ou "Pôr em espera"): a cliente foi ao provador, a venda
  fica guardada e o caixa atende a próxima; depois é só retomar.

- **Início remodelado com resumo em palavras**: "como está a loja" escrito em português simples (vendas da
  semana × anterior, peça mais vendida, forma de pagamento mais usada, ticket médio, melhor dia e horário,
  crediário atrasado e peças para repor) e o vendido hoje em destaque.
- **Desfazer**: excluir produto ou cliente e apagar despesa só acontecem depois de alguns segundos, com o botão
  "Desfazer"; entrada de estoque também tem "Desfazer" (tira as peças e as etiquetas da fila).

- **Produtos remodelado**: painel com peças em estoque, valor em estoque, lucro previsto e o que precisa repor;
  visão **Modelos** (cada roupa uma vez, com as cores e os tamanhos e a quantidade de cada um), além de Lista e
  Vitrine; filtros (com estoque, para repor, esgotados, inativos) e ordenação.
- **Celular conectado para fotos**: o celular lê o QR Code uma vez só e fica conectado; depois, ao clicar em
  "Celular" no cadastro, o nome da peça aparece sozinho no celular para tirar a foto (Configurações → Loja mostra
  e desconecta os celulares).

- **Cadastro de peça remodelado**: vitrine ao vivo à esquerda (foto grande, nome, preço, margem e a etiqueta
  como vai sair) e 3 passos à direita (peça, preço, tamanhos/cores); tamanhos em botões, cores com bolinha,
  quantidades com − e +, preço pelo custo em um clique (×2, ×2,2, ×2,5, ×3).
- **Cadastro de produto mais rápido**: categorias em um clique (e o nome "Vestido…" já escolhe Vestido),
  tamanhos lembrados por categoria, cores comuns em um clique, **Salvar e fazer outro** (mesma categoria,
  marca e tamanhos), **Cadastrar parecido** a partir de um produto, Ctrl+Enter salva.
- **Etiquetas ao dar entrada**: ao cadastrar peças ou lançar entrada (bipagem ou estoque), as etiquetas vão
  sozinhas para a fila na quantidade certa, com o botão "Imprimir agora" (ou imprime direto, ou não faz nada —
  a escolha fica lembrada).

- **Editor de etiqueta** (Etiquetas → Editar etiqueta): monta a etiqueta do jeito da loja — arrasta e muda o
  tamanho de cada item (logo, monograma, nome, tamanho/cor, preço, preço "De", parcelas, código de barras,
  textos livres, linhas, moldura e imagens), escolhe letra (moderna, elegante, simples, máquina), tamanho,
  negrito, riscado, alinhamento e quando cada item aparece (sempre, só em liquidação, só quando parcela).
  Desfazer/refazer, setas do teclado, prévia com qualquer peça e "ver como a impressora imprime". A etiqueta
  vai como imagem para a impressora (TSPL, ZPL, EPL ou navegador), então sai igual à tela.

- **Outros computadores da loja**: em Configurações → Loja, a administradora libera o sistema para outro
  computador da mesma rede (ex.: um para cadastrar produtos enquanto o outro fica no caixa). Os dois usam os
  mesmos dados ao mesmo tempo, cada um com seu login. No outro computador basta rodar o
  `ClaraStyllus-Computador-Extra-Setup-<versão>.exe` (não pede administrador): o atalho procura o computador
  do caixa na rede sozinho e abre o sistema em janela própria. Nada fica exposto para a internet.

- **Identidade da loja**: a logo dourada (monograma CS com a borboleta) na tela de entrada, no menu, no
  ícone dos atalhos e da aba, no Resumo do mês e no catálogo do Instagram; cores do sistema no ameixa e
  dourado da marca. Em Configurações → Cupom, o botão **Usar a logo da loja** coloca a logo no cupom. A etiqueta
  sai com a logo (monograma e nome) no lugar do nome escrito, em ZPL, EPL, TSPL e pelo navegador (dá para
  desligar em Configurações → Impressoras). Etiquetadoras que só falam TSPL (Knup, Xprinter, Gprinter, TSC…)
  recebem TSPL mesmo se a linguagem ficou no padrão ZPL.

- **Assistente de boas-vindas**: na primeira vez, o administrador passa por 5 passos (dados da loja,
  impressoras com teste, vendedoras, markup e meta) e o sistema já fica pronto para vender.
- **Histórico de ações** (administrador): quem cancelou ou excluiu venda, deu desconto, mexeu no estoque
  ou no preço, fez sangria, abriu a gaveta sem venda, fechou o caixa com diferença, errou a senha… com
  filtros por período, pessoa e tipo, e destaque para o que merece atenção.
- **Ficha da cliente**: total comprado, ticket médio, última compra, tamanhos/cores/categorias que ela
  mais compra, últimas peças com foto, crediário, vales e condicionais, WhatsApp e "Vender para ela".
- **Relatórios com gráficos**: comparação com o período anterior, faturamento por dia, formas de
  pagamento, horário de pico, dia da semana, categorias e vendedoras.
- **Atualização do sistema**: procura versão nova sozinho (com internet), baixa em segundo plano e avisa
  no Início; um clique instala. Sem internet, dá para atualizar escolhendo o instalador (pendrive).
- **Visual moderno**: menu com ícones, fontes próprias (funcionam sem internet) e todas as telas redesenhadas
  (venda, pagamento, caixa com contagem de notas e moedas no fechamento, troca, produtos em lista ou vitrine,
  crediário, condicional, etiquetas, inventário e vendedores em cartões com as vendas do mês).
- **Configurações em abas**: Loja, Cupom, Impressoras, Vendas, Crediário, Backup e Atualização, com aviso de
  alterações não salvas.
- **Cupom personalizado**: logo da loja no topo (a imagem vira preto e branco sozinha, com ajuste de tom),
  mensagem final em destaque e **QR Code** do Instagram ou WhatsApp no rodapé, com pré-visualização na tela.
- **Resumo do mês em imagem**: um cartão no formato de post (1080 × 1350) com faturamento, comparação com o
  mês anterior, meta, vendas, peças, ticket, melhor dia, vendedora destaque e peça campeã. Dá para baixar ou
  copiar e colar no WhatsApp (Relatórios ou Início → "Resumo em imagem").
- **Menu recolhível**: só os ícones, com o nome aparecendo ao passar o mouse (a escolha fica guardada).
- **Animações**: entrada suave das telas, números que sobem, barras que crescem e confete quando a meta do mês
  é batida (desligadas se o Windows estiver com "reduzir animações").
- **Sons novos** (bipe, venda concluída, erro e meta), com volume baixo/médio/alto e botões para ouvir em
  Configurações → Vendas.
- **Telas vazias ilustradas**: desenhos delicados quando ainda não há produtos, vendas, clientes etc.
- **Modelos de etiqueta**: padrão, preço em destaque, **parcelado** ("3x de R$ 86,64 sem juros", com 2 a 12 parcelas) ou simples (sem o nome da loja).
- **Login sem senha salva**: o navegador não oferece para guardar a senha; cada pessoa digita a sua ao entrar
  (o ícone do olho mostra o que foi digitado).
- **Troca com vale-troca**: bipe o cupom (V123) ou use 🔁 Troca no caixa, escolha as peças que voltam e sai um
  vale impresso com código de barras (valor pago, já com desconto). O vale paga outra compra e o saldo que sobrar continua valendo.
- **Valor rápido no pagamento**: "valor exato" e notas (R$ 50, 100, 200…) com um clique.
- **Botões rápidos no caixa**: sacola, embrulho, ajuste de barra… Produtos marcados como **serviço** não controlam
  estoque e, com preço 0, o valor é perguntado na hora.
- **Reserva com sinal**: no caixa, bipe as peças, escolha a cliente e clique em **Reservar**. Ela paga um sinal
  (sugestão de 30%, em dinheiro, PIX ou cartão), as peças saem do estoque e o comprovante sai em 2 vias. Dá para
  receber mais, mudar o prazo e mandar lembrete no WhatsApp. Na retirada, as peças vão para o caixa e o sinal já
  entra como pagamento; se ela desistir, o sinal vira crédito, volta em dinheiro ou fica com a loja.
- **Lista de espera**: anote quando uma cliente pedir uma peça ou tamanho que acabou (pelo cadastro ou só
  descrevendo, ex.: "saia plissada P"). Quando a peça volta ao estoque, aparece "Chegou!" com bolinha no menu e
  aviso no Início, e um clique abre o WhatsApp com a mensagem pronta.
- **Condicional (malinha)**: bipe as peças, escolha a cliente e clique em 👜 Condicional. As peças saem do estoque,
  o comprovante sai em 2 vias e, ao fechar, o que ela ficou vai direto para o caixa.
- **Lucro real**: vendas − trocas − custo − taxas − despesas (aluguel, luz…, com repetição mensal) nos Relatórios.
- **Tela cheia** no caixa (botão de tela cheia ou atalho "Caixa (tela cheia)" criado pelo instalador).
- **Cadastro em grade**: escolha os tamanhos (botões prontos: PP–GG, 34–46…) e as cores, e digite a quantidade
  de cada combinação numa tabela. No **modo bipar**, cada bipe da etiqueta do fornecedor soma +1 na combinação
  e guarda o código dela. Dá para **adicionar tamanhos/cores** a um produto que já existe.
- **Entrada por bipagem**: quando chega mercadoria, bipe as peças e confirme — o estoque soma de uma vez.
- **Backup automático**: uma cópia ao fechar o caixa e uma vez por dia, guardando as últimas 30, com
  segunda cópia opcional em pendrive ou pasta do Google Drive/OneDrive; o painel avisa se ficar sem backup.
- **Preço sugerido pelo markup**: digite o custo e o sistema sugere o preço (ex.: custo × 2,2, terminando em ,90).
- **Liquidação "De/Por"**: aplique um desconto em lote; a etiqueta sai com o preço antigo riscado, o PDV mostra
  o "De" e o cupom informa quanto a cliente economizou.
- **Inventário pelo leitor**: conta a loja toda ou uma categoria bipando as peças, mostra o que está
  faltando/sobrando (em peças e em custo), permite desfazer/corrigir leituras e ajusta o estoque ao finalizar.
- **Juros no crédito e "cai na conta"**: até 3x sem juros (a loja paga a taxa); a partir de 4x (configurável) a
  taxa da maquininha é somada no valor da cliente e a loja recebe o preço cheio. O pagamento, a venda concluída,
  a tela Vendas, os Relatórios e o Início mostram quanto realmente cai na conta depois das taxas. Na troca, os
  juros pagos pela cliente não entram no vale.
- **Taxas das maquininhas**: tabela com a taxa do débito e de cada parcela do crédito (1x a 12x), separada
  por bandeira (Visa/Master e Elo/Amex), já preenchida com a tabela da maquininha da loja, mais a taxa do PIX
  e um simulador ("quanto cai na conta"). No pagamento, escolha a bandeira do cartão e veja a taxa na hora;
  a taxa fica gravada em cada venda e os Relatórios mostram o líquido por forma, parcela e bandeira.
- **Painel Início** (administrador): vendas de hoje × ontem, meta do mês com projeção, gráfico dos
  últimos 14 dias, mais vendidos, aniversariantes (com mensagem pronta no WhatsApp) e crediário do dia.
- **Fotos das peças**: aparecem no cadastro, na busca e no "último item" da tela de venda. Dá para **tirar a foto
  pelo celular**: no cadastro, clique em "Pelo celular", aponte a câmera para o QR Code e tire a foto (o celular
  precisa estar no mesmo Wi-Fi da loja; ele só acessa a página da foto, nunca o sistema).
- **Condicional conferida pela bipagem**: ao fechar, bipe as peças que a cliente trouxe; o que não for bipado fica com
  ela (sem bipar nada, fica com tudo). O sistema marca o que voltou (verde), o que ficou (amarelo), avisa peça errada
  ou bipada a mais, e o botão mostra quantas peças vão para o caixa.
- **Mensagens do WhatsApp editáveis**: todo botão de WhatsApp (cobrança do crediário, parcela do dia, condicional,
  reserva, lista de espera, aniversário) abre a mensagem para editar antes de mandar; a administradora pode guardar o
  texto como padrão. Os modelos ficam em Configurações → Loja, com {nome}, {loja}, {saldo}… que trocam sozinhos.
- **Sem zoom**: Ctrl + rodinha, Ctrl +/− e a pinça (touchpad ou tela de toque) não ampliam a tela; Ctrl + 0 volta
  para 100% se já estava ampliada.
- **Cobrança em fila** (Crediário → Cobrar hoje): lista de quem tem parcela vencida ou vencendo hoje (ou nos próximos
  dias, em Configurações → Crediário), a mais atrasada primeiro. **Cobrar** abre a mensagem pronta; depois de mandar,
  fica registrada ("cobrada hoje", histórico na ficha) e a próxima cliente já fica selecionada. Aviso no Início.
- **WhatsApp direto**: as mensagens abrem no **aplicativo do WhatsApp** do computador ou no **WhatsApp Web** sempre na
  mesma aba (escolha na janela da mensagem; fica guardado), sem a página intermediária do wa.me.
- **Começar do zero** (Configurações → Backup, administradora): zera o sistema com a senha da administradora e
  digitando ZERAR. Três opções: **só o movimento** (vendas, caixa, crediário, trocas, condicionais, reservas, despesas e
  histórico; mantém produtos com o estoque atual, clientes, vendedores e configurações), **tudo da loja** (também
  produtos e clientes) ou **como novo** (inclusive vendedores e configurações, volta ao primeiro acesso). Antes, guarda
  uma cópia completa "antes-de-zerar-….db" na pasta de backups, que não é apagada pelo rodízio.
- **Esqueci minha senha** (tela de entrada): vendedora pede à administradora (Vendedores → Editar → Nova senha).
  A administradora clica em **Gerar código**; o código de 6 números é gravado em
  `C:\ProgramData\ClaraStyllus\REDEFINIR-SENHA.txt` (atalho **Clara Styllus → Código para redefinir a senha** no
  menu Iniciar). Vale 15 minutos, uma vez só, e 5 erros cancelam. Fica registrado no Histórico.
- **Despesas** (menu Gestão, administradora): aba para lançar tudo o que a loja gasta — compras de mercadoria,
  funcionárias (salário, vale, comissão), aluguel, contas, impostos, embalagens… com categoria em botões, para quem foi
  pago (com os nomes já usados para escolher), forma de pagamento, observação e repetição mensal. Pago em dinheiro da
  gaveta? Marque "tirei da gaveta" e sai do caixa como sangria (apagar a despesa com o caixa aberto devolve). Mostra o
  total, para onde foi o dinheiro por categoria, os últimos 6 meses, busca e edição. Compras de mercadoria aparecem no
  total gasto, mas não entram no lucro real (o custo das peças vendidas já entra).
- **Relatórios → Despesas da loja**: resumo por categoria, comparação com o período anterior, % das vendas e as
  sangrias do caixa, que podem virar despesa com um clique.
- **Sem sugestões do navegador**: nenhum campo mostra a lista de palavras/números digitados antes nem corretor.
  Os atalhos do sistema abrem o Edge/Chrome num **perfil só do Clara Styllus** (`C:\ProgramData\ClaraStyllus\navegador`),
  com preenchimento automático de endereço/nome/telefone, senhas salvas e sugestões desligados.
- **Desconto com botões prontos**: no F7 (venda toda) e no "desconto" de cada peça aparecem 5%, 10%, 15% e 20%, já
  mostrando quanto sai e quanto fica; teclas 1, 2, 3, 4 escolhem. Dá para digitar outro valor (em % ou R$). Os botões
  mudam em Configurações → Vendas, e os acima do desconto máximo ficam desligados.
- **Foto da cliente**: no cadastro da cliente, escolha a foto no computador ou tire pelo celular (QR Code, igual à foto do
  produto). Aparece na lista e na ficha. Ao excluir o cadastro, a foto é apagada.
- **Cadastro em grade sem "esgotados" falsos**: só são criadas as combinações de tamanho × cor que têm quantidade (a
  opção de cadastrar as com 0 fica desmarcada). Se já existirem combinações criadas com 0 que nunca tiveram peça, a tela
  de Produtos avisa e deixa apagar (também pela grade do produto).
- **Receber crediário pelo caixa**: botão **Crediário** (ou F10) na tela de venda. Se a cliente da venda deve, abre o
  recebimento dela; senão, mostra quem está devendo para escolher. Vendedoras também recebem, o valor entra no caixa
  aberto e o recibo sai na impressora. No aviso de "vencido no crediário" há o atalho **receber agora**.
- **Foto sem fundo**: ao escolher ou tirar a foto da peça (no computador ou pelo celular), o sistema recorta a roupa
  sozinho e coloca num fundo no visual da loja (rosa, branco ou creme), com sombra suave, em 900 × 1200. Dá para trocar o
  fundo, voltar para a original ou desligar o "tirar o fundo sozinho". Funciona sem internet (modelo U²-Net pequeno no
  ONNX Runtime Web, em `public/vendor`). Fica melhor com a peça inteira na foto, no cabide, manequim ou estendida, sem
  pessoa junto.
- **Aviso "hora de repor" no caixa** só aparece para a administradora (as vendedoras não veem).
- **Catálogo para Instagram e WhatsApp** (Produtos → Catálogo): marque as peças e o sistema monta as imagens com
  foto, nome, tamanhos com estoque, preço "De/Por" com o % de desconto e o "3x de" sem juros. Formato de stories
  (1080 × 1920) ou de post (1080 × 1350), uma peça por imagem ou quatro por imagem com título ("Novidades da semana").
- **Chegou peça nova: avisar clientes**: depois de cadastrar uma peça ou dar entrada por bipagem, aparecem as
  clientes que pediram na lista de espera e as que compraram a mesma peça ou a mesma categoria naquele tamanho no
  último ano, cada uma com o botão de WhatsApp e a mensagem pronta (dá para editar). Também pelo ícone do WhatsApp
  na lista de produtos.
- **Curva ABC** (Relatórios): os modelos que fazem 80% do faturamento (A), os próximos 15% (B) e o resto (C), com
  aviso de "repor" no carro-chefe com pouco estoque.
- **Peças paradas** (Relatórios): modelos com estoque que não vendem há 30/60/90/120/180 dias, com o dinheiro
  parado no custo; clicar abre o produto no cadastro para fazer liquidação.
- **Melhores dias e horários** (Relatórios): mapa de calor dia da semana × horário, com os três momentos que mais vendem.
- **Excluir produto** (administrador): nunca vendido, apaga de vez; já vendido, some das listas e continua nas
  vendas antigas (o código de barras fica livre).
- **Grade de estoque** tamanho × cor, colorida (com estoque, no mínimo, esgotado).
- **Tela de venda com alertas** (crediário vencido, última peça, caixa esquecido aberto), **som ao bipar**
  e **troco em tamanho grande** ao concluir.
- **Login por vendedor(a)**: cada pessoa entra com usuário e senha; a venda e o caixa ficam no nome
  de quem está logado (aparece no cupom e no relatório por vendedor). Perfis **administrador(a)**
  (tudo) e **vendedor(a)** (vende, abre/fecha caixa, consulta vendas, clientes e etiquetas).
- **Vender (frente de caixa)**: leitor de código de barras, busca por nome, quantidade (`3*código`),
  desconto por item ou na venda (em R$ ou %), vendedor(a), cliente e CPF no cupom.
- **Pagamento**: dinheiro (com troco), PIX, débito, crédito (parcelado), **crediário** e pagamento
  dividido entre formas.
- **Crediário**: venda parcelada para o cliente, lista de quem está devendo e em atraso, recebimento
  com recibo, cobrança pelo WhatsApp e lançamento dos débitos do caderno antigo.
- **Cupom**: comprovante impresso **direto na térmica** (80 ou 58 mm, sem a janela do navegador), com
  1 ou 2 vias, e **cupom de troca** (sem preços, para presente).
- **Produtos**: cadastro com **grade de tamanho × cor** de uma só vez, preço de custo e de venda,
  margem, estoque mínimo, entrada/saída/ajuste de estoque e histórico.
- **Etiquetas**: código de barras EAN-13 gerado automaticamente (ou o do fornecedor), impressão direta
  em TSPL/ZPL/EPL nas térmicas de etiqueta (genéricas, Zebra, Elgin, Argox…) ou em folha A4 adesiva.
- **Caixa**: abrir e fechar direto da tela de venda; sangria, suprimento, abertura da gaveta, fechamento com conferência do dinheiro e
  impressão do resumo.
- **Vendas**: consulta, reimpressão e cancelamento (devolve as peças ao estoque). O administrador também
  pode **excluir** uma venda de vez (lançada errado ou de teste): se não estava cancelada, as peças voltam
  para o estoque e os vales usados voltam a valer; não é possível excluir venda com troca ou com parcela do
  crediário já recebida.
- **Clientes**: cadastro, aniversário, observações e histórico de compras.
- **Relatórios**: faturamento, ticket médio, lucro bruto, vendas por dia, por forma de pagamento,
  por vendedor(a), mais vendidos e estoque baixo.
- **Backup**: download do banco de dados com um clique.

## Instalação no computador da loja (Windows 10/11, 64 bits)

1. Baixe o **`ClaraStyllus-PDV-Setup-<versão>.exe`** (aba *Actions* → última execução de
   “Instalador Windows” → *Artifacts*, ou na página *Releases* quando houver uma versão publicada).
2. Dê dois cliques e siga o assistente. Como o instalador não tem assinatura digital paga, o Windows
   pode mostrar “O Windows protegeu o computador”: clique em **Mais informações → Executar assim mesmo**.
3. Pronto: abra pelo ícone **Clara Styllus PDV** da área de trabalho. No primeiro acesso, crie o
   usuário administrador e depois cadastre as vendedoras em **Vendedores**.

O instalador já inclui tudo (não precisa instalar Node.js nem nada mais) e:

- instala o sistema em `C:\Program Files\Clara Styllus PDV`;
- cria o serviço do Windows **Clara Styllus PDV**, que liga sozinho junto com o computador
  (sem janela preta aberta) e se reinicia caso pare;
- guarda os dados em `C:\ProgramData\ClaraStyllus\dados` e os logs em `...\logs`;
- abre o PDV como aplicativo (janela própria do Edge/Chrome, sem barra de endereço);
- **atualizar** = rodar o instalador da versão nova por cima. Os dados são mantidos e, antes,
  é feita uma cópia em `C:\ProgramData\ClaraStyllus\backups`;
- **desinstalar** pelo menu Iniciar ou em *Configurações → Aplicativos*. Ele pergunta se deve apagar os
  dados (o padrão é manter).

Depois de cadastrar o primeiro usuário, em **Vendedores** cadastre um usuário para cada vendedora.
Para passar o caixa para outra pessoa, use **Trocar usuário** no menu (a venda em andamento não se perde).

### Gerar o instalador

Ele é gerado automaticamente pelo GitHub Actions a cada envio (`.github/workflows/instalador.yml`).
Para publicar uma versão: altere `version` no `package.json` e crie a tag (`git tag v1.0.0 && git push --tags`).
Para gerar localmente (Linux/WSL com `nsis` instalado): `bash instalador/build.sh` → `dist/`.

### Rodar sem instalar (desenvolvimento)

1. Instale o **Node.js 22.13 ou mais novo**: <https://nodejs.org>.
2. **Windows**: dois cliques em `iniciar.bat`. **Linux/macOS**: `./iniciar.sh` (ou `npm start`).
3. Abra <http://localhost:3456>. Os dados ficam em `dados/clara-styllus.db`.

Variáveis opcionais: `PORTA` (padrão 3456), `BANCO` (caminho do arquivo do banco), `HOST`
(padrão `0.0.0.0`; use `127.0.0.1` para não aceitar nada da rede) e `REDE_LIBERADA=1` (libera o sistema
todo para outro computador da rede). Sem `REDE_LIBERADA`, quem está na rede (o celular) só acessa a página
de enviar a foto do produto, com o código de uso único gerado no computador.

## Impressão direta (sem a janela do navegador)

O cupom e as etiquetas são enviados **direto para a impressora**, já montados na linguagem dela.
Não passam pelo diálogo de impressão do navegador, por isso não saem com margem, escala ou corte errado.

- **Cupom (ESC/POS)**: Elgin i7/i8/i9, Epson TM-T20, Bematech MP-4200 (em modo ESC/POS), Daruma, Tanca,
  Knup e a maioria das térmicas de 58/80 mm. Também corta o papel e **abre a gaveta** nas vendas em dinheiro.
- **Etiquetas (ZPL, EPL/PPLB ou TSPL)**: Zebra, Elgin L42/L42 Pro, Argox e similares (ZPL/EPL);
  TSC, Gprinter, Xprinter, iDPRT, Beeprt e as etiquetadoras genéricas de marketplace (TSPL).
  Funciona com rolo de 1 ou mais etiquetas lado a lado.

Como configurar (em **Configurações → Impressora de cupom / Impressora de etiquetas**):

1. Instale a impressora no Windows com o driver do fabricante (ou “Generic / Text Only”).
2. Clique em **↻** para listar as impressoras do Windows e escolha a certa.
3. Ajuste o tamanho (80 ou 58 mm; tamanho da etiqueta em mm) e clique em **Imprimir teste**.
4. Se aparecerem caracteres estranhos no lugar dos acentos, troque **Acentos** para “Sem acentos”.

**Cupom automático ao finalizar a venda:** com “Imprimir o cupom automaticamente” marcado (padrão),
o cupom sai sozinho na térmica assim que a venda é concluída — sem janela de impressão. Se nenhuma
impressora de cupom foi escolhida ainda, o sistema procura uma térmica instalada no Windows (Elgin,
Bematech, Epson TM, POS-80, Generic / Text Only...) e guarda a escolha. A tela de venda concluída
mostra se o cupom foi enviado ou se deu problema (com o botão **Imprimir de novo**).

> O cupom impresso é um **comprovante de venda (não fiscal)**. O cupom fiscal eletrônico (NFC-e)
> exige certificado digital A1, CSC da SEFAZ e transmissão à SEFAZ — ainda não está integrado.

O modo **“pelo navegador”** continua disponível (por exemplo, para etiquetas em folha A4 de
impressora comum). A impressão direta usa o .NET Framework que já vem no Windows 10/11.

## Crediário

- Na venda, escolha **Crediário**: o sistema pede o cliente, o número de parcelas e o 1º vencimento.
  O cupom sai em 2 vias, com as parcelas e uma linha para o cliente assinar.
- Na aba **Crediário** você vê quem está devendo, quanto está vencido e há quantos dias.
  Ali dá para **receber** (o valor entra no caixa aberto e abate as parcelas mais antigas, com
  recibo impresso), **cobrar pelo WhatsApp** e, para o administrador, **lançar débitos antigos**
  (do caderno), estornar recebimentos e cancelar parcelas lançadas por engano.
- Em *Configurações → Crediário*: máximo de parcelas, prazo do 1º vencimento, limite padrão e
  bloqueio de nova compra para quem está em atraso. O limite de cada cliente fica no cadastro dele.

## Atalhos na tela de venda

| Tecla | Ação |
|-------|------|
| F1 | Ir para a tela de venda |
| F2 | Buscar produto |
| F4 | Finalizar venda |
| F6 | Identificar cliente |
| F7 | Desconto na venda |
| F8 | Remover o último item |
| F9 | Cancelar a venda |
| F10 | Receber pagamento do crediário (da cliente da venda ou escolhendo quem vai pagar) |
| Alt + 1…7 | Escolher a forma de pagamento (na tela de pagamento; os números sozinhos digitam o valor) |
| Enter | Confirmar a venda depois de ver o troco |
| Esc | Fechar janela |

## Sobre o cupom fiscal (NFC-e)

O cupom impresso hoje é um **comprovante de venda, não fiscal**. Desde o fim do ECF, o cupom fiscal
no varejo é a **NFC-e**, que precisa ser autorizada pela SEFAZ do estado. Para emitir é preciso:

- certificado digital **A1** da empresa;
- **CSC** (código de segurança do contribuinte), gerado no portal da SEFAZ;
- inscrição estadual habilitada para NFC-e e NCM/CFOP/CST corretos em cada produto.

A NFC-e tem **modo de contingência offline**: a nota é emitida sem internet e precisa ser
transmitida em até 24 h. A integração pode ser feita depois via ACBr ou uma API de emissão
(Focus NFe, PlugNotas, NFE.io…). Converse com a contabilidade da loja antes.

> **MEI** normalmente não é obrigado a emitir NFC-e para venda a consumidor final pessoa física.
> Confirme com a contabilidade.

## Atualizar o sistema

**Pelo próprio sistema (com internet):** em *Configurações → Atualizações do sistema* aparece a versão
instalada e se existe uma nova. O sistema procura sozinho a cada 6 horas e já deixa o instalador baixado;
o aviso aparece também no Início. Clique em **Atualizar agora**: o PDV fecha por 1–2 minutos, instala
(com backup dos dados antes) e a tela volta sozinha.

As versões vêm das *Releases* do GitHub (a cada tag `v*` o GitHub Actions publica o instalador).
Como o repositório é **privado**, o computador da loja precisa de um token de leitura:

1. No GitHub: *Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token*.
2. *Repository access*: só o repositório `clara-styllus`. *Permissions → Contents*: **Read-only**.
3. Copie o token e cole em *Configurações → Atualizações do sistema → Atualização automática e acesso*.

**Sem internet:** baixe o `ClaraStyllus-PDV-Setup-x.y.z.exe` em outro computador, leve num pendrive e
use **Atualizar com arquivo** na mesma tela (ou simplesmente rode o instalador).

## Backup

O backup é automático (Configurações → Backup automático): ao fechar o caixa e uma vez por dia, em
`C:\ProgramData\ClaraStyllus\backups`, guardando as últimas 30 cópias. Configure uma segunda pasta
(pendrive ou Google Drive) para se proteger de defeito no computador. Em *Configurações → Backups*
também dá para fazer um backup na hora ou baixar uma cópia. Para restaurar, pare o
serviço “Clara Styllus PDV” (em *Serviços* do Windows), apague os arquivos `dados/clara-styllus.db-wal` e `-shm` (se existirem) e substitua
`dados/clara-styllus.db` pelo arquivo do backup (renomeado).

## Desenvolvimento

```sh
npm start           # sobe o servidor em http://localhost:3456
npm test            # testes da API (contas, estoque, caixa, crediário, reservas, impressão…)
npm run test:telas  # testes de tela: abre um navegador e faz vendas, trocas, reservas… de verdade
```

Os testes de tela usam o [Playwright](https://playwright.dev) (com o Chromium dele). Ele não faz parte
do sistema instalado na loja: em desenvolvimento, instale com `npm i -D playwright && npx playwright install chromium`
(ou aponte `PLAYWRIGHT_MODULO` para uma instalação existente). Sem ele, os testes de tela são pulados.

Estrutura: `server.js` (servidor HTTP), `src/` (banco SQLite embutido no Node e API),
`public/` (telas em HTML/CSS/JS puro, sem build).
