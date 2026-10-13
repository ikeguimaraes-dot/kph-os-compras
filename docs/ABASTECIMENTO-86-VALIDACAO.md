# Validação — Prompt 15: Ciclo de vida do 86 + alerta 85

Branch: `feat/abastecimento-86-estoque-minimo`
Data: 2026-10-13

---

## O7 — lint / type-check / build

| Verificação | Status |
|---|---|
| `npx tsc --noEmit` | ✅ 0 erros |
| `npm run lint` | ✅ 0 avisos |
| `npm run build` | ✅ todas as rotas compiladas |

Rotas novas presentes no output do build:
- `ƒ /compras/abastecimento/timeline`
- `ƒ /compras/estoque/minimo`

---

## O1 — Produto com 86 e venda posterior: ENTRADA = 1º registro, SAÍDA = 1ª venda posterior

```sql
-- 1. Encontre um episódio fechado por venda ("voltou_a_vender")
SELECT
  produto_id,
  produto_nome,
  ep_num,
  entrada_at,
  saida_at,
  saida_tipo,
  saida_venda_at,
  dias_em_86
FROM v_86_episodio
WHERE saida_tipo = 'voltou_a_vender'
ORDER BY entrada_at DESC
LIMIT 5;

-- 2. Confirme o 1º registro de abastecimento_86 para esse produto + episódio
-- (substitua :produto_id e :entrada_at pelos valores da query acima)
SELECT
  a.id,
  a.produto_id,
  o.created_at AS op_86_created_at,
  a.criado_em
FROM abastecimento_86 a
JOIN op_86 o ON o.id = a.op_86_id
WHERE a.produto_id = :'produto_id'
ORDER BY a.criado_em
LIMIT 3;

-- 3. Confirme a 1ª venda posterior no Lorean
-- (substitua :produto_id e :entrada_at pelos valores obtidos)
SELECT
  lpd.produto_id,
  lpd.data,
  lpd.qtd
FROM lorean_produtos_dia lpd
WHERE lpd.produto_id = :'produto_id'
  AND lpd.data > :'entrada_at'::date
  AND lpd.qtd > 0
ORDER BY lpd.data
LIMIT 3;
```

**Validação:** `entrada_at` da view deve coincidir com `op_86_created_at` (ou `criado_em` quando `created_at` não está exposto). `saida_at` deve coincidir com a data da 1ª linha da query 3.

---

## O2 — Produto em 86 SEM venda posterior: "ABERTO · N dias"

```sql
-- Episódios abertos (sem saída)
SELECT
  produto_id,
  produto_nome,
  entrada_at,
  saida_at,
  dias_em_86,
  -- dias esperados: CURRENT_DATE - entrada_at::date
  (CURRENT_DATE - entrada_at::date) AS dias_calculado
FROM v_86_episodio
WHERE saida_at IS NULL
ORDER BY entrada_at
LIMIT 10;
```

**Validação:** `dias_em_86` deve ser igual a `dias_calculado`. Na tela, o item aparece "ABERTO · N dias" com N = `dias_em_86`.

---

## O3 — Dar baixa manual: grava `resolvido_por/em` e fecha episódio

```sql
-- Após usar o botão "Dar baixa" na interface, confirme:
SELECT
  a.id,
  a.produto_id,
  a.resolvido_por,
  a.resolvido_em
FROM abastecimento_86 a
WHERE a.resolvido_em IS NOT NULL
ORDER BY a.resolvido_em DESC
LIMIT 5;

-- Confirme na view que o episódio aparece fechado com saida_tipo = 'baixa_manual'
SELECT
  produto_id,
  ep_num,
  saida_at,
  saida_tipo,
  baixa_manual_em
FROM v_86_episodio
WHERE saida_tipo = 'baixa_manual'
ORDER BY baixa_manual_em DESC
LIMIT 5;
```

**Validação:** após o clique em "Dar baixa", `resolvido_em` preenchido em `abastecimento_86`, e a view retorna `saida_tipo = 'baixa_manual'` para o episódio, que some da lista de abertos.

---

## O4 — Gravar mínimo: salva em `compras_estoque_minimo` e muda status imediatamente

```sql
-- Após editar o mínimo na interface /compras/estoque/minimo, confirme:
SELECT
  unit_id,
  insumo_id,
  qtd_minima,
  atualizado_em
FROM compras_estoque_minimo
ORDER BY atualizado_em DESC
LIMIT 5;

-- Confirme o estoque atual desse insumo
SELECT
  item_id,
  quantidade,
  unidade_medida
FROM v_pedido_estoque
WHERE item_id = :'insumo_id'
  AND unit_id = :'unit_id';
```

**Validação:** se `quantidade < qtd_minima`, a linha aparece na aba "Em 85" com status âmbar. Se `quantidade = 0`, status ZERADO em vermelho. A mudança é imediata (server action upsert + revalidatePath).

---

## O5 — Contagens do resumo batem com o banco

```sql
-- Abertos agora
SELECT COUNT(*) AS abertos
FROM v_86_episodio
WHERE saida_at IS NULL;

-- Entraram nas últimas 24h
SELECT COUNT(*) AS entrados_24h
FROM v_86_episodio
WHERE entrada_at >= NOW() - INTERVAL '24 hours';

-- Saíram nas últimas 24h
SELECT COUNT(*) AS saidos_24h
FROM v_86_episodio
WHERE saida_at >= NOW() - INTERVAL '24 hours';

-- Mais antigo aberto
SELECT MIN(entrada_at) AS mais_antigo
FROM v_86_episodio
WHERE saida_at IS NULL;
```

**Validação:** os valores retornados devem coincidir com os cards de resumo exibidos no topo de `/compras/abastecimento/timeline`.

---

## O6 — Badge do menu = nº de episódios abertos

```sql
-- Query usada no layout.tsx (load86Count)
SELECT COUNT(*) AS badge_count
FROM v_86_episodio
WHERE saida_at IS NULL;
```

**Validação:** o número exibido no badge vermelho ao lado de "Rotina de abastecimento" no menu lateral deve ser igual a `badge_count`.

---

## Decisões de implementação

| # | Decisão | Motivação |
|---|---|---|
| 1 | `abastecimento_86.criado_em` como proxy para `op_criado_em` | `op_86` não expõe `created_at` diretamente na view existente; `criado_em` em `abastecimento_86` é preenchido no momento do registro e tem a mesma semântica para fins de ordenação de episódio. |
| 2 | `/compras/estoque/minimo` como sub-rota nova | A rota `/compras/estoque` existente usa `SourceClient` mostrando registros brutos do Everest (posições por depósito). Criar uma sub-rota dedicada evita poluir essa view com lógica de estoque mínimo. |
| 3 | `(ARRAY_AGG(uuid ORDER BY ...))[1]` em vez de `MIN(uuid)` | Postgres não possui função de agregação `min` para tipo `uuid`. `ARRAY_AGG` ordenado + `[1]` é o equivalente portável. |
| 4 | Episódio novo quando `EXISTS` venda entre dois registros consecutivos | Regra de negócio: "baixou de 86" → vendeu → voltou a 86 = novo episódio. Detectado via sub-select em `lorean_produtos_dia` no CTE `registros_ord`. |
| 5 | Estoque mínimo agrega por `insumo_id` quando unit = null (todas as casas) | Cada casa tem sua própria linha; sem filtro de unidade, a tela soma os mínimos de todas as casas para dar uma visão agregada. |
