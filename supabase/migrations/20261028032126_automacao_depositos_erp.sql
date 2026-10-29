-- O cadastro oficial ativo/planejamento determina quais saldos ERP podem entrar.
-- Confere o escopo de TODAS as linhas, completude e a existência da coleta.
insert into compras_automacao_deposito(unit_id,empresa,deposito,evidencia)
select d.unit_id,d.empresa,d.deposito,'Cadastro oficial Everest ativo e planejamento; empresa/depósito conferidos em todas as linhas; saldo ERP, sem alegação de contagem física'
from everest_estoque_depositos d join everest_estoque_saldos s using(unit_id,empresa,deposito)
where d.ativo and d.planejamento and s.total=jsonb_array_length(s.registros) and s.total>0
and not exists(select 1 from jsonb_array_elements(s.registros) j where (j->>'cd_empresa')::integer is distinct from d.empresa or (j->>'cd_deposito')::integer is distinct from d.deposito)
on conflict(unit_id,empresa,deposito) do nothing;
