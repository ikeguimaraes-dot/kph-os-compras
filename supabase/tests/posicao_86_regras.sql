-- Executar em banco de testes com os oráculos. Nenhum teste persiste dados.
begin;
do $$
declare u uuid; i uuid; payload jsonb; c uuid; n bigint; rejeitou boolean;
begin
 select unit_id,id into u,i from posicao_86_item where chave='parrilla';
 select count(*) into n from posicao_86_evento;
 select cf.id,cf.payload into c,payload from posicao_86_confirmacao cf where unit_id=u and chave='oraculo-2-2026-10';
 perform confirmar_posicao_86(u,'oraculo-2-2026-10','2026-10-26 11:00-03',true,'Henrique — lista histórica confirmada',payload);
 if (select count(*) from posicao_86_evento)<>n then raise exception 'Replay duplicou eventos'; end if;
 perform confirmar_posicao_86(u,'teste-parcial','2026-10-26 12:00-03',false,'teste',jsonb_build_array(jsonb_build_object('item_id',i,'tipo',86,'motivo','compra','acao','retornar')));
 if (select n_86 from posicao_86_resumo_em('2026-10-26 12:00-03') where unit_id=u)<>9 then raise exception 'Parcial alterou outros itens'; end if;
 if (select ultima_confirmacao from posicao_86_resumo_em('2026-10-26 12:00-03') where unit_id=u)<>'2026-10-26 11:00-03'::timestamptz then raise exception 'Parcial renovou lista completa'; end if;
 perform confirmar_posicao_86(u,'teste-silencio','2026-10-26 13:00-03',false,'teste','[]');
 if (select n_86 from posicao_86_resumo_em('2026-10-26 13:00-03') where unit_id=u)<>9 then raise exception 'Silêncio retornou itens'; end if;
 perform confirmar_posicao_86(u,'teste-zero','2026-10-26 14:00-03',true,'teste','[]');
 if (select n_86+n_85 from posicao_86_resumo_em('2026-10-26 14:00-03') where unit_id=u)<>0 then raise exception 'Lista zero não limpou posição'; end if;
 if (select n_86 from posicao_86_resumo_em('2026-10-26 11:00-03') where unit_id=u)<>10 then raise exception 'Histórico alterado'; end if;
 rejeitou:=false;
 begin update posicao_86_confirmacao set registrado_por='outro' where id=c; exception when others then rejeitou:=true; end;
 if not rejeitou then raise exception 'Histórico mutável'; end if;
 rejeitou:=false;
 begin perform confirmar_posicao_86(u,'teste-85-produto','2026-10-26 15:00-03',false,'teste',jsonb_build_array(jsonb_build_object('item_id',i,'tipo',85,'motivo','compra'))); exception when others then rejeitou:=true; end;
 if not rejeitou then raise exception 'Aceitou 85 em prato'; end if;
 rejeitou:=false;
 begin perform confirmar_posicao_86(u,'teste-retroativo','2026-10-25 11:00-03',true,'teste','[]'); exception when others then rejeitou:=true; end;
 if not rejeitou then raise exception 'Aceitou retroatividade fora de ordem'; end if;
 raise notice 'REGRAS F1 OK: replay, parcial, silêncio, zero, histórico, 85 e retroatividade';
end $$;
rollback;
