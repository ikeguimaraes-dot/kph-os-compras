# Prisma de Compras

Leitura de compras do Everest e análises derivadas do Financeiro. Este módulo não ingere, importa ou altera dados do Everest/Lorean.

## Rotas
- `/compras/prisma`: decisões/categorias, fornecedores, âncoras e plano.
- `/compras/recebimento`, `/compras/analise`, `/compras/estoque`: leituras operacionais paginadas.
- `/compras/ingredientes`, `/compras/fornecedores`, `/compras/cardapio`: cadastros e custos da API. O caminho de fichas sob `/compras` funciona com o proxy do shell.
- `/api/cardapio/import`: HTTP 410. Pedidos e cotações locais permanecem.

## Contrato e segurança
As migrations deste repositório só criam views de leitura e a tabela local `compras_plano_acao`. Dependem de `v_compra_cmv_base`, `v_ponte_fichas`, `v_ponte_cobertura`, `mv_fornecedor_ancora` e `v_ancora_diagnostico`, mantidas pelo Financeiro.

As server actions validam a sessão e o acesso a cada casa antes de usar o service role. Views analíticas não têm acesso direto de anon/authenticated. RLS limita o plano por casa; plano de grupo exige acesso a todas as casas do escopo. Edições usam `atualizado_em` como versão. A zona não restaura cookies antigos e não eleva sessões ausentes para service role.

O cálculo usa preços ponderados por quantidade, fornecedores por raiz de CNPJ e todos os itens com CFOP CMV no gasto. Pareto inclui o fornecedor que cruza o limite. A diferença para o melhor preço é um teto no período, restrito a itens com razão máximo/mínimo até 2,5. Inflação não é somada ao teto para evitar dupla contagem. Fórmulas e limiares estão em `prisma-config.ts`.

Âncoras usam uma janela móvel fixa de 12 meses do Financeiro. A cobertura da ponte e a cobertura efetiva de custo aparecem separadas. Com cobertura insuficiente, a classificação fica suspensa. O filtro personalizado se aplica às análises de compras; o plano é persistente e independente do período. As leituras de análise têm cache de até 60 segundos por escopo/período.

## Validação
`npx tsx --test tests/prisma.test.ts`, `npm run type-check` e `npm run build`.

`scripts/validate-prisma.ts` concilia o engine com as views SQL usando credenciais fornecidas pelo ambiente. Não grava no banco. Nunca versionar credenciais nem o resultado com dados empresariais.

O comando de lint do repositório ainda não tem configuração ESLint. Os relatórios de execução, contexto, exportação do protótipo e filas financeiras permanecem ignorados pelo Git neste repositório público. As evidências privadas estão no checkout local e no repositório privado do Financeiro.

O critério de pronto inclui revisão humana da ponte, conciliação ao centavo e teste da persistência do plano em sessão autenticada. Build não substitui esses testes.
