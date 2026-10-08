# Ownership de dados e código

| Objeto | Repositório dono |
| --- | --- |
| everest_*, lorean_*, ingestão e sync | kph-os-financeiro |
| v_custo_compra e Análise do CMV do DRE | kph-os-financeiro |
| produto_venda_ficha, sugerir_ponte, v_ponte_* | kph-os-compras |
| v_compra_cmv_base, v_ficha_*, v_preco_medio_compra, v_share_fornecedor_item | kph-os-compras |
| mv_fornecedor_ancora, v_ancora_diagnostico, prisma_refresh_log e crons Prisma | kph-os-compras |
| v_prisma_*, mv_prisma_*, compras_* | kph-os-compras |
| /compras/fichas e /compras/prisma | kph-os-compras |
| Rotas antigas da ponte | Financeiro: redirect HTTP 308 para Compras |

O banco é compartilhado. A consolidação não executa DDL nem reaplica migrations. Os arquivos foram alinhados aos timestamps efetivamente registrados pelo MCP em schema_migrations, preservando o SQL e a versão aplicada.

| Versão aplicada | Migration | Dono |
| --- | --- | --- |
| 20261008100007 | prisma_api_only | Financeiro |
| 20261008100054 | prisma_cmv_totals | Financeiro |
| 20261008100332 | produto_venda_ficha | Compras |
| 20261008100454 | ponte_cobertura_cron | Compras |
| 20261008101148 | fornecedor_ancora | Compras |
| 20261008101324 | everest_read_models | Compras |
| 20261008102637 | ancora_diagnostico | Compras |
| 20261008103811 | prisma_leituras_plano | Compras |
| 20261008144820 | prisma_cockpit | Compras |
| 20261008151012 | prisma_metas_responsavel | Compras |

Relatórios privados de validação permanecem locais em docs/ do Compras, ignorados pelo Git porque o repositório é público. Não publicar exportações financeiras, prints ou estratégia confidencial.

## Qualidade e abastecimento

Compras mantém `v_prisma_completude_mes`, `v_prisma_estoque_*`, aliases de fornecedores, `abastecimento_*`, `v_abastecimento_*`, `cardapio_papel`, `cardapio_retirada_aprovacao`, `compras_matriz_marcas` e `compras_cotacao_distribuidor`.

`op_86`, relatórios da operação e ingestões Everest/Lorean são somente fontes de leitura. As causas confirmadas, os planos de retorno, as propostas e as aprovações ficam em tabelas próprias. Nenhum acordo executa pagamento ou baixa de título; a conciliação efetiva continua no Everest. As ações do servidor conferem identidade, papel e escopo de casa antes de usar o cliente de serviço. As tabelas novas não concedem acesso direto a anon/authenticated.

As versões posteriores à consolidação são alterações novas, aplicadas uma vez:

| Versão | Migration |
| --- | --- |
| 20261008181217 | prisma_completude_estoque_apelidos |
| 20261008182307 | prisma_abastecimento_core |
| 20261008182328 | prisma_abastecimento_models |
| 20261008182834 | prisma_abastecimento_sugestoes_recentes |
| 20261008183118 | prisma_abastecimento_guardas_alertas |
| 20261008183558 | prisma_abastecimento_metas_retomada |
| 20261008185539 | prisma_abastecimento_dia_operacional_inicial |
