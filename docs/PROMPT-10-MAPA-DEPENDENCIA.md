# Prompt 10 — Mapa de dependência: fornecedor → insumo → prato → caixa

Origem: Book de prompts KPH OS Compras (08/10/2026). Conceito validado com dados reais da Meet & Eat.

## Modo de execução
- Trabalhar na branch `feat/prisma-mapa-20261008` a partir do `main` deste repo.
- NÃO criar worktree fora de /Users/henriqueguimaraes/Desktop/_HOS.
- Ignorar e NÃO commitar os arquivos duplicados não rastreados terminados em " 2.ts" / " 2.sql".
- Migrations versionadas em supabase/migrations; só views/tabelas novas do compras.
- Rodar testes, typecheck e build. Abrir PR. Fazer merge no main e deploy só com todos os oráculos passando.
- Gravar o relatório em docs/PRISMA-MAPA-VALIDACAO.md com o resultado de cada oráculo e prints.

## Contexto
REPO: kph-os-compras (main) · SUPABASE: iqgrvptrtphvbmvrqntm
ROTA: /compras/prisma/mapa (link no cockpit e na rotina de abastecimento)
PRINCÍPIO: o usuário é visual. Toda informação principal é forma, cor e espessura; o texto é legenda. Nenhuma tabela na primeira dobra.

## Dados (views novas de leitura; nada altera everest_*, lorean_*, op_86)
v_mapa_aresta (unit_id, raiz_cnpj, insumo_id, produto_venda_ficha_id, receita_12m, receita_semana, peso_custo, receita_atribuida, critico bool)
- Só pares confirmados na ponte (produto_venda_ficha.status = 'confirmado').
- peso_custo = custo do insumo na ficha / custo total da ficha (v_ficha_explodida × v_preco_medio_compra).
- receita_atribuida = receita do prato × peso_custo × share do fornecedor no insumo. É a medida da ESPESSURA. Nunca somar receita cheia do prato em mais de um fornecedor.
- critico = peso_custo >= 0,15 (configurável em prisma-config.ts).

Fornecedor principal do insumo = maior share nos ÚLTIMOS 90 DIAS. Guardar também o principal de 12 meses; se diferentes, sinalizar "fornecedor trocou".

v_mapa_insumo: reserva = nº de outros fornecedores (raiz) que entregaram o mesmo item ao grupo em 12 meses + itens homologados em compras_matriz_marcas. ultima_compra por casa.

v_mapa_fornecedor: gasto 12m e % das compras da casa e do grupo, posição no ranking, receita atribuída e % da receita, nº de pratos dependentes / nº de pratos vendidos, vencido, a vencer, a conciliar (> 120 dias), em aberto total, limite, disponível.

Títulos: everest_titulos_fornecedor, ds_situacao = 'Ativo', vl_saldo > 0. Parcelas de acordo (nr_nota vazio com ds_parcela n/m) marcadas como "acordo".

NOVA TABELA compras_fornecedor_credito (raiz_cnpj pk, limite_rs, prazo_dias_acordado, observacao, atualizado_por, atualizado_em). Editável na ficha do fornecedor. RLS no padrão do repo.

LIMPEZA (pré-requisito):
- Unificar Pescados Popo e Charcutaria Specialli (duas raízes cada): tabela compras_fornecedor_grupo (raiz_cnpj → grupo_id) usada por todas as views do mapa. Títulos não podem duplicar ao somar o grupo.
- Corrigir apelido "Pama de" e revisar apelidos terminados em preposição em compras_fornecedor_apelido.

## Visual

### Seletor de visão ("liga e apaga a luz")
No topo da tela, um interruptor de 3 posições, grande e tátil, sempre visível:
[ Dinheiro ] [ Dependência ] [ Travados ]
- Dinheiro = Nível 1 (fluxo Sankey, espessura em R$). Padrão ao abrir.
- Dependência = Nível 2 (árvore fornecedor → insumo → prato do fornecedor selecionado; sem seleção, abre o de maior receita atribuída).
- Travados = visão invertida (cards dos pratos em 86).
Regras: um clique troca a visão inteira com cross-fade de 200 ms, sem recarregar, mantendo casa, período, filtros e fornecedor. Posição ativa "acesa" (preenchida, cor do tema), as outras "apagadas". Estado na URL (?view=dinheiro|dependencia|travados&f=<raiz>). Atalhos 1, 2 e 3. No mobile, interruptor fixo no topo. O Nível 3 (ficha) abre por cima de qualquer visão.

### Nível 1 · Fluxo (Dinheiro)
Sankey fornecedor → prato (d3-sankey UMD ou SVG próprio).
- Espessura = receita_atribuida. Esquerda: fornecedores; direita: 12 pratos de maior receita atribuída + "outros pratos".
- Faixa verde = prato vendendo; vermelha = prato com 86 aberto (abastecimento_86); âmbar = insumo sem reserva.
- Nó do fornecedor com anel de dívida: arco proporcional a vencido / em aberto.
- Hover destaca as faixas do fornecedor ou prato; o resto vai a 8% de opacidade.
- Filtros: casa (todas ou uma), período, categoria de insumo, "só pratos em 86", "só insumos sem reserva".
- Mobile (< 640 px): lista vertical de fornecedores com barra empilhada de pratos; toque abre o Nível 2.

### Nível 2 · Foco do fornecedor (Dependência)
Árvore fornecedor → insumos → pratos:
- insumo: nome, reserva ("sem reserva" em âmbar), última compra (⚠ se > 45 dias), selo "fornecedor trocou".
- prato: receita por semana, peso no custo, selo 86 com data e nº de registros.

### Nível 3 · Ficha do fornecedor (painel lateral; bottom sheet no mobile)
- Barra de crédito: em aberto × limite; verde, âmbar (> 80%), vermelho (estourado); campo para cadastrar limite e prazo.
- Linha do tempo de boletos: eixo −100 a +45 dias, linha "hoje", um círculo por dia de vencimento com área proporcional ao valor; vermelho > 30 dias vencido, âmbar até 30, cinza a vencer; parcelas de acordo com contorno tracejado; seta "◂ R$ X a conciliar".
- Mix: % das compras (posição de N), % da receita atribuída, nº de pratos de N vendidos; quadrante âncora da aba Âncoras.
- Ações: "Abrir acordo" (pré-preenche abastecimento_acordo com pratos liberados, vencido e contribuição recuperável), "Ver na fila de 86", "Levar ao plano".

### Travados (visão invertida)
Cards dos pratos com 86 aberto, ordenados por receita por semana: dias em 86, nº de registros, status da causa e dependências (insumo, peso, fornecedor principal 90d, reserva, última compra, vencido do fornecedor). Clique abre o Nível 3.

### Padrão visual
- Tema do Prisma (escuro, Newsreader nos títulos, Instrument Sans no corpo).
- Cor só com significado: verde vende, vermelho travado, âmbar risco, roxo fornecedor, cinza neutro.
- Todo número com tooltip de fórmula e fonte. Prévia e teto rotulados.
- Transições 150–300 ms; respeitar prefers-reduced-motion. Nós e faixas focáveis, aria-label com valores.

## Oráculos (mostrar o resultado de cada um)
O1. Soma das espessuras dos fornecedores = soma da receita atribuída da view, por casa.
O2. Parrillada Carne não aparece com receita cheia em mais de um fornecedor.
O3. Porter House da Meet & Eat: fornecedor principal 90d ≠ VPJ e selo "fornecedor trocou".
O4. Pescados Popo: títulos não duplicam após unificação; vencido = R$ 15.488,54 em 08/10.
O5. Irmãos Avelino: linha do tempo mostra os ~43 boletos entre jul e set; total bate com a base.
O6. Limite cadastrado na ficha grava em compras_fornecedor_credito e a barra muda de cor.
O7. Filtro "só pratos em 86" mostra só faixas vermelhas; números batem com abastecimento_86.
O8. Interruptor: as 3 posições trocam a visão sem recarregar, mantêm filtros e fornecedor; ?view= abre direto na visão; teclas 1, 2 e 3 funcionam.
O9. Prints em 1440 px e 390 px das três visões e da ficha; build e deploy com sessão real.

PARAR e reportar se qualquer oráculo falhar. Não declarar pronto com oráculo falhando.
