#!/usr/bin/env python3
"""
PARSER DE REFERÊNCIA — Ficha Técnica Everest 3.0 (KPH OS / Cardápio)
====================================================================
Este é o algoritmo VALIDADO de extração das fichas. Use-o como especificação
para portar a lógica para TypeScript (parse no browser com pdf.js).

Entrada: o texto de cada página do PDF, COM LAYOUT preservado (colunas alinhadas
por espaços). No Python usei `pdftotext -layout`. No browser, reconstrua linhas
a partir do pdf.js getTextContent() agrupando os text items por coordenada Y e
ordenando por X — ver notas no fim do arquivo.

Layout de UMA página = UMA ficha:

    FICHA TÉCNICA / cabeçalho da empresa (ignorar)
    Item     Descrição Item        UM  Tipo do Item     Q. Produção  Versão Dt.Versão  Custo Produção Situação
    4000007  AGUA PANNA 500ML      UNID PRODUTO ACABADO  1,000000     1      15/10/2025  16,6934        Ativo
    INSUMO
    Item     Descrição do Item  UM  Embalagem  Tipo do Item  Q.Aplicada %Aprov. F.Aplic. Q.BaixaEstoque V.CustoMédio V.CustoUnitário TipoBaixa
    1000042  AGUA PANNA 500ML   UNID UNIDADE   MATERIA PRIMA 1,000000   100,000 1,000000 1,000000       16,6934      16,6934         Consumo
                                                            Custo dos Insumos                                          16,6934

REGRAS DE OURO DO MAPEAMENTO (não erre estas):
  - quantidade     <- "Q. Baixa Estoque"  (já normalizado p/ 1 un do produto; NÃO é Q.Aplicada)
  - custo_unitario <- "V. Custo Médio"    (custo unitário REAL)
  - perda_pct      <- 100 - "% Aprov."
  - custo_total    = quantidade * custo_unitario  (deve reproduzir "V. Custo Unitário")
  - O insumo pode ser MATERIA PRIMA, SUBPRODUTO **ou PRODUTO ACABADO** (combos/menus).
  - Número é BR: "1.234,56" -> remove pontos, troca vírgula por ponto.
"""

import re

NUM = re.compile(r'-?\d{1,3}(?:\.\d{3})*,\d+|-?\d+,\d+')
UM_MAP = {  # UM do Everest -> enum UnidadePadrao do banco
    "UNID": "un", "UN": "un", "GF": "un",  # GF = garrafa (sem enum próprio -> un)
    "L": "l", "ML": "ml", "KG": "kg", "G": "g",
}

def br_to_float(s: str) -> float:
    return float(s.replace(".", "").replace(",", "."))

def parse_page(page_text: str):
    """Retorna (produto_dict, [insumo_dicts]) ou None se a página não for ficha."""
    lines = page_text.splitlines()
    try:
        hdr = next(i for i, l in enumerate(lines) if l.strip() == "INSUMO")
    except StopIteration:
        return None

    # ---- linha do PRODUTO (acima do header INSUMO) ----
    prod_line = next(
        (l for l in lines[:hdr]
         if re.match(r'\s*\d{6,7}\s', l) and ("PRODUTO ACABADO" in l or "SUBPRODUTO" in l)),
        None,
    )
    if not prod_line:
        return None

    codigo = re.match(r'\s*(\d{6,7})', prod_line).group(1)
    is_sub = "SUBPRODUTO" in prod_line
    nums = NUM.findall(prod_line)        # [Q.Produção, ..., Custo Produção]  (a data dd/mm/aaaa NÃO casa)
    rendimento = br_to_float(nums[0]) if nums else 1.0
    custo_total = br_to_float(nums[-1]) if nums else 0.0
    situacao = prod_line.rstrip().split()[-1]            # "Ativo" / "Inativo"
    nome_m = re.match(r'\s*\d{6,7}\s+(.+?)\s{2,}', prod_line)
    nome = nome_m.group(1).strip() if nome_m else "?"

    produto = dict(
        codigo=codigo, nome=nome, is_subproduto=is_sub,
        rendimento=rendimento, custo_total=custo_total,
        ativo=(situacao.lower() == "ativo"),
    )

    # ---- linhas de INSUMO (entre header e "Custo dos Insumos") ----
    insumos = []
    pend_desc = []  # pedaços de descrição que quebraram em linha própria
    for l in lines[hdr + 1:]:
        if "Custo dos Insumos" in l:
            break
        m = re.match(r'\s*(\d{6,7})\s+(.*)', l)
        is_insumo = m and ("MATERIA PRIMA" in l or "SUBPRODUTO" in l or "PRODUTO ACABADO" in l)
        if is_insumo:
            ns = NUM.findall(l)
            if len(ns) < 6:
                pend_desc = []
                continue
            # Os 6 últimos números, nesta ordem:
            q_apl, aprov, f_apl, q_baixa, v_medio, v_unit = [br_to_float(x) for x in ns[-6:]]
            icod = m.group(1)
            tipo = ("subproduto" if "SUBPRODUTO" in l
                    else "produto_acabado" if "PRODUTO ACABADO" in l
                    else "materia_prima")
            toks = l.split()
            um_raw = next((t for t in toks if t in UM_MAP), None)
            nome_i = m.group(2)
            if um_raw and um_raw in nome_i:
                nome_i = nome_i.split(um_raw)[0]
            nome_i = re.sub(r'\s{2,}.*$', '', nome_i).strip()
            if pend_desc:
                nome_i = (" ".join(pend_desc) + " " + nome_i).strip()
                pend_desc = []
            insumos.append(dict(
                codigo=icod, nome=nome_i, tipo=tipo,
                unidade=UM_MAP.get(um_raw, "un"),
                quantidade=q_baixa,                 # <- Q. BAIXA ESTOQUE
                custo_unitario=v_medio,             # <- V. CUSTO MÉDIO
                perda_pct=round(100 - aprov, 4),
                custo_total=round(q_baixa * v_medio, 4),  # reproduz V. Custo Unitário
            ))
        elif l.strip() and not NUM.search(l) and "Descrição" not in l:
            # linha de descrição órfã (nome do insumo quebrou em 2/3 linhas)
            pend_desc.append(re.sub(r'\s{2,}', ' ', l.strip()))

    return produto, insumos


# ─────────────────────────────────────────────────────────────────────────────
# NOTAS PARA O PORTE EM TYPESCRIPT (parse no browser com pdf.js)
# ─────────────────────────────────────────────────────────────────────────────
# 1. pdf.js getTextContent() devolve items com .str e .transform = [a,b,c,d,e,f].
#    e (transform[4]) ~ X, f (transform[5]) ~ Y no espaço do texto.
# 2. ATENÇÃO: este PDF tem "Page rot: 90". Detecte a orientação: agrupe por
#    Y e veja se as "linhas" fazem sentido; se não, troque os eixos (use X como
#    linha). Teste contra o oráculo (abaixo) — ele diz se você acertou.
# 3. Monte cada linha agrupando items com Y próximo (bucket ~2px), ordene por X,
#    e junte os .str inserindo um separador de 2+ espaços quando o gap em X for
#    grande (preserva as colunas, igual ao -layout). Aí aplique a MESMA lógica.
# 4. Páginas: percorra de 1..N; cada página é uma ficha. NÃO confie em quebra por
#    form-feed — itere page.getPage(i).
#
# ORÁCULO DE ACEITAÇÃO (rodando sobre o index.pdf de referência):
#   - 936 fichas  (598 produto_acabado + 338 subproduto)
#   - 1007 insumos distintos por código (311 espelham ficha / 696 matéria-prima folha)
#   - 2725 linhas de recipe_item no total
#   - UMs presentes: UNID, UN, L, ML, KG, GF
#   - RECONCILIAÇÃO: para TODAS as 936 fichas, sum(quantidade*custo_unitario) deve
#     bater com o "Custo Produção" declarado dentro de R$ 0,02. (Hoje: 936/936.)
#   - soma do custo_total dos 598 produto_acabado ≈ R$ 42.504,97
# Se algum desses números não fechar, o parser está errado — não importe.

if __name__ == "__main__":
    import sys, json
    pages = [p for p in open(sys.argv[1], encoding="utf-8").read().split("\f") if p.strip()]
    out = [parse_page(p) for p in pages]
    out = [o for o in out if o]
    print(f"fichas: {len(out)}")
