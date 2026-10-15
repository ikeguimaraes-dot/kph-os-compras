-- Hotfix: join de assinatura comparava nome normalizado com texto original
CREATE OR REPLACE VIEW public.v_86_protecao_prato AS
 WITH grupo_recente AS (
         SELECT DISTINCT ON (pvf_1.unit_id, pvf_1.id) pvf_1.unit_id,
            pvf_1.id AS produto_id, p.grupo
           FROM produto_venda_ficha pvf_1
             JOIN lorean_workdays w ON w.unit_id = pvf_1.unit_id
             JOIN lorean_produtos_dia p ON p.workday_id_fk = w.id AND upper(unaccent(TRIM(BOTH FROM p.produto))) = pvf_1.nome_venda
          WHERE p.grupo IS NOT NULL
          ORDER BY pvf_1.unit_id, pvf_1.id, w.data DESC
        )
 SELECT pvf.unit_id, pvf.id AS produto_id, pvf.nome_venda AS nome_venda_key,
    pvf.nome_venda_original AS nome, pvf.receita_12m,
    COALESCE(par.classe_abc, 'C') AS classe_abc,
    COALESCE(p86.assinatura, false) AS assinatura,
    gr.grupo, cat.teto_86_simultaneo, COALESCE(cat.critica, false) AS critica,
        CASE
            WHEN COALESCE(par.classe_abc,'C')='A' AND (COALESCE(p86.assinatura,false) OR COALESCE(cat.teto_86_simultaneo,1)=0) THEN 'INEGOCIAVEL'
            WHEN COALESCE(par.classe_abc,'C')='A' OR COALESCE(p86.assinatura,false) THEN 'PROTEGIDO'
            WHEN COALESCE(par.classe_abc,'C')='B' THEN 'GERENCIAVEL'
            ELSE 'LIVRE'
        END AS classe_86
   FROM produto_venda_ficha pvf
     LEFT JOIN mv_pareto_prato par ON par.unit_id = pvf.unit_id AND par.produto_id = pvf.id
     LEFT JOIN compras_86_prato p86 ON p86.unit_id = pvf.unit_id AND upper(unaccent(TRIM(BOTH FROM p86.prato))) = pvf.nome_venda
     LEFT JOIN grupo_recente gr ON gr.unit_id = pvf.unit_id AND gr.produto_id = pvf.id
     LEFT JOIN compras_86_categoria cat ON cat.unit_id = pvf.unit_id AND cat.grupo = gr.grupo
  WHERE pvf.status = 'confirmado';
