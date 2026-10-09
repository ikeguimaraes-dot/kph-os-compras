# Prompt 12 — Pedidos de compra: decisão com todas as variáveis

Página de Pedidos de compra do GHOST (fluxo existente de montar pedido por fornecedor). Mesmo modo de execução dos Prompts 10/11: branch nova a partir do main, migrations versionadas, testes/typecheck/lint/build verdes, PR, merge e deploy SÓ com oráculos passando; PARAR e reportar se qualquer um falhar. Fontes: receita/qtd = Lorean; estoque, compras e títulos = Everest; cmv_pct do Lorean proibido.

## Objetivo
Ao montar um pedido para um fornecedor, o comprador vê NUMA TELA SÓ, por item e pelo fornecedor:
1. ESTOQUE VIVO — posição atual do item na casa, pela melhor fonte everest_* disponível (posição/saldo mais recente; se for snapshot de inventário, rotular "posição de DD/MM"). Nunca inventar número.
2. MÉDIA DE VENDAS POR DIA DA SEMANA — por casa e produto de venda ligado ao insumo (ponte confirmada): média das últimas 12 semanas do Lorean, seg a dom. Converter para consumo do insumo via ficha explodida (qtd vendida × quantidade do insumo na ficha).
3. BOLETOS EM ABERTO do fornecedor (grupo unificado): vencido, a vencer 7d, total em aberto — mesma base da ficha do mapa (v_mapa_titulo/v_mapa_fornecedor).
4. CRÉDITO — limite cadastrado (compras_fornecedor_credito) − em aberto do grupo = disponível; barra verde/âmbar(>80%)/vermelho(estourado).

## Comportamento
- Sugestão de quantidade por item: cobertura alvo (dias, configurável; padrão até a próxima entrega típica do fornecedor ou 7d) × consumo médio dos dias cobertos − estoque vivo; nunca negativa; arredondar à unidade de compra. Tooltip com a fórmula e os números.
- Total do pedido comparado ao crédito disponível em tempo real: estourou → aviso vermelho e exige confirmação explícita (não bloquear, registrar quem confirmou).
- Fornecedor com vencido > 0 → faixa de alerta com valor e link "Abrir acordo".
- Itens do pedido com prato em 86 ligado ao insumo → selo "destrava 86".
- Views novas somente leitura (v_pedido_estoque, v_pedido_consumo_dow, reaproveitar as do mapa); nenhuma escrita em everest_*/lorean_*.
- Visual no padrão do Prisma; números com fonte e fórmula; mobile ok.

## Oráculos
O1. Para 1 item real da Meet & Eat: média de terça no app = média aritmética das últimas 12 terças do Lorean (conferir no banco, mostrar contas).
O2. Consumo do insumo = Σ(qtd vendida × qtd na ficha) só de pontes confirmadas; item sem ficha confirmada mostra "sem ficha" e não inventa consumo.
O3. Estoque vivo do item bate com a fonte everest_* escolhida; rótulo de data presente quando snapshot.
O4. Vencido/a vencer/aberto do fornecedor = ficha do mapa (mesmos números, grupo unificado, sem duplicar Popo/Specialli).
O5. Disponível = limite − aberto; pedido que estoura pinta vermelho e exige confirmação; confirmação fica registrada.
O6. Sugestão de quantidade confere com a fórmula no tooltip para 2 itens reais (um com estoque alto → sugestão 0).
O7. Prints 1440 px e 390 px; build e deploy com sessão real.
