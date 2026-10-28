import Link from 'next/link';
import { comprasAccess } from '@/lib/compras/everest-access';
import { getAutomation } from '@/lib/compras/automacao-actions';
async function historyStart(){ return new Date(Date.now()-84*86400000).toISOString(); }
export async function PosicaoSection(){
 const {db,unitIds}=await comprasAccess();
 const start=await historyStart();
 const [positions,queue,history,automation]=await Promise.all([
 db.from('posicao_86_atual').select('unit_id,casa,ultima_confirmacao,status,n_86,n_85').in('unit_id',unitIds),
 db.from('v_pendencias_acompanhamento_86').select('id',{count:'exact',head:true}).in('unit_id',unitIds),
 db.from('posicao_86_evento').select('id,posicao_86_confirmacao!inner(confirmado_em)',{count:'exact',head:true}).in('unit_id',unitIds).eq('tipo',86).eq('evento','abertura').gte('posicao_86_confirmacao.confirmado_em',start),
 getAutomation().catch(()=>null),
 ]);
 const calculated=automation?.items.filter(i=>i.result.state==='86')??[];
 const attention=automation?.items.filter(i=>i.result.state==='85')??[];
 const unknown=automation?.items.filter(i=>i.result.state==='nao_comprovado').length;
 return <section aria-label="Posição operacional e acompanhamento" style={{padding:16,marginBottom:24,border:'1px solid var(--border)',borderRadius:12}}>
 <div style={{display:'flex',flexWrap:'wrap',gap:24}}>
 <div><strong>86 agora · cálculo por insumo/base</strong><p>{automation?`${calculated.length} bloqueios comprovados · ${unknown} posições não comprovadas`:'Cálculo indisponível'}</p><small>{attention.length} alertas 85 separados. Falta de dados não significa disponibilidade.</small></div>
 <div><strong>Histórico de 86 · últimos 84 dias</strong><p>{history.error?'Consulta indisponível':`${history.count??0} aberturas confirmadas`}</p><small>Ocorrências operacionais; não conta variantes de venda.</small></div>
 <div><strong>Pendências de acompanhamento</strong><p>{queue.error?'Consulta indisponível':`${queue.count??0} registros na fila de Compras`}</p><small>Não determinam a cor dos pratos.</small></div>
 </div>
 <details><summary>Últimas listas históricas por casa</summary>{positions.error?<p>Consulta indisponível.</p>:positions.data?.map(p=><p key={p.unit_id}><strong>{p.casa}</strong>: {p.n_86} ocorrências 86 e {p.n_85} alertas 85 registrados · {p.status==='desatualizado'?'posição desatualizada':p.status} · última confirmação {p.ultima_confirmacao?new Date(p.ultima_confirmacao).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'}):'ausente'}. A lista histórica não substitui o cálculo atual.</p>)}</details>
 <Link href="/compras/automacao">Ver cálculo, demanda e exceções →</Link>
 </section>;
}
