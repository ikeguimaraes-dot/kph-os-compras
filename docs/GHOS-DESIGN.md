# GHOS · Compras

GHOS é a identidade do produto de Compras do Grupo KPH. Prisma permanece como cockpit de margem dentro dele.

## Entrada e navegação

- Entrada: `/compras/inicio`. A raiz do aplicativo direciona para essa página.
- `/compras` continua sendo Pedidos de compra, preservando links existentes.
- A navegação do GHOS contém apenas Compras, organizada em visão e direção, operação, cozinha e base.
- O link KPH OS retorna à plataforma principal. O domínio canônico e o login compartilhado permanecem os mesmos.
- A casa selecionada usa o contexto existente de autorização e seleção; não cria uma sessão paralela.

## Identidade

Marfim e verde profundo, com bronze em pequenos detalhes. Fraunces nos títulos e na assinatura; Instrument Sans na interface. O símbolo combina a letra G com linhas que remetem a orientação e origem.

A entrada conduz a três ações: abastecer, entender a margem e negociar. Não replica indicadores nem apresenta números sem consultar sua fonte. O conceito editorial é “Comprar bem. Servir melhor.”

O tema claro é o padrão. A preferência claro/escuro é persistida sob `ghos-theme`, independente da preferência de outras áreas. O menu móvel usa diálogo nativo, com fechamento por Escape, contenção de foco e botão de fechamento. Há link para pular a navegação, estado atual nos links e suporte a movimento reduzido.

## Validação

TypeScript, build Next.js e regressões de cálculo. Conferência visual e interação em ambiente local de teste, nas larguras de desktop e celular. A validação local não substitui o acesso autenticado do usuário em produção.
