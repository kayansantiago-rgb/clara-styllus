# Clara Styllus · PDV

Sistema de ponto de venda **offline e local** da loja de roupas Clara Styllus.
Roda em um computador da loja, sem internet, e é usado pelo navegador.

## O que ele faz

- **Vender (frente de caixa)**: leitor de código de barras, busca por nome, quantidade (`3*código`),
  desconto por item ou na venda (em R$ ou %), vendedor(a), cliente e CPF no cupom.
- **Pagamento**: dinheiro (com troco), PIX, débito, crédito (parcelado) e pagamento dividido entre formas.
- **Cupom**: comprovante para impressora térmica de 80 mm ou 58 mm, com 1 ou 2 vias, e
  **cupom de troca** (sem preços, para presente).
- **Produtos**: cadastro com **grade de tamanho × cor** de uma só vez, preço de custo e de venda,
  margem, estoque mínimo, entrada/saída/ajuste de estoque e histórico.
- **Etiquetas**: código de barras EAN-13 gerado automaticamente (ou o do fornecedor), impressão em
  rolo de etiquetas térmicas (Argox, Elgin, Zebra…) ou em folha A4 adesiva.
- **Caixa**: abertura com troco, sangria, suprimento, fechamento com conferência do dinheiro e
  impressão do resumo.
- **Vendas**: consulta, reimpressão e cancelamento (devolve as peças ao estoque).
- **Clientes**: cadastro, aniversário, observações e histórico de compras.
- **Relatórios**: faturamento, ticket médio, lucro bruto, vendas por dia, por forma de pagamento,
  por vendedor(a), mais vendidos e estoque baixo.
- **Backup**: download do banco de dados com um clique.

## Instalação

1. Instale o **Node.js 22.13 ou mais novo** (versão LTS): <https://nodejs.org>.
   Não é preciso instalar mais nada: o sistema não tem dependências externas.
2. Copie esta pasta para o computador da loja (ex.: `C:\ClaraStyllus`).
3. **Windows**: dê dois cliques em `iniciar.bat`.
   **Linux/macOS**: rode `./iniciar.sh` (ou `npm start`).
4. O navegador abre em <http://localhost:3456>. Deixe a janela preta aberta enquanto usar o sistema.

Dica: crie um atalho do `iniciar.bat` na área de trabalho e na pasta “Inicializar” do Windows.

Os dados ficam em `dados/clara-styllus.db`. Variáveis opcionais: `PORTA` (padrão 3456),
`BANCO` (caminho do arquivo do banco) e `HOST` (use `0.0.0.0` para acessar de outro computador da rede).

## Impressão

A impressão usa o diálogo do navegador (Chrome ou Edge recomendados).

- **Cupom**: instale o driver da impressora térmica (Elgin i9, Bematech MP-4200, Epson TM-T20…),
  configure o papel como bobina de 80 mm (ou 58 mm) e, no diálogo, escolha **Margens: nenhuma**.
- **Etiquetas**: em *Configurações* informe o tamanho da etiqueta (ex.: 40 × 30 mm) e as colunas
  (1 para rolo). No driver da impressora de etiquetas, configure o mesmo tamanho.
- **Sem diálogo de impressão**: se a loja usa uma única impressora, abra o Chrome com
  `--kiosk-printing` para imprimir direto na impressora padrão.

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
| 1–5 | Escolher a forma de pagamento (na tela de pagamento) |
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

Em *Configurações → Baixar backup agora* você baixa uma cópia do banco. Para restaurar, feche o
sistema, apague os arquivos `dados/clara-styllus.db-wal` e `-shm` (se existirem) e substitua
`dados/clara-styllus.db` pelo arquivo do backup (renomeado).

## Desenvolvimento

```sh
npm start   # sobe o servidor em http://localhost:3456
npm test    # testes da API
```

Estrutura: `server.js` (servidor HTTP), `src/` (banco SQLite embutido no Node e API),
`public/` (telas em HTML/CSS/JS puro, sem build).
