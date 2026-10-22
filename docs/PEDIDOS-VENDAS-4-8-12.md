# Planejamento pelas vendas em Pedidos de compra

`/compras` passa a abrir o planejamento com três visões: vendas por produto, consumo teórico de insumos por casa e consolidado dos itens canônicos do Everest. Pedidos emitidos continuam na mesma página. `/compras/pedidos` mantém as sugestões anteriores e aponta para o novo planejamento.

As janelas móveis de 28, 56 e 84 dias excluem o dia atual em São Paulo. Cada quantidade vendida é dividida por 4, 8 ou 12 para obter a média por semana calendário. A escolha de uma janela destaca a referência de sete dias; não faz média de médias. O detalhe mostra as médias por dia da semana. Cada casa informa cobertura em dias com dados. Não há ajuste de calendário operacional, eventos ou indisponibilidade nesta versão.

Somente ligações confirmadas e fichas explodidas válidas participam do cálculo de insumos. A interface expõe produtos não convertidos e rotula o consolidado como soma da parte mapeada. IDs canônicos e unidades diferentes nunca são fundidos por nome. Quantidade inválida propaga ausência de valor.

O registro de 86 é associado pelo nome normalizado do produto e funciona como aviso, não como uma correção de demanda. Não há evidência suficiente de duração ou disponibilidade para imputar vendas perdidas. A falta de ocorrência não prova disponibilidade.

Estoque é apresentado como posição histórica, com a data mais antiga e mais recente dos depósitos. A quantidade líquida a comprar permanece a confirmar: estoque utilizável, entregas abertas, segurança, embalagem e rendimento precisam ser conciliados. Nenhuma ação cria pedido, envia mensagem ou movimenta estoque.

A RPC `compras_planejamento_vendas(uuid[])` é STABLE, SECURITY INVOKER e executável somente por service_role. A action deriva os IDs permitidos da sessão por comprasAccess; não aceita escopo arbitrário do cliente. HOS e outras unidades sem código Lorean são excluídas.

Validação: testes de agregação por casa e consolidação, quantidades ausentes, fichas não confirmadas, unidades incompatíveis e janelas independentes; TypeScript; ESLint; build Next.js; consulta real e confronto com a agregação Lorean. A prévia visual deve ser revisada pelo usuário antes de evoluir para geração automática.
