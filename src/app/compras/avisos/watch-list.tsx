'use client';
import {useEffect,useState} from 'react';
import {getIntegrationWatches,type WatchNotice} from '@/lib/integracao-watch/actions';
import './watch.css';
const date=(value:string|null)=>value?new Intl.DateTimeFormat('pt-BR',{timeZone:'America/Sao_Paulo',dateStyle:'short',timeStyle:'short'}).format(new Date(value)):'Ainda não realizada';
export function WatchList({initial,initialReadAt}:{initial:WatchNotice[];initialReadAt:number}){
 const [rows,setRows]=useState(initial),[error,setError]=useState(false),[now,setNow]=useState(initialReadAt);
 useEffect(()=>{let live=true;const timer=setInterval(async()=>{if(document.hidden)return;try{const next=await getIntegrationWatches();if(live){setRows(next);setError(false);setNow(Date.now());}}catch{if(live){setError(true);setNow(Date.now());}}},60000);return()=>{live=false;clearInterval(timer);};},[]);
 return <section className="watch-page"><p className="watch-eyebrow">GHOST · ACOMPANHAMENTO</p><h1>A venda chegou ao Everest?</h1><p>Consulta automática a cada 15 minutos. Um aviso no GHOST e um e-mail por casa quando a baixa de venda for encontrada.</p>
 {error&&<p role="alert">A atualização desta tela falhou. Os dados abaixo são da última leitura bem-sucedida.</p>}
 {!rows.length&&<p>Nenhum acompanhamento cadastrado para sua conta.</p>}
 <div className="watch-grid">{rows.map(w=>{const failed=w.last_error||w.email_error;const stale=w.status==='pending'&&(!w.checked_at?now-Date.parse(w.expires_at)+48*3600000>30*60000:now-Date.parse(w.checked_at)>30*60000);return <article key={w.id} className={`watch-card ${w.status}`}>
 <span className="watch-status">{w.status==='found'?'Baixa encontrada':w.status==='expired'?'Acompanhamento encerrado':failed||stale?'Verificação pendente':'Aguardando baixa'}</span>
 <h2>{w.units?.name??'Casa'}</h2><p>Vendas de {w.dia.split('-').reverse().join('/')}</p>
 <dl><dt>Última consulta</dt><dd>{date(w.checked_at)}</dd><dt>Acompanhamento até</dt><dd>{date(w.expires_at)}</dd><dt>E-mail</dt><dd>{w.email_sent_at?`Aceito pelo serviço de envio · ${date(w.email_sent_at)}`:w.status==='pending'?'Será enviado quando a baixa for encontrada':w.email_error??'Envio pendente'}</dd></dl>
 {w.last_error&&<p className="watch-error">{w.last_error}</p>}{stale&&<p className="watch-error">Sem consulta recente. A posição ainda não foi verificada.</p>}
 {w.evidence?.length? <details><summary>Ver movimentos encontrados</summary><ul>{w.evidence.map(m=><li key={m.id}>Movimento {m.id} · {m.linhas} linhas{m.observacao&&<p>{m.observacao}</p>}</li>)}</ul></details>:null}
 {w.status==='found'&&<p className="watch-note">A baixa foi encontrada. A conciliação de todas as vendas e a disponibilidade física de estoque ainda precisam ser verificadas.</p>}
 {w.status==='expired'&&<p>O prazo terminou sem confirmar a baixa. Isso não significa que a casa ficou fechada.</p>}
 </article>;})}</div><p className="watch-note">Horários de consulta em Brasília. A observação de integração é reproduzida como registrada pelo Everest. Esta tela atualiza a cada minuto enquanto estiver visível.</p></section>;
}
