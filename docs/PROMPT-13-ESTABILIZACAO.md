# Prompt 13 — Estabilização geral: plataforma 100% no ar hoje

Missão única: zerar os erros de runtime do GHOST em produção e publicar os Prompts 11 e 12 já implementados. PARAR e reportar apenas se um oráculo falhar DEPOIS das correções abaixo; os problemas conhecidos têm a solução indicada e devem ser corrigidos, não reportados.

## Problemas conhecidos e solução obrigatória
1. BUILD (Turbopack): worktrees deste repo nascem com node_modules como symlink externo e o build falha. Em CADA worktree usada (prisma-pareto, compras-pedidos e qualquer nova): rm node_modules && npm install (instalação real). Já foi feito assim na worktree prisma-mapa-20261008 e funcionou.
2. ESCOPO DE CASA (React #441 em produção): várias actions ainda validam unitId com z.uuid() e recebem "all"/"" ou id fora da lista quando o usuário escolhe "Todas as casas" ou a casa HOS. Criar helper único src/lib/compras/unit-scope.ts (parse: string não-uuid → null; uuid → ele mesmo) e aplicá-lo em TODAS as entradas unitId de src/lib/compras/*-actions.ts e rotas de API do app (grep por z.uuid() e por unitId). Semântica: null = todas as casas autorizadas do usuário (como o cockpit já faz após 530b1ef). Nenhuma action pode lançar ZodError por escopo de casa.

## Sequência
A. Branch feat/estabilizacao-ghost a partir do main: aplicar o helper de escopo em todas as actions; varrer TODAS as páginas do menu GHOST (Início, Prisma de margem, Rotina de abastecimento, Estratégia, Pedidos de compra, Acordos & caixa, Cotações, Recebimento, Fornecedores, Engenharia de cardápio, Cardápio, Fichas técnicas, Matriz de marcas, Ingredientes, Estoque, Logística, Análise de CMV, mapa /compras/prisma/mapa) nos três escopos: casa única (Meet & Eat), "Todas as casas" e a casa HOS — nenhuma pode renderizar erro. Testes/typecheck/lint/build verdes; PR; merge.
B. Finalizar Prompt 11 (worktree existente prisma-pareto-*): corrigir node_modules como acima, rebase no main, build verde, revalidar os 7 oráculos do PROMPT-11, PR, merge.
C. Finalizar Prompt 12 (worktree compras-pedidos): idem, rebase no main pós-11, revalidar os 7 oráculos do PROMPT-12 (migration 20261009064932 JÁ está aplicada no banco — não reaplicar), PR, merge.
D. Deploy final de produção; aguardar READY.

## Oráculos finais (todos obrigatórios)
O1. grep: nenhuma entrada unitId de action/API validando z.uuid() cru — todas via unit-scope.
O2. Com sessão real em produção, as páginas do menu listadas em A abrem sem erro nos 3 escopos (prints por amostragem: cockpit, cardápio, fichas, mapa, pedidos em "Todas as casas" e em HOS).
O3. Logs de runtime da Vercel do projeto kph-os-compras sem NENHUM erro novo nos 15 minutos após o deploy final, navegando pelas páginas.
O4. Oráculos do Prompt 11 todos passando (relatório atualizado).
O5. Oráculos do Prompt 12 todos passando (relatório atualizado).
O6. Regressão: /compras/prisma/mapa continua funcionando (3 visões + ficha + limite gravando).
O7. Relatório final docs/ESTABILIZACAO-VALIDACAO.md com evidências, commits e URLs de deploy.
