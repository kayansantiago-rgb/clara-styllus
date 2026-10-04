# Clara Styllus · PDV

Sistema de ponto de venda **offline e local** da loja de roupas Clara Styllus.
Roda em um computador da loja, sem internet, e é usado pelo navegador.

## O que ele faz

- **Inventário pelo leitor**: conta a loja toda ou uma categoria bipando as peças, mostra o que está
  faltando/sobrando (em peças e em custo), permite desfazer/corrigir leituras e ajusta o estoque ao finalizar.
- **Taxas das maquininhas**: cadastre as % de débito, crédito (à vista, 2–6x, 7–12x) e PIX; a taxa fica
  gravada em cada venda e os Relatórios mostram quanto realmente cai na conta e o lucro depois das taxas.
- **Painel Início** (administrador): vendas de hoje × ontem, meta do mês com projeção, gráfico dos
  últimos 14 dias, mais vendidos, aniversariantes (com mensagem pronta no WhatsApp) e crediário do dia.
- **Fotos das peças**: aparecem no cadastro, na busca e no "último item" da tela de venda.
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
  em ZPL/EPL nas térmicas de etiqueta (Zebra, Elgin, Argox…) ou em folha A4 adesiva.
- **Caixa**: abrir e fechar direto da tela de venda; sangria, suprimento, abertura da gaveta, fechamento com conferência do dinheiro e
  impressão do resumo.
- **Vendas**: consulta, reimpressão e cancelamento (devolve as peças ao estoque).
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

Variáveis opcionais: `PORTA` (padrão 3456), `BANCO` (caminho do arquivo do banco) e `HOST`
(use `0.0.0.0` para acessar de outro computador da rede).

## Impressão direta (sem a janela do navegador)

O cupom e as etiquetas são enviados **direto para a impressora**, já montados na linguagem dela.
Não passam pelo diálogo de impressão do navegador, por isso não saem com margem, escala ou corte errado.

- **Cupom (ESC/POS)**: Elgin i7/i8/i9, Epson TM-T20, Bematech MP-4200 (em modo ESC/POS), Daruma, Tanca,
  Knup e a maioria das térmicas de 58/80 mm. Também corta o papel e **abre a gaveta** nas vendas em dinheiro.
- **Etiquetas (ZPL ou EPL/PPLB)**: Zebra, Elgin L42/L42 Pro, Argox e similares. Funciona com rolo de
  1 ou mais etiquetas lado a lado.

Como configurar (em **Configurações → Impressora de cupom / Impressora de etiquetas**):

1. Instale a impressora no Windows com o driver do fabricante (ou “Generic / Text Only”).
2. Clique em **↻** para listar as impressoras do Windows e escolha a certa.
3. Ajuste o tamanho (80 ou 58 mm; tamanho da etiqueta em mm) e clique em **Imprimir teste**.
4. Se aparecerem caracteres estranhos no lugar dos acentos, troque **Acentos** para “Sem acentos”.

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
| 1–6 | Escolher a forma de pagamento (na tela de pagamento) |
| Esc | Fechar janela |

## Sobre o cupom fiscal (NFC-e)

O cupom impresso hoje é um **comprovante de venda, não fiscal**. Desde o fim do ECF, o cupom fiscal
no varejo é a **NFC-e**, que precisa ser autorizada pela SEFAZ do estado. Para emitir é preciso:

- certificado digital **A1** da empresa;
- **CSC** (código de segurança do contribuinte), gerado no portal da SEFAZ;
- inscrição estadual habilitada para NFC-e e NCM/CFOP/CST corretos em cada produto
  (o cadastro já tem o campo NCM).

A NFC-e tem **modo de contingência offline**: a nota é emitida sem internet e precisa ser
transmitida em até 24 h. A integração pode ser feita depois via ACBr ou uma API de emissão
(Focus NFe, PlugNotas, NFE.io…). Converse com a contabilidade da loja antes.

> **MEI** normalmente não é obrigado a emitir NFC-e para venda a consumidor final pessoa física.
> Confirme com a contabilidade.

## Backup

Em *Configurações → Baixar backup agora* você baixa uma cópia do banco. Para restaurar, pare o
serviço “Clara Styllus PDV” (em *Serviços* do Windows), apague os arquivos `dados/clara-styllus.db-wal` e `-shm` (se existirem) e substitua
`dados/clara-styllus.db` pelo arquivo do backup (renomeado).

## Desenvolvimento

```sh
npm start   # sobe o servidor em http://localhost:3456
npm test    # testes da API
```

Estrutura: `server.js` (servidor HTTP), `src/` (banco SQLite embutido no Node e API),
`public/` (telas em HTML/CSS/JS puro, sem build).
