insert into units values('00000000-0000-0000-0000-000000000001','Teste',true,'1');
insert into everest_itens values('00000000-0000-0000-0000-000000000002','1000001',1,'Insumo','KG','MPA.TESTE');
insert into lorean_workdays values('00000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000001','2026-10-26',false,'dia_inteiro',100);
insert into lorean_produtos_dia values('00000000-0000-0000-0000-000000000003','Prato','Cozinha');
insert into everest_estoque_movimentos values('00000000-0000-0000-0000-000000000001',1,now(),'[{"id_movimentoestoque":1,"cd_empresa":1,"dt_movimento":"2026-10-26","at_situacao":1,"ds_movimentoestoquetipo_origem":"VENDA DO DIA (INTEGRACAO PDV)","itens":[{"id_item":1,"cd_item":"1000001","qt_convertido":5,"at_movimentacao":143,"sg_unidademedida":"KG"}]}]');
-- Duplicata de janela não duplica consumo.
insert into everest_estoque_movimentos select * from everest_estoque_movimentos;
do $$ declare v jsonb; begin
 v:=compras_automacao_base(array['00000000-0000-0000-0000-000000000001'::uuid],'2026-10-28');
 if v#>>'{items,0,medias,0,quantity}'<>'5.0000000000000000' then raise exception 'Consumo duplicado: %',v;end if;
 if v#>>'{items,0,estoque_validado}'<>'false' then raise exception 'Estoque inferido';end if;
 if jsonb_array_length(compras_automacao_base('{}','2026-10-28')->'items')<>0 then raise exception 'Vazamento de escopo';end if;
 raise notice 'SQL OK: códigos, deduplicação, estoque desconhecido e escopo';
end $$;
