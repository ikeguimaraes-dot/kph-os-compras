import * as T from 'three';
import {activityProfile,type TwinActivity} from './model';

// Shared geometry/materials within one scene. Every rig is stylized; no person is a live record.
export function createLife(){
 const geometries=new Map<string,T.BufferGeometry>(),materials=new Map<string,T.MeshStandardMaterial>();
 const updates:((time:number,weekday:number,activity?:TwinActivity)=>void)[]=[];
 const lamps:T.MeshStandardMaterial[]=[];
 const mat=(c:string)=>{if(!materials.has(c))materials.set(c,new T.MeshStandardMaterial({color:c,roughness:.8}));return materials.get(c)!;};
 const mesh=(p:T.Object3D,g:T.BufferGeometry,c:string,x:number,y:number,z:number,shadow=false)=>{const m=new T.Mesh(g,mat(c));m.position.set(x,y,z);m.castShadow=shadow;m.receiveShadow=true;p.add(m);return m;};
 const box=(p:T.Object3D,x:number,y:number,z:number,w:number,h:number,d:number,c:string)=>{const k=`b${w},${h},${d}`;if(!geometries.has(k))geometries.set(k,new T.BoxGeometry(w,h,d));return mesh(p,geometries.get(k)!,c,x,y,z);};
 const ball=(p:T.Object3D,x:number,y:number,z:number,r:number,c:string)=>{const k=`s${r}`;if(!geometries.has(k))geometries.set(k,new T.IcosahedronGeometry(r,1));return mesh(p,geometries.get(k)!,c,x,y,z,true);};
 const cyl=(p:T.Object3D,x:number,y:number,z:number,r:number,h:number,c:string)=>{const k=`c${r},${h}`;if(!geometries.has(k))geometries.set(k,new T.CylinderGeometry(r,r,h,10));return mesh(p,geometries.get(k)!,c,x,y,z);};
 const shirt=['#b06d4f','#627e8c','#d1ab59','#586c57','#bba2bd','#e7dbbe','#ab5251','#718c86'];
 const skins=['#c68e66','#e0b58d','#8f5f40','#b77b51'];
 const rig=(parent:T.Object3D,color:string,seated=false,seed=0,role='guest')=>{
  const root=new T.Group();parent.add(root);const torso=new T.Group();root.add(torso);
  const hip=seated?.69:.91,shoulder=hip+.36;
  const body=box(torso,0,hip+.18,0,.34,.48,.23,color);body.castShadow=true;
  const head=ball(torso,0,hip+.61,0,.18,skins[seed%4]!);
  if(role==='chef'){cyl(torso,0,hip+.78,0,.18,.14,'#f7f3e5');ball(torso,0,hip+.9,0,.17,'#f7f3e5');}
  else{const hair=ball(torso,0,hip+.69,-.025,.177,['#4c3b30','#7b5539','#463e3b'][seed%3]!);hair.scale.y=.45;}
  const arms:T.Group[]=[],legs:T.Group[]=[];
  for(const side of [-1,1]){
   const arm=new T.Group();arm.position.set(side*.23,shoulder,0);torso.add(arm);arms.push(arm);
   box(arm,0,-.16,0,.11,.32,.12,color);ball(arm,0,-.35,0,.065,skins[seed%4]!);
   const leg=new T.Group();leg.position.set(side*.1,hip-.05,0);root.add(leg);legs.push(leg);
   if(seated){box(leg,0,-.04,.17,.14,.14,.42,'#414e4a');box(leg,0,-.3,.34,.13,.48,.14,'#414e4a');box(leg,0,-.55,.4,.16,.1,.24,'#3e443f');}
   else{box(leg,0,-.36,0,.13,.72,.14,'#414e4a');box(leg,0,-.74,.06,.16,.11,.26,'#3e443f');}
  }
  if(role==='waiter'||role==='chef'){box(torso,0,hip+.06,.13,.3,.46,.035,role==='chef'?'#f3eee1':'#d0b592');}
  return {root,torso,head,arms,legs};
 };
 const plate=(parent:T.Object3D,x:number,z:number,index:number)=>{
  const g=new T.Group();g.position.set(x,1.16,z);parent.add(g);
  cyl(g,0,0,0,.19,.025,'#fff9e9');cyl(g,0,.025,0,.12,.025,['#9c5e40','#d4b675','#8d9d5d'][index%3]!);
  ball(g,.06,.05,-.04,.045,'#849452');box(g,.25,0,0,.018,.018,.3,'#9fa99d');box(g,-.25,0,0,.025,.018,.3,'#9fa99d');
  cyl(g,.19,.06,-.21,.045,.12,index%2?'#98664f':'#acc5bf');return g;
 };
 const sign=(parent:T.Object3D,label:string,color:string)=>{
  const canvas=document.createElement('canvas');canvas.width=768;canvas.height=128;const c=canvas.getContext('2d')!;c.fillStyle=color;c.fillRect(0,0,768,128);c.fillStyle='#fff9e8';c.font='500 56px Georgia';c.textAlign='center';c.fillText(label,384,86,710);
  const tex=new T.CanvasTexture(canvas);tex.colorSpace=T.SRGBColorSpace;
  const m=new T.Mesh(new T.PlaneGeometry(3,.55),new T.MeshBasicMaterial({map:tex,side:T.DoubleSide}));m.position.set(-4.4,2.18,6.38);parent.add(m);textures.push(tex);
 };
 const textures:T.Texture[]=[];
 const restaurant=(parent:T.Object3D,id:string,name:string,accent:string)=>{
  const theme=name.includes('Madonna')?'italian':name.includes('Match')?'sport':name.includes('Meet')?'grill':'bistro';
  sign(parent,name.replace(' SP Itaim',''),theme==='italian'?'#8a5650':theme==='sport'?'#456c67':theme==='grill'?'#695442':'#59684e');
  // Warm floor, framed wall panels and lighting make each house recognizable.
  for(let i=0;i<3;i++){
   const x=1.2+i*2.2;box(parent,x,1.6,-5.06,1.6,1.1,.08,theme==='italian'?'#b77d6b':theme==='sport'?'#627f7b':accent);
   box(parent,x,1.6,-5,1.35,.85,.04,theme==='sport'?'#adc8b5':'#e6d6b8');
   if(theme==='sport'){box(parent,x,1.6,-4.97,1.2,.025,.01,'#f4eee0');cyl(parent,x,1.6,-4.96,.15,.025,'#e5ead4').rotation.x=Math.PI/2;}
  }
  for(const [x,z] of [[-1,1.6],[1.5,1.6],[-1,4],[1.5,4]] as [number,number][]){
   // Floral centerpiece and linen; chair count stays illustrative, never a seating-capacity record.
   cyl(parent,x,1.2,z,.085,.2,theme==='italian'?'#a5634d':'#d6c8a3');ball(parent,x,1.37,z,.13,'#86956b');
   box(parent,x,2.95,z,.025,.55,.025,'#7a7965');
   const light=cyl(parent,x,2.62,z,.29,.16,'#eed49a');const lm=mat('#eed49a').clone();lm.emissive=new T.Color('#e8b568');lm.emissiveIntensity=.25;light.material=lm;lamps.push(lm);
  }
  const guests:{rig:ReturnType<typeof rig>;setting:T.Group;seat:number}[]=[];
  const tables:[number,number][]=[[-1,1.6],[1.5,1.6],[-1,4],[1.5,4]];
  tables.forEach(([x,z],ti)=>{
   for(let j=0;j<4;j++){
    const angle=j*Math.PI/2,seat=j*4+ti;
    const actor=rig(parent,shirt[(ti*3+j)%shirt.length]!,true,ti*4+j);
    actor.root.position.set(x+Math.cos(angle)*.85,.15,z+Math.sin(angle)*.85);actor.root.rotation.y=Math.atan2(-Math.cos(angle),-Math.sin(angle));
    guests.push({rig:actor,seat,setting:plate(parent,x+Math.cos(angle)*.34,z+Math.sin(angle)*.34,ti+j)});
   }
  });
  const chef1=rig(parent,'#f5f1e3',false,1,'chef'),chef2=rig(parent,'#f5f1e3',false,2,'chef');
  chef1.root.position.set(2.3,.15,-2.8);chef1.root.rotation.y=0;
  chef2.root.position.set(5.2,.15,-3.2);chef2.root.rotation.y=Math.PI;
  const bartender=rig(parent,theme==='italian'?'#915e55':'#536b5b',false,3,'waiter');bartender.root.position.set(6.85,.15,2.3);bartender.root.rotation.y=-Math.PI/2;
  const waiter=rig(parent,'#f3edde',false,2,'waiter');
  const tray=cyl(waiter.root,.35,1.17,.28,.31,.045,'#776b58');cyl(tray,0,.07,0,.19,.035,'#fff4dc');
  // Explicit corridor waypoints avoid tables, chairs, the prep island and partitions.
  const path=new T.CatmullRomCurve3([[3.2,.15,.5],[3.2,.15,2.7],[3.2,.15,4.9],[.2,.15,5.05],[-2.4,.15,4.9],[-2.4,.15,.35],[.2,.15,.35],[3.2,.15,.5]].map(v=>new T.Vector3(...v as [number,number,number])),true,'catmullrom',.05);
  const steam:T.Mesh[]=[];for(let i=0;i<6;i++){const s=ball(parent,1.8+(i%3)*2,1.7,-4.4,.095,'#f4f0df');s.material=new T.MeshStandardMaterial({color:'#fff5df',transparent:true,opacity:.22,depthWrite:false});steam.push(s);}
  updates.push((time,weekday,activity)=>{
   const profile=activityProfile(activity,id,weekday);const count=profile.symbols;
   guests.forEach(({rig:a,seat,setting})=>{
    a.root.visible=seat<count;setting.visible=seat<count;
    const phase=time*(.8+seat*.013)+seat*1.8;
    a.arms[0]!.rotation.x=-.7-Math.max(0,Math.sin(phase))*.85;a.arms[1]!.rotation.x=-.7+Math.sin(phase*.6)*.12;
    a.head.rotation.y=Math.sin(phase*.35)*.2;a.torso.rotation.z=Math.sin(phase*.5)*.025;
   });
   [chef1,chef2].forEach((a,i)=>{a.arms[0]!.rotation.x=-.9+Math.sin(time*3+i)*.3;a.arms[1]!.rotation.x=-1.1+Math.cos(time*3+i)*.2;a.torso.rotation.y=Math.sin(time*.4+i)*.09;});
   bartender.arms[0]!.rotation.x=-1+Math.sin(time*1.8)*.2;bartender.arms[1]!.rotation.x=-1-Math.sin(time*1.8)*.2;
   const u=(time*.022)%1,travel=Math.min(1,u/.86);waiter.root.position.copy(path.getPointAt(travel));const tangent=path.getTangentAt(Math.min(.999,travel));waiter.root.rotation.y=Math.atan2(tangent.x,tangent.z);
   waiter.legs.forEach((leg,i)=>{leg.rotation.x=u>.86?0:Math.sin(time*6+i*Math.PI)*.3;});waiter.arms[0]!.rotation.x=-1.15;waiter.arms[1]!.rotation.x=-.25;
   steam.forEach((s,i)=>{const p=(time*.25+i/6)%1;s.position.y=1.65+p*.8;s.scale.setScalar(.6+p);(s.material as T.MeshStandardMaterial).opacity=(1-p)*.2;});
  });
 };
 const dock=(parent:T.Object3D,x:number,z:number,phase=0)=>{
  const g=new T.Group();g.position.set(x,0,z);parent.add(g);
  const worker=rig(g,'#cf965e',false,phase+1,'worker');
  const cart=new T.Group();g.add(cart);box(cart,0,.3,0,.85,.12,1.3,'#be864e');
  box(cart,0,.65,0,.75,.6,.9,'#bfa16e');box(cart,0,.98,0,.55,.08,.7,'#e5c38c');
  box(cart,0,.75,.65,.75,1,.06,'#54725d');
  for(const xx of [-.4,.4])for(const zz of [-.5,.5]){const w=cyl(cart,xx,.17,zz,.13,.09,'#43544a');w.rotation.z=Math.PI/2;}
  updates.push(time=>{const u=(time*.08+phase*.27)%2;const distance=u<1?u:2-u;cart.position.z=distance*2;worker.root.position.set(.85,.15,distance*2+.6);worker.root.rotation.y=u<1?0:Math.PI;worker.arms.forEach(a=>a.rotation.x=-.9);worker.legs.forEach((leg,i)=>leg.rotation.x=Math.sin(time*5+i*Math.PI)*.24);});
 };
 const factory=(parent:T.Object3D)=>{
  for(let i=0;i<3;i++){const a=rig(parent,'#eeeedd',false,i,'chef');a.root.position.set(-2.6,.15,-5+i*4);a.root.rotation.y=Math.PI/2;updates.push(t=>{a.arms[0]!.rotation.x=-1+Math.sin(t*2+i)*.25;a.arms[1]!.rotation.x=-1+Math.cos(t*2+i)*.25;});}
  dock(parent,6,5,2);
 };
 return {restaurant,dock,factory,update:(time:number,weekday:number,activity:TwinActivity|undefined,night:boolean)=>{updates.forEach(fn=>fn(time,weekday,activity));lamps.forEach(m=>m.emissiveIntensity=night?1.5:.3);},dispose:()=>{textures.forEach(t=>t.dispose());geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());}};
}
