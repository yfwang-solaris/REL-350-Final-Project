/* The page clock is the only owner of time, scroll and the renderer. */
(() => {
  'use strict';
  const $=s=>document.querySelector(s), all=s=>Array.from(document.querySelectorAll(s));
  const clamp=(x,a=0,b=1)=>Math.min(b,Math.max(a,x));
  const mix=(a,b,p)=>a+(b-a)*p;
  const smooth=(a,b,x)=>{const p=clamp((x-a)/(b-a));return p*p*(3-2*p);};
  const wave=(x,y,t)=>.67*Math.cos(y*.009+t*.20+17)+.34*Math.cos(x*.005+y*.006-(t*.20+17)*.67);
  const root=document.documentElement, reduced=matchMedia('(prefers-reduced-motion: reduce)');
  const scrollTimeline=CSS.supports('animation-timeline:scroll()');
  const terms=all('.term'),sentence=all('.sentence span'),rail=$('#tray'),earthCopy=$('#ford4 .spread');
  const reflection=$('.reflection em'),scrollCue=$('.cue'),cards=all('.mat img');
  const chips=terms.map((el,i)=>{const chip=document.createElement('span');chip.className='chip';chip.dataset.ford=i;chip.textContent=el.querySelector('.term-spelling').textContent;chip.hidden=true;rail.append(chip);return chip;});
  const nightWater=$('.night-water'),dissolvedAt=sentence.map(()=>-Infinity);
  let previousSentencePhase=null,inscriptionOpacity=-1;
  let canvas=$('#flow'),model,renderer,backend='initializing',errorMessage='';
  const plane=document.querySelector('.river-plane');
  let paintOrigin=0,lastDom=0,nextWater=0,lastSubmit=0,slowSubmits=0,idleTimer=0;
  let raf=0,t=0,last=0,y=scrollY,inputY=y,scrollSpeed=0;
  let readyCount=0,lastGesture=-Infinity,layoutTimer=0,building=false,deferred=false,layoutSerial=0;
  let screenWidth=innerWidth,screenHeight=innerHeight;
  let currentFrame=null,priorStaticKey='',pointer=null,visibilityEpoch=0,paintCount=0;
  let lastDirection=0,known=0,lastBand=-1,bandPhase=0;
  const impulses=[],emissions=[],arrivals=new Array(5).fill(-Infinity);
  const lastPluck=Array(7).fill(-100),revealed=new Set(),intro=new Map();
  const ns='http://www.w3.org/2000/svg';
  const defs=$('#reflection').parentNode;
  const imageStyles=cards.map((img,i)=>{
    const filter=document.createElementNS(ns,'filter'),noise=document.createElementNS(ns,'feTurbulence'),map=document.createElementNS(ns,'feDisplacementMap');
    filter.id='water-image-'+i;noise.setAttribute('type','fractalNoise');noise.setAttribute('baseFrequency','.015 .065');
    noise.setAttribute('numOctaves','1');noise.setAttribute('seed','17');noise.setAttribute('result','water');
    map.setAttribute('in','SourceGraphic');map.setAttribute('in2','water');map.setAttribute('xChannelSelector','R');map.setAttribute('yChannelSelector','G');map.setAttribute('scale','11');
    filter.append(noise,map);defs.append(filter);
    const state={img,start:Infinity,done:false,loaded:false,wash:null};
    function ready(){
      state.wash?.remove();state.wash=null;
      state.loaded=img.naturalWidth>0;state.done=false;state.start=Infinity;
      if(state.loaded&&!reduced.matches){
        const wash=img.cloneNode(false);wash.removeAttribute('id');wash.alt='';
        wash.setAttribute('aria-hidden','true');wash.className='image-wash loaded';
        wash.style.filter='url(#'+filter.id+')';img.after(wash);state.wash=wash;
      }
      wake();
    }
    img.addEventListener('load',ready);if(img.complete)ready();
    return state;
  });
  const colors=[[241,236,226],[43,38,34],[236,226,208],[18,26,39],[121,94,69]];
  const linear=v=>{v/=255;return v<.04045?v/12.92:((v+.055)/1.055)**2.4;};
  const labs=colors.map(rgb=>{
    const [r,g,b]=rgb.map(linear),l=Math.cbrt(.4122214708*r+.5363325363*g+.0514459929*b),m=Math.cbrt(.2119034982*r+.6806995451*g+.1073969566*b),s=Math.cbrt(.0883024619*r+.2817188376*g+.6299787005*b);
    return [.2104542553*l+.793617785*m-.0040720468*s,1.9779984951*l-2.428592205*m+.4505937099*s,.0259040371*l+.7827717662*m-.808675766*s];
  });
  const paletteIndex=[0,0,1,1,2,2,3,3];
  function colorAt(zoneY){
    const stops=model.stops;let i=1;while(i<7&&zoneY>stops[i])i++;
    let a=paletteIndex[i-1],b=paletteIndex[i];
    if(a===b)return colors[a].map(v=>v/255);
    let p=clamp((zoneY-stops[i-1])/Math.max(1,stops[i]-stops[i-1]));
    if(i===4){
      if(p<.43){b=4;p/=.43;}
      else{a=4;p=(p-.43)/.57;}
    }
    const [L,A,B]=labs[a].map((v,k)=>mix(v,labs[b][k],p));
    const l=(L+.3963377774*A+.2158037573*B)**3,m=(L-.1055613458*A-.0638541728*B)**3,s=(L-.0894841775*A-1.291485548*B)**3;
    return [4.0767416621*l-3.3077115913*m+.2309699292*s,-1.2684380046*l+2.6097574011*m-.3413193965*s,-.0041960863*l-.7034186147*m+1.707614701*s].map(v=>v<.0031308?12.92*v:1.055*Math.max(0,v)**(1/2.4)-.055);
  }
  const view=(r,held=0)=>[r[0],r[1]-y+held,r[2],r[3]];
  const onscreen=(r,pad=0)=>r[1]+r[3]>-pad&&r[1]<screenHeight+pad;
  const secondsSince=(start)=>Math.max(0,t-start);
  function speedAtBand(box){
    const atlas=model.atlas,x=model.w*.52,docY=box[1]+box[3]*.55;
    const i=4*(clamp(Math.floor(docY/model.docH*atlas.height),0,atlas.height-1)*atlas.width+
      clamp(Math.floor(x/model.w*atlas.width),0,atlas.width-1));
    const field=atlas.channel,dist=(field[i]/255-.5)*520;
    const inChannel=field[i+3]/255*Math.exp(-dist*dist*.00065)*.87;
    const dx=mix(24+5*wave(x,docY,t),(field[i+1]/127.5-1)*41,inChannel);
    const dy=mix(-5.68*Math.cos(x*.008+t*.20+17),(field[i+2]/127.5-1)*41,inChannel);
    return Math.hypot(dx,dy)*(1+scrollSpeed*.52)*(1-.92*atlas.obstacles[i]/255);
  }
  function impulse(x,docY,dx,dy,radius,strength,kind){
    if(reduced.matches)return;
    impulses.push({x,docY,dx,dy,radius,strength,kind,born:t});
    if(impulses.length>8)impulses.shift();
  }
  function pluck(i,x){
    if(t-lastPluck[i]<.14)return;
    lastPluck[i]=t;
    const r=model.strings;
    impulse(x,r[1]+r[3]*(.14+i*.12),0,1,Math.min(160,r[3]+28),1,1);
  }
  function makeFrame(dt){
    const m=model,h=screenHeight,anchor=y+h*.56;
    const earthHeld=clamp(y-m.earthStage[1],0,m.earthHold),nightHeld=clamp(y-m.night[1],0,m.nightHold);
    const earthP=clamp((y+h*.57-m.earthStage[1])/(m.earthStage[3]-h*.16));
    const finalP=reduced.matches?1:clamp((y-m.night[1]+m.h*.58)/(m.h*.78+m.nightHold));
    const sentencePhase=clamp((y+h*.86-m.sentence[1])/(h*1.14));
    if(previousSentencePhase!==null&&!reduced.matches){
      sentence.forEach((_,i)=>{
        const crossing=.215+i*.15;
        if(sentencePhase>=crossing&&previousSentencePhase<crossing)dissolvedAt[i]=t;
        if(sentencePhase<crossing)dissolvedAt[i]=-Infinity;
      });
    }
    previousSentencePhase=sentencePhase;
    let section=0;for(let i=0;i<5;i++)if(anchor>=m.fords[i][1])section=i+1;
    if(anchor>=m.night[1])section=6;if(y>m.night[1]+m.night[3])section=7;
    let active=-1;
    for(let i=0;i<m.quotes.length;i++)if(onscreen(view(m.quotes[i].box))){active=i;break;}
    if(active!==lastBand){lastBand=active;bandPhase=0;}
    if(active>=0&&!m.quotes[active].native&&!reduced.matches)bandPhase+=dt*speedAtBand(m.quotes[active].box);
    for(let i=0;i<5;i++)if(y+h*.81>=m.termBoxes[i][1]&&arrivals[i]===-Infinity){
      arrivals[i]=t;known=Math.max(known,i+1);const r=m.termBoxes[i];
      const g=m.termGuards[i];
      if(!reduced.matches&&onscreen(view(r)))emissions.push({x:Math.min(m.w-16,g[0]+g[2]+13),docY:g[1]+g[3]+12,born:t,kind:i});
    }
    while(impulses.length&&secondsSince(impulses[0].born)>3)impulses.shift();
    while(emissions.length&&secondsSince(emissions[0].born)>3)emissions.shift();
    const showAll=reduced.matches||section>=6;
    let ledger=showAll?5:known;
    const currentLight=pointer||[m.w*(.70+.16*Math.sin(t*.19)),h*(.56+.085*Math.cos(t*.17))];
    const band=active<0?[0,-1e5,m.w,1]:view(m.quotes[active].box);
    return {y,t,dt,section,bg:colorAt(anchor),stops:m.stops,speed:scrollSpeed,gold:.01+.085*(ledger/5)**1.4,
      hero:view(m.hero),ford2:view(m.strings),ford3:view(m.streams),ford4:view(m.earthBox,earthHeld),
      surface:view(m.surface),ford5:view(m.fords[4]),final:view(m.finale,nightHeld),band,term:view(m.termBoxes[0]),
      termGuards:m.termGuards.map((r,i)=>view(r,i===3?earthHeld*.58:0)),timeBed:view(m.timeBed),
      dissolveAges:dissolvedAt.map(start=>!reduced.matches&&t-start<1.2?t-start:-1),
      glyphBoxes:m.wordBoxes.map(r=>view(r)),finalP,earthP,mergeP:clamp((anchor-m.fords[2][1])/m.fords[2][3]),
      vacP:reduced.matches?1:arrivals[0]===-Infinity?0:clamp(secondsSince(arrivals[0])/1.9),
      sentencePhase,light:currentLight,noiseSeed:17,
      impulses:impulses.map(a=>[a.x,a.docY-y,a.dx,a.dy,a.radius,a.strength,secondsSince(a.born),a.kind]),
      emissions:emissions.map(a=>({x:a.x,y:a.docY-y,age:secondsSince(a.born),kind:a.kind})),
      plucks:lastPluck.map(secondsSince),static:reduced.matches,settle:0,earthHeld,nightHeld,ledger,active};
  }
  function showParagraph(p,phase,full){
    if(full&&p.finished)return;
    for(const piece of p.pieces){
      const a=full?1:smooth(piece.delay,piece.delay+(p.fade??.54),phase);
      if(piece.value===a)continue;piece.value=a;
      // A reader can stop the wheel anywhere. Once a letter surfaces, retain readable ink.
      const visibleInk=a===0?0:.77+.23*a;
      piece.el.style.opacity=a===1?'':String(visibleInk);
      piece.el.style.transform=a===1?'':'translateY('+((1-a)*10).toFixed(2)+'px)';
      if(a>0&&a<1){
        if(!piece.el.dataset.soft)piece.el.dataset.soft=piece.el.textContent;
        piece.el.style.setProperty('--soft',String((1-a)*.58));
      }else if(piece.el.dataset.soft){delete piece.el.dataset.soft;piece.el.style.removeProperty('--soft');}
    }
    p.finished=full;
  }
  function updateText(f,delta){
    const m=model,still=f.static;
    const foil=still?1:smooth(.5,.6,f.finalP);
    if(!scrollTimeline&&foil!==inscriptionOpacity){nightWater.style.setProperty('--inscription-opacity',String(foil));inscriptionOpacity=foil;}
    chips.forEach((chip,i)=>{if(chip.hidden!==(i>=f.ledger))chip.hidden=i>=f.ledger;});
    rail.classList.toggle('visible',y+screenHeight*.6>m.fords[0][1]&&y<m.night[1]-screenHeight*.12);
    const railY=y+(m.small?12:screenHeight*.21);
    rail.classList.toggle('dark',(railY>(m.stops[1]+m.stops[2])*.5&&railY<(m.stops[3]+m.stops[4])*.5)||railY>(m.stops[5]+m.stops[6])*.5);
    if(delta)lastDirection=Math.sign(delta);
    rail.classList.toggle('down',m.small&&!still&&lastDirection>0);
    if(onscreen(f.hero)){
      const n=wave(f.hero[2]*.38,f.hero[1],still?0:t);
      reflection.parentElement.style.transform='translate3d('+(n*3).toFixed(2)+'px,'+(n*.7).toFixed(2)+'px,0) skewX('+(n*.9).toFixed(2)+'deg)';
      const cueTravel=m.small?35:61;
      scrollCue.style.setProperty('--drop',(cueTravel*(still?.5:.5-.48*Math.cos(t*1.68))).toFixed(2)+'px');
    }
    if(!scrollTimeline&&onscreen(f.ford4))earthCopy.style.transform=f.earthHeld?'translateY('+(-.42*f.earthHeld).toFixed(1)+'px)':'';
    if(f.active>=0&&!m.quotes[f.active].native){
      const c=m.quotes[f.active],r=f.band;
      const distance=still?0:(y+screenHeight-c.box[1])*1.15+bandPhase;
      const bias=.24*Math.sin((still?0:t)*.2+17);
      const phase=((distance%c.period)+c.period)%c.period;
      for(const token of c.tokens){
        let x=token.x+phase-c.period;
        const vertical=r[3]*(.55+.115*Math.sin(x/r[2]*Math.PI*2+bias))-c.fontSize*.83-5;
        const tilt=Math.atan(r[3]*.115*Math.cos(x/r[2]*Math.PI*2+bias)*Math.PI*2/r[2]);
        token.el.style.transform='translate3d('+x.toFixed(2)+'px,'+vertical.toFixed(2)+'px,0) rotate('+tilt.toFixed(4)+'rad)';
      }
    }
    if(onscreen(f.ford5)){
      sentence.forEach((el,i)=>{
        const phase=clamp((f.sentencePhase-i*.15)/.43),light=Math.sin(phase*Math.PI);
        el.style.opacity=still?'1':String(.22+.78*light);
        el.style.transform=still?'':'translateX('+((m.small?23:53)*phase).toFixed(2)+'px)';
        f.glyphBoxes[i][0]+=still?0:(m.small?23:53)*phase;
      });
    }
    for(let i=0;i<m.paragraphs.length;i++){
      const p=m.paragraphs[i],isFinal=i===m.paragraphs.length-1;
      if(!isFinal&&p.finished)continue;
      const r=view(p.box,isFinal?f.nightHeld:i===3?f.earthHeld*.58:0);
      if(isFinal){
        const phase=still?1:clamp((f.finalP-.06)/.34);
        if(phase!==p.progress){showParagraph(p,p.duration*phase,phase===1||f.finalP>=.4);p.progress=phase;}
        continue;
      }
      if(!onscreen(r,16))continue;
      if(still||revealed.has(p.el)){showParagraph(p,1,true);continue;}
      if(!intro.has(p.el))intro.set(p.el,t);
      const phase=t-intro.get(p.el);
      if(phase>p.duration){revealed.add(p.el);showParagraph(p,phase,true);}else showParagraph(p,phase,false);
    }
    for(let i=0;i<imageStyles.length;i++){
      const o=imageStyles[i];if(o.done||!o.loaded)continue;
      const r=view(m.imageBoxes[i]);
      if(!onscreen(r))continue;
      if(o.start===Infinity)o.start=t;
      const p=still?1:clamp((t-o.start)/1.6);
      if(p===1){o.wash?.remove();o.wash=null;o.img.style.transform='';o.img.style.opacity='';o.done=true;continue;}
      const clarity=smooth(0,1,p);
      if(o.wash)o.wash.style.opacity=String(1-clarity);
      o.img.style.opacity=String(clarity);
      o.img.style.transform='translateY('+((1-p)*6).toFixed(2)+'px)';
    }
  }
  function useLayers(m){
    if(backend==='layers')return;
    const previous=renderer;
    const fresh=canvas.cloneNode(false);canvas.replaceWith(fresh);canvas=fresh;
    renderer=RiverLayers(plane,{...m,h:Math.ceil(m.h*1.15)});
    backend='layers';root.classList.add('native-water');previous?.dispose();
    priorStaticKey='';lastSubmit=0;slowSubmits=0;
  }
  function installRenderer(m){
    const renderModel={...m,h:Math.ceil(m.h*1.15)};
    earthCopy.style.setProperty('--pin-start',m.earthStage[1]+'px');
    earthCopy.style.setProperty('--pin-end',(m.earthStage[1]+m.earthHold)+'px');
    earthCopy.style.setProperty('--pin-lift',(-.42*m.earthHold)+'px');
    for(const [name,p] of [['--foil-start',.5],['--foil-end',.6]]){
      nightWater.style.setProperty(name,(m.night[1]-.58*m.h+p*(.78*m.h+m.nightHold))+'px');
    }
    if(renderer){
      renderer.layout(renderModel);
    }else{
      try{renderer=window.RiverGL?.(canvas,renderModel);if(renderer){
        backend='webgl2';
        canvas.addEventListener('webglcontextlost',event=>{
          event.preventDefault();if(event.currentTarget!==canvas)return;
          useLayers(model||m);last=0;wake();
        },{once:true});
      }}
      catch(error){errorMessage=String(error);console.warn('WebGL river:',error);}
      if(!renderer)useLayers(m);
    }
    canvas.style.width=m.w+'px';canvas.style.height=renderModel.h+'px';
  }
  function compose(now){
    raf=0;if(!model||document.hidden)return;
    const elapsed=last?Math.max(0,(now-last)*.001):0;last=now;
    const dt=Math.min(.06,elapsed);
    if(!reduced.matches)t+=elapsed;
    const previousY=y;y=scrollY;inputY=y;const delta=y-previousY;
    scrollSpeed=mix(scrollSpeed,clamp(Math.abs(delta)/(Math.max(dt,.001)*950),0,2),1-Math.exp(-dt*8));
    if(delta&&!reduced.matches){
      for(let i=0;i<7;i++){
        const hit=model.strings[1]+model.strings[3]*(.14+i*.12)-screenHeight*.54;
        if((previousY-hit)*(y-hit)<=0)pluck(i,model.w*(.27+.07*i));
      }
      const edge=model.surface[1]+model.surface[3]*.67-screenHeight*.62;
      if((previousY-edge)*(y-edge)<=0)impulse(model.w*.75,edge+screenHeight*.62,0,-1,Math.min(model.w*.28,230),1,1);
    }
    const f=makeFrame(dt);f.elapsed=elapsed;currentFrame=f;
    if(delta||!lastDom||now-lastDom>=1000/60||reduced.matches){
      updateText(f,delta);lastDom=now;
    }else if(onscreen(f.ford5)){
      for(let i=0;i<sentence.length;i++)f.glyphBoxes[i][0]+=(model.small?23:53)*clamp((f.sentencePhase-i*.15)/.43);
    }
    const key=[Math.round(y),readyCount,reduced.matches].join('/');
    if((!reduced.matches||key!==priorStaticKey)&&(backend==='layers'||now+.5>=nextWater||reduced.matches||!priorStaticKey)){
      f.settle=reduced.matches?18:0;
      if(backend==='layers'){
        renderer.draw(f);paintCount++;
      }else{
        // Place a completed water frame in the scrollable document at the origin it actually drew.
        // The compositor can then move it with the text between two GPU submissions.
        const pad=Math.min(y,Math.round(model.h*.075)),origin=y-pad;
        const shifted={...f,y:origin};
        const lift=r=>[r[0],r[1]+pad,r[2],r[3]];
        for(const name of ['hero','ford2','ford3','ford4','surface','ford5','final','band','term','timeBed'])shifted[name]=lift(f[name]);
        shifted.termGuards=f.termGuards.map(lift);shifted.glyphBoxes=f.glyphBoxes.map(lift);
        shifted.light=[f.light[0],f.light[1]+pad];
        shifted.impulses=f.impulses.map(r=>[r[0],r[1]+pad,...r.slice(2)]);
        shifted.emissions=f.emissions.map(e=>({...e,y:e.y+pad}));
        if(renderer.draw(shifted)){
          const gap=lastSubmit?now-lastSubmit:0;lastSubmit=now;
          if(!f.static&&now-lastGesture<400&&gap>65&&gap<1000)slowSubmits++;
          else slowSubmits=Math.max(0,slowSubmits-1);
          const budget=delta?1000/90:1000/60;
          nextWater=now+budget-Math.min(Math.max(0,now-nextWater),budget*.35);
          if(origin!==paintOrigin)canvas.style.transform='translateY('+origin+'px)';
          paintOrigin=origin;paintCount++;
          if(slowSubmits>=15)useLayers(model);
        }
      }
      priorStaticKey=key;
    }
    if(!reduced.matches&&y<model.night[1]+model.night[3]+50){
      if(backend==='layers'&&!delta&&now-lastGesture>120)idleTimer=setTimeout(wake,1000/24);
      else wake();
    }
  }
  function wake(){clearTimeout(idleTimer);if(!raf&&model&&!document.hidden)raf=requestAnimationFrame(compose);}
  function queueLayout(delay=205){
    clearTimeout(layoutTimer);layoutTimer=setTimeout(prepare,Math.max(0,delay));
  }
  async function prepare(){
    if(building){deferred=true;return;}
    const wait=200-(performance.now()-lastGesture);if(model&&wait>0){queueLayout(wait+3);return;}
    building=true;const serial=++layoutSerial;
    try{
      root.style.setProperty('--vh',innerHeight*.01+'px');
      const m=await RiverLayout.build(reduced.matches);
      if(serial!==layoutSerial)return;
      if(model&&performance.now()-lastGesture<200){deferred=true;return;}
      installRenderer(m);
      for(const quote of m.quotes){quote.el.replaceChildren(quote.fragments);delete quote.fragments;}
      model=m;readyCount++;lastDom=0;
      priorStaticKey='';inputY=scrollY;last=0;root.classList.add('simulated');wake();
    }catch(error){errorMessage=String(error);console.error('River layout:',error);if(!model)root.classList.remove('live','simulated');}
    finally{building=false;if(deferred){deferred=false;queueLayout();}}
  }
  addEventListener('scroll',()=>{inputY=scrollY;lastGesture=performance.now();wake();},{passive:true});
  addEventListener('resize',()=>{
    screenWidth=innerWidth;screenHeight=innerHeight;inputY=scrollY;
    if(!model||screenWidth!==model.w||Math.abs(screenHeight-model.h)>model.h*.15)queueLayout();else wake();
  });
  const onPointer=e=>{
    if(!model||reduced.matches)return;
    const x=e.clientX,v=e.clientY;
    if(pointer){const dx=x-pointer[0],dy=v-pointer[1],len=Math.hypot(dx,dy);
      if(len>1.5&&(!impulses.length||secondsSince(impulses.at(-1).born)>.035)){
        impulse(x,v+inputY,dx/len,dy/len,120,clamp(len/36,.2,1.3),0);
      }
    }
    pointer=[x,v];wake();const r=model.strings,ratio=(v+inputY-r[1])/r[3];
    const i=Math.round((ratio-.14)/.12);if(i>=0&&i<7&&Math.abs(ratio-(.14+i*.12))<.055)pluck(i,x);
  };
  addEventListener('pointermove',onPointer,{passive:true});
  document.addEventListener('pointerleave',()=>{pointer=null;});
  document.addEventListener('visibilitychange',()=>{
    visibilityEpoch++;last=0;lastSubmit=0;slowSubmits=0;inputY=scrollY;y=inputY;scrollSpeed=0;
    if(document.hidden){clearTimeout(idleTimer);cancelAnimationFrame(raf);raf=0;}else wake();
  });
  reduced.addEventListener('change',()=>{priorStaticKey='';last=0;impulses.length=0;queueLayout(0);wake();});
  document.addEventListener('focusin',e=>{
    const p=e.target.closest('.copy p,.night-pin p');if(p)revealed.add(p);
  });
  Object.defineProperty(window,'riverDiagnostics',{get:()=>({
    backend,paintOrigin,layoutCount:readyCount,progress:currentFrame?.finalP||0,clock:t,paused:document.hidden,visibilityEpoch,paintCount,
    gpu:renderer?.stats||{},error:errorMessage,finalRect:currentFrame?.final||[],glyphBoxes:currentFrame?.glyphBoxes||[],
    termGuards:currentFrame?.termGuards||[],timeBed:currentFrame?.timeBed||[],dissolveAges:currentFrame?.dissolveAges||[],
    finalGlyphBounds:currentFrame&&model?model.finalGlyphBounds.map(b=>[b[0]+currentFrame.final[0],b[1]+currentFrame.final[1],b[2],b[3]]):[]
  })});
  root.classList.add('live');
  Promise.all([document.fonts.load('italic 400 52px Cormorant'),document.fonts.load('400 18px "Noto Serif"'),document.fonts.ready]).then(()=>queueLayout(0));
})();

