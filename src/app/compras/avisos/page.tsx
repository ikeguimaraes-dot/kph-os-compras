import {getWatchSnapshot} from '@/lib/integracao-watch/actions';
import {WatchList} from './watch-list';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export default async function Page(){
 let snapshot;
 try{snapshot=await getWatchSnapshot();}
 catch{return <div style={{padding:32}}><h1>Avisos de integração</h1><p>Não foi possível consultar o acompanhamento. Recarregue a página.</p></div>;}
 return <WatchList initial={snapshot.rows} initialReadAt={snapshot.readAt}/>;
}
