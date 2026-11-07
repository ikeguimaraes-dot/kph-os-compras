import {Users,ArrowUpRight} from 'lucide-react';
import {activityProfile,num,type TwinActivity,type TwinHouse} from './model';
const days=['','Seg','Ter','Qua','Qui','Sex','Sáb','Dom'];
export default function ActivityPanel({activity,house,weekday,onDay,onSalon}:{activity?:TwinActivity;house:TwinHouse;weekday:number;onDay:(d:number)=>void;onSalon:()=>void}){
 const profile=activityProfile(activity,house.id,weekday);
 const rows=days.slice(1).map((_,i)=>activityProfile(activity,house.id,i+1));const max=Math.max(1,...rows.map(p=>p.mean??0));
 return <section className="atlas-activity-panel" aria-label="Movimento histórico de clientes">
  <div className="atlas-eyebrow"><Users size={14}/> O SALÃO GANHA VIDA</div>
  <h2>Uma casa.<br/>Muitos encontros.</h2>
  <div className="atlas-activity-number"><strong>{num(profile.mean,0)}</strong><span>clientes / dia registrado<small>{days[weekday]} · {profile.samples} observações</small></span></div>
  <div className="atlas-week-chart">{rows.map((p,i)=><button key={i} onClick={()=>onDay(i+1)} aria-pressed={weekday===i+1} aria-label={`${days[i+1]}: ${p.valid?num(p.mean)+' clientes por dia registrado':'amostra insuficiente'}`}><span>{p.valid?num(p.mean,0):'—'}</span><i><b style={{height:`${p.mean===null?5:Math.max(3,p.mean/max*100)}%`}} className={p.valid?'':'insufficient'}/></i><small>{days[i+1]}</small></button>)}</div>
  <p>{profile.valid?'O movimento visual acompanha a média desse dia em relação aos outros dias da própria casa.':'Amostra insuficiente: a cena mantém um movimento ilustrativo padrão, sem estimar clientes.'}</p>
  <span className="atlas-activity-source">LOREAN · {activity?`${activity.from.split('-').reverse().slice(0,2).join('/')} — ${activity.to.split('-').reverse().slice(0,2).join('/')}/${activity.to.slice(0,4)}`:'SEM HISTÓRICO'}</span>
  <button className="atlas-visit" onClick={onSalon}>Aproximar do salão <ArrowUpRight size={15}/></button>
  <p className="atlas-small-note">Pessoas e mesas são simbólicas. A cena não representa capacidade, ocupação atual nem escala real de funcionários.</p>
 </section>;
}
