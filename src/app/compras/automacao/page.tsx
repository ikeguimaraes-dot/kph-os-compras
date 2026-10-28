import Link from 'next/link';
import {getAutomation} from '@/lib/compras/automacao-actions';
export const dynamic='force-dynamic';
export const runtime='nodejs';
const fmt=new Intl.NumberFormat('pt-BR',{maximumFractionDigits:3});
const weekdays=['','Seg','Ter','Qua','Qui','Sex','Sáb','Dom'];
const n=(v:number|null)=>v===null?'Não comprovado':fmt.format(v);
const reasons:Record<string,string>={demanda_sem_amostra_suficiente:'Histórico por dia da semana insuficiente · Integrações',estoque_sem_posicao_utilizavel:'Validar escopo e saldo utilizável do depósito · Estoque/Integrações',pedidos_abertos_sem_conciliacao:'Vincular códigos dos pedidos em aberto · Integrações',embalagem_ou_minimo_pendente:'Condição de embalagem/mínimo ausente · Cadastro comercial',seguranca_pendente:'Política de segurança ausente · Planejamento',prazo_pendente:'Prazo de reposição ausente · Cadastro comercial',entrega_invalida:'Entrega com dado inválido · Recebimento',entrega_sem_confirmacao_ou_atrasada:'Entrega atrasada ou sem confirmação · Recebimento',sincronizacao_consumo_antiga:'Baixas do Everest desatualizadas · Integrações',vendas_sem_baixa_pdv:'Venda sem baixa correspondente · Integrações',movimentos_inconsistentes:'Unidade, sinal ou tipo de movimento divergente · Integrações',repor_por_producao:'Base de produção interna; não emitir compra direta · Produção'};
export default async function AutomationPage({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}){
 const q=await searchParams;
 const data=await getAutomation(typeof q.casa==='string'?q.casa:null);
 const term=typeof q.q==='string'?q.q.toLocaleLowerCase('pt-BR'):'';
 const ready=data.items.filter(i=>i.result.quantity!==null&&i.result.quantity>0);
 const exceptions=new Map<string,number>();for(const i of data.items)for(const e of i.result.exceptions)exceptions.set(e,(exceptions.get(e)??0)+1);
 const filtered=data.items.filter(i=>(!term||i.nome.toLocaleLowerCase('pt-BR').includes(term))&&(q.filtro!=='prontos'||(i.result.quantity!==null&&i.result.quantity>0)));
 const page=Math.max(1,Math.min(Math.ceil(filtered.length/50)||1,Number.parseInt(String(q.p??'1'),10)||1));
 const href=(p:number)=>'/compras/automacao?'+new URLSearchParams({q:term,filtro:String(q.filtro??''),casa:typeof q.casa==='string'?q.casa:'',p:String(p)});
 return <main style={{maxWidth:1180,margin:'auto',padding:16}}>
 <Link href="/compras">← Compras</Link><h1>Pedidos calculados e exceções</h1>
 <p>{typeof q.casa==='string'&&q.casa?'Visão da casa filtrada':'Visão consolidada das casas operacionais autorizadas'}</p>
 <p>Consumo da integração oficial Everest por dia da semana. Necessidade = demanda + segurança − saldo utilizável − entregas confirmadas, ajustada à embalagem.</p>
 <p>Referência: {data.asOf} · {data.items.length} insumos e bases · <strong>{ready.length} sugestões líquidas calculadas</strong>. Nenhum pedido enviado automaticamente nesta tela.</p>
 <p><Link href="/compras/automacao/exportar">Exportar cálculo e evidências (JSON)</Link> · <Link href="/compras/estoque/everest">Conferir fontes de estoque</Link></p>
 <section aria-label="Cobertura por casa" style={{display:'flex',flexWrap:'wrap',gap:16}}>{data.units.map(u=>{const c=data.coverage.find(c=>c.id===u.id);return <article key={u.id} style={{border:'1px solid var(--border)',padding:16,borderRadius:8}}><h2>{u.name}</h2>{c?<p>{c.dias_conciliados} dias conciliados / {c.dias_vendas} com venda</p>:<p>Sem leitura automática desta casa. Não representa zero.</p>}<p>{c?.dias_eventos??0} dias com eventos separados da média regular</p><Link href={'/compras/automacao?casa='+u.id}>Filtrar casa</Link></article>;})}</section>
 <h2>Exceções por área</h2><p>Dados ausentes geram uma pendência explícita. Não são interpretados como estoque zero ou autorização de compra.</p>
 <ul>{[...exceptions].map(([e,count])=><li key={e}>{reasons[e]??e}: <strong>{count}</strong> itens</li>)}</ul>
 <form><input type="hidden" name="casa" value={typeof q.casa==='string'?q.casa:''}/><label>Buscar insumo <input name="q" defaultValue={term}/></label> <label>Mostrar <select name="filtro" defaultValue={String(q.filtro??'')}><option value="">Todos</option><option value="prontos">Sugestões calculadas</option></select></label> <button type="submit">Filtrar</button></form>
 <p>{filtered.length} itens · página {page}</p>
 <div style={{overflowX:'auto'}}><table style={{width:'100%'}}><thead><tr><th>Insumo / casa</th><th>Demanda</th><th>Estoque</th><th>Entregas</th><th>Comprar</th><th>Conferência</th></tr></thead><tbody>{filtered.slice((page-1)*50,page*50).map(i=><tr key={i.unit_id+':'+i.item_id}><td>{i.nome}<br/><small>{data.units.find(u=>u.id===i.unit_id)?.name} · {i.medida}</small></td><td>{n(i.result.demand)}<br/><small>{i.demand.length} dias · referência histórica</small><details><summary>Médias e amostras</summary>{i.medias.map(m=><p key={m.dow}>{weekdays[m.dow]}: {n(m.quantity)} {i.medida} · {m.samples} dias</p>)}</details></td><td>{n(i.result.stock)}</td><td>{n(i.result.incoming)}</td><td><strong>{n(i.result.quantity)}</strong><br/><small>{i.result.packs===null?'':n(i.result.packs)+' embalagens'}</small></td><td>{i.result.state==='nao_comprovado'?'Posição não comprovada':i.result.state}<br/>{i.result.firstShortage&&<small>Falta projetada: {i.result.firstShortage}<br/></small>}{i.result.exceptions.map(e=><small key={e}>{reasons[e]??e}<br/></small>)}</td></tr>)}</tbody></table></div>
 <nav aria-label="Paginação">{page>1&&<Link href={href(page-1)}>← Anterior</Link>} {page*50<filtered.length&&<Link href={href(page+1)}>Próxima →</Link>}</nav>
 </main>;
}
