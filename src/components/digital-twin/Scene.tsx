'use client';
/* eslint-disable react-hooks/set-state-in-effect -- Initial renderer capability and projected anchors are produced by the imperative Three.js setup. */
import {useEffect,useRef,useState} from 'react';
import * as T from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {zones,houseColors,houseShare,num,type Layer,type TwinHouse,type Zone,type TwinNetwork,type ScaleBasis,type RouteMode,type TwinActivity} from './model';
import {buildNetwork} from './NetworkWorld';
import {createLife} from './Life';

type Props={activity?:TwinActivity;weekday:number;showLabels:boolean;network?:TwinNetwork;basis:ScaleBasis;routeMode:RouteMode;facility:string|null;speed:number;houses:TwinHouse[];house:TwinHouse|null;zone:Zone|null;layer:Layer;night:boolean;animate:boolean;reset:number;zoom:number;onSelect:(id:string)=>void};
type Anchor={id:string;name:string;point:T.Vector3;detail:string};
const palette={wall:'#e5e3d8',concrete:'#cfcec4',metal:'#91a0a1',dark:'#394d45',wood:'#b58b60',leaf:'#658571',orange:'#eb855b'};

export default function Scene(props:Props){
 const mount=useRef<HTMLDivElement>(null);
 const labels=useRef<Record<string,HTMLButtonElement|null>>({});
 const [anchors,setAnchors]=useState<Anchor[]>([]);
 const [failed,setFailed]=useState(false);
 const current=useRef(props);
 const api=useRef<{reset:()=>void;zoom:(direction:number)=>void}|null>(null);
 useEffect(()=>{current.current=props;},[props]);
 useEffect(()=>{api.current?.reset();},[props.reset]);
 const lastZoom=useRef(0);
 useEffect(()=>{api.current?.zoom(props.zoom-lastZoom.current);lastZoom.current=props.zoom;},[props.zoom]);

 useEffect(()=>{
  const root=mount.current;if(!root)return;
  let renderer:T.WebGLRenderer;
  try {renderer=new T.WebGLRenderer({antialias:true,alpha:true,powerPreference:'high-performance'});}catch{setFailed(true);return;}
  renderer.setPixelRatio(Math.min(window.devicePixelRatio,1.7));
  renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.PCFSoftShadowMap;
  renderer.outputColorSpace=T.SRGBColorSpace;renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1.35;
  renderer.domElement.setAttribute('aria-label','Maquete 3D interativa. Use os botões de casas e áreas como alternativa ao mouse.');
  root.appendChild(renderer.domElement);
  const scene=new T.Scene();
  const camera=new T.PerspectiveCamera(35,1,.1,600);
  const groupView=!props.house;
  const start=new T.Vector3(groupView?15:12,groupView?43:17,groupView?42:26);
  camera.position.copy(start);
  const controls=new OrbitControls(camera,renderer.domElement);
  controls.target.set(0,0,0);controls.enableDamping=true;controls.dampingFactor=.07;
  controls.minDistance=groupView?17:9;controls.maxDistance=groupView?68:42;controls.maxPolarAngle=Math.PI*.46;controls.minPolarAngle=.18;
  controls.enablePan=true;controls.autoRotateSpeed=.25;
  const ambient=new T.HemisphereLight('#f7f4e9','#93a292',2.7);scene.add(ambient);
  const sun=new T.DirectionalLight('#fff2da',3.5);sun.position.set(-15,28,12);sun.castShadow=true;
  sun.shadow.mapSize.set(2048,2048);sun.shadow.camera.left=-40;sun.shadow.camera.right=40;sun.shadow.camera.top=40;sun.shadow.camera.bottom=-40;
  sun.shadow.normalBias=.04;sun.shadow.bias=-.0003;scene.add(sun);
  const fill=new T.DirectionalLight('#c0d8ed',1);fill.position.set(15,12,-10);scene.add(fill);
  const materials=new Map<string,T.MeshStandardMaterial>();
  const geometries=new Map<string,T.BufferGeometry>();
  const material=(color:string,metalness=0)=>{
   const key=color+metalness;let m=materials.get(key);if(!m){m=new T.MeshStandardMaterial({color,roughness:metalness?.38:.78,metalness});materials.set(key,m);}return m;
  };
  const box=(parent:T.Object3D,x:number,y:number,z:number,w:number,h:number,d:number,color:string,metalness=0)=>{
   const key=[w,h,d].join(':');let g=geometries.get(key);if(!g){g=new T.BoxGeometry(w,h,d);geometries.set(key,g);}
   const m=new T.Mesh(g,material(color,metalness));m.position.set(x,y,z);m.castShadow=true;m.receiveShadow=true;parent.add(m);return m;
  };
  const cylinder=(parent:T.Object3D,x:number,y:number,z:number,r:number,h:number,color:string,rt?:number)=>{
   const key=`c:${r}:${rt??r}:${h}`;let g=geometries.get(key);if(!g){g=new T.CylinderGeometry(rt??r,r,h,12);geometries.set(key,g);}
   const m=new T.Mesh(g,material(color));m.position.set(x,y,z);m.castShadow=true;m.receiveShadow=true;parent.add(m);return m;
  };
  const foliage=(parent:T.Object3D,x:number,z:number,scale=1)=>{
   cylinder(parent,x,.55*scale,z,.09*scale,1.1*scale,palette.wood);
   cylinder(parent,x,1.1*scale,z,.53*scale,1.0*scale,palette.leaf,.31*scale);
   cylinder(parent,x,1.6*scale,z,.37*scale,.65*scale,'#81967b',.12*scale);
   box(parent,x,.13,z,.7*scale,.26,.7*scale,'#b6b4a4');
  };
  const shelf=(parent:T.Object3D,x:number,z:number,rotate=0)=>{
   const g=new T.Group();g.position.set(x,0,z);g.rotation.y=rotate;parent.add(g);
   for(const xx of [-.95,.95])for(const zz of [-.35,.35])box(g,xx,.9,zz,.06,1.8,.06,palette.dark);
   for(let row=0;row<3;row++){
    box(g,0,.3+row*.55,0,2,.06,.85,palette.metal,.3);
    for(let col=0;col<3;col++)box(g,(col-1)*.62,.51+row*.55,0,.48,.36,.6,['#b99b73','#d2b58a','#b9c1a0'][(row+col)%3]!);
   }
  };
  const table=(parent:T.Object3D,x:number,z:number)=>{
   cylinder(parent,x,.56,z,.055,1.05,palette.dark);
   cylinder(parent,x,1.08,z,.6,.1,'#c9aa84');
   for(const angle of [0,Math.PI/2,Math.PI,Math.PI*1.5]){
    const xx=x+Math.cos(angle)*.85,zz=z+Math.sin(angle)*.85;
    cylinder(parent,xx,.53,zz,.22,.09,'#909e88');
    box(parent,xx,.28,zz,.06,.5,.06,palette.dark);
   }
   cylinder(parent,x+.1,1.18,z,.06,.13,'#f7f5ea');
  };
  const picks:T.Object3D[]=[];const focusFloors:{mesh:T.Mesh;id:string;base:string}[]=[];
  const life=createLife();
  const makeHouse=(parent:T.Object3D,accent:string,detailed:boolean,houseId:string,houseName:string)=>{
   box(parent,0,-.24,0,15,.5,11.2,palette.dark);
   box(parent,0,.04,0,14.7,.12,10.9,'#dddcd0');
   // Low front edge and tall back wall produce an architectural cutaway.
   box(parent,0,1.2,-5.2,14.7,2.4,.18,palette.wall);
   box(parent,-7.25,1.2,0,.18,2.4,10.5,palette.wall);
   box(parent,7.25,.65,0,.18,1.3,10.5,palette.wall);
   box(parent,0,.23,5.2,14.7,.46,.18,palette.wall);
   box(parent,0,2.44,-5.2,14.85,.12,.25,accent);
   box(parent,-7.25,2.44,0,.25,.12,10.5,accent);
   const areas:[Zone,number,number,number,number,string][]=[
    ['estoque',-5,-2.5,4.1,4.7,'#d6c8ae'],['frio',-1.3,-2.5,3.1,4.7,'#bbd2d3'],
    ['cozinha',3.55,-2.5,6.1,4.7,'#d6d8ce'],['recebimento',-5,2.5,4.1,4.7,'#c8bca6'],
    ['salao',.1,2.5,5.8,4.7,'#e2d9c7'],['bar',5.2,2.5,3.9,4.7,'#c7cdb9']
   ];
   for(const [id,x,z,w,d,color] of areas){
    const floor=box(parent,x,.13,z,w,.04,d,color);floor.material=material(color).clone();
    if(detailed){floor.userData.node=id;picks.push(floor);focusFloors.push({mesh:floor,id,base:color});}
   }
   // Grouted floor and internal partitions.
   for(let x=-6.5;x<7;x+=.85)box(parent,x,.156,0,.012,.008,10,'#c4c7bb');
   for(let z=-4.5;z<5;z+=.85)box(parent,0,.157,z,14,.008,.012,'#c4c7bb');
   box(parent,-2.85,.65,-2.55,.13,1.15,4.8,palette.wall);
   box(parent,.45,.65,-3.5,.13,1.15,3,palette.wall);
   box(parent,-5,.65,0,4.2,1.15,.12,palette.wall);
   shelf(parent,-5.4,-3.9);shelf(parent,-5.4,-1.6);
   // Walk-in cold storage doors and stocked interior.
   for(let i=0;i<2;i++){
    box(parent,-1.35,1.13,-4.1+i*1.4,2.1,1.8,.9,'#d6e5e1',.4);
    box(parent,-1.35,1.12,-3.63+i*1.4,1.9,1.5,.04,'#b3cac9',.25);
    box(parent,-.65,1.12,-3.58+i*1.4,.045,.45,.045,'#526f72',.5);
    box(parent,-1.6,1.64,-3.57+i*1.4,.4,.12,.025,'#759ca0');
   }
   // Kitchen: pass, ovens, extractor, prep island, pots and chopping boards.
   box(parent,3.8,.65,-4.4,5.5,1,1,palette.metal,.45);
   box(parent,3.8,1.18,-4.4,5.6,.12,1.1,'#d1d9d2',.55);
   for(let j=0;j<5;j++){
    cylinder(parent,1.8+j,1.27,-4.4,.22,.06,palette.dark);
    if(j%2===0)cylinder(parent,1.8+j,1.42,-4.4,.19,.25,'#c0c9c4');
   }
   box(parent,3.7,2.45,-4.4,5.8,.35,1.25,'#a6b6ae',.45);
   box(parent,3.7,2.8,-4.6,1.4,.5,.7,palette.wall);
   box(parent,3.55,.65,-1.65,4.6,1,1.4,palette.metal,.4);
   box(parent,3.55,1.19,-1.65,4.7,.1,1.5,'#d1d9d2',.4);
   box(parent,2.2,1.27,-1.65,.75,.055,.6,palette.wood);
   cylinder(parent,4.4,1.34,-1.65,.25,.22,'#e5ddd0');

   // Dining room and bar.
   table(parent,-1,1.6);table(parent,1.5,1.6);table(parent,-1,4);table(parent,1.5,4);
   box(parent,6.2,.7,2.5,.85,1.2,4,'#547364');box(parent,6.2,1.35,2.5,1.2,.14,4.3,'#d7d1bf');
   for(let j=0;j<5;j++){
    cylinder(parent,6.25,1.58,.9+j*.7,.07,.3,j%2?'#a88453':'#647d53');
    if(j%2===0){cylinder(parent,4.8,.55,.9+j*.7,.23,.12,palette.wood);cylinder(parent,4.8,.28,.9+j*.7,.04,.5,palette.dark);}
   }
   // Receiving pallets, cases and hand truck.
   box(parent,-5.3,.28,2.2,1.8,.24,1.3,palette.wood);
   for(let j=0;j<4;j++)box(parent,-5.7+(j%2)*.75,.65,1.9+Math.floor(j/2)*.6,.67,.5,.52,'#b79d76');
   box(parent,-5.3,1.06,2.1,1.45,.3,.95,'#d1b88c');
   box(parent,-3.8,.35,4,.6,.2,1,palette.orange);
   box(parent,-3.8,.88,4.35,.5,1,.06,palette.dark);

   // Facade canopy, entry garden and terrace.
   box(parent,-4.4,2.45,5.8,3.2,.12,1.1,accent);
   for(const x of [-5.9,-2.9])box(parent,x,1.25,6.15,.08,2.5,.08,palette.dark);
   foliage(parent,-6,6.25,.8);foliage(parent,6,6.2,.8);
   life.restaurant(parent,houseId,houseName,accent);
   life.dock(parent,-6.3,3,0);
   return parent;
  };
  const world=new T.Group();scene.add(world);
  const plane=box(world,0,-.7,0,groupView?62:22,.35,groupView?48:18,'#d9ddd0');
  plane.receiveShadow=true;
  // A floating base gives the model a crafted, physical quality.
  box(world,0,-1.02,0,groupView?62:22,.3,groupView?48:18,'#adb7a9');
  const nextAnchors:Anchor[]=[];
  const networkWorld=groupView?buildNetwork({world,houses:props.houses,network:props.network,basis:props.basis,makeHouse,picks,life}):null;
  if(networkWorld){
   nextAnchors.push(...networkWorld.anchors);
  }else{
   makeHouse(world,houseColors[Math.max(0,props.houses.findIndex(h=>h.id===props.house?.id))%4]!,true,props.house!.id,props.house!.name);
   for(let i=0;i<5;i++)foliage(world,-9.4,-6.4+i*3,1.05);
   for(let i=0;i<4;i++)foliage(world,9.3,-5.8+i*3.7,.95);
   box(world,0,-.48,7.55,21,.06,2,'#b4bdb2');
   for(let x=-9;x<=9;x+=1.8)box(world,x,-.44,7.55,.75,.018,.05,'#f0ecdf');
   zones.forEach(zone=>nextAnchors.push({id:zone.id,name:zone.name,point:new T.Vector3(zone.x,.65,zone.z),detail:zone.subtitle}));
  }
  setAnchors(nextAnchors);
  // Paths illustrate the chain; positions and vehicles are not telemetry.
  const flows=new T.Group();world.add(flows);
  const pathPoints=groupView?[[-9,0,-7],[-9,0,0],[9,0,0],[9,0,7]]:[[-5,.3,3],[-5,.3,-2.4],[-1,.3,-2.4],[3,.3,-2.4],[3,.3,2.4]];
  const curve=new T.CatmullRomCurve3(pathPoints.map(v=>new T.Vector3(v[0]!,v[1]!+.4,v[2]!)),false,'catmullrom',.1);
  const tubeGeometry=new T.TubeGeometry(curve,60,.025,6,false);const tube=new T.Mesh(tubeGeometry,material('#e17c52'));flows.add(tube);
  const dots:T.Mesh[]=[];
  const dotGeometry=new T.SphereGeometry(.07,8,8);
  for(let i=0;i<10;i++){const dot=new T.Mesh(dotGeometry,new T.MeshBasicMaterial({color:'#f69b70'}));dots.push(dot);flows.add(dot);}
  const truck=new T.Group();world.add(truck);
  box(truck,0,.28,0,.78,.15,1.55,palette.dark);box(truck,0,.75,.15,.85,.85,1.1,'#f2f0e2');
  box(truck,0,.61,-.7,.83,.62,.55,'#628573');box(truck,0,.73,-.99,.63,.25,.015,'#a6c9cd');
  for(const x of [-.43,.43])for(const z of [-.6,.55]){const w=cylinder(truck,x,.27,z,.17,.12,'#3a4542');w.rotation.z=Math.PI/2;}
  const ray=new T.Raycaster();const pointer=new T.Vector2();let down={x:0,y:0};
  const onDown=(e:PointerEvent)=>{down={x:e.clientX,y:e.clientY};};
  const pick=(e:PointerEvent)=>{
   if(Math.hypot(e.clientX-down.x,e.clientY-down.y)>5)return;
   const bounds=renderer.domElement.getBoundingClientRect();pointer.set((e.clientX-bounds.left)/bounds.width*2-1,-(e.clientY-bounds.top)/bounds.height*2+1);
   ray.setFromCamera(pointer,camera);const hit=ray.intersectObjects(picks,false)[0];if(hit)current.current.onSelect(hit.object.userData.node);
  };
  renderer.domElement.addEventListener('pointerdown',onDown);renderer.domElement.addEventListener('pointerup',pick);
  const direction=start.clone().normalize();
  const right=new T.Vector3().crossVectors(new T.Vector3(0,1,0),direction).normalize();
  const up=new T.Vector3().crossVectors(direction,right).normalize();
  let fitDistance=40;
  const resize=()=>{
   const w=root.clientWidth,h=root.clientHeight;renderer.setSize(w,h);camera.aspect=w/h;camera.updateProjectionMatrix();
   const tan=Math.tan(T.MathUtils.degToRad(camera.fov/2));let distance=0;
   // Fit the whole diorama at both wide and portrait viewport ratios.
   for(const x of [-1,1])for(const y of [-1,4])for(const z of [-1,1]){
    const corner=new T.Vector3(x*(groupView?31:11),y,z*(groupView?24:9));
    distance=Math.max(distance,Math.max(Math.abs(corner.dot(right))/(tan*camera.aspect),Math.abs(corner.dot(up))/tan)+corner.dot(direction));
   }
   fitDistance=distance*1.06;start.copy(direction).multiplyScalar(fitDistance);camera.position.copy(start);controls.target.set(0,0,0);
   controls.minDistance=distance*.28;controls.maxDistance=distance*1.9;controls.update();
  };
  const observer=new ResizeObserver(resize);observer.observe(root);resize();
  let frame=0,elapsed=0,last=0;const projected=new T.Vector3();
  let resetting=false,lastFocus:Zone|null=null,lastFacility:string|null=null;
  const desiredTarget=new T.Vector3(),desiredPosition=start.clone();
  api.current={reset:()=>{desiredTarget.set(0,0,0);desiredPosition.copy(start);resetting=true;},zoom:(direction)=>{resetting=false;camera.position.sub(controls.target).multiplyScalar(direction>0?.85:1.18).add(controls.target);controls.update();}};
  controls.addEventListener('start',()=>{resetting=false;});
  const motion=window.matchMedia('(prefers-reduced-motion: reduce)');
  const render=(time:number)=>{
   frame=requestAnimationFrame(render);
   const delta=last?Math.min(time-last,50):0;last=time;
   const p=current.current;
   if(p.animate&&!motion.matches)elapsed+=delta/1000*p.speed;
   if(groupView&&p.facility!==lastFacility){
    lastFacility=p.facility;const anchor=nextAnchors.find(a=>a.id===p.facility);
    desiredTarget.set(anchor?.point.x??0,0,anchor?.point.z??0);
    desiredPosition.copy(direction).multiplyScalar(fitDistance*(anchor?(p.facility==='factory'?.6:.45):1)).add(desiredTarget);resetting=true;
   }
   if(!groupView&&p.zone!==lastFocus){
    lastFocus=p.zone;const focus=zones.find(z=>z.id===p.zone);
    desiredTarget.set(focus?.x??0,0,focus?.z??0);
    desiredPosition.copy(direction).multiplyScalar(fitDistance*(focus?.48:1)).add(desiredTarget);resetting=true;
   }
   if(resetting){camera.position.lerp(desiredPosition,motion.matches?1:.085);controls.target.lerp(desiredTarget,motion.matches?1:.085);if(camera.position.distanceTo(desiredPosition)<.03)resetting=false;}
   ambient.intensity=p.night?.65:2.2;sun.intensity=p.night?.35:3.1;fill.intensity=p.night?1.25:.8;
   renderer.toneMappingExposure=p.night?1:1.1;
   flows.visible=!groupView&&p.layer==='fluxo';truck.visible=!groupView&&p.layer==='fluxo';
   life.update(elapsed,p.weekday,p.activity,p.night);
   networkWorld?.update(elapsed,p.routeMode,p.facility,p.layer==='fluxo',p.basis);
   truck.position.set(groupView?-15+(elapsed*.8)%30:-9+(elapsed*.7)%18,groupView?-.4:0,groupView?0:7.5);truck.rotation.y=-Math.PI/2;
   dots.forEach((dot,i)=>dot.position.copy(curve.getPoint((elapsed*.065+i/10)%1)));
   for(const entry of focusFloors){const mat=entry.mesh.material as T.MeshStandardMaterial;mat.color.set(entry.id===p.zone?'#f4b585':p.layer==='estoque'&&['estoque','frio'].includes(entry.id)?'#98b9a0':entry.base);}
   controls.update();renderer.render(scene,camera);
   for(const anchor of nextAnchors){
    const el=labels.current[anchor.id];if(!el)continue;
    projected.copy(anchor.point).project(camera);
    el.style.left=`${(projected.x*.5+.5)*root.clientWidth}px`;el.style.top=`${(-projected.y*.5+.5)*root.clientHeight}px`;
    el.style.opacity=projected.z<1?'1':'0';el.style.pointerEvents=projected.z<1?'auto':'none';
   }
  };
  frame=requestAnimationFrame(render);
  return ()=>{
   cancelAnimationFrame(frame);observer.disconnect();controls.dispose();api.current=null;
   renderer.domElement.removeEventListener('pointerdown',onDown);renderer.domElement.removeEventListener('pointerup',pick);
   scene.traverse(o=>{if(o instanceof T.Mesh){o.geometry.dispose();const mats=Array.isArray(o.material)?o.material:[o.material];mats.forEach(m=>m.dispose());}});
   networkWorld?.dispose();life.dispose();renderer.dispose();renderer.domElement.remove();
  };
 // Models rebuild only when entering/leaving a house. Controls use the current prop ref.
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[props.house?.id]);
 return <div className="atlas-world" ref={mount}>
  {failed&&<div className="atlas-webgl-error">A visualização 3D requer WebGL. As casas, áreas e dados continuam acessíveis pelos painéis.</div>}
  <div className={`atlas-labels ${!props.showLabels?'atlas-labels-quiet':''}`}>{anchors.map(a=><button key={a.id} ref={e=>{labels.current[a.id]=e;}} className={`atlas-pin ${props.zone===a.id||props.facility===a.id?'selected':''} ${!props.house?'house':''}`} onClick={()=>props.onSelect(a.id)} aria-label={`Explorar ${a.name}`}><span className="pin-dot"/><span>{a.name}{!props.house&&<small>{props.houses.some(h=>h.id===a.id)&&props.basis!=='equal'?`${num((houseShare(props.network,a.id,props.basis)??0)*100)}% · ${props.basis==='revenue'?'receita bruta':'itens vendidos'}`:a.detail}</small>}</span><span className="pin-arrow">↗</span></button>)}</div>
 </div>;
}
