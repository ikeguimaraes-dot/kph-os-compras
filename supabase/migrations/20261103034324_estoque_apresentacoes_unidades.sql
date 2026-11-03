alter table public.compras_estoque_apresentacoes drop constraint compras_estoque_apresentacoes_unidade_base_check;
alter table public.compras_estoque_apresentacoes add constraint compras_estoque_apresentacoes_unidade_base_check check (unidade_base in ('KG','L','UNID'));
