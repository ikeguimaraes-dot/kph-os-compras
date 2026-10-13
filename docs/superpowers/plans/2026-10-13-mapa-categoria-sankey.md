# Mapa Sankey — 1ª Coluna: Categorias de Gasto Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Substituir a 1ª coluna do Sankey (visão Dinheiro) de CASAS para CATEGORIAS DE GASTO, mantendo o estágio 2 (fornecedor→prato) intacto.

**Architecture:** Adicionar `buildCategoryFlow()` em `prisma-mapa.ts` que distribui `gasto_12m` dos fornecedores proporcionalmente às categorias usando `receita_atribuida` como proxy; atualizar o componente `Sankey` em `map-client.tsx` para usar a nova função no S1 (links + nós) e atualizar a lógica de hover 3 estágios (categoria→fornecedor→prato).

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript strict, SVG custom Sankey, Supabase (views `v_mapa_aresta` + `v_mapa_fornecedor`).

---

## File Map

| Arquivo | Operação | Responsabilidade |
|---|---|---|
| `src/lib/compras/prisma-mapa.ts` | Modify | Adicionar types `CatFlowLink`, `CategoryFlow` e função `buildCategoryFlow` |
| `src/app/compras/prisma/mapa/map-client.tsx` | Modify | `MapClient`: importar e memoizar `categoryFlow`; `Sankey`: substituir S1 casas→categorias, hover, SVG caption, props |

---

## Task 1: Adicionar `buildCategoryFlow` em `prisma-mapa.ts`

**Files:**
- Modify: `src/lib/compras/prisma-mapa.ts` (append após `aggregateSuppliers`)

### Lógica do algoritmo

Dado que `v_mapa_fornecedor.gasto_12m` contém o CMV real por fornecedor (fonte: Everest ERP) mas não está quebrado por categoria, e que `v_mapa_aresta.receita_atribuida` está disponível por `(categoria, raiz_cnpj)`, distribui-se o `gasto_12m` proporcionalmente à `receita_atribuida` por categoria.

**Oracle**: para o fornecedor X, `sum(spend_categoria_X) = gasto_12m_X` ← por construção.

- [ ] **Step 1: Adicionar types `CatFlowLink` e `CategoryFlow`**

Abrir `src/lib/compras/prisma-mapa.ts`. Após a linha de `export function aggregateSuppliers` (linha 248), **antes** da função, adicionar:

```typescript
export type CatFlowLink = {
  catId: string;       // raw category key or "outras"
  raiz_cnpj: string;
  value: number;       // CMV spend distribuído proporcionalmente
};
export type CategoryFlow = {
  categories: { id: string; value: number }[];  // sorted desc, "outras" last
  catLinks: CatFlowLink[];
  total: number;       // = sum gasto_12m dos fornecedores no escopo
};
```

- [ ] **Step 2: Adicionar função `buildCategoryFlow`**

Após `aggregateSuppliers` (após a linha `}`  do final da função, ~linha 270), adicionar:

```typescript
export function buildCategoryFlow(
  edges: MapEdge[],
  suppliers: MapSupplier[],
): CategoryFlow {
  // receita_atribuida por (raiz_cnpj → Map<catId, value>)
  const rCatSup = new Map<string, Map<string, number>>();
  // receita_atribuida total por raiz_cnpj
  const rSup = new Map<string, number>();

  for (const e of edges) {
    if (!e.raiz_cnpj || !e.receita_atribuida || Number(e.receita_atribuida) <= 0) continue;
    const cat = e.categoria ?? "SEM_CATEGORIA";
    const val = Number(e.receita_atribuida);
    const catMap = rCatSup.get(e.raiz_cnpj) ?? new Map<string, number>();
    catMap.set(cat, (catMap.get(cat) ?? 0) + val);
    rCatSup.set(e.raiz_cnpj, catMap);
    rSup.set(e.raiz_cnpj, (rSup.get(e.raiz_cnpj) ?? 0) + val);
  }

  const gastoMap = new Map(suppliers.map((s) => [s.raiz_cnpj, Number(s.gasto_12m)]));

  // Build raw links e acumular totais por categoria
  const catTotals = new Map<string, number>();
  const rawLinks: CatFlowLink[] = [];

  for (const [raiz, catMap] of rCatSup) {
    const rTotal = rSup.get(raiz) ?? 0;
    const gasto = gastoMap.get(raiz) ?? 0;
    if (rTotal <= 0 || gasto <= 0) continue;
    for (const [cat, rVal] of catMap) {
      const spend = gasto * (rVal / rTotal);
      if (spend <= 0) continue;
      rawLinks.push({ catId: cat, raiz_cnpj: raiz, value: spend });
      catTotals.set(cat, (catTotals.get(cat) ?? 0) + spend);
    }
  }

  const total = [...catTotals.values()].reduce((a, b) => a + b, 0);
  const threshold = total * 0.02;

  const otherCatIds = new Set(
    [...catTotals.entries()].filter(([, v]) => v < threshold).map(([k]) => k),
  );

  // Mesclar "Outras"
  const otherLinkMap = new Map<string, number>();
  const finalLinks: CatFlowLink[] = [];
  for (const link of rawLinks) {
    if (otherCatIds.has(link.catId)) {
      otherLinkMap.set(link.raiz_cnpj, (otherLinkMap.get(link.raiz_cnpj) ?? 0) + link.value);
    } else {
      finalLinks.push(link);
    }
  }
  for (const [raiz, value] of otherLinkMap) {
    if (value > 0) finalLinks.push({ catId: "outras", raiz_cnpj: raiz, value });
  }

  const mainCats = [...catTotals.entries()]
    .filter(([k]) => !otherCatIds.has(k))
    .map(([id, value]) => ({ id, value }))
    .sort((a, b) => b.value - a.value);

  const otherTotal = [...catTotals.entries()]
    .filter(([k]) => otherCatIds.has(k))
    .reduce((s, [, v]) => s + v, 0);

  const categories = [...mainCats];
  if (otherTotal > 0) categories.push({ id: "outras", value: otherTotal });

  return { categories, catLinks: finalLinks, total };
}
```

- [ ] **Step 3: Type-check isolado**

```bash
npx tsc --noEmit 2>&1 | grep "prisma-mapa"
```
Esperado: nenhuma linha (sem erros no arquivo).

- [ ] **Step 4: Commit**

```bash
git add src/lib/compras/prisma-mapa.ts
git commit -m "feat(mapa): buildCategoryFlow — distribui gasto_12m por categoria via receita_atribuida"
```

---

## Task 2: Atualizar `MapClient` — importar e memoizar `categoryFlow`

**Files:**
- Modify: `src/app/compras/prisma/mapa/map-client.tsx`

- [ ] **Step 1: Adicionar `buildCategoryFlow` e `CategoryFlow` nos imports de `prisma-mapa`**

Localizar o bloco de imports de `prisma-mapa` (linhas 14–33 aprox.). Adicionar `buildCategoryFlow` e `type CategoryFlow` na lista:

```typescript
import {
  aggregateSuppliers,
  blockKey,
  buildCategoryFlow,
  buildFlow,
  creditColor,
  dishKey,
  filterMap,
  isCritical,
  costLabel,
  unpricedDishes,
  mapView,
  titleTimeline,
  type CategoryFlow,
  type CatFlowLink,
  type MapBlock,
  type MapEdge,
  type MapFilters,
  type MapPeriod,
  type MapSupplier,
  type MapView,
} from "@/lib/compras/prisma-mapa";
```

- [ ] **Step 2: Memoizar `categoryFlow` no corpo de `MapClient`**

Após a linha `const flow = useMemo(...)` (linha ~126–129), adicionar:

```typescript
const categoryFlow = useMemo(
  () => buildCategoryFlow(edges, suppliers),
  [edges, suppliers],
);
```

- [ ] **Step 3: Atualizar a chamada do componente `<Sankey>`**

Localizar a chamada de `<Sankey>` (linha ~333–345). Substituir pela versão sem `unitSuppliers` e `units`, com `categoryFlow` adicionado:

```tsx
<Sankey
  flow={flow}
  categoryFlow={categoryFlow}
  suppliers={suppliers}
  names={names}
  hover={hover}
  setHover={setHover}
  open={openFocus}
/>
```

- [ ] **Step 4: Type-check**

```bash
npx tsc --noEmit 2>&1 | grep "map-client"
```
Esperado: erros de "Expected N arguments but got M" no componente `Sankey` (pois ele ainda tem a assinatura antiga) — confirmar que esses são os únicos erros antes de prosseguir.

---

## Task 3: Reescrever o componente `Sankey` — props, hover e SVG S1

**Files:**
- Modify: `src/app/compras/prisma/mapa/map-client.tsx` — função `Sankey` (linhas ~606–991)

Esta é a maior alteração. A função `Sankey` tem três partes a mudar:
1. **Props** — remover `unitSuppliers` e `units`, adicionar `categoryFlow`
2. **Lógica de dados S1** — substituir variáveis de casas por variáveis de categorias
3. **Hover** — `activeHouses` → `activeCats`
4. **SVG** — substituir nós e links de casas por nós e links de categorias

- [ ] **Step 1: Atualizar a assinatura da função `Sankey`**

Localizar (linha ~606):
```typescript
function Sankey({
  flow,
  suppliers,
  names,
  hover,
  setHover,
  open,
  unitSuppliers,
  units,
}: {
  flow: ReturnType<typeof buildFlow>;
  suppliers: MapSupplier[];
  names: Map<string, string>;
  hover: string | null;
  setHover: (v: string | null) => void;
  open: (v: string) => void;
  unitSuppliers: MapSupplier[];
  units: { id: string; name: string }[];
})
```

Substituir por:
```typescript
function Sankey({
  flow,
  categoryFlow,
  suppliers,
  names,
  hover,
  setHover,
  open,
}: {
  flow: ReturnType<typeof buildFlow>;
  categoryFlow: CategoryFlow;
  suppliers: MapSupplier[];
  names: Map<string, string>;
  hover: string | null;
  setHover: (v: string | null) => void;
  open: (v: string) => void;
})
```

- [ ] **Step 2: Substituir todo o bloco de variáveis S1 (casas) por variáveis S1 (categorias)**

Localizar o bloco que começa com `// IDs dos fornecedores que aparecem no flow` (linha ~626) e vai até `const houseOrder = ...` (linha ~684). **Substituir** esse bloco inteiro por:

```typescript
  const flowSupplierIds = new Set(flow.sources.map((s) => s.id));

  // Filtrar catLinks para apenas fornecedores que aparecem no S2
  const catLinks = categoryFlow.catLinks.filter((l) => flowSupplierIds.has(l.raiz_cnpj));

  // catId → Set<raiz_cnpj>
  const catToSuppliersMap = new Map<string, Set<string>>();
  // raiz_cnpj → Set<catId>
  const supplierToCatsMap = new Map<string, Set<string>>();
  for (const l of catLinks) {
    const cs = catToSuppliersMap.get(l.catId) ?? new Set<string>();
    cs.add(l.raiz_cnpj);
    catToSuppliersMap.set(l.catId, cs);
    const sc = supplierToCatsMap.get(l.raiz_cnpj) ?? new Set<string>();
    sc.add(l.catId);
    supplierToCatsMap.set(l.raiz_cnpj, sc);
  }

  const nCats = categoryFlow.categories.length;
  const height = Math.max(
    650,
    Math.max(nCats, flow.sources.length, flow.targets.length) * 65 + 420,
  );
  // Scale S2 (fornecedor→prato) — inalterado
  const scaleS2 =
    (height - 50 - Math.max(flow.sources.length, flow.targets.length) * 60) /
    flow.total;
  // Scale S1 (categoria→fornecedor): proporcional ao CMV total
  const scaleS1 =
    categoryFlow.total > 0
      ? (height - 50 - Math.max(nCats, flow.sources.length) * 60) /
        categoryFlow.total
      : scaleS2;

  // Layout de categorias (S1 — lado esquerdo)
  const catYMap = new Map<string, { y: number; offset: number }>();
  let catY = 28;
  for (const cat of categoryFlow.categories) {
    catYMap.set(cat.id, { y: catY, offset: 0 });
    catY += cat.value * scaleS1 + 60;
  }
```

- [ ] **Step 3: Atualizar o hover de 3 estágios**

Localizar o bloco `// Hover de 3 estágios` (linha ~708). Substituir de `let activeHouses:...` até o final da propagação (linha ~748) por:

```typescript
  // Hover de 3 estágios: categoria → fornecedor → prato (e inverso)
  const catIds = new Set(categoryFlow.categories.map((c) => c.id));

  let activeCats: Set<string> | null = null;
  let activeSuppliers: Set<string> | null = null;
  let activeDishes: Set<string> | null = null;

  if (hover) {
    activeCats = new Set<string>();
    activeSuppliers = new Set<string>();
    activeDishes = new Set<string>();

    if (catIds.has(hover)) {
      // hover = categoria
      activeCats.add(hover);
      for (const s of catToSuppliersMap.get(hover) ?? new Set<string>()) {
        activeSuppliers.add(s);
      }
    } else if (flowSupplierIds.has(hover)) {
      // hover = fornecedor
      activeSuppliers.add(hover);
      for (const c of supplierToCatsMap.get(hover) ?? new Set<string>()) {
        activeCats.add(c);
      }
    } else {
      // hover = prato
      activeDishes.add(hover);
      for (const l of flow.links) {
        if (l.target === hover) {
          activeSuppliers.add(l.source);
          for (const c of supplierToCatsMap.get(l.source) ?? new Set<string>()) {
            activeCats.add(c);
          }
        }
      }
    }
    // Propagar fornecedores → pratos
    for (const s of activeSuppliers) {
      for (const l of flow.links) {
        if (l.source === s) activeDishes.add(l.target);
      }
    }
  }
```

- [ ] **Step 4: Atualizar funções de opacidade**

Localizar (linha ~750):
```typescript
  const nodeOp = (id: string, active: Set<string> | null) =>
    !hover ? 1 : active?.has(id) ? 1 : 0.08;
  const s1Op = (uid: string, rcnpj: string) =>
    !hover ? 0.6 : activeHouses?.has(uid) && activeSuppliers?.has(rcnpj) ? 0.6 : 0.08;
  const s2Op = (src: string, tgt: string) =>
    !hover ? 0.6 : activeSuppliers?.has(src) && activeDishes?.has(tgt) ? 0.6 : 0.08;
```

Substituir por:
```typescript
  const nodeOp = (id: string, active: Set<string> | null) =>
    !hover ? 1 : active?.has(id) ? 1 : 0.08;
  const s1Op = (catId: string, rcnpj: string) =>
    !hover ? 0.6 : activeCats?.has(catId) && activeSuppliers?.has(rcnpj) ? 0.6 : 0.08;
  const s2Op = (src: string, tgt: string) =>
    !hover ? 0.6 : activeSuppliers?.has(src) && activeDishes?.has(tgt) ? 0.6 : 0.08;
```

- [ ] **Step 5: Atualizar offsets — remover houseOffsets/sourceOffsetsS1, adicionar catOffsets**

Localizar (linha ~758):
```typescript
  // Offsets para links S1 (cópia para não mutar houseYMap/sourcesLayout durante render)
  const houseOffsets = new Map(
    [...houseYMap.entries()].map(([k, v]) => [k, { y: v.y, offset: 0 }]),
  );
  const sourceOffsetsS1 = new Map(
    flow.sources.map((s) => [s.id, { y: sourcesLayout.get(s.id)!.y, offset: 0 }]),
  );
```

Substituir por:
```typescript
  // Offsets para links S1 (categoria→fornecedor)
  const catOffsets = new Map(
    [...catYMap.entries()].map(([k, v]) => [k, { y: v.y, offset: 0 }]),
  );
  const sourceOffsetsS1 = new Map(
    flow.sources.map((s) => [s.id, { y: sourcesLayout.get(s.id)!.y, offset: 0 }]),
  );
```

- [ ] **Step 6: Atualizar SVG caption da 1ª coluna**

Localizar (linha ~784):
```tsx
      <text x="12" y="14" className="map-svg-caption">
        R$ QUE SAI DO CAIXA · CASAS
      </text>
```

Substituir por:
```tsx
      <text x="12" y="14" className="map-svg-caption">
        R$ QUE SAI DO CAIXA · CATEGORIAS
      </text>
```

- [ ] **Step 7: Substituir links S1 (casas→fornecedores) por links S1 (categorias→fornecedores)**

Localizar o bloco `{/* Links S1: casas → fornecedores */}` (linha ~793). Substituir **todo o bloco** (até o `}` do map, antes de `{/* Links S2 */}`) por:

```tsx
      {/* Links S1: categorias → fornecedores */}
      {(() => {
        // Ordenar catLinks: primeiro pela ordem das categorias, depois pela ordem dos fornecedores
        const catOrder = new Map(categoryFlow.categories.map((c, i) => [c.id, i]));
        const supOrder = new Map(flow.sources.map((s, i) => [s.id, i]));
        const sorted = [...catLinks].sort(
          (a, b) =>
            (catOrder.get(a.catId) ?? 999) - (catOrder.get(b.catId) ?? 999) ||
            (supOrder.get(a.raiz_cnpj) ?? 999) - (supOrder.get(b.raiz_cnpj) ?? 999),
        );
        return sorted.map((l) => {
          const c = catOffsets.get(l.catId);
          const s = sourceOffsetsS1.get(l.raiz_cnpj);
          if (!c || !s) return null;
          const width = l.value * scaleS1;
          const y1 = c.y + c.offset + width / 2;
          const y2 = s.y + s.offset + width / 2;
          c.offset += width;
          s.offset += width;
          const catDisplay = l.catId === "outras" ? "Outras" : categoryName(l.catId);
          return (
            <path
              key={`s1-${l.catId}-${l.raiz_cnpj}`}
              d={`M 90 ${y1} C 330 ${y1}, 590 ${y2}, 762 ${y2}`}
              strokeWidth={width}
              className="map-flow-link green"
              opacity={s1Op(l.catId, l.raiz_cnpj)}
              onMouseEnter={() => setHover(l.catId)}
              onMouseLeave={() => setHover(null)}
              onFocus={() => setHover(l.catId)}
              onBlur={() => setHover(null)}
            >
              <title>{`${catDisplay} → ${names.get(l.raiz_cnpj) ?? l.raiz_cnpj}: ${compact(l.value)}/ano CMV`}</title>
            </path>
          );
        });
      })()}
```

- [ ] **Step 8: Substituir nós de CASAS por nós de CATEGORIAS**

Localizar o bloco `{/* Nós de CASAS */}` (linha ~856). Substituir **todo o bloco** (até antes de `{/* Nós de FORNECEDORES */}`) por:

```tsx
      {/* Nós de CATEGORIAS */}
      {categoryFlow.categories.map((cat) => {
        const layout = catYMap.get(cat.id)!;
        const h = cat.value * scaleS1;
        const catDisplay = cat.id === "outras" ? "Outras" : categoryName(cat.id);
        return (
          <g
            key={cat.id}
            className="map-svg-node"
            tabIndex={0}
            role="button"
            aria-label={`${catDisplay}. Compra ${compact(cat.value)}/ano CMV.`}
            opacity={nodeOp(cat.id, activeCats)}
            onMouseEnter={() => setHover(cat.id)}
            onMouseLeave={() => setHover(null)}
            onFocus={() => setHover(cat.id)}
            onBlur={() => setHover(null)}
          >
            <title>{`${catDisplay} · CMV ${compact(cat.value)}/ano`}</title>
            <rect x="80" y={layout.y} width="10" height={h} rx="2" fill="#b5a0df" />
            <text x="96" y={layout.y + h / 2 - 5}>{catDisplay.slice(0, 22)}</text>
            <text x="96" y={layout.y + h / 2 + 11} className="map-svg-value">
              {`${compact(cat.value)}/ano`}
            </text>
          </g>
        );
      })}
```

- [ ] **Step 9: Type-check**

```bash
npx tsc --noEmit 2>&1 | grep -E "map-client|prisma-mapa"
```
Esperado: sem erros nestes dois arquivos.

- [ ] **Step 10: Commit**

```bash
git add src/app/compras/prisma/mapa/map-client.tsx
git commit -m "feat(mapa): Sankey S1 categorias→fornecedores (substituição de casas)"
```

---

## Task 4: Lint + Type-check + Build completo

- [ ] **Step 1: Lint**

```bash
npm run lint 2>&1 | grep -v "node_modules" | head -50
```
Esperado: sem erros nos arquivos modificados. Warnings pré-existentes são aceitáveis.

- [ ] **Step 2: Type-check completo**

```bash
npm run type-check 2>&1 | head -60
```
Esperado: zero erros em `src/lib/compras/prisma-mapa.ts` e `src/app/compras/prisma/mapa/map-client.tsx`. Erros ESM/CJS pré-existentes (em test suites, `@swc`, `jest`) são ignorados.

- [ ] **Step 3: Build**

```bash
npm run build 2>&1 | tail -30
```
Esperado: `✓ Compiled successfully` ou similar. Se houver erros, investigar antes de prosseguir.

- [ ] **Step 4: Commit de verificação (se houver ajustes de lint/type)**

```bash
git add -p   # adicionar apenas arquivos modificados por correções
git commit -m "fix(mapa): correções de lint/type após mudança Sankey categorias"
```

---

## Task 5: Verificar oráculos manualmente

Os oráculos garantem que os cálculos estão corretos.

- [ ] **Step 1: Verificar Oracle 1 — soma dos links = gasto_12m por fornecedor**

No console do browser (DevTools → Console), com a página `/compras/prisma/mapa?view=dinheiro` carregada (grupo, sem filtros), inspecionar os nós de fornecedor. Guidara deve somar ~R$ 286.700 (tolerância de arredondamento de floating point).

Adicionar temporariamente ao console para validar:
```javascript
// Verificação manual: olhar tooltips dos links de Guidara e somar
// Não é possível sem debug hooks — validar visualmente nos tooltips dos links
```

Verificar visualmente que a legenda `/ano CMV` aparece nos tooltips dos links S1 (hover sobre um link categoria→fornecedor).

- [ ] **Step 2: Verificar Oracle 2 — soma das categorias = total CMV**

Verificar que o total dos valores dos nós de categoria (~altura proporcional) corresponde ao total indicado no header da página (`flow.total` é receita atribuída; o total do S1 é CMV — serão diferentes entre si, o que é esperado).

A legenda abaixo do Sankey deve continuar lendo: "Espessura 1ª coluna = compra CMV (R$/ano) · Espessura 2ª coluna = receita atribuída (R$/ano)".

- [ ] **Step 3: Verificar que o estágio 2 não mudou**

Com todos os filtros zerados, clicar em um fornecedor → verificar que o hover propaga para fornecedor→pratos como antes. Clicar no nó abre a view de dependência.

- [ ] **Step 4: Verificar filtro de categoria**

Selecionar "Proteínas" no dropdown Categoria. Verificar que:
1. A 1ª coluna mostra apenas "Proteínas"
2. Os links e fornecedores são filtrados para o escopo de Proteínas
3. O S2 também é filtrado (comportamento pre-existente de filterMap)

- [ ] **Step 5: Verificar filtro de casa**

Selecionar uma casa específica. Verificar que:
1. As categorias refletem apenas o escopo da casa
2. Os valores são coerentes com o menor scope

---

## Task 6: PR, merge squash e deploy

- [ ] **Step 1: Push do branch**

```bash
git push -u origin feat/mapa-categoria
```

- [ ] **Step 2: Criar PR via `gh`**

```bash
gh pr create \
  --title "feat(mapa): Sankey 1ª coluna categorias (substitui casas)" \
  --body "$(cat <<'EOF'
## Resumo

- Substitui a 1ª coluna do Sankey (visão Dinheiro) de CASAS para CATEGORIAS DE GASTO
- `buildCategoryFlow` distribui `gasto_12m` dos fornecedores proporcionalmente às categorias usando `receita_atribuida` como proxy
- Categorias < 2% do total agrupadas em "Outras"
- Hover propaga 3 estágios: categoria → fornecedor → prato (e inverso)
- Estágio 2 (fornecedor → prato) inalterado
- Filtro de casa e filtro de categoria continuam funcionando

## Oráculos

- Soma dos links categoria→fornecedor = `gasto_12m` do fornecedor no escopo (Guidara ~R$ 286,7k no grupo)
- Soma dos nós de categoria = total CMV do escopo

## Plano

`docs/superpowers/plans/2026-10-13-mapa-categoria-sankey.md`

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 3: Merge squash**

```bash
gh pr merge --squash --auto
```

Ou, se preferir confirmar antes do merge:
```bash
gh pr view --web   # abrir no browser para revisar
gh pr merge --squash
```

- [ ] **Step 4: Aguardar deploy READY na Vercel**

```bash
# Verificar status do deployment após merge
gh run list --limit 5
```

Ou via Vercel CLI:
```bash
vercel ls --limit 3
```

Aguardar até o deployment aparecer como `READY`.

---

## Self-Review

### Cobertura do spec

| Requisito | Tarefa |
|---|---|
| 1ª coluna = categorias de insumo | Task 3 (nós SVG) |
| Rótulo = nome + R$ X/ano | Task 3 Step 8 |
| Links categoria→fornecedor espessura = compra no escopo | Task 3 Steps 7–8 |
| Categorias < 2% → "Outras" | Task 1 Step 2 |
| Estágio 2 inalterado | Task 3 (não toca S2) |
| Cabeçalho "R$ QUE SAI DO CAIXA · CATEGORIAS" | Task 3 Step 6 |
| Hover categoria→fornecedor→prato e inverso | Task 3 Steps 3–4 |
| Filtro de categoria → só ela na 1ª coluna | Task 5 Step 4 |
| Filtro de casa mantém escopo | Task 5 Step 5 |
| Branch feat/mapa-categoria | Task 1 (git checkout feito antes do plano) |
| Lint + type-check + build | Task 4 |
| Oracle Guidara R$ 286,7k | Task 5 Step 1 |
| Oracle soma categorias = total CMV | Task 5 Step 2 |
| Commit + PR via gh + merge squash | Task 6 |

### Pontos de atenção

1. **`sorted.map` dentro de `{()=>{}}` IIFE**: necessário porque `catOffsets` e `sourceOffsetsS1` têm estado mutável (`.offset`) que precisa ser atualizado em ordem. O padrão IIFE é idêntico ao que seria feito sem ele — apenas envolve o sort+map em um contexto imperativo para garantir ordem de mutação.

2. **`categoryName` acessível no Sankey**: `Sankey` está no mesmo arquivo que o import de `categoryName` de `prisma-config` — já disponível, sem necessidade de prop adicional.

3. **Suppliers com `gasto_12m=0`**: excluídos por `gasto <= 0` em `buildCategoryFlow` — nenhum link gerado, fornecedor não aparece em S1 (mas ainda aparece em S2 se tiver receita atribuída).

4. **Fornecedores em S1 mas não em S2**: `catLinks.filter(l => flowSupplierIds.has(l.raiz_cnpj))` garante que apenas fornecedores com receita atribuída aparecem em S1, evitando links "soltos".
