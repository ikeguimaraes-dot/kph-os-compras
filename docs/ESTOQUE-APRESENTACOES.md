# Estoque por apresentação

A tela Cadastro mín/máx lê `compras_estoque_apresentacoes`, já existente na base operacional. Cada apresentação mantém fator e unidade próprios; não converte o saldo do item pai. Saldo nulo é A contar; zero é uma contagem física válida.

A leitura inclui itens com política mesmo sem compras históricas. Itens pais com apresentações ficam bloqueados no servidor e na edição, e são excluídos de sugestões de reposição por item. Seus saldos, mínimos, máximos e tendências agregados não são apresentados como valores utilizáveis de uma embalagem. Nenhum pedido automático por apresentação é introduzido.

Registrar contagem exige casa autorizada para escrita. A atualização é restrita por casa, apresentação e versão `atualizado_em`; um conflito exige recarregar. São atualizados somente saldo contado, data e autoria, sem alterar mínimo, estoque Everest ou pedidos.

## Dependências e homologação

A tabela deve existir no ambiente de destino. Este PR não cria nem reescreve o cadastro mestre Everest, não reativa itens, não inventa saldos e não muda as referências provisórias já cadastradas. A migration estoque_apresentacoes_unidades amplia a unidade base para UNID, preservando KG e L. Isso permite contar pães e metades de placa sem converter para peso.

Após publicar, autenticar e escolher a casa: conferir apresentações separadas, registrar uma contagem real, verificar diferenciação entre A contar e zero e verificar bloqueio do item pai. A homologação autenticada não foi executada durante a implementação. Não registrar contagens fictícias na base de produção para teste.

## Validação local

`node --import tsx --test tests/stock-presentations.test.ts tests/unit-scope.test.ts tests/operational-pendings.test.ts`

`npm run type-check`, `npm run lint`, `npm run build`.
