const stage=document.querySelector('#stage'),status=document.querySelector('#status');
const clamp=(v,a,b)=>Math.min(b,Math.max(a,v));
const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
const particles=new BackgroundParticles(document.querySelector('#particles'),reduced);
let renderer,camera,scene,tiltRig,flipRig,front,back,textures,ready=false;
let layerTextures;
const layerNames=['count','title','decor','logo','date'];
const layerStrength={count:.085,title:.09,decor:.045,logo:.15,date:.115};
const layerBounds=[[
 {x:1303,y:150,w:466,h:230},{x:1085,y:3352,w:901,h:549},{x:0,y:0,w:3072,h:4096},{x:715,y:1315,w:1643,h:1397},{x:1353,y:665,w:366,h:366}
],[
 {x:1276,y:142,w:510,h:244},{x:993,y:3296,w:1085,h:660},{x:0,y:0,w:3072,h:4096},{x:668,y:1235,w:1737,h:1477},{x:1343,y:664,w:386,h:205}
]];
function setFace(face,index){
 face.material.map=textures[index];face.userData.index=index;
 face.children.forEach((layer,i)=>{const b=layerBounds[index][i];layer.material.map=layerTextures[index][i];layer.scale.set(b.w/3072*2.1,b.h/4096*2.8,1);layer.userData.origin={x:((b.x+b.w/2)/3072-.5)*2.1,y:(.5-(b.y+b.h/2)/4096)*2.8};layer.position.set(layer.userData.origin.x,layer.userData.origin.y,layer.name==='title'?.014:.002*(i+1));});
}
let side=0,visibleSide=0,drag=null,tilt={x:0,y:0},smooth={x:0,y:0},turn=null,last=performance.now();
let sensorState='off',sensorTilt={x:0,y:0},sensorTimeout,noticeTimeout,requestId=0;
function message(text){clearTimeout(noticeTimeout);status.textContent=text;if(text)noticeTimeout=setTimeout(()=>status.textContent='',6500);}
function showSide(value){if(stage.dataset.side&&visibleSide===value)return;if(stage.dataset.side)particles.transition(value);visibleSide=value;stage.dataset.side=value?'back':'front';stage.setAttribute('aria-label',value?'SOFT BLOOM，点击翻回正面':'ROUGH ECHO，点击翻到反面');}
function renderSensorState(){stage.dataset.sensor=sensorState;}
function stopSensor(){clearTimeout(sensorTimeout);window.removeEventListener('deviceorientation',onOrientation);sensorState='off';sensorTilt={x:0,y:0};renderSensorState();}
function awaitSensor(){clearTimeout(sensorTimeout);sensorTilt={x:0,y:0};sensorState='waiting';renderSensorState();sensorTimeout=setTimeout(()=>{stopSensor();message('未收到姿态数据，请检查浏览器的运动与方向权限。');},5000);}
function onOrientation(e){
 if(document.hidden||!['waiting','active'].includes(sensorState)||!Number.isFinite(e.beta)||!Number.isFinite(e.gamma))return;
 if(sensorState!=='active'){clearTimeout(sensorTimeout);sensorState='active';renderSensorState();message('');}
 // Project gravity onto the screen: physical level stays neutral in every orientation.
 const rad=Math.PI/180,b=e.beta*rad,g=e.gamma*rad,a=(screen.orientation?.angle??window.orientation??0)*rad;
 const x=Math.sin(g),y=Math.sin(b);
 const response=v=>Math.abs(v)<.008?0:Math.sign(v)*(Math.abs(v)-.008)/.992;
 sensorTilt.y=clamp(response(x*Math.cos(a)+y*Math.sin(a))*1.05,-.55,.55);
 sensorTilt.x=clamp(response(y*Math.cos(a)-x*Math.sin(a))*.9,-.5,.5);
}
async function startSensor(fromGesture=false){
 if(!isSecureContext||!window.DeviceOrientationEvent)return;
 if(typeof DeviceOrientationEvent.requestPermission==='function'&&!fromGesture){sensorState='needs-gesture';renderSensorState();return;}
 const id=++requestId;sensorState='requesting';renderSensorState();
 try{const ask=DeviceOrientationEvent.requestPermission;const permission=typeof ask==='function'?await ask.call(DeviceOrientationEvent):'granted';if(id!==requestId)return;if(permission!=='granted'){stopSensor();return message('未获得体感权限，仍可拖动和点击卡片。');}awaitSensor();window.addEventListener('deviceorientation',onOrientation,{passive:true});}
 catch(e){if(id!==requestId)return;stopSensor();
  // Safari needs a user gesture before showing its native permission prompt.
  if(e.name==='NotAllowedError'){sensorState='needs-gesture';renderSensorState();return;}
  message('无法开启体感，仍可拖动和点击卡片。');
 }
}
// Request synchronously within a real gesture, including after a no-data timeout.
function requestSensorFromGesture(){if(['needs-gesture','off'].includes(sensorState))startSensor(true);}
stage.addEventListener('click',requestSensorFromGesture);
stage.addEventListener('touchend',requestSensorFromGesture,{passive:true});
if(navigator.maxTouchPoints>0||matchMedia('(pointer: coarse)').matches)startSensor();
window.addEventListener('orientationchange',()=>{if(sensorState==='active')awaitSensor();});
document.addEventListener('visibilitychange',()=>{if(document.hidden){drag=null;tilt={x:0,y:0};clearTimeout(sensorTimeout);}else if(sensorState==='active'||sensorState==='waiting')awaitSensor();});
function flip(axis='y',direction=1){
 if(!ready||turn)return;
 back.rotation.z=axis==='x'?Math.PI:0;
 // Continue from the rendered pose instead of unwinding tilt during the flip.
 turn={axis,direction,start:performance.now(),duration:reduced?1:520,from:side,x:smooth.x,y:smooth.y};tilt={x:0,y:0};
}
function boundsHit(x,y){if(!ready)return false;const r=renderer.domElement.getBoundingClientRect();const mouse=new THREE.Vector2((x-r.left)/r.width*2-1,-(y-r.top)/r.height*2+1);const ray=new THREE.Raycaster();ray.setFromCamera(mouse,camera);return ray.intersectObjects([front,back]).length>0;}
stage.addEventListener('pointerdown',e=>{if(e.button!==0||turn||!boundsHit(e.clientX,e.clientY))return;drag={id:e.pointerId,x:e.clientX,y:e.clientY,moved:0,flipped:false};stage.setPointerCapture(e.pointerId);});
stage.addEventListener('pointermove',e=>{
 if(drag&&drag.id===e.pointerId){
  if(drag.flipped)return;
  const dx=e.clientX-drag.x,dy=e.clientY-drag.y;drag.moved=Math.max(drag.moved,Math.hypot(dx,dy));const span=Math.min(innerWidth,innerHeight)*.32;
  tilt.y=clamp(dx/span,-1.1,1.1)*1.05;tilt.x=clamp(-dy/span,-1.1,1.1)*1.05;
  if(Math.max(Math.abs(tilt.x),Math.abs(tilt.y))>=.96){const axis=Math.abs(dx)>=Math.abs(dy)?'y':'x';drag.flipped=true;flip(axis,Math.sign(axis==='y'?dx:-dy)||1);}
 }else if(e.pointerType==='mouse'&&!turn&&!reduced){tilt.y=clamp((e.clientX-innerWidth/2)/(innerWidth/2),-1,1)*.24;tilt.x=clamp(-(e.clientY-innerHeight/2)/(innerHeight/2),-1,1)*.18;}
});
function release(e,cancel=false){if(!drag||drag.id!==e.pointerId)return;const tap=drag.moved<9&&!drag.flipped;drag=null;tilt={x:0,y:0};if(tap&&!cancel)flip();}
stage.addEventListener('pointerup',e=>release(e));stage.addEventListener('pointercancel',e=>release(e,true));stage.addEventListener('lostpointercapture',e=>release(e,true));stage.addEventListener('pointerleave',()=>{if(!drag)tilt={x:0,y:0};});
stage.addEventListener('keydown',e=>{if(e.code==='Space'||e.code==='Enter'){e.preventDefault();flip();}});
function resize(){const w=stage.clientWidth,h=stage.clientHeight;renderer.setPixelRatio(Math.min(devicePixelRatio,3,Math.sqrt(4500000/(w*h))));renderer.setSize(w,h);camera.aspect=w/h;const tan=Math.tan(THREE.MathUtils.degToRad(17));camera.position.z=Math.max(2.8/(2*tan*.78),2.1/(2*tan*camera.aspect*.78));camera.updateProjectionMatrix();}
async function init(){try{
 renderer=new THREE.WebGLRenderer({antialias:true,alpha:true});renderer.outputEncoding=THREE.sRGBEncoding;stage.appendChild(renderer.domElement);
 scene=new THREE.Scene();camera=new THREE.PerspectiveCamera(34,1,.1,100);tiltRig=new THREE.Group();flipRig=new THREE.Group();scene.add(tiltRig);tiltRig.add(flipRig);
 const loader=new THREE.TextureLoader();const paths=['assets/front-base.webp','assets/back-base.webp',...['front','back'].flatMap(face=>layerNames.map(name=>`assets/${face}-${name}.webp`))];const loaded=await Promise.all(paths.map(src=>new Promise((resolve,reject)=>loader.load(src,resolve,undefined,reject))));loaded.forEach(t=>{t.encoding=THREE.sRGBEncoding;t.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());renderer.initTexture(t);});textures=loaded.slice(0,2);layerTextures=[loaded.slice(2,7),loaded.slice(7,12)];
 const geo=new THREE.PlaneGeometry(2.1,2.8);front=new THREE.Mesh(geo,new THREE.MeshBasicMaterial({map:textures[0]}));front.position.z=.008;back=new THREE.Mesh(geo,new THREE.MeshBasicMaterial({map:textures[1]}));back.rotation.y=Math.PI;back.position.z=-.008;flipRig.add(front,back);flipRig.add(new THREE.Mesh(new THREE.BoxGeometry(2.1,2.8,.012),new THREE.MeshBasicMaterial({color:0x4c4142})));
 for(const [index,face]of [front,back].entries()){for(const [i,name]of layerNames.entries()){const layer=new THREE.Mesh(new THREE.PlaneGeometry(1,1),new THREE.MeshBasicMaterial({map:layerTextures[index][i],transparent:true,depthWrite:false}));layer.name=name;layer.renderOrder=name==='title'?6:i+1;face.add(layer);}setFace(face,index);}
 new ResizeObserver(resize).observe(stage);resize();renderer.compile(scene,camera);renderer.render(scene,camera);document.querySelector('#fallback').style.display='none';ready=true;stage.dataset.ready='true';showSide(0);
 function animate(now){
  const dt=Math.min((now-last)/1000,.05),ease=1-Math.exp(-dt*(sensorState==='active'&&!drag?35:18));last=now;const sensor=sensorState==='active'&&!drag&&!turn?sensorTilt:{x:0,y:0};
  let bg=side;
  if(turn){const p=clamp((now-turn.start)/turn.duration,0,1),t=1-Math.pow(1-p,3);
   const x=turn.x+((turn.axis==='x'?Math.PI*turn.direction:0)-turn.x)*t;
   const y=turn.y+((turn.axis==='y'?Math.PI*turn.direction:0)-turn.y)*t;
   tiltRig.rotation.set(x,y,0);tiltRig.position.set(turn.y*.05*(1-t),-turn.x*.04*(1-t),0);
   const progress=clamp(Math.abs(turn.axis==='x'?x:y)/Math.PI,0,1);bg=turn.from+(1-2*turn.from)*progress;showSide(progress>=.5?1-turn.from:turn.from);
   if(p>=1){side=1-turn.from;setFace(front,side);setFace(back,1-side);tiltRig.rotation.set(0,0,0);tiltRig.position.set(0,0,0);smooth={x:0,y:0};back.rotation.z=0;turn=null;showSide(side);bg=side;}
  }else{
   smooth.x+=((reduced&&!drag?0:tilt.x)+sensor.x-smooth.x)*ease;smooth.y+=((reduced&&!drag?0:tilt.y)+sensor.y-smooth.y)*ease;
   tiltRig.rotation.set(smooth.x,smooth.y,0);tiltRig.position.set(smooth.y*.05,-smooth.x*.04,0);
  }
  for(const face of [front,back])for(const layer of face.children){const o=layer.userData.origin,strength=reduced||turn?0:layerStrength[layer.name];layer.position.x+=(o.x+smooth.y*strength-layer.position.x)*ease;layer.position.y+=(o.y-smooth.x*strength-layer.position.y)*ease;}
  document.documentElement.style.setProperty('--back-opacity',bg);particles.draw(dt,bg);renderer.render(scene,camera);requestAnimationFrame(animate);
 }requestAnimationFrame(animate);
}catch(e){stage.dataset.error=e.message;document.querySelector('#fallback').style.display='block';message('三维画面加载失败，请刷新重试。');}}
init();
