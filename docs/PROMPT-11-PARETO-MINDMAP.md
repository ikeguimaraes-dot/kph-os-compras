# Prompt 11 — Miro + Pareto no mapa do Prisma

Evolução de /compras/prisma/mapa (Prompt 10, já em produção). Mesmo modo de execução: branch nova a partir do main, migrations versionadas, testes/typecheck/lint/build verdes, PR, merge e deploy SÓ com oráculos passando; PARAR e reportar se qualquer um falhar.

## Parte A — Visão Dependência vira mapa mental lateral (estilo Miro)
Trocar a árvore vertical por um canvas horizontal:
- Nó-raiz do fornecedor à ESQUERDA; ramos de insumos ao centro; folhas de pratos à direita.
- Pan (arrastar o fundo), zoom (scroll/pinça, 0.5x–2x), recolher/expandir cada ramo de insumo (clique no nó), com contagem "(+N pratos)" quando recolhido.
- Mesmos dados e selos de hoje (reserva, última compra >45d, fornecedor trocou, 86, peso no custo) — nada de regressão de conteúdo.
- Ligações em curvas suaves; espessura da ligação insumo→prato proporcional ao peso no custo.
- Duplo clique num prato abre a visão invertida dele; duplo clique noutro fornecedor re-enraíza o canvas.
- Mobile: mantém a lista vertical atual (canvas só ≥1024 px).
- Sem biblioteca pesada nova: SVG próprio ou d3 já disponível.

## Parte B — 4ª posição do interruptor: PARETO (tecla 4, ?view=pareto)
Curvas ABC com três abas internas: Pratos | Fornecedores | Insumos.
Dados (views novas, só leitura): v_pareto_prato, v_pareto_fornecedor, v_pareto_insumo.
- Pratos: barras por receita atribuída 12m (desc), linha acumulada, cortes A=80% / B=95% / C=resto. Cada barra carrega: nº de insumos EXCLUSIVOS (nenhum outro prato confirmado usa) e nº de fornecedores DEDICADOS (só entregam para este prato). Painel "economia de cardápio" ao selecionar pratos C: compra 12m evitada (R$), fornecedores a menos, boletos/mês a menos.
- Fornecedores: ABC por gasto 12m; destacar cauda C com >0 vencido (candidatos a sair).
- Insumos: ABC por compra 12m; agrupar itens equivalentes (mesmo item comprado de 2+ fornecedores) e mostrar "equalização": volume que poderia concentrar no fornecedor principal.
- Tabela compras_prato_assinatura (unit_id, produto_id, marcado_por, em) + botão "marcar assinatura" na barra do prato (RLS padrão). Prato de assinatura NUNCA entra como cortável e aparece com selo próprio.
- Tudo com tooltip de fórmula e fonte; receita = Lorean, custo/compra = Everest; cmv_pct do Lorean proibido.

## Oráculos
O1. Em cada aba, soma das barras = total da base (receita atribuída / gasto / compra) por casa; cortes A/B/C somam 100%.
O2. Parrillada Carne aparece UMA vez na aba Fornecedores (grupo unificado), sem duplicar receita.
O3. Um prato C com insumo exclusivo mostra economia = compra 12m desse insumo (conferir 1 caso real no banco).
O4. Prato marcado assinatura grava na tabela e some da lista de cortáveis na hora.
O5. Interruptor agora com 4 posições; teclas 1-4; ?view=pareto abre direto; filtros e fornecedor preservados ao alternar.
O6. Mapa mental: pan, zoom e recolher funcionam; re-enraizar por duplo clique; nenhum dado da árvore antiga some.
O7. Prints 1440 px e 390 px das visões novas; build e deploy com sessão real.
