class BackgroundParticles {
 constructor(canvas,reduced){
  this.canvas=canvas;this.ctx=canvas.getContext('2d');this.reduced=reduced;this.items=[];this.time=0;this.mix=0;this.burstCount=0;
  this.resize();this.seed();
  window.addEventListener('resize',()=>{this.resize();this.seed();});
 }
 resize(){this.w=innerWidth;this.h=innerHeight;this.dpr=Math.min(devicePixelRatio,2);this.canvas.width=Math.round(this.w*this.dpr);this.canvas.height=Math.round(this.h*this.dpr);this.ctx.setTransform(this.dpr,0,0,this.dpr,0,0);this.count=Math.min(80,Math.round(this.w*this.h/12000)+20);}
 make(kind,seed=false,burst=false){
  const r=(a,b)=>a+Math.random()*(b-a),snow=kind===1;
  return {kind,x:r(0,this.w),y:seed?r(0,this.h):snow?r(-60,-4):this.h+r(4,35),vx:r(-9,9),vy:snow?r(14,28):-r(42,85),terminal:r(19,38),size:snow?r(2,4.5):r(1.3,3),angle:r(0,Math.PI),spin:r(-.65,.65),phase:r(0,Math.PI*2),age:seed?r(1,4):0,life:snow?this.h/18+8:r(4.5,9),burst,alpha:snow?r(.5,.8):r(.35,.75)};
 }
 seed(){this.items=[];if(this.reduced)return;for(let kind=0;kind<2;kind++)for(let i=0;i<this.count;i++)this.items.push(this.make(kind,true));}
 transition(kind){if(this.reduced)return;this.burstCount++;for(let i=0;i<12;i++){const p=this.make(kind,false,true);p.y=kind?Math.random()*this.h*.16:this.h*(.86+Math.random()*.14);p.vy*=1.35;p.life=kind?3.5:2.5;this.items.push(p);}if(this.items.length>this.count*2+36)this.items.splice(this.count*2,12);}
 draw(dt,mix){
  const c=this.ctx;c.clearRect(0,0,this.w,this.h);if(this.reduced||document.hidden)return;
  this.time+=dt;this.mix=mix;
  for(let i=this.items.length-1;i>=0;i--){const p=this.items[i],snow=p.kind===1;p.age+=dt;
   // Snow settles towards terminal speed; embers rise in a buoyant, turbulent updraft.
   const wind=Math.sin(this.time*.65+p.phase)*9+Math.sin(this.time*1.3+p.phase*2)*3;
   p.vx+=(wind-p.vx)*(1-Math.exp(-dt*(snow?1.2:2.4)));
   if(snow)p.vy+=(p.terminal-p.vy)*(1-Math.exp(-dt*.7));else p.vy+=(-68-p.vy)*(1-Math.exp(-dt*.8));
   p.x+=p.vx*dt;p.y+=p.vy*dt;p.angle+=p.spin*dt;
   if(p.age>p.life||p.y< -80||p.y>this.h+80){if(p.burst){this.items.splice(i,1);continue;}this.items[i]=this.make(p.kind);continue;}
   if(p.x< -10)p.x=this.w+10;if(p.x>this.w+10)p.x=-10;
   const fadeIn=Math.min(1,p.age/.6),fadeOut=Math.min(1,(p.life-p.age)/(snow?1.5:2.2));
   const opacity=p.alpha*fadeIn*fadeOut*(snow?mix:1-mix);if(opacity<.005)continue;
   c.save();c.translate(p.x,p.y);c.rotate(p.angle);c.globalAlpha=opacity;
   c.fillStyle=snow?'#ffffff':p.age/p.life<.4?'#ffd18a':'#f47840';
   if(snow){c.beginPath();c.arc(0,0,p.size/2,0,Math.PI*2);c.fill();}
   else c.fillRect(-p.size/2,-p.size/2,p.size,p.size);
   c.restore();
  }
 }
}
