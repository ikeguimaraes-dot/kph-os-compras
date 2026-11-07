-- Somente leitura: deve passar tanto localmente quanto no Supabase após a carga.
do $$
declare a jsonb; b jsonb;
begin
 select jsonb_object_agg(casa,jsonb_build_array(n_86,n_85)) into a from posicao_86_resumo_em('2026-10-23 18:30-03');
 if a<> '{"Meet & Eat":[4,0],"Frêneze":[2,0],"Madonna SP Itaim":[1,0],"Match Point":[1,0]}'::jsonb then raise exception 'Oráculo 1 casas: %',a; end if;
 select jsonb_object_agg(motivo,n) into a from (select motivo,count(*) n from posicao_86_em('2026-10-23 18:30-03') group by motivo)s;
 if a<>'{"sazonalidade":2,"producao":4,"fora_do_padrao":2}'::jsonb then raise exception 'Oráculo 1 motivos: %',a; end if;
 select jsonb_object_agg(casa,jsonb_build_array(n_86,n_85)) into a from posicao_86_resumo_em('2026-10-26 11:00-03');
 if a<>'{"Meet & Eat":[10,0],"Frêneze":[2,2],"Madonna SP Itaim":[0,2],"Match Point":[0,1]}'::jsonb then raise exception 'Oráculo 2 casas: %',a; end if;
 select jsonb_object_agg(motivo,n) into a from (select motivo,count(*) n from posicao_86_em('2026-10-26 11:00-03') where tipo=86 group by motivo)s;
 if a<>'{"sazonalidade":1,"compra":7,"producao":1,"fora_do_padrao":2,"nao_informado":1}'::jsonb then raise exception 'Oráculo 2 motivos: %',a; end if;
 select jsonb_agg(i.nome order by i.nome) into a from posicao_86_evento e join posicao_86_item i on i.id=e.item_id where evento='retorno';
 if a<> '["Costelinha BBQ","Fettuccine","Paleta de Cordeiro"]'::jsonb then raise exception 'Retornos: %',a; end if;
 select jsonb_agg(i.nome order by i.nome) into a from posicao_86_evento e join posicao_86_item i on i.id=e.item_id where motivo_alterado;
 if a<>'["Lagosta Inteira","Parrilla do Mar"]'::jsonb then raise exception 'Motivos alterados: %',a; end if;
 if (select count(*) from posicao_86_evento where evento='atualizacao')<>5 then raise exception 'Continuidade incorreta'; end if;
 if (select count(*) from posicao_86_em('2026-10-23 18:30-03') s join posicao_86_afetado a on a.item_id=s.item_id where s.tipo=86 and a.destino='eventos')<>3 then raise exception 'Risco eventos oráculo 1'; end if;
 if (select count(*) from posicao_86_em('2026-10-26 11:00-03') s join posicao_86_afetado a on a.item_id=s.item_id where s.tipo=86 and a.destino='eventos')<>2 then raise exception 'Risco eventos oráculo 2'; end if;
 if exists(select 1 from posicao_86_resumo_em('2026-10-26 11:00-03') r cross join lateral jsonb_array_elements(r.itens) j where j->>'tipo'='85' and j->'afetados'<>'[]'::jsonb) then raise exception '85 colore produto'; end if;
 if not exists(select 1 from posicao_86_em('2026-10-26 11:00-03')s join posicao_86_item i on i.id=s.item_id where i.chave='pao' and i.natureza='sem_identificacao' and i.pendencia is not null) then raise exception 'Pendência pão ausente'; end if;
 if exists(select 1 from posicao_86_resumo_em('2026-10-26 17:00-03') where status<>'atualizado') or exists(select 1 from posicao_86_resumo_em('2026-10-26 17:00:01-03') where status<>'desatualizado') then raise exception 'Limite de 6 horas incorreto'; end if;
 if (select count(*) from posicao_86_confirmacao)<>8 or (select count(*) from posicao_86_evento)<>28 then raise exception 'Contagem histórico incorreta'; end if;
 raise notice 'ACEITE F1 OK: 8/12 ocorrências, 5 alertas, 3 retornos, 5 continuidades, 2 motivos alterados, riscos 3/2';
end $$;
