-- Reaproveita políticas positivas já cadastradas, sem inventar embalagem ou prazo.
insert into compras_automacao_parametro(unit_id,item_id,seguranca,evidencia)
select unit_id,insumo_id,qtd_minima,'Estoque mínimo positivo cadastrado em compras_estoque_minimo; usado como reserva de planejamento'
from compras_estoque_minimo where qtd_minima>0
on conflict(unit_id,item_id) do nothing;
