import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';

const viewport=document.querySelector('#viewport');
const scene=new THREE.Scene();scene.background=new THREE.Color('#cce0d4');scene.fog=new THREE.Fog('#cce0d4',22,43);
const camera=new THREE.OrthographicCamera(-12,12,8,-8,.1,100);camera.position.set(13,17,13);camera.lookAt(0,0,0);
const renderer=new THREE.WebGLRenderer({antialias:true,alpha:false});renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.15;viewport.prepend(renderer.domElement);
const hemi=new THREE.HemisphereLight('#f5ffdf','#8a9c70',2.15);scene.add(hemi);const sun=new THREE.DirectionalLight('#fff1c6',3.1);sun.position.set(-7,15,8);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);sun.shadow.camera.left=-19;sun.shadow.camera.right=19;sun.shadow.camera.top=19;sun.shadow.camera.bottom=-19;sun.shadow.bias=-.0003;scene.add(sun);
const mat=(color,roughness=1)=>new THREE.MeshStandardMaterial({color,roughness,flatShading:true});
const mats={grass:[mat('#8fb979'),mat('#93bd7a'),mat('#87b271'),mat('#98c17d')],darkGrass:mat('#6a9c61'),dirt:mat('#9a7049'),wetDirt:mat('#715643'),path:mat('#c4aa78'),wood:mat('#a76d49'),woodDark:mat('#76513d'),cream:mat('#f2e6c6'),red:mat('#bd6655'),roof:mat('#995b4c'),leaf:[mat('#6f9e63'),mat('#8fb576'),mat('#5d8959')],trunk:mat('#805d42'),flower:mat('#f2cf66'),white:mat('#f5edcf'),water:mat('#9dcee0')};
const boxGeo=new THREE.BoxGeometry(1,1,1);
function cube(x,y,z,sx,sy,sz,material,parent=scene){const o=new THREE.Mesh(new THREE.BoxGeometry(sx,sy,sz),material);o.position.set(x,y,z);o.castShadow=true;o.receiveShadow=true;parent.add(o);return o}
function sphere(x,y,z,r,material,parent=scene,detail=1){const o=new THREE.Mesh(new THREE.IcosahedronGeometry(r,detail),material);o.position.set(x,y,z);o.castShadow=true;parent.add(o);return o}
function group(x=0,y=0,z=0){const g=new THREE.Group();g.position.set(x,y,z);scene.add(g);return g}
// Soft rolling meadow, checkerboard variation and winding footpaths.
cube(0,-.34,0,29,.55,29,mats.darkGrass);
for(let x=-13;x<=13;x++)for(let z=-13;z<=13;z++){let m=mats.grass[Math.abs((x*13+z*7)%4)];const groundTile=cube(x,-.045,z,.99,.12,.99,m);groundTile.castShadow=false}
// A little pond and stepping stones at the far meadow edge.
const pond=new THREE.Mesh(new THREE.CircleGeometry(2.1,24),mats.water);pond.rotation.x=-Math.PI/2;pond.position.set(8,-.012,-7);pond.scale.set(1.35,.8,1);pond.receiveShadow=true;scene.add(pond);
for(let i=0;i<8;i++){let a=i/8*Math.PI*2;sphere(8+Math.cos(a)*2.8,.1,-7+Math.sin(a)*1.8,.33,mats.leaf[i%3],scene,0)}
// Path tiles
for(let i=0;i<7;i++)cube(-3.7,-.0,1.3-i,.96,.08,.96,mats.path);
for(let i=0;i<5;i++)cube(-4+i,-.0,1.3,.96,.08,.96,mats.path);
// Cottage: handcrafted cottage, chimney, windows and door.
const house=group(-5.3,0,-4.2);
cube(0,.84,0,4.2,1.7,3.3,mats.cream,house);cube(0,1.86,0,4.75,.28,3.8,mats.woodDark,house);
const roofL=cube(0,2.4,.95,4.8,1.15,2.3,mats.roof,house);roofL.rotation.x=.58;
const roofR=cube(0,2.4,-.95,4.8,1.15,2.3,mats.roof,house);roofR.rotation.x=-.58;
cube(0,2.05,0,4.9,.18,.22,mats.woodDark,house);cube(-1.3,.68,1.68,.78,1.35,.16,mats.woodDark,house);cube(-1.3,.68,1.78,.57,1.15,.07,mats.wood,house);
for(const x of [-.25,1.25]){cube(x,1.08,1.69,.67,.67,.14,mat('#a9d2c4'),house);cube(x,1.08,1.78,.09,.75,.05,mats.white,house);cube(x,1.08,1.78,.75,.09,.05,mats.white,house)}
cube(1.55,2.32,-.7,.45,1.5,.45,mats.woodDark,house);cube(1.55,3.13,-.7,.65,.16,.65,mats.red,house);
// Farm sign
cube(-3.4,.46,-1.2,.22,.9,.22,mats.woodDark);cube(-3.4,1,-1.2,1.55,.55,.16,mats.wood); // front board toward camera
// Market stand + cheerful striped awning and seed sacks
const stall=group(3.9,0,-1.6);cube(0,.62,0,2.1,1.15,1.35,mats.wood,stall);cube(0,1.3,0,2.45,.18,1.65,mats.woodDark,stall);
for(let i=0;i<5;i++){cube(-.95+i*.48,1.65,0,.49,.58,1.78,i%2?mats.cream:mats.red,stall)}
for(const x of [-.85,.85])cube(x,1.33,-.55,.12,1.1,.12,mats.woodDark,stall);
const sack=mat('#d7ba79');sphere(-.5,.55,.78,.26,sack,stall,1);sphere(.35,.52,.79,.27,sack,stall,1);
// Gardens, fence, flowers and trees
const plotTiles=new Map();const key=(x,z)=>`${x},${z}`;
for(let x=-3;x<=0;x++)for(let z=1;z<=4;z++){const tile=cube(x,.035,z,.87,.13,.87,mats.grass[0]);tile.userData={x,z};plotTiles.set(key(x,z),{x,z,state:'grass',watered:false,days:0,crop:null,mesh:tile})}
// Fence around yard, with opening on south
for(let x=-8;x<=4;x++){if(x===-3||x===-2||x===-1)continue;cube(x,.38,5.4,.87,.65,.12,mats.cream)}
for(let z=-2;z<=5;z++){cube(-8.4,.38,z,.12,.65,.87,mats.cream);cube(4.4,.38,z,.12,.65,.87,mats.cream)}
// Trees built from chunky low-poly crowns.
function tree(x,z,size=1){const g=group(x,0,z);cube(0,.55*size,0,.35*size,1.2*size,.35*size,mats.trunk,g);sphere(0,1.55*size,0,.93*size,mats.leaf[0],g,1);sphere(-.42*size,1.35*size,.22*size,.68*size,mats.leaf[1],g,1);sphere(.43*size,1.4*size,-.08*size,.68*size,mats.leaf[2],g,1);return g}
[[-9,-5,1.3],[-9,2,1.15],[6,-4,1.25],[8,2,1.35],[3,8,1.1],[-7,8,1.1],[11,-1,1.1]].forEach(a=>tree(...a));
for(let i=0;i<45;i++){let x=((i*37)%25)-12,z=((i*23)%25)-12;if(Math.abs(x)<5&&z>-1&&z<6)continue;if((x+z)%3===0){const f=sphere(x,.13,z,.12,mats.flower,scene,0);f.scale.y=1.2}}
// Player character, composed of simple friendly toy-like shapes.
const player=group(-2,0,0);const skin=mat('#e6ad7c'),shirt=mat('#668b61'),pants=mat('#536b73'),hair=mat('#624b3e');
cube(0,.72,0,.57,.72,.44,shirt,player);cube(0,.22,0,.52,.32,.43,pants,player);sphere(0,1.32,0,.42,skin,player,1);sphere(0,1.57,-.04,.43,hair,player,1);cube(.19,1.3,.35,.08,.1,.04,mat('#59463d'),player);cube(-.19,1.3,.35,.08,.1,.04,mat('#59463d'),player);
for(const x of [-.17,.17])cube(x,.08,.04,.2,.17,.4,mats.woodDark,player);
// Character ground marker
const marker=new THREE.Mesh(new THREE.CircleGeometry(.56,24),new THREE.MeshBasicMaterial({color:'#fff4bb',transparent:true,opacity:.38,depthWrite:false}));marker.rotation.x=-Math.PI/2;marker.position.y=.025;player.add(marker);marker.position.y=.025;
// Interactive world labels
function label(text,x,y,z){const c=document.createElement('canvas');c.width=512;c.height=100;const ctx=c.getContext('2d');ctx.fillStyle='#fff9e9';ctx.beginPath();ctx.roundRect(15,9,482,78,25);ctx.fill();ctx.strokeStyle='#ffffff';ctx.lineWidth=6;ctx.stroke();ctx.fillStyle='#53634e';ctx.font='bold 34px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(text,256,50);const tex=new THREE.CanvasTexture(c);const sprite=new THREE.Sprite(new THREE.SpriteMaterial({map:tex,transparent:true,depthTest:false}));sprite.scale.set(2.7,.53,1);sprite.position.set(x,y,z);scene.add(sprite);return sprite}
label('✿  YOUR COTTAGE',-5.3,3.5,-4.3);label('SEED SHOP',3.9,2.65,-1.6);label('TURNIP PATCH',-1.6,1.65,2.5);
// Crop visual helpers
const cropObjects=new Map();
function refreshTile(t){t.mesh.material=t.state==='grass'?mats.grass[0]:t.watered?mats.wetDirt:mats.dirt;t.mesh.scale.y=1;t.mesh.position.y=.035;
 if(cropObjects.has(key(t.x,t.z))){scene.remove(cropObjects.get(key(t.x,t.z)));cropObjects.delete(key(t.x,t.z))}
 if(t.crop){let g=group(t.x,0,t.z);cropObjects.set(key(t.x,t.z),g);let stage=t.days>=2?2:t.days>=1?1:0;let stem=mat('#528450'),leaf=mat(stage===2?'#76a94d':'#83b767'),root=mat('#e6b951');cube(0,.22+stage*.08,0,.11,.45+stage*.15,.11,stem,g);
 for(let s of [-1,1]){let l=sphere(s*.2,.36+stage*.1,.02,.22+stage*.05,leaf,g,1);l.scale.set(1.3,.6,.7);l.rotation.z=s*.35}
 if(stage===2){sphere(0,.37,.11,.22,root,g,1);for(let s of [-1,1]){let l=sphere(s*.21,.48,.06,.2,leaf,g,1);l.scale.set(1.4,.55,.65)}}
 }
}
function resize(){const w=viewport.clientWidth,h=viewport.clientHeight;renderer.setSize(w,h,false);let aspect=w/h;const view=12.4;camera.left=-view*aspect/2;camera.right=view*aspect/2;camera.top=view/2;camera.bottom=-view/2;camera.updateProjectionMatrix()}
window.addEventListener('resize',resize);resize();

const state={day:1,gold:120,energy:100,seeds:8,crops:0,tool:'hoe',hours:6,minutes:0,gameStarted:false,toastTimer:null};
const $=s=>document.querySelector(s);
function setToast(text){const el=$('#toast');el.textContent=text;el.classList.add('show');clearTimeout(state.toastTimer);state.toastTimer=setTimeout(()=>el.classList.remove('show'),2100)}
function updateUI(){ $('#seasonDay').textContent=`Spring · Day ${state.day}`;$('#clock').textContent=`${((Math.floor(state.hours)+11)%12)+1}:${String(Math.floor(state.minutes/10)*10).padStart(2,'0')} ${state.hours>=12?'PM':'AM'}`;$('#gold').textContent=state.gold;$('#seedCount').textContent=state.seeds;$('#cropCount').textContent=state.crops;$('#energyText').textContent=`${state.energy} / 100`;$('#energyBar').style.width=`${state.energy}%`;$('#weather').textContent=state.day%4===0?'Cloudy with a chance of rain':'A sunny day';}
function energy(cost){if(state.energy<cost){setToast('You are worn out. Take a little rest!');return false}state.energy-=cost;updateUI();return true}
function useTool(){const px=player.position.x,pz=player.position.z;let nearest=null,dist=2.15;for(const t of plotTiles.values()){const d=Math.hypot(t.x-px,t.z-pz);if(d<dist){dist=d;nearest=t}}
 if(!nearest){setToast('Move closer to a garden patch first.');return}
 const t=nearest;
 if(state.tool==='hoe'){if(t.state!=='grass'){setToast('That soil is already turned.');return}if(!energy(3))return;t.state='tilled';refreshTile(t);setToast('Soft soil, ready for planting!')}
 else if(state.tool==='seeds'){if(t.state==='grass'){setToast('Turn the soil with your hoe first.');return}if(t.crop){setToast('Something is already growing there.');return}if(state.seeds<1){setToast('No seeds left. Visit the seed shop!');return}if(!energy(1))return;state.seeds--;t.crop=true;t.days=0;t.watered=false;refreshTile(t);updateUI();setToast('A turnip seed tucked in. Give it a drink!')}
 else if(state.tool==='water'){if(t.state==='grass'){setToast('There is nothing to water here.');return}if(!t.crop){setToast('Plant a seed here before watering.');return}if(t.watered){setToast('This little seed is already watered today.');return}if(!energy(1))return;t.watered=true;refreshTile(t);setToast('A refreshing drink for your turnip!')}
 else if(state.tool==='harvest'){if(!t.crop||t.days<2){setToast('Not quite ready yet. Give it a couple of mornings!');return}if(!energy(1))return;t.crop=false;t.days=0;t.watered=false;t.state='tilled';state.crops++;refreshTile(t);updateUI();setToast('A lovely turnip! Take it to market to sell.')}
}
function nearbyHouse(){return Math.hypot(player.position.x+5.3,player.position.z+4.2)<2.7}
function nearbyStall(){return Math.hypot(player.position.x-3.9,player.position.z+1.6)<2.2}
function interact(){if(nearbyHouse()){sleep();return}if(nearbyStall()){if(state.crops>0){const earned=state.crops*35;state.gold+=earned;setToast(`Sold ${state.crops} turnip${state.crops===1?'':'s'} for ${earned}g!`);state.crops=0;updateUI()}else if(state.gold>=10){state.gold-=10;state.seeds+=5;updateUI();setToast('Bought 5 turnip seeds for 10g!')}else setToast('Five seeds cost 10g. Come back with a little more gold!');return}setToast('Nothing to do here just yet. Explore your farm!')}
function sleep(){state.day++;state.hours=6;state.minutes=0;state.energy=100;for(const t of plotTiles.values()){if(t.crop&&t.watered)t.days++;t.watered=false;refreshTile(t)}updateUI();setToast(`Good morning! Spring, day ${state.day}. Your watered crops have grown.`)}

// Keyboard and touch-friendly controls.
const keys=new Set();window.addEventListener('keydown',e=>{if(['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code))e.preventDefault();if(e.repeat)return;keys.add(e.code);if(e.code==='Space'){useTool()}if(e.code==='KeyE'){interact()}if(e.code==='KeyJ'){toggleJournal()}if(e.code==='Digit1')selectTool('hoe');if(e.code==='Digit2')selectTool('seeds');if(e.code==='Digit3')selectTool('water');if(e.code==='Digit4')selectTool('harvest');if(e.code==='KeyB'&&nearbyStall())interact()});window.addEventListener('keyup',e=>keys.delete(e.code));
function selectTool(tool){state.tool=tool;document.querySelectorAll('.tool').forEach(el=>el.classList.toggle('active',el.dataset.tool===tool));const names={hoe:'Hoe selected · Press SPACE near the garden',seeds:'Seeds selected · Press SPACE to plant',water:'Watering can selected · Press SPACE to water',harvest:'Basket selected · Press SPACE to harvest'};$('#sceneHint').innerHTML=`<span class="sparkle">✦</span> ${names[tool]}`}
document.querySelectorAll('.tool').forEach(el=>el.addEventListener('click',()=>selectTool(el.dataset.tool)));
function toggleJournal(){if(!state.gameStarted)return;$('#modalBackdrop').classList.toggle('open');$('#welcomeModal').style.display='none';$('#journalModal').style.display='block'}
$('#journalBtn').addEventListener('click',toggleJournal);$('#closeJournal').addEventListener('click',()=>$('#modalBackdrop').classList.remove('open'));$('#modalBackdrop').addEventListener('click',e=>{if(e.target===$('#modalBackdrop'))$('#modalBackdrop').classList.remove('open')});$('#startGame').addEventListener('click',()=>{state.gameStarted=true;$('#modalBackdrop').classList.remove('open');$('#welcomeModal').style.display='none';$('#journalModal').style.display='block';setToast('Your farm is waiting. Have a lovely first day!')});
// Add big thumb controls on phones and tablets.
const touch=document.createElement('div');touch.className='touch-controls';touch.innerHTML='<div class="dpad"><button data-dir="up">▲</button><button data-dir="left">◀</button><button data-dir="down">▼</button><button data-dir="right">▶</button></div><div class="touch-actions"><button data-act="use">USE</button><button data-act="interact">E</button></div>';viewport.append(touch);
touch.querySelectorAll('[data-dir]').forEach(b=>{const code={up:'KeyW',down:'KeyS',left:'KeyA',right:'KeyD'}[b.dataset.dir];b.addEventListener('pointerdown',e=>{e.preventDefault();keys.add(code);b.setPointerCapture(e.pointerId)});['pointerup','pointercancel','lostpointercapture'].forEach(ev=>b.addEventListener(ev,()=>keys.delete(code)))});touch.querySelector('[data-act="use"]').addEventListener('pointerdown',e=>{e.preventDefault();useTool()});touch.querySelector('[data-act="interact"]').addEventListener('pointerdown',e=>{e.preventDefault();interact()});

// Gentle camera follow and toy-like movement.
const clock=new THREE.Clock();let walkTime=0;function animate(){requestAnimationFrame(animate);const dt=Math.min(clock.getDelta(),.05);let dx=0,dz=0;if(keys.has('KeyW')||keys.has('ArrowUp'))dz-=1;if(keys.has('KeyS')||keys.has('ArrowDown'))dz+=1;if(keys.has('KeyA')||keys.has('ArrowLeft'))dx-=1;if(keys.has('KeyD')||keys.has('ArrowRight'))dx+=1;let moving=dx||dz;if(moving){const len=Math.hypot(dx,dz);dx/=len;dz/=len;let speed=3.1;player.position.x=THREE.MathUtils.clamp(player.position.x+dx*speed*dt,-11.8,11.8);player.position.z=THREE.MathUtils.clamp(player.position.z+dz*speed*dt,-11.8,11.8);player.rotation.y=Math.atan2(dx,dz);walkTime+=dt*10;player.position.y=Math.abs(Math.sin(walkTime))*.045;state.minutes+=dt*1.65;if(state.minutes>=60){state.hours++;state.minutes=0;if(state.hours>=24){sleep()}}updateUI()}else player.position.y=THREE.MathUtils.damp(player.position.y,0,10,dt);
 camera.position.x=THREE.MathUtils.damp(camera.position.x,player.position.x+13,1.1,dt);camera.position.z=THREE.MathUtils.damp(camera.position.z,player.position.z+13,1.1,dt);camera.lookAt(player.position.x,0,player.position.z);
 renderer.render(scene,camera)}
updateUI();animate();window.addEventListener('load',()=>setTimeout(()=>$('#loading').classList.add('done'),500));
