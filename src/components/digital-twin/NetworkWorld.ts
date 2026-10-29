import * as T from 'three';
import {orderProgress,type AtlasOrder} from '@/lib/atlas/model';
import type {createLife} from './Life';
import {houseColors,houseScale,houseShare,num,type TwinHouse,type TwinNetwork,type ScaleBasis,type RouteMode} from './model';

export type NetworkAnchor={id:string;name:string;point:T.Vector3;detail:string};
type Options={orders?:AtlasOrder[];world:T.Group;houses:TwinHouse[];network?:TwinNetwork;basis:ScaleBasis;makeHouse:(parent:T.Object3D,color:string,detailed:boolean,houseId:string,houseName:string)=>T.Object3D;picks:T.Object3D[];life:ReturnType<typeof createLife>};
const supplierColors=['#4f7666','#a97659','#8d9d5e','#6d8299'];

export function buildNetwork({world,houses,network,basis,makeHouse,picks,life,orders}:Options){
 const textures:T.Texture[]=[];
 const mats=new Map<string,T.MeshStandardMaterial>();
 const mat=(c:string)=>{if(!mats.has(c))mats.set(c,new T.MeshStandardMaterial({color:c,roughness:.75}));return mats.get(c)!;};
 const box=(p:T.Object3D,x:number,y:number,z:number,w:number,h:number,d:number,c:string)=>{const m=new T.Mesh(new T.BoxGeometry(w,h,d),mat(c));m.position.set(x,y,z);m.castShadow=true;m.receiveShadow=true;p.add(m);return m;};
 const cyl=(p:T.Object3D,x:number,y:number,z:number,r:number,h:number,c:string)=>{const m=new T.Mesh(new T.CylinderGeometry(r,r,h,12),mat(c));m.position.set(x,y,z);m.castShadow=true;p.add(m);return m;};
 const sign=(p:T.Object3D,label:string,x:number,y:number,z:number,w:number,h:number,bg:string,rotation=0)=>{
  const canvas=document.createElement('canvas');canvas.width=1024;canvas.height=256;const ctx=canvas.getContext('2d')!;
  ctx.fillStyle=bg;ctx.fillRect(0,0,1024,256);ctx.fillStyle='#f9f5e9';ctx.font=`600 ${label.length>15?59:82}px sans-serif`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(label,512,132,940);
  const texture=new T.CanvasTexture(canvas);texture.colorSpace=T.SRGBColorSpace;textures.push(texture);
  const m=new T.Mesh(new T.PlaneGeometry(w,h),new T.MeshBasicMaterial({map:texture,side:T.DoubleSide}));m.position.set(x,y,z);m.rotation.y=rotation;p.add(m);return m;
 };
 const tree=(x:number,z:number)=>{cyl(world,x,.4,z,.1,1.7,'#9a8264');const crown=new T.Mesh(new T.IcosahedronGeometry(.85,0),mat('#8eaa82'));crown.position.set(x,1.4,z);world.add(crown);};
 const anchors:NetworkAnchor[]=[];
 const road='#bcc4b7';
 for(const x of [-13,10])box(world,x,-.45,0,3.1,.08,44,road);
 for(const z of [-17,-6,6,17]){box(world,0,-.45,z,58,.08,2.8,road);for(let x=-28;x<29;x+=2)box(world,x,-.395,z,.85,.012,.06,'#f8f4e7');}
 for(const x of [-13,10])for(let z=-21;z<22;z+=2)box(world,x,-.39,z,.06,.012,.8,'#f8f4e7');
 for(const x of [-29,29])for(let z=-20;z<22;z+=4)tree(x,z);
 const zs=[-17,-6,6,17];
 const buildings:{mesh:T.Group;id:string}[]=[];
 houses.forEach((h,i)=>{
  const group=new T.Group();group.position.set(21,-.3,zs[i]!);const scale=houseScale(network,h.id,basis);group.scale.set(scale,.65,scale);world.add(group);
  makeHouse(group,houseColors[i%4]!,false,h.id,h.name);buildings.push({mesh:group,id:h.id});
  const hit=box(world,21,-.45,zs[i]!,12.5,.02,8.5,'#cbd2c0');hit.userData.node=h.id;picks.push(hit);
  const share=houseShare(network,h.id,basis);
  anchors.push({id:h.id,name:h.name.replace(' SP Itaim',''),point:new T.Vector3(21,3.5,zs[i]!+3),detail:basis==='equal'?'Entrar na casa':`${num((share??0)*100)}% · ${basis==='revenue'?'receita bruta':'itens vendidos'}`});
 });
 const suppliers=[...(network?.suppliers??[])].slice(0,4);
 suppliers.forEach((s,i)=>{
  const g=new T.Group();g.position.set(-22,-.3,zs[i]!);world.add(g);const color=supplierColors[i]!;
  const pad=box(g,0,-.05,0,11,.2,8,'#b7c2ae');pad.userData.node=s.id;picks.push(pad);
  box(g,-.5,1.3,-.8,8,2.6,4.8,'#e6e4d6');box(g,-.5,2.69,-.8,8.5,.18,5.3,color);
  for(let j=0;j<3;j++){
   box(g,-3+j*2.6,1.05,1.62,1.9,2.1,.12,'#647d73');
   for(let k=0;k<6;k++)box(g,-3+j*2.6,.2+k*.33,1.7,1.75,.035,.035,'#9caea0');
   box(g,-3+j*2.6,-.01,2.7,2.05,.12,1.9,'#d7c99d');
  }
  sign(g,s.label,-.5,2.25,1.75,6.8,.72,color);
  if(s.id==='45950502'){
   // Agricultural motif is illustrative, not a claim that this supplier owns a farm.
   for(let r=0;r<4;r++)for(let c=0;c<6;c++){box(g,-4+c*1.5,-.06,-4.5-r*.38,1.1,.14,.25,'#8b9867');cyl(g,-4+c*1.5,.13,-4.5-r*.38,.14,.25,'#a8b77e');}
  }else{cyl(g,4,1.1,-1, .7,2.5,'#b5c6bd');cyl(g,4,1.1,-3,.7,2.5,'#b5c6bd');}
  life.dock(g,2.5,2, i);
  anchors.push({id:s.id,name:s.label,point:new T.Vector3(-22,4,zs[i]!+2),detail:s.purchaseOnly?`R$ ${num(s.spend,0)} em compras`:`${num(s.kg/1000,2)} t em KG · ${s.invoices} notas`});
 });
 // Central production facility: cutaway, receiving docks, cold room, production line and dispatch.
 const factory=new T.Group();factory.position.set(-2,-.25,0);world.add(factory);
 const factoryPad=box(factory,0,-.1,0,16,.4,18,'#617f6b');factoryPad.userData.node='factory';picks.push(factoryPad);
 box(factory,0,.14,0,15.6,.12,17.6,'#e3e4d7');
 box(factory,0,1.5,-8.5,15.6,3,.2,'#dbe3d6');box(factory,-7.6,1.5,0,.2,3,17,'#dbe3d6');
 box(factory,0,3.05,-8.5,15.9,.16,.35,'#52745f');box(factory,-7.6,3.05,0,.35,.16,17.2,'#52745f');
 sign(factory,'KPH / FÁBRICA',0,2.2,-8.35,10,1.25,'#52745f');
 for(let i=0;i<4;i++){
  const z=-5.5+i*3.6;box(factory,-5.2,.23,z,3.6,.08,3.1,i<2?'#bdd4ce':'#cbbc9d');
  for(let k=0;k<3;k++){box(factory,-5.2,.6+k*.65,z,3,.08,1.8,'#899e8d');for(let j=0;j<4;j++)box(factory,-6.25+j*.7,.84+k*.65,z,.55,.43,1.1,i<2?'#adc7c4':'#c7ab7d');}
 }
 box(factory,-3.1,1,-4,.12,1.7,8,'#c5d7cb');
 for(let i=0;i<3;i++){
  const z=-5+i*4;box(factory,0,.8,z,3.6,1.3,2.4,'#9dafa5');box(factory,0,1.5,z,3.8,.15,2.6,'#dde5df');
  cyl(factory,-.7,1.85,z,.6,.65,'#9dad9f');cyl(factory,.8,1.85,z,.6,.65,'#9dad9f');
  box(factory,0,3,z,4,.3,2.7,'#c6d3c7');
  cyl(factory,0,3.5,z,.4,1,'#c6d3c7');
 }
 box(factory,4,.7,0,2,.25,14,'#496b5c');
 for(let i=0;i<25;i++){const roller=cyl(factory,4,.88,-6.8+i*.55,.12,1.9,'#a9b9aa');roller.rotation.z=Math.PI/2;}
 for(let i=0;i<3;i++){box(factory,6.7,.2,-5+i*5,2,.3,2.7,'#c2ad83');box(factory,7.7,.24,-5+i*5,.1,.03,2.7,'#e8c06d');}
 box(factory,2,.75,7,6,1,1.4,'#577967');sign(factory,'EXPEDIÇÃO',2,1.7,7.8,5,.7,'#577967');
 anchors.push({id:'factory',name:'Fábrica KPH',point:new T.Vector3(-2,5.3,4),detail:orders?'Depósitos ERP · produção possível':'Produção central · cenário'});
 life.factory(factory);
 const crates:T.Mesh[]=[];for(let i=0;i<7;i++)crates.push(box(factory,4,1.25,-6+i*2,1.3,.6,1,'#cfaf79'));
 const routes:{curve:T.CatmullRomCurve3;group:T.Group;vehicle:T.Group;mode:RouteMode;phase:number;supplier:string;house:string;cargo:T.Mesh}[]=[];
 const makeTruck=(brand:string,color:string)=>{
  const g=new T.Group();world.add(g);
  box(g,0,.2,0,1.05,.2,2.9,'#40584a');box(g,0,.95,.45,1.12,1.25,1.95,'#f3efdf');
  box(g,0,.7,-1.05,1.12,.9,.85,color);box(g,0,.95,-1.49,.86,.36,.025,'#a5ccca');
  box(g,0,.37,-1.5,.95,.13,.09,'#ccd1bd');
  for(const x of [-.57,.57])for(const z of [-1.08,.85]){const wheel=cyl(g,x,.27,z,.25,.13,'#35453e');wheel.rotation.z=Math.PI/2;}
  for(const x of [-.57,.57])sign(g,brand,x,1.03,.4,1.85,.65,color,x>0?Math.PI/2:-Math.PI/2);
  sign(g,brand,0,1.59,.4,1,.36,color).rotation.x=-Math.PI/2;
  return g;
 };
 const addRoute=(points:number[][],brand:string,color:string,mode:RouteMode,phase:number,supplier:string,house:string)=>{
  const curve=new T.CatmullRomCurve3(points.map(v=>new T.Vector3(v[0],-.15,v[1])),false,'catmullrom',.08);
  const g=new T.Group();world.add(g);
  const line=new T.Line(new T.BufferGeometry().setFromPoints(curve.getPoints(100)),mode==='fabrica'?new T.LineDashedMaterial({color,dashSize:.6,gapSize:.45,transparent:true,opacity:.65}):new T.LineBasicMaterial({color,transparent:true,opacity:.55}));line.computeLineDistances();g.add(line);
  const cargo=box(world,0,.25,0,.65,.6,.65,'#be9d6a');
  routes.push({curve,group:g,vehicle:makeTruck(brand,color),mode,phase,supplier,house,cargo});
 };
 suppliers.forEach((s,i)=>{
  const sz=zs[i]!;
  s.houses.forEach((link,j)=>{const hi=houses.findIndex(h=>h.id===link.unit_id);if(hi<0)return;const hz=zs[hi]!;
   // North perimeter avoids the central factory: notes establish endpoints, never the actual road.
   addRoute([[-21,sz+3],[-13,sz+3],[-13,-22],[10,-22],[10,hz],[16,hz]],s.label,supplierColors[i]!,'documentado',i*.19+j*.27,s.id,link.unit_id);
  });
  addRoute([[-21,sz+3],[-13,sz+3],[-13,6],[-10,6]],s.label,supplierColors[i]!,'fabrica',i*.23,s.id,'factory');
 });
 houses.forEach((h,i)=>addRoute([[6,6],[10,6],[10,zs[i]!],[16,zs[i]!]],'KPH / '+h.name.replace(' SP Itaim','').toUpperCase(),houseColors[i]!,'fabrica',i*.24,'factory',h.id));
 const today=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
 const orderTrucks=(orders??[]).filter(o=>o.status!=='cancelado').slice(0,24).map((order,i)=>{
  const si=suppliers.findIndex(s=>s.id===order.supplierId),hi=houses.findIndex(h=>h.id===order.unitId);
  const proven=si>=0&&hi>=0&&!!order.eta&&order.status!=='rascunho';
  const vehicle=makeTruck(order.number,proven?'#547b67':'#b58a54');
  const curve=proven?new T.CatmullRomCurve3([[-21,zs[si]!+3],[-13,zs[si]!+3],[-13,-22],[10,-22],[10,zs[hi]!],[16,zs[hi]!]].map(([x,z])=>new T.Vector3(x!,-.15,z!)),false,'catmullrom',.08):null;
  const p=orderProgress(order,today);vehicle.position.copy(curve?curve.getPointAt(p):new T.Vector3(-9+(i%6)*2.4,-.15,20+Math.floor(i/6)*1.6));
  if(curve){const t=curve.getTangentAt(Math.min(.9999,p));vehicle.rotation.y=Math.atan2(-t.x,-t.z);}
  vehicle.traverse(node=>{if(node instanceof T.Mesh){node.userData.node='order:'+order.id;picks.push(node);}});
  anchors.push({id:'order:'+order.id,name:order.number,point:vehicle.position.clone().add(new T.Vector3(0,2,0)),detail:proven?(order.supplier??'Pedido'):'Dados pendentes · sem rota'});
  return {vehicle,order};
 });
 return {anchors,update:(elapsed:number,mode:RouteMode,selected:string|null,showLines:boolean,newBasis:ScaleBasis)=>{
  orderTrucks.forEach(({vehicle,order})=>{vehicle.visible=mode==='pedidos'&&(!selected||selected==='order:'+order.id||selected===order.unitId||selected===order.supplierId);});
  buildings.forEach(({mesh,id})=>{const s=houseScale(network,id,newBasis);mesh.scale.x=T.MathUtils.lerp(mesh.scale.x,s,.08);mesh.scale.z=T.MathUtils.lerp(mesh.scale.z,s,.08);});
  crates.forEach((c,i)=>{c.position.z=-6.5+(elapsed*.85+i*2)%13;});
  routes.forEach((r)=>{
   const active=r.mode===mode;const selectedRoute=!selected||selected===r.supplier||selected===r.house;
   r.group.visible=active&&showLines&&selectedRoute;r.vehicle.visible=active&&selectedRoute;
   // Continuous out-and-back loop with a dwell at both endpoints; no inferred ETA or GPS.
   const cycle=(elapsed*.025+r.phase)%1;const outbound=cycle<.5;
   const u=outbound?Math.min(1,Math.max(0,(cycle-.05)/.4)):1-Math.min(1,Math.max(0,(cycle-.55)/.4));
   r.vehicle.position.copy(r.curve.getPointAt(u));
   const tangent=r.curve.getTangentAt(Math.min(.9999,Math.max(.0001,u))).multiplyScalar(outbound?1:-1);
   r.vehicle.rotation.y=Math.atan2(-tangent.x,-tangent.z);
   const unloading=cycle>=.45&&cycle<.55,loading=cycle<.05||cycle>=.95;
   r.cargo.visible=active&&selectedRoute&&(unloading||loading);
   if(r.cargo.visible){r.cargo.position.copy(r.vehicle.position);r.cargo.position.x+=1+Math.sin(elapsed*2)*.35;r.cargo.position.y=.25+Math.abs(Math.sin(elapsed*2))*.2;}
  });
 },dispose:()=>textures.forEach(t=>t.dispose())};
}
