/* Background plates travel with the document. Only an active reach repaints its local ink. */
window.RiverLayers=function(plane,initial){
  const brush=River2D(document.createElement('canvas'),initial,true);
  const earth=document.querySelector('.earth-pin'),night=document.querySelector('.night-water');
  const stats={backend:'layers',frames:0,regionPaints:0};
  const reflection=document.querySelector('.reflection'),reflectionInk=document.createElement('canvas');
  reflectionInk.className='reflection-plate';reflection.append(reflectionInk);
  function cacheReflection(){
    const word=reflection.querySelector('em'),style=getComputedStyle(word);
    const width=reflection.clientWidth,height=reflection.clientHeight,line=word.offsetHeight;
    if(!width||!height||!line)return;
    const src=document.createElement('canvas'),ratio=Math.min(1.5,devicePixelRatio);
    src.width=Math.ceil(width*ratio);src.height=Math.ceil(line*ratio);
    const pen=src.getContext('2d');pen.scale(ratio,ratio);
    pen.font=[style.fontStyle,style.fontWeight,style.fontSize,style.fontFamily].join(' ');
    pen.letterSpacing=style.letterSpacing;pen.fillStyle=style.color;
    const text=word.textContent,metrics=pen.measureText(text);
    pen.fillText(text,0,(line+metrics.fontBoundingBoxAscent-metrics.fontBoundingBoxDescent)/2);
    reflectionInk.width=src.width;reflectionInk.height=Math.ceil(height*ratio);
    const ink=reflectionInk.getContext('2d');
    for(let row=0;row<reflectionInk.height;row++){
      const yy=row/ratio,from=(line*.36+(line*.36-yy)/.64)*ratio;
      ink.globalAlpha=1-yy/height;
      ink.drawImage(src,0,from,src.width,1.6,(1.6*Math.sin(yy*.27)+.8*Math.cos(yy*.49))*ratio,row,src.width,1);
    }
  }
  const glint=document.createElement('span');glint.className='river-glint';document.querySelector('.dawn-art').append(glint);
  let film=null;
  let model,regions=[],spine=[],lastScroll=NaN,lastGlint=-1;
  const center=u=>.83-.54*u+.06*Math.sin(2*Math.PI*u+.6)+.05*Math.sin(2*Math.PI*u-1.15)+.095*Math.exp(-(((u-.36)/.25)**2));
  const rect=(x,y,w,h)=>[x,y,Math.max(1,w),Math.max(1,h)];
  function region(key,box,parent=plane){
    const canvas=document.createElement('canvas');
    canvas.className='river-region';canvas.setAttribute('aria-hidden','true');
    parent.append(canvas);
    const origin=parent===earth?model.earthBox:parent===night?model.finale:[0,0];
    const [x,y,w,h]=box;
    Object.assign(canvas.style,{left:(x-origin[0])+'px',top:(y-origin[1])+'px',width:w+'px',height:h+'px'});
    const scale=Math.min(1.2,Math.sqrt(580000/(w*h)),devicePixelRatio);
    canvas.width=Math.ceil(w*scale);canvas.height=Math.ceil(h*scale);
    const layer={key,box,canvas,parent,stamp:null,last:-Infinity};
    regions.push(layer);return layer;
  }
  function ambient(m){
    // Sample the same channel atlas once in document coordinates, leaving room for the focused scenes.
    const a=m.atlas,dy=m.docH/a.height,step=768;
    const exclude=[m.hero,m.earthStage,m.fords[4],m.night,...m.termGuards];
    for(let top=0;top<m.night[1];top+=step){
      const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
      svg.classList.add('river-spine');svg.style.top=top+'px';
      svg.setAttribute('viewBox','0 0 '+m.w+' '+step);svg.setAttribute('height',step);
      const marks=[];let previous;
      for(let j=Math.floor(top/dy);j<a.height&&(j+.5)*dy<top+step+dy;j++){
        let best=Infinity,ix=-1;
        for(let i=0;i<a.width;i++){
          const k=(j*a.width+i)*4,alpha=a.channel[k+3];
          const d=Math.abs(a.channel[k]-127.5);
          if(alpha>30&&d<best){best=d;ix=i;}
        }
        const x=(ix+.5)*m.w/a.width,y=(j+.5)*dy;
        if(ix<0||exclude.some(r=>x>=r[0]-25&&x<r[0]+r[2]+25&&y>r[1]-15&&y<r[1]+r[3]+15)){previous=null;continue;}
        for(let lane=0;lane<7;lane++){
          const xx=x+(lane-3)*1.6+Math.sin(j*.16+lane*.4);
          if(!marks[lane])marks[lane]=[];
          marks[lane].push((previous?'L':'M')+xx.toFixed(1)+' '+(y-top).toFixed(1));
        }
        previous=true;
      }
      for(const line of marks){
        const path=document.createElementNS(svg.namespaceURI,'path');path.setAttribute('d',line.join(' '));svg.append(path);
      }
      if(marks.length){plane.append(svg);spine.push(svg);}
    }
  }
  function layout(m,first=false){
    clearFilm();for(const r of regions)r.canvas.remove();for(const el of spine)el.remove();
    model=m;regions=[];spine=[];cacheReflection();if(!first)brush.layout(m);
    // Flat daylight, night and soil are cached separately to avoid rasterizing a
    // document-sized OKLab gradient as each new scrolling tile becomes visible.
    const colors=['#f1ece2','#f1ece2','#2b2622','#2b2622','#ece2d0','#ece2d0','#121a27','#121a27'];
    for(let i=1;i<m.stops.length;i++){
      const band=document.createElement('div');band.className='river-tone';
      Object.assign(band.style,{top:m.stops[i-1]+'px',height:Math.max(0,m.stops[i]-m.stops[i-1]+1)+'px',
        background:colors[i]===colors[i-1]?colors[i]:'linear-gradient(to bottom in oklab,'+colors[i-1]+','+colors[i]+')'});
      plane.append(band);spine.push(band);
    }
    ambient(m);
    region('ford2',rect(m.strings[0],m.strings[1]-15,m.strings[2],m.strings[3]+30));
    region('ford3',m.streams);
    region('sediment',m.earthBox,earth);
    const e=m.earthBox;
    // On phones the vein is placed relative to the bottom of the reading column.
    const bed=m.small?Math.min(e[1]+e[3]-1,m.earthTextBottom+46):e[1]+e[3]*.84;
    const pad=m.small?44:Math.max(62,e[3]*.12);
    region('vein',rect(0,bed-pad,m.w,2*pad),earth);
    region('seam',m.surface);region('surface',m.surface);
    region('timeBed',m.timeBed);
    region('term',rect(m.termBoxes[0][0]-120,m.termBoxes[0][1]-30,m.termBoxes[0][2]+240,m.termBoxes[0][3]+60));
    for(let i=0;i<m.quotes.length;i++)region('band',m.quotes[i].box).index=i;
    const words=m.wordBoxes,left=Math.min(...words.map(r=>r[0])),top=Math.min(...words.map(r=>r[1]));
    const right=Math.max(...words.map(r=>r[0]+r[2])),bottom=Math.max(...words.map(r=>r[1]+r[3]));
    region('words',rect(left,top-6,Math.min(m.w-left,right-left+200),bottom-top+18));
    for(const r of m.termGuards)region('events',rect(Math.min(m.w-135,r[0]+r[2]-8),r[1]+r[3]-12,135,82));
    region('final',m.finale,night);
  }
  // Prepaint the reversible night sequence at this page's measured glyph positions.
  // Adjacent samples crossfade continuously on the browser's native scroll timeline.
  function prepareNight(frame){
    if(film||!window.ScrollTimeline||!window.Worker||!window.OffscreenCanvas||frame.static)return;
    const m=model,stage=m.finale,visibleHeight=innerHeight,source=document.scrollingElement;
    const total=source.scrollHeight-visibleHeight;
    if(total<=0)return;
    const state={cancel:false,nodes:[],url:null,worker:null,ready:false};
    film=state;
    const count=31,scale=Math.min(1.12,900/stage[2],210/stage[3]);
    const width=Math.ceil(stage[2]*scale),height=Math.ceil(stage[3]*scale);
    const cols=Math.max(1,Math.min(6,Math.floor(4096/width))),rows=Math.ceil(count/cols);
    const r=[0,0,stage[2],stage[3]],blank=[0,-1e6,0,0];
    const still={...frame,y:stage[1],final:r,t:3,section:6,dt:0,nightHeld:0,
      hero:blank,ford2:blank,ford3:blank,ford4:blank,surface:blank,ford5:blank,band:blank,term:blank,timeBed:blank,
      impulses:[],emissions:[],plucks:[],termGuards:[],dissolveAges:[]};
    async function paintSequence(event){
      const {model,frame,width,height,rows,cols,count}=event.data;
      const tile=new OffscreenCanvas(width,height),atlas=new OffscreenCanvas(width*cols,height*rows);
      const pen=atlas.getContext('2d',{willReadFrequently:true}),artist=River2D(new OffscreenCanvas(1,1),model,true);
      for(let k=0;k<count;k++){
        frame.finalP=.60*k/(count-1);
        artist.paintRegion(tile,frame,'final',frame.final);
        pen.drawImage(tile,(k%cols)*width,Math.floor(k/cols)*height);
      }
      self.postMessage(await atlas.convertToBlob({type:'image/png'}));
    }
    const script='('+installRiver2D.toString()+')();self.onmessage='+paintSequence.toString();
    const url=URL.createObjectURL(new Blob([script],{type:'text/javascript'}));
    try{
      state.worker=new Worker(url);
    }catch{return;}finally{URL.revokeObjectURL(url);}
    state.worker.onerror=()=>state.worker.terminate();
    state.worker.onmessage=async ({data:blob})=>{
        state.worker.terminate();
        if(!blob||state.cancel)return;
        state.url=URL.createObjectURL(blob);
        const img=new Image();img.src=state.url;
        try{await img.decode();}catch{return;}
        if(state.cancel)return;
        const holder=document.createElement('div');holder.className='night-film';holder.setAttribute('aria-hidden','true');
        const timeline=new ScrollTimeline({source,axis:'block'});
        const start=m.night[1]-visibleHeight*.58,travel=visibleHeight*.78+m.nightHold;
        const offset=k=>Math.max(0,Math.min(1,(start+travel*.6*k/(count-1))/total));
        const pose=k=>'translate3d('+(-(k%cols)*stage[2])+'px,'+(-Math.floor(k/cols)*stage[3])+'px,0)';
        for(let parity=0;parity<2;parity++){
          const image=parity?img.cloneNode():img;
          image.alt='';image.style.width=(cols*stage[2])+'px';image.style.height=(rows*stage[3])+'px';holder.append(image);
          const poses=[],opacity=[];
          for(let k=0;k<count;k++){
            const shown=k%2===parity;
            // Move a transparent layer to the next sample exactly at its zero crossing.
            const sample=shown?k:Math.min(count-1,k+1);
            poses.push({offset:offset(k),transform:pose(sample),easing:'steps(1,end)'});
            opacity.push({offset:offset(k),opacity:shown?1:0});
          }
          poses.unshift({offset:0,transform:poses[0].transform});poses.push({offset:1,transform:poses.at(-1).transform});
          opacity.unshift({offset:0,opacity:opacity[0].opacity});opacity.push({offset:1,opacity:opacity.at(-1).opacity});
          image.animate(poses,{timeline,fill:'both',duration:'auto'});
          image.animate(opacity,{timeline,fill:'both',duration:'auto'});
        }
        const sparks=document.createElementNS('http://www.w3.org/2000/svg','svg');
        sparks.classList.add('night-sparks');sparks.setAttribute('viewBox','0 0 '+stage[2]+' '+stage[3]);
        const moving=document.createElementNS(sparks.namespaceURI,'g'),points=m.glyphs.final||[];
        for(let n=0;n<36&&points.length;n++){
          const i=Math.floor(n*points.length/72)*2;
          const dot=document.createElementNS(sparks.namespaceURI,'ellipse');
          dot.setAttribute('cx',points[i]);dot.setAttribute('cy',points[i+1]);
          dot.setAttribute('rx',1.1);dot.setAttribute('ry',.6);moving.append(dot);
        }
        sparks.append(moving);holder.append(sparks);
        night.append(holder);state.nodes.push(holder);
        const last=regions.find(layer=>layer.key==='final');
        last.canvas.style.visibility='hidden';state.ready=true;stats.nightCached=true;
    };
    const geometry={w:m.w,h:m.h,docH:m.docH,small:m.small,finale:stage,finalGlyphBounds:m.finalGlyphBounds,
      glyphs:{final:m.glyphs.final}};
    state.worker.postMessage({model:geometry,frame:still,width,height,rows,cols,count});
  }
  function clearFilm(){
    if(!film)return;
    film.cancel=true;
    film.worker?.terminate();
    for(const el of film.nodes)el.remove();
    if(film.url)URL.revokeObjectURL(film.url);
    film=null;stats.nightCached=false;
  }

  function draw(f){
    if(f.y>model.fords[2][1]-innerHeight)prepareNight(f);
    const moving=f.y!==lastScroll;lastScroll=f.y;
    if(f.hero[1]+f.hero[3]>0&&f.hero[1]<innerHeight&&(f.static||f.t-lastGlint>.05)){
      const u=Math.max(0,Math.min(1,(f.light[0]-f.hero[0])/f.hero[2])),cy=center(u);
      const angle=Math.atan((center(u+.001)-cy)*f.hero[3]/(.001*f.hero[2]));
      glint.style.transform='translate('+Math.round(u*f.hero[2]-40)+'px,'+Math.round(cy*f.hero[3])+'px) rotate('+angle+'rad)';
      glint.style.opacity=String(Math.max(.08,.64-Math.abs(f.light[1]-f.hero[1]-cy*f.hero[3])*.002));lastGlint=f.t;
    }
    for(const layer of regions){
      const {key,canvas,box,parent}=layer;
      if(key==='final'&&film?.ready)continue;
      const held=parent===earth?f.earthHeld:parent===night?f.nightHeld:0;
      const v=[box[0],box[1]-f.y+held,box[2],box[3]];
      const visible=v[1]<=innerHeight+14&&v[1]+v[3]>=-14;
      if(visible!==layer.visible){
        layer.visible=visible;
        if(!['sediment','seam','timeBed','band'].includes(key))canvas.classList.toggle('region-active',visible);
      }
      if(!visible)continue;
      let stamp=0;
      switch(key){
        case 'vein':stamp=Math.round(f.earthP*320);break;
        case 'ford2':stamp=f.plucks.some(a=>a<3)||f.impulses.length?f.t:0;break;
        case 'ford3':stamp=Math.round(f.mergeP*80);break;
        case 'final':stamp=f.finalP<.6?Math.round(f.finalP*300):Math.floor(f.t*8);break;
        case 'words':stamp=f.dissolveAges.some(a=>a>=0)?f.t:0;break;
        case 'events':stamp=f.emissions.some(e=>e.age<2.8&&Math.abs(e.y-v[1])<120)?f.t:0;break;
        case 'term':stamp=f.vacP>0&&f.vacP<1?f.t:0;break;
        case 'band':if(layer.index!==f.active)continue;stamp=Math.floor(f.t*2);break;
        case 'surface':stamp=Math.floor(f.t*12);break;
      }
      if(layer.stamp===stamp)continue;
      if(!f.static&&layer.stamp!==null&&f.t-layer.last<(moving?1/35:1/24))continue;
      layer.stamp=stamp;layer.last=f.t;brush.paintRegion(canvas,f,key,v);stats.regionPaints++;
    }
    stats.frames++;return true;
  }
  function dispose(){clearFilm();glint.remove();reflectionInk.remove();for(const r of regions)r.canvas.remove();for(const el of spine)el.remove();brush.dispose();}
  layout(initial,true);return {draw,layout,dispose,stats};
};
