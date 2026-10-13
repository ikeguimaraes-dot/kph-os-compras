# Prompt 15 — Ciclo de vida do 86 + alerta 85 (estoque mínimo)

Mesmo modo de execução dos Prompts anteriores: branch nova a partir do main, migrations versionadas (revoke anon/authenticated, grant select to service_role), lint + type-check + build verdes (ignorar suítes de teste com falha ESM/CJS pré-existente), PR, merge squash e deploy SÓ com os oráculos passando; se um falhar depois das correções, PARE e reporte. Fontes: 86 = op_86/abastecimento_86; vendas = lorean (qtd); estoque = mesma fonte de estoque vivo usada em /compras/pedidos. cmv_pct do Lorean proibido.

## Parte A — Aba "Linha do tempo 86" em /compras/abastecimento
O usuário quer saber QUANDO o produto entrou em 86 e QUANDO saiu. Hoje nada dá baixa.

Dados — view v_86_episodio (por casa × produto):
- ENTRADA = created_at do primeiro registro de 86 do episódio (op_86).
- SAÍDA automática = data/hora da PRIMEIRA venda do produto no Lorean POSTERIOR à entrada (qtd > 0) → rotular "voltou a vender". Sem venda posterior = episódio ABERTO.
- Registro de 86 novo DEPOIS de uma saída abre episódio novo (produto pode entrar e sair várias vezes).
- Saída manual: botão "dar baixa" no episódio (grava resolvido_por/em em abastecimento_86) — quando houver baixa manual E venda, vale a mais antiga.
- Por episódio: dias em 86 (saída−entrada; aberto = até hoje), nº de registros no período, setor/motivo do primeiro registro, receita média semanal do produto (régua de impacto, prévia).

Tela (aba nova na página de abastecimento, ao lado da fila atual):
- Lista de episódios ordenada por status (abertos primeiro) e impacto (receita/semana desc).
- Cada linha: produto, casa, ENTROU dd/mm hh, SAIU dd/mm ("voltou a vender" ou "baixa manual") ou "ABERTO · N dias", registros, motivo, receita/semana.
- Alertas visuais: entrada nas últimas 24h = selo "NOVO"; aberto > 7 dias = vermelho forte.
- Resumo no topo: abertos agora, entraram 24h, saíram 24h, mais antigo aberto.
- Badge com nº de abertos no item "Rotina de abastecimento" do menu lateral do GHOST.

## Parte B — "85": estoque mínimo e alerta de quase-fim
NOVA TABELA compras_estoque_minimo (unit_id uuid, insumo_id, qtd_minima numeric, atualizado_por, atualizado_em, pk unit_id+insumo_id; RLS padrão do repo).

Na página /compras/estoque:
- Coluna "Mínimo" editável inline (grava na tabela) ao lado do estoque atual.
- STATUS por item: OK (acima do mínimo) · 85 (abaixo do mínimo, > 0) em âmbar · ZERADO em vermelho. Item sem mínimo cadastrado = "—" (sem julgamento; não inventar mínimo).
- Filtro/aba "Em 85" listando os itens abaixo do mínimo, ordenados por (mínimo − atual)/mínimo.
- Resumo no topo: nº em 85, nº zerados, nº sem mínimo cadastrado.

Em /compras/pedidos: itens em 85 ganham selo âmbar "85" e sobem na ordenação da sugestão (prioridade de compra). Tooltip: "abaixo do mínimo cadastrado (X de Y)".

## Oráculos
O1. Caso real conferido no banco: um produto com registro de 86 e venda posterior mostra ENTRADA = created_at do 1º registro e SAÍDA = data da 1ª venda posterior, com as datas exibidas batendo com as consultas (mostrar as queries no relatório).
O2. Produto com 86 e SEM venda posterior aparece "ABERTO · N dias" com N correto.
O3. Dar baixa manual grava em abastecimento_86 e o episódio fecha na hora.
O4. Gravar um mínimo salva em compras_estoque_minimo e o status do item muda imediatamente; item com estoque < mínimo aparece na aba "Em 85" (conferir 1 caso com números reais).
O5. Contagens do resumo (abertos/24h) batem com op_86/abastecimento_86 no banco.
O6. Badge do menu = nº de episódios abertos.
O7. lint/type-check/build verdes; deploy READY; registrar no relatório docs/ABASTECIMENTO-86-VALIDACAO.md.
