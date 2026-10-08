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
