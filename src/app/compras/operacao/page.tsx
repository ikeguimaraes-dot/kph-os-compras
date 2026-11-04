import Link from 'next/link';
import {comprasAccess} from '@/lib/compras/everest-access';
import {summarizePolls,type Poll} from '@/lib/compras/integracao-health';
import './operacao.css';
import {getExcecoes} from '@/lib/compras/excecoes-actions';
import ExceptionsClient from './excecoes-client';
export const dynamic='force-dynamic';
export const runtime='nodejs';
const date=(v:string|null)=>v?new Intl.DateTimeFormat('pt-BR',{timeZone:'America/Sao_Paulo',dateStyle:'short',timeStyle:'medium'}).format(new Date(v)):'Ainda não registrada';
export default async function Page(){
 const {db,units,unitIds}=await comprasAccess();
 const houses=await db.from('units').select('id,name').in('id',unitIds).eq('active',true).eq('is_training',false).not('lorean_code','is',null);
 if(houses.error)throw Error('Não foi possível consultar as casas operacionais.');
 const exceptions=await getExcecoes();
 // This dynamic server page captures one request-time clock for all house checks.
 // eslint-disable-next-line react-hooks/purity
 const now=Date.now(),since=new Date(now-86400000).toISOString();
 const data=await Promise.all((houses.data??[]).map(async house=>{
  const [polls,log,arrivals]=await Promise.all([
   db.from('everest_movimentos_observacoes').select('periodo_inicio,periodo_fim,iniciado_em,concluido_em,total').eq('unit_id',house.id).eq('baseline',false).gte('concluido_em',since).order('concluido_em',{ascending:false}).limit(1000),
   db.from('everest_sync_logs').select('status,erro,iniciado_em,finalizado_em').eq('escopo',house.id).eq('entity_name','estoque-movimentos').order('iniciado_em',{ascending:false}).limit(1).maybeSingle(),
   db.from('everest_movimentos_chegadas').select('id_movimentoestoque,dt_movimento,primeira_deteccao_em,ultima_ausencia_em').eq('unit_id',house.id).eq('baseline',false).gte('primeira_deteccao_em',since).order('primeira_deteccao_em',{ascending:false}).limit(100),
  ]);
  return {house,polls:summarizePolls((polls.data??[]) as Poll[],now),log:log.data,arrivals:arrivals.data??[],error:!!(polls.error||log.error||arrivals.error),limited:polls.data?.length===1000||arrivals.data?.length===100};
 }));
 return <main className="op-page"><header><span className="op-eyebrow">COMPRAS & LOGÍSTICA</span><h1>Controle da operação</h1><p>Acompanhe as fontes que sustentam o planejamento e a execução em cada casa.</p></header>
 <nav className="op-links"><Link href="/compras/automacao">Planejamento e simulação</Link><Link href="/compras">Pedidos</Link><Link href="/compras/estoque">Estoque e apresentações</Link><Link href="/compras/logistica">Logística</Link><Link href="/compras/recebimento">Recebimento</Link></nav>
 <ExceptionsClient initial={exceptions}/>
 <section><h2>Chegada das baixas</h2><p>Consultas programadas a cada 15 minutos. Os horários abaixo mostram a coleta efetivamente concluída, em São Paulo. Uma consulta recente não comprova todos os turnos integrados.</p>
 <div className="op-grid">{data.map(d=><article className="op-card" key={d.house.id}><div className="op-card-title"><h3>{d.house.name}</h3><span className={'op-badge '+(d.error||d.polls.state!=='recente'?'op-attention':'op-ok')}>{d.error?'Consulta indisponível':d.polls.state==='recente'?'Coleta recente':d.polls.state==='aguardando'?'Aguardando coleta':'Coleta atrasada'}</span></div>
 <dl><dt>Última janela concluída</dt><dd>{date(d.polls.latest?.concluido_em??null)}</dd><dt>Período consultado nessa janela</dt><dd>{d.polls.latest?`${d.polls.latest.periodo_inicio} a ${d.polls.latest.periodo_fim}`:'Não comprovado'}</dd><dt>Janelas concluídas nas últimas 24h</dt><dd>{d.error?'Consulta parcial':d.polls.windows}</dd><dt>Última execução da casa</dt><dd>{d.log?`${d.log.status} · ${date(d.log.finalizado_em??d.log.iniciado_em)}`:'Ainda não registrada'}</dd></dl>
 {d.log?.erro&&<p className="op-error">A última execução registrou falha. A janela completa anterior foi preservada.</p>}
 <details><summary>Novas detecções de baixa: {d.arrivals.length}{d.limited?'+':''}</summary><p>Exclui o histórico anterior à medição. Detecção é o horário em que o KPH viu o documento; não é o horário interno de gravação no Everest.</p>{d.arrivals.map(a=><p key={a.id_movimentoestoque}>Movimento de {a.dt_movimento} · detectado {date(a.primeira_deteccao_em)}<br/><small>{a.ultima_ausencia_em?`Ausente na leitura iniciada em ${date(a.ultima_ausencia_em)}`:'Sem leitura anterior que delimite a chegada.'}</small></p>)}</details>
 {d.limited&&<p>Exibição limitada aos registros mais recentes; contagens não representam o histórico completo.</p>}</article>)}</div></section>
 {!data.length&&<p>Nenhuma casa operacional autorizada foi encontrada entre as {units.length} unidades acessíveis.</p>}
 <p className="op-muted">Atualizado em {date(new Date(now).toISOString())}. Atrasos acima de 45 minutos são destacados para conferência.</p></main>;
}
