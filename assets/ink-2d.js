/* CPU edition of the ink field. The page supplies the only animation clock. */
(() => {
  'use strict';
  const TAU=Math.PI*2;
  const clamp=(x,a=0,b=1)=>Math.max(a,Math.min(b,x));
  const mix=(a,b,t)=>a+(b-a)*t;
  const ease=(a,b,x)=>{const q=clamp((x-a)/(b-a));return q*q*(3-2*q);};
  const fract=x=>x-Math.floor(x);
  const seed=i=>fract(Math.sin(i*127.1+17)*43758.5453);
  const noise=(x,y,t)=>-.71*Math.cos(x*.008+t*.20+17)-.34*Math.cos(x*.005+y*.006-(t*.20+17)*.67);
  const visible=(r,h,pad=0)=>r&&r[2]>0&&r[3]>0&&r[1]+r[3]>-pad&&r[1]<h+pad;
  const ink={
    day:['#697a72','#788d81','#50626a'], night:['#9daaa7','#778c94','#b8c0b5'],
    earth:['#a49884','#786f63','#c6bba4'],gold:'#bb9856',bright:'#e9cd8d'
  };
  const palettes=[[241,236,226],[43,38,34],[236,226,208],[18,26,39]];
  const linear=v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;};
  const display=v=>Math.round(clamp(v<=.0031308?12.92*v:1.055*Math.max(0,v)**(1/2.4)-.055)*255);
  function lab(rgb){
    const [r,g,b]=rgb.map(linear);
    const l=Math.cbrt(.41222147*r+.53633254*g+.05144599*b);
    const m=Math.cbrt(.2119035*r+.68069955*g+.10739696*b);
    const s=Math.cbrt(.08830246*r+.28171884*g+.6299787*b);
    return [.21045426*l+.79361779*m-.00407205*s,1.9779985*l-2.4285922*m+.45059371*s,.02590404*l+.78277177*m-.80867577*s];
  }
  const labs=palettes.map(lab);
  function shade(a,b,t){
    const L=mix(a[0],b[0],t),A=mix(a[1],b[1],t),B=mix(a[2],b[2],t);
    const l=(L+.39633778*A+.21580376*B)**3,m=(L-.10556135*A-.06385417*B)**3,s=(L-.08948418*A-1.29148555*B)**3;
    return 'rgb('+[display(4.07674166*l-3.30771159*m+.23096993*s),display(-1.268438*l+2.6097574*m-.3413194*s),display(-.00419609*l-.70341861*m+1.7076147*s)].join(',')+')';
  }
  const stopColors=[0,0,1,1,2,2,3,3];
  function skyAt(y,stops){
    for(let j=1;j<8;j++)if(y<=stops[j]){
      return shade(labs[stopColors[j-1]],labs[stopColors[j]],clamp((y-stops[j-1])/Math.max(1,stops[j]-stops[j-1])));
    }
    return shade(labs[3],labs[3],0);
  }
  function paper(context,frame,height){
    const stops=frame.stops;
    if(!stops||stops.length!==8)return 'rgb('+frame.bg.map(v=>Math.round(v*255)).join(',')+')';
    const y=frame.y,end=y+height;
    let varying=false;
    for(let i=1;i<8;i++)if(stopColors[i]!==stopColors[i-1]&&stops[i]>=y&&stops[i-1]<=end)varying=true;
    if(!varying)return skyAt(y+height*.5,stops);
    const gradient=context.createLinearGradient(0,0,0,height);
    gradient.addColorStop(0,skyAt(y,stops));
    for(let i=1;i<8;i++){
      const steps=stopColors[i]!==stopColors[i-1]?12:1;
      for(let j=1;j<=steps;j++){
        const at=mix(stops[i-1],stops[i],j/steps);
        if(at>y&&at<end)gradient.addColorStop((at-y)/height,shade(labs[stopColors[i-1]],labs[stopColors[i]],j/steps));
      }
    }
    gradient.addColorStop(1,skyAt(end,stops));return gradient;
  }
  function returningPaper(width,height){
    const c=document.createElement('canvas');c.width=Math.min(400,Math.ceil(width));c.height=clamp(Math.ceil(height),2,520);
    const b=c.getContext('2d'),pixels=b.createImageData(c.width,c.height),umber=lab([121,94,69]);
    const ramp=Array.from({length:1025},(_,i)=>{
      const t=i/1024,color=t<.43?shade(labs[1],umber,t/.43):shade(umber,labs[2],(t-.43)/.57);
      return color.match(/\d+/g).map(Number);
    });
    for(let x=0;x<c.width;x++){
      const u=(x+.5)/c.width,bank=.055*Math.sin(u*TAU+.4)+.021*Math.sin(2*u*TAU-.7);
      for(let y=0;y<c.height;y++){
        const t=(y+.5)/c.height,at=(y*c.width+x)*4,rgb=ramp[Math.round(1024*clamp(t+bank*Math.sin(Math.PI*t)))];
        pixels.data[at]=rgb[0];pixels.data[at+1]=rgb[1];pixels.data[at+2]=rgb[2];pixels.data[at+3]=255;
      }
    }
    b.putImageData(pixels,0,0);return c;
  }
  function heroY(rect,x,k){
    const u=(x-rect[0])/rect[2];
    const shoal=(u-.36)/.25;
    return rect[1]+rect[3]*((k===0?.74-.42*u+.12*Math.sin(TAU*u+.6):.92-.66*u+.10*Math.sin(TAU*u-1.15))+.095*Math.exp(-shoal*shoal));
  }
  function nightY(rect,x,k,p){
    const u=(x-rect[0])/rect[2],peak=(u-.52)*2.9,converge=Math.exp(-peak*peak)*ease(0,.35,p);
    return rect[1]+rect[3]*(k===0?.01+.20*converge+.029*Math.sin(TAU*u*1.1-.7):.98-.17*converge+.036*Math.sin(TAU*u*1.35+1));
  }
  function goldY(rect,x,textBottom){
    const u=(x-rect[0])/rect[2];
    if(Number.isFinite(textBottom)){
      const room=rect[1]+rect[3]-textBottom;
      const center=clamp(room*.62,36,49),swing=Math.min(10,Math.max(0,room-center-5)*.58);
      return textBottom+center+swing*(.62*Math.sin(u*TAU*1.2)+.28*Math.cos(17*u)-.10*ease(.52,1,u));
    }
    return rect[1]+rect[3]*(.85+.029*Math.sin(u*TAU*1.2)+.017*Math.cos(17*u)-.055*ease(.52,1,u));
  }
  function timeY(rect,x){
    const u=(x-rect[0])/rect[2];
    return rect[1]+rect[3]*(.505+.105*Math.sin(TAU*u-.55)+.035*Math.cos(13*u+.2));
  }
  function spineOpacity(y,reach){
    if(!reach||reach[3]<=0)return 1;
    return 1-ease(reach[1],reach[1]+100,y)*(1-ease(reach[1]+reach[3]-100,reach[1]+reach[3],y));
  }
  function bandY(rect,x,t){
    return rect[1]+rect[3]*(.55+.115*Math.sin((x-rect[0])/rect[2]*TAU+.24*Math.sin(t*.2+17)));
  }
  function stringY(rect,x,i,age){
    const u=clamp((x-rect[0])/rect[2]),level=rect[1]+rect[3]*(.12+.12*i);
    return level+(age>=0&&age<4?Math.sin(age*15)*Math.exp(-1.5*age)*Math.sin(Math.PI*u)*Math.sin(Math.PI*4*u)*Math.min(rect[3]*.1,17):0);
  }
  function cubicImpulse(r,x,y){
    const dx=x-r[0],dy=y-r[1],rad=Math.max(12,r[4]),distance=Math.hypot(dx,dy);
    if(distance>rad*3)return 0;
    const q=distance/rad,age=Math.max(0,r[6]),amplitude=clamp(Math.abs(r[5]),0,4);
    if(r[7]===1)return Math.sin(q*19-age*9)*Math.exp(-9*Math.abs(q-age*.35)-age*.65)*amplitude;
    return Math.exp(-3*q*q-age*2.2)*amplitude;
  }
  function swatch(points){
    if(!points||points.length<2)return null;
    let left=Infinity,top=Infinity,right=-Infinity,bottom=-Infinity;
    for(let i=0;i<points.length;i+=2){left=Math.min(left,points[i]);right=Math.max(right,points[i]);top=Math.min(top,points[i+1]);bottom=Math.max(bottom,points[i+1]);}
    const width=Math.max(1,right-left+1),height=Math.max(1,bottom-top+1);
    const raster=document.createElement('canvas'),scale=2;
    raster.width=Math.ceil((width+6)*scale);raster.height=Math.ceil((height+6)*scale);
    const brush=raster.getContext('2d');brush.scale(scale,scale);
    const step=clamp(Math.sqrt(width*height*.19/(points.length/2)),.65,2.3);
    const g=brush.createLinearGradient(0,0,width,height*.24);g.addColorStop(0,'#bd9b61');g.addColorStop(.4,'#e4c990');g.addColorStop(.61,'#f1d894');g.addColorStop(1,'#c2a168');
    brush.fillStyle=g;brush.beginPath();
    for(let i=0;i<points.length;i+=2){
      const x=points[i]-left+3,y=points[i+1]-top+3,r=step*.68;
      brush.moveTo(x+r,y);brush.arc(x,y,r,0,TAU);
    }
    brush.fill();
    return {points,width:width+6,height:height+6,left:left-3,top:top-3,raster,step};
  }
  function finalTargets(model){
    const supplied=model.glyphs?.final;
    if(supplied?.length>=96)return supplied;
    // A temporarily empty font mask must still produce a readable night inscription.
    const r=model.finale||[0,0,model.w,Math.max(100,model.h*.27)];
    const width=Math.max(1,Math.ceil(r[2])),height=Math.max(1,Math.ceil(r[3]));
    const c=document.createElement('canvas');c.width=width;c.height=height;
    const b=c.getContext('2d',{willReadFrequently:true});
    b.font='italic '+(model.small?clamp(width*.105,36,46):clamp(width*.046,36,64))+'px Cormorant,Georgia,serif';
    b.textAlign='center';b.fillStyle='white';
    const rows=model.small?['vāc · soma · vīṇā','sarasvatī · tīrtha · kāla']:['vāc · soma · vīṇā · sarasvatī · tīrtha · kāla'];
    rows.forEach((s,i)=>{
      const at=(model.small?(i?.595:.405):.52)*height,m=b.measureText(s);
      b.fillText(s,width/2,at+(m.actualBoundingBoxAscent-m.actualBoundingBoxDescent)/2,width*(model.small?.92:.90));
    });
    const p=b.getImageData(0,0,width,height).data,a=[];
    for(let y=0;y<height;y++)for(let x=0;x<width;x++)if(p[(y*width+x)*4+3]>76)a.push(x+.5,y+.5);
    return new Float32Array(a);
  }
  window.River2D=function River2D(canvas,initial){
    // Keep fallback surfaces on the CPU so an emulated GPU never has to rasterize these paths.
    const backing={alpha:false,willReadFrequently:true};
    const ctx=canvas.getContext('2d',backing);
    if(!ctx)return null;
    const trails=document.createElement('canvas'),tc=trails.getContext('2d',{willReadFrequently:true});
    const ground=document.createElement('canvas'),gc=ground.getContext('2d',backing);
    const guardPaints=new Map(),guardPad=23;
    const stats={backend:'Canvas2D',particles:0,dpr:1,trailScale:1};
    let M,w,h,dpr,small,atlas,glyphs,spine,field,cols,rows,px,py,weight,count,nightTop,nightBottom;
    let lastY=NaN,lastPaperY=NaN,surfacePaper,clock=0,frames=0,quality=1,layoutChanged=true;
    const cell=54;
    function sizeCanvas(){
      // Keep all coordinates in CSS pixels. The reading text and gilding retain their native resolution.
      dpr=Math.min(M.dpr||1,1.25,Math.sqrt(760000*quality/(w*h)));
      canvas.width=Math.max(1,Math.round(w*dpr));canvas.height=Math.max(1,Math.round(h*dpr));
      ctx.setTransform(canvas.width/w,0,0,canvas.height/h,0,0);stats.dpr=dpr;
    }
    function historyBuffer(){
      const s=Math.min(dpr,.84);
      trails.width=Math.max(1,Math.round(w*s));trails.height=Math.max(1,Math.round(h*s));
      tc.setTransform(trails.width/w,0,0,trails.height/h,0,0);
      stats.trailScale=s;lastPaperY=NaN;layoutChanged=true;
    }
    function layout(model){
      M=model;w=Math.max(1,M.w);h=Math.max(1,M.h);small=M.small;atlas=M.atlas;
      sizeCanvas();
      ground.width=Math.max(1,Math.ceil(w/2));ground.height=Math.max(1,Math.ceil(h/2));
      gc.setTransform(ground.width/w,0,0,ground.height/h,0,0);
      guardPaints.clear();surfacePaper=M.stops&&M.stops[4]>M.stops[3]?returningPaper(w,M.stops[4]-M.stops[3]):null;
      cols=Math.ceil(w/cell)+2;rows=Math.ceil(h/cell)+2;field=new Float32Array(cols*rows*3);
      const capacity=small?850:1200;
      px=new Float32Array(capacity);py=new Float32Array(capacity);weight=new Float32Array(capacity);
      for(let i=0;i<capacity;i++){px[i]=seed(i*3)*w;py[i]=seed(i*3+1)*h;weight[i]=.6+seed(i*3+2)*.85;}
      glyphs={final:swatch(finalTargets(M)),vac:swatch(M.glyphs?.vac),titleWords:(M.glyphs?.titleWords||[]).map(swatch)};
      const rowsInk=M.finalGlyphBounds?.filter(b=>b[2]>0&&b[3]>0)||[];
      nightTop=rowsInk.length?Math.min(...rowsInk.map(b=>b[1])):(glyphs.final?.top||0);
      nightBottom=rowsInk.length?Math.max(...rowsInk.map(b=>b[1]+b[3])):nightTop+(glyphs.final?.height||0);
      spine=[];
      if(atlas?.channel){
        for(let j=0;j<atlas.height;j++){
          let best=Infinity,ix=-1;
          for(let i=0;i<atlas.width;i++){
            const p=(j*atlas.width+i)*4,a=atlas.channel;
            if(a[p+3]<20)continue;
            const score=Math.abs(a[p]-127.5)+(255-a[p+3])*.07;
            if(score<best){best=score;ix=i;}
          }
          spine.push(ix<0?NaN:(ix+.5)*w/atlas.width);
        }
      }
      historyBuffer();lastY=NaN;
    }
    function refreshPaper(f){
      if(f.y===lastPaperY)return;
      gc.fillStyle=paper(gc,f,h);gc.fillRect(0,0,w,h);
      const stops=f.stops||M.stops;
      if(surfacePaper&&stops[4]>f.y&&stops[3]<f.y+h){
        gc.drawImage(surfacePaper,0,stops[3]-f.y,w,stops[4]-stops[3]);
      }
      lastPaperY=f.y;
    }
    function protectTerms(f){
      for(const [index,r] of (f.termGuards||[]).entries()){
        if(!visible(r,h,guardPad))continue;
        const coreW=Math.ceil(r[2])+2,coreH=Math.ceil(r[3])+2,W=coreW+2*guardPad,H=coreH+2*guardPad;
        let cache=guardPaints.get(index);
        if(!cache||cache.mask.width!==W||cache.mask.height!==H){
          const mask=document.createElement('canvas'),patch=document.createElement('canvas');
          mask.width=patch.width=W;mask.height=patch.height=H;
          const m=mask.getContext('2d');let previous=0;
          for(let i=0;i<=12;i++){
            const t=(i+1)/13,opacity=ease(0,1,t),radius=(1-t)*guardPad;
            m.globalAlpha=clamp((opacity-previous)/Math.max(.0001,1-previous));
            m.beginPath();m.roundRect(guardPad-radius,guardPad-radius,coreW+2*radius,coreH+2*radius,radius);m.fill();
            previous=opacity;
          }
          cache={mask,patch,brush:patch.getContext('2d',{willReadFrequently:true})};guardPaints.set(index,cache);
        }
        const x=Math.floor(r[0])-guardPad-1,y=Math.floor(r[1])-guardPad-1,b=cache.brush;
        b.globalCompositeOperation='copy';b.drawImage(cache.mask,0,0);
        b.globalCompositeOperation='source-in';b.drawImage(ground,-x,-y,w,h);
        // Restore both the fresh plate and the accumulation buffer. The shared
        // paper source includes the warm seam, even when a term crosses it.
        ctx.drawImage(cache.patch,x,y);
        tc.globalCompositeOperation='destination-out';tc.drawImage(cache.mask,x,y);tc.globalCompositeOperation='source-over';
      }
    }
    function localAtlas(x,y){
      return (clamp(Math.floor(y/M.docH*atlas.height),0,atlas.height-1)*atlas.width+clamp(Math.floor(x/w*atlas.width),0,atlas.width-1))*4;
    }
    function obstacleY(y,f){
      if(f.earthHeld>0&&visible(f.ford4,h)&&y>=f.ford4[1]&&y<=f.ford4[1]+f.ford4[3])return y+f.y-f.earthHeld;
      if(f.nightHeld>0&&f.section>=6)return y+f.y-f.nightHeld;
      return y+f.y;
    }
    function pickShade(f){
      const mean=f.bg[0]+f.bg[1]+f.bg[2];
      return mean>1.2?ink.day:(f.bg[2]>f.bg[0]?ink.night:ink.earth);
    }
    function vectors(f){
      const obstacles=atlas?.obstacles,channel=atlas?.channel,impulses=f.impulses||[];
      for(let j=0;j<rows;j++)for(let i=0;i<cols;i++){
        const x=i*cell,y=j*cell,a=atlas?localAtlas(x,y+f.y):0,k=(j*cols+i)*3;
        const o=obstacles?localAtlas(x,obstacleY(y,f)):0;
        const calm=obstacles?obstacles[o]/255:0,edge=obstacles?obstacles[o+3]/255:0;
        const worldY=y+f.y,phase=f.t*.20+17,slow=f.section===4?.39:1;
        let dx=24+5*(.67*Math.cos(worldY*.009+phase)+.34*Math.cos(x*.005+worldY*.006-phase*.67));
        let dy=noise(x,worldY,f.t)*8;
        if(channel){
          const near=channel[a+3]/255*Math.exp(-Math.abs(channel[a]-127.5)/26)*spineOpacity(y,f.ford5);
          dx=mix(dx,(channel[a+1]/127.5-1)*53,near*.77);dy=mix(dy,(channel[a+2]/127.5-1)*53,near*.77);
        }
        if(visible(f.timeBed,h)){
          const near=Math.exp(-Math.abs(timeY(f.timeBed,x)-y)/Math.max(8,f.timeBed[3]*.35));
          dx=mix(dx,43,near);dy=mix(dy,(timeY(f.timeBed,x+4)-timeY(f.timeBed,x))*10.75,near);
        }
        if(edge>.01){
          const nx=obstacles[o+1]/127.5-1,ny=obstacles[o+2]/127.5-1,approach=Math.min(0,dx*nx+dy*ny);
          dx-=approach*nx*edge;dy-=approach*ny*edge;
          dy+=edge*(ny*18+Math.sin(y*.036+f.t*.6)*Math.max(0,nx)*10);
        }
        for(const r of impulses){const influence=cubicImpulse(r,x,y);if(!influence)continue;
          if(r[7]===1){const range=Math.hypot(x-r[0],y-r[1])||1;dx+=65*influence*(x-r[0])/range;dy+=65*influence*(y-r[1])/range;}
          else{const v=Math.hypot(r[2],r[3])||1,rad=Math.max(12,r[4]);dx+=(53*r[2]/v-(y-r[1])/rad*18)*influence;dy+=(53*r[3]/v+(x-r[0])/rad*18)*influence;}
        }
        const strings=f.ford2;
        if(visible(strings,h)&&Math.abs(y-strings[1]-strings[3]*.5)<strings[3]*1.3){
          for(let n=0;n<7;n++){
            const age=f.plucks?.[n]??20;if(age<0||age>3)continue;
            const q=Math.abs(y-strings[1]-strings[3]*(.12+.12*n))-age*53;
            dy+=Math.sin(x*.012-age*13)*Math.exp(-Math.abs(q)*.035-age*1.6)*33;
          }
        }
        if(visible(f.surface,h)){
          const r=f.surface,l=Math.hypot((x-r[0]-r[2]*.76)/Math.max(1,r[2]*.37),(y-r[1]-r[3]*.58)/Math.max(1,r[3]*.31));
          dy+=Math.sin(l*28-f.t*2)*Math.exp(-2.8*l)*ease(0,.13,l)*18;
        }
        const velocity=slow*(1+.52*Math.min(3,Math.abs(f.speed)))*(1-.92*calm);
        field[k]=dx*velocity;field[k+1]=dy*velocity;field[k+2]=calm;
      }
    }
    function bend(x,y,f){
      // Sample the same direction field for engraved bundles and for loose ink.
      const col=clamp(x/cell,0,cols-1.01),row=clamp(y/cell,0,rows-1.01);
      const i=Math.floor(col),j=Math.floor(row),k=(j*cols+i)*3+1,next=k+cols*3;
      const dy=mix(mix(field[k],field[k+3],col-i),mix(field[next],field[next+3],col-i),row-j);
      const a=atlas?.obstacles,idx=a?localAtlas(x,obstacleY(y,f)):0;
      const edge=a?(a[idx+2]/127.5-1)*(a[idx+3]/255)*12:0;
      return clamp(dy*.25+edge,-20,20)+noise(x,y,f.t)*1.1;
    }
    function backgroundInk(f,dt,clear,jump,present=true){
      count=Math.round(px.length*quality);stats.particles=count;
      refreshPaper(f);
      // Keep pigment on transparent paper. Repeated low-opacity redraws of an
      // 8-bit opaque background otherwise accumulate rounding errors in dark scenes.
      tc.globalAlpha=1;
      if(clear)tc.clearRect(0,0,w,h);
      else{
        if(Math.abs(jump)>.35){
          tc.globalCompositeOperation='copy';tc.drawImage(trails,0,-jump,w,h);
        }
        tc.globalCompositeOperation='destination-out';tc.globalAlpha=1-Math.exp(-dt*1.35);
        tc.fillRect(0,0,w,h);tc.globalCompositeOperation='source-over';
      }
      const groups=Array.from({length:8},()=>new Path2D()),colors=pickShade(f);
      const gold=clamp(f.gold,.01,.095);
      for(let i=0;i<count;i++){
        let x=px[i],y=py[i]-jump;
        y=((y%h)+h)%h;
        const k=(clamp(Math.floor(y/cell),0,rows-1)*cols+clamp(Math.floor(x/cell),0,cols-1))*3;
        const dx=field[k],dy=field[k+1],mult=weight[i],quiet=field[k+2]>.58;
        const pen=groups[(i/px.length<gold?3:i%3)*2+Number(quiet)],len=(clear?.66:.31)*mult;
        pen.moveTo(x-dx*len,y-dy*len);pen.quadraticCurveTo(x-dx*len*.42,y-dy*len*.58,x,y);
        x+=dx*dt*mult;y+=dy*dt*mult;
        if(x<-16||x>w+16){x=dx>=0?-2:w+2;y=seed(i+Math.floor(f.t*2))*h;}
        px[i]=x;py[i]=y;
      }
      tc.lineCap='round';
      for(let i=0;i<8;i++){
        tc.strokeStyle=i>=6?ink.gold:colors[i>>1];tc.lineWidth=.55+(i%3)*.16;
        tc.globalAlpha=(clear?(i%2?.012:.095):(i%2?.0025:.017)*Math.min(2,dt*60))*(i>=6?.75:1);tc.stroke(groups[i]);
      }
      tc.globalAlpha=1;
      if(present){ctx.globalAlpha=1;ctx.drawImage(ground,0,0,w,h);ctx.drawImage(trails,0,0,w,h);}
    }
    function paths(colors,alpha,width,groups){
      ctx.lineCap='round';ctx.lineJoin='round';
      for(let i=0;i<groups.length;i++){ctx.strokeStyle=colors[i%colors.length];ctx.lineWidth=width*(.58+i*.19);ctx.globalAlpha=alpha*(.74+i*.08);ctx.stroke(groups[i]);}
      ctx.globalAlpha=1;
    }
    function yarn(f,r,fn,lanes,half,colors,alpha,lineWidth,lo=-.05,hi=1.05,confine=null){
      if(!visible(r,h,80))return;
      const groups=Array.from({length:4},()=>new Path2D());
      const detail=Math.sqrt(quality);
      if(lanes>7)lanes=Math.max(7,Math.round(lanes*.65*detail));
      const nodes=clamp(Math.ceil(detail*(hi-lo)*r[2]/(small?16:28)),10,72);
      const guards=(f.termGuards||[]).filter(g=>visible(g,h,50)&&g[1]<r[1]+r[3]+54&&g[1]+g[3]>r[1]-54)
        .map(g=>({g,below:fn(g[0]+g[2]*.5,0,0)>g[1]+g[3]*.5}));
      for(let j=0;j<lanes;j++){
        const lane=lanes===1?0:j/(lanes-1)*2-1,id=17+j*19,phase=seed(id)*TAU;
        const p=groups[j%4],drift=f.t*(.12+.045*seed(id+1));
        const start=lanes>7&&j%6===0?lo+seed(id+2)*(hi-lo)*.46:lo;
        const end=lanes>7&&j%8===1?hi-seed(id+3)*(hi-lo)*.38:hi;
        let previousX=0,previousY=0;
        for(let k=0;k<=nodes;k++){
          const u=mix(start,end,k/nodes),x=r[0]+r[2]*u,center=fn(x,j,lane);
          const fan=Math.sin(u*TAU*.91+1.13+lane*.52);
          const spread=half*(.83+.29*fan+.14*Math.sin(u*TAU*2.65+drift*.10+lane*.45));
          const edge=half>4?half*.34*lane**3*(.42+Math.sin(u*TAU*2.23+phase*.25-drift*.12)):0;
          const grain=edge+Math.sin(u*21+phase-drift)*(.28+Math.abs(lane)*.64)+Math.sin(u*41+phase*.5-drift*.4)*.33;
          let y=center+lane*spread+grain+bend(x,center+lane*spread,f);
          for(const {g,below} of guards){
            const distanceX=Math.max(g[0]-x,x-g[0]-g[2],0);
            const distanceY=Math.max(g[1]-y,y-g[1]-g[3],0);
            const diversion=(1-ease(0,64,distanceX))*(1-ease(0,27,distanceY));
            const bank=below?Math.max(y,g[1]+g[3]+12):Math.min(y,g[1]-12);
            y=mix(y,bank,diversion);
          }
          if(confine)y=confine(y);
          if(!k)p.moveTo(x,y);
          else p.quadraticCurveTo(previousX,previousY,(x+previousX)/2,(y+previousY)/2);
          previousX=x;previousY=y;
        }
        p.lineTo(previousX,previousY);
      }
      // Keep the same continuous filament through quiet water. Its pigment becomes
      // lighter at the rounded banks, using the layout atlas rather than a cutout.
      const obstacle=atlas?.obstacles;
      if(obstacle&&typeof colors[0]==='string'){
        const stops=[];let touches=false;
        const samples=clamp(Math.ceil((hi-lo)*r[2]/40),4,42);
        for(let i=0;i<=samples;i++){
          const u=i/samples,x=r[0]+r[2]*mix(lo,hi,u),yy=fn(x,0,0);
          const quiet=obstacle[localAtlas(x,obstacleY(yy,f))]/255;
          stops.push([u,1-.94*quiet]);if(quiet>.04)touches=true;
        }
        if(touches)colors=colors.map(color=>{
          const rgb=parseInt(color.slice(1),16),gradient=ctx.createLinearGradient(r[0]+r[2]*lo,0,r[0]+r[2]*hi,0);
          for(const [u,strength] of stops)gradient.addColorStop(u,'rgba('+(rgb>>16)+','+((rgb>>8)&255)+','+(rgb&255)+','+strength+')');
          return gradient;
        });
      }
      paths(colors,alpha,lineWidth,groups);
    }
    function channel(f){
      if(spine.length<2)return;
      const dy=M.docH/spine.length,from=clamp(Math.floor(f.y/dy)-1,0,spine.length-1),to=clamp(Math.ceil((f.y+h)/dy)+1,0,spine.length-1);
      const groups=Array.from({length:4},()=>new Path2D());
      const banks=[f.hero,f.ford4,f.final].filter(r=>visible(r,h));
      for(let j=0;j<13;j++){
        const p=groups[j%4];let used=false,px0=0,py0=0;
        for(let i=from;i<=to;i++){
          const x=spine[i];if(!Number.isFinite(x)){used=false;continue;}
          const yy=(i+.5)*dy-f.y;
          if(banks.some(r=>yy>=r[1]&&yy<=r[1]+r[3])){used=false;continue;}
          const displacement=(j-6)*(.81+.22*Math.sin(i*.052+f.t*.16))+.9*Math.sin(i*.17+j*.36-f.t*.35);
          const xx=x+displacement+bend(x,yy,f)*.42;
          if(!used){p.moveTo(xx,yy);used=true;}else p.quadraticCurveTo(px0,py0,(xx+px0)*.5,(yy+py0)*.5);
          px0=xx;py0=yy;
        }
        if(used)p.lineTo(px0,py0);
      }
      let colors=pickShade(f);
      if(visible(f.ford5,h,60)){
        colors=colors.map(color=>{
          const grad=ctx.createLinearGradient(0,0,0,h),rgb=parseInt(color.slice(1),16);
          for(let i=0;i<=40;i++){const u=i/40;grad.addColorStop(u,'rgba('+(rgb>>16)+','+((rgb>>8)&255)+','+(rgb&255)+','+spineOpacity(u*h,f.ford5)+')');}
          return grad;
        });
      }
      paths(colors,.215,.9,groups);
    }
    function glyphInk(f,g,rect,kind,phase){
      if(!g||!visible(rect,h,100))return;
      const final=kind==='final',formation=final?ease(.13,.50,phase):ease(0,.50,phase)*(1-ease(.55,1,phase));
      if(!final&&(phase<=0||phase>=1))return;
      const handoff=final?1-ease(.50,.60,phase):1;
      const blend=final?ease(.77,.997,formation):0;
      if(final&&handoff<1){
        const path=new Path2D(),n=g.points.length/2;
        for(let j=0;j<Math.min(48,n);j++){
          const k=Math.floor(j*n/Math.min(48,n))*2,q=seed(j);
          const x=rect[0]+g.points[k]+4*Math.sin(q*TAU+f.t*.57);
          const y=rect[1]+g.points[k+1]+1.65*Math.cos(q*TAU-f.t*.41);
          path.moveTo(x-.8,y);path.lineTo(x+1.1,y+.12);
        }
        paths(['#e5ca8a'],.22*(1-handoff),.82,[path]);
      }
      if(handoff===0)return;
      if(blend*handoff>.001){
        ctx.globalAlpha=blend*handoff*.96;ctx.drawImage(g.raster,rect[0]+g.left,rect[1]+g.top,g.width,g.height);ctx.globalAlpha=1;
      }
      const points=g.points,groups=[new Path2D(),new Path2D(),new Path2D()];
      const cap=final?(small?3900:6700):190,step=Math.max(1,Math.ceil(points.length*.5/cap));
      const jitter=(1-formation)*(final?rect[3]*.028:25);
      for(let j=0;j<points.length/2;j+=step){
        const gx=rect[0]+points[j*2],gy=rect[1]+points[j*2+1],key=weight[j%weight.length],q=fract(j*.6180339887);
        let x,y;
        if(final){
          const u=fract(q+.055*f.t),sourceX=rect[0]+u*rect[2];
          x=mix(sourceX,gx,formation);
          y=mix(rect[1]+rect[3]*(.51+.022*Math.sin(u*TAU-f.t*.31)),gy,formation);
        }else{
          const release=1-formation;
          x=gx+(phase<.5?-1:1)*release*(30+q*110);y=gy;
        }
        x+=Math.sin(j*.13-f.t*.49)*jitter*.25;
        y+=Math.sin(q*TAU-f.t*.31)*jitter+(1-formation)*bend(x,y,f);
        const len=final?mix(4.8,g.step*.41,formation):2.5;
        const pen=groups[j%3];pen.moveTo(x-len,y+.14);pen.lineTo(x+len*.27,y+key*.12);
      }
      const alpha=final?mix(.20,.80,formation)*(1-.76*blend)*handoff:.26*Math.sin(phase*Math.PI);
      paths(final?['#b48b48','#d9b772','#f1daa4']:['#8b6c35','#987844','#bb9858'],alpha,final?clamp(g.step*1.2,.8,2.5):1.0,groups);
    }
    function passingWords(f){
      if(f.static)return;
      for(let i=0;i<glyphs.titleWords.length;i++){
        const age=f.dissolveAges?.[i],g=glyphs.titleWords[i],r=f.glyphBoxes?.[i];
        if(!g||!visible(r,h,50)||!(age>=0&&age<1.2))continue;
        const phase=age/1.2,groups=[new Path2D(),new Path2D(),new Path2D()],n=g.points.length/2;
        const marks=Math.min(56,n);
        for(let j=0;j<marks;j++){
          const k=Math.floor(j*n/marks)*2,q=seed(j+11*i);
          const x=r[0]+g.points[k]+(37+92*q)*phase;
          const y=r[1]+g.points[k+1]+Math.sin(q*TAU+phase*2)*phase*4;
          const len=.7+phase*(5+8*q),p=groups[j%3];
          p.moveTo(x-len,y);p.quadraticCurveTo(x-len*.28,y+.38,x,y+q*.5);
        }
        paths(['#1c2636'],.38*(1-ease(.11,1,phase))*ease(0,.07,phase),.74,groups);
      }
    }
    function sources(f){
      for(const r of f.impulses||[]){
        if(r[7]!==1||r[6]>2.9)continue;
        for(let i=0;i<4;i++){
          const age=r[6]-i*.19;if(age<0||age>2.4)continue;
          const radius=(.14+age*.73)*r[4];ctx.beginPath();ctx.ellipse(r[0],r[1],Math.max(1,radius),Math.max(1,radius*.22),0,0,TAU);
          ctx.strokeStyle=ink.gold;ctx.globalAlpha=clamp(.38*(1-age/2.4));ctx.lineWidth=.7;ctx.stroke();
        }
      }
      ctx.globalAlpha=1;
      for(const r of f.emissions||[]){
        if(r.age<0||r.age>2.8)continue;
        ctx.strokeStyle=ink.gold;ctx.globalAlpha=.37*(1-r.age/2.8);ctx.lineWidth=.8;ctx.beginPath();
        for(let i=0;i<24;i++){const k=seed(i),x=r.x+(12+34*k)*r.age,y=r.y+Math.sin(k*TAU+r.age)*(3+4*r.age);ctx.moveTo(x,y);ctx.lineTo(x+1+k*2,y+.2);}
        ctx.stroke();
      }
      ctx.globalAlpha=1;
    }
    function reaches(f){
      let r=f.hero;
      if(visible(r,h)){
        for(let k=0;k<2;k++){
          const half=(small?11:22)*(k?1.25:1);
          yarn(f,r,x=>heroY(r,x,k),small?54:96,half,k?['#39494d','#3c5054','#60736e']:['#586f65','#73877b','#516b62'],k?.67:.60,small?.85:1);
          yarn(f,r,x=>heroY(r,x,k),small?13:22,half*1.65,['#86958a','#a1a99a'],.26,.65);
        }
        const lx=f.light?.[0]??r[0]+r[2]*.77,ly=f.light?.[1]??r[1]+r[3]*.56;
        const radius=small?82:122,goldLight=ctx.createRadialGradient(lx,ly,0,lx,ly,radius);
        goldLight.addColorStop(0,'#94723b');goldLight.addColorStop(.45,'rgba(155,120,58,.9)');goldLight.addColorStop(1,'rgba(169,134,62,0)');
        const center=x=>(heroY(r,x,0)+heroY(r,x,1))*.5;
        yarn(f,r,center,5,2.5,[goldLight],.52,.85,(lx-r[0]-radius)/r[2],(lx-r[0]+radius)/r[2]);
      }
      channel(f);
      if(visible(f.band,h))yarn(f,f.band,x=>bandY(f.band,x,f.t),16,small?5:8,pickShade(f),.25,.7);
      r=f.ford2;
      if(visible(r,h))for(let i=0;i<7;i++)yarn(f,r,x=>stringY(r,x,i,f.plucks?.[i]??20),3,.85,ink.day,.55,.8);
      r=f.ford3;
      if(visible(r,h)){
        for(let i=0;i<10;i++){
          const base=(i-4.5)/9;
          yarn(f,r,x=>{
            const u=(x-r[0])/r[2],g=ease(.02,.84,u)*(.45+f.mergeP*.55);
            return r[1]+r[3]*(.50+base*.88*(1-g)+.13*Math.sin(TAU*u+.35)*(1-u));
          },4,1.4,ink.day,.39,.7);
        }
      }
      r=f.ford4;
      if(visible(r,h)){
        for(let i=0;i<17;i++){
          const level=(i+.5)/17;
          yarn(f,r,x=>r[1]+r[3]*(level+.013*Math.sin(x*.005+level*9-f.t*.028)+.007*Math.sin(x*.015-level*3)),2,.8,ink.earth,.17,.75);
        }
        const bottom=small?M.earthTextBottom-f.y+(f.earthHeld||0)*.58:NaN;
        const bed=x=>goldY(r,x,bottom);
        yarn(f,r,bed,7,2.5,['#a78340','#c6a663'],.65,.9);
        const head=.07+.86*f.earthP;
        const light=ctx.createLinearGradient(r[0]+r[2]*(head-.15),0,r[0]+r[2]*(head+.15),0);
        light.addColorStop(0,'transparent');light.addColorStop(.5,'#f8d68a');light.addColorStop(1,'transparent');
        yarn(f,r,bed,10,1.85,[light],.85,1,head-.15,head+.15);
      }
      r=f.surface;
      if(visible(r,h)){
        const point=.77;
        yarn(f,r,x=>r[1]+r[3]*(.93-.33*ease(.39,point,(x-r[0])/r[2])),6,1.5,['#a58449','#bfa05f'],.52,.85,-.05,point);
        for(let i=0;i<5;i++){const q=fract(f.t*.21+i/5);ctx.beginPath();ctx.ellipse(r[0]+r[2]*point,r[1]+r[3]*.60,Math.max(2,r[2]*(.014+.108*q)),Math.max(1,r[3]*(.006+.047*q)),0,0,TAU);ctx.strokeStyle='#b49455';ctx.lineWidth=.86;ctx.globalAlpha=.62*(1-q);ctx.stroke();}
        ctx.globalAlpha=1;
      }
      glyphInk(f,glyphs.vac,f.term,'vac',f.vacP||0);
      r=f.timeBed;
      if(visible(r,h)){
        yarn(f,r,x=>timeY(r,x),15,r[3]*.095,['#78887e','#6e807b','#667a7d'],.39,.78);
        for(const side of [-1,1]){
          yarn(f,r,x=>timeY(r,x)+side*r[3]*.082*Math.sin((x-r[0])/r[2]*TAU+.3),5,.95,ink.day,.34,.65);
        }
      }
      passingWords(f);
      r=f.final;
      if(visible(r,h,100)){
        for(let k=0;k<2;k++){
          const left=-.07,right=mix(.42,1.07,ease(0,.35,f.finalP));
          const half=small?6:Math.min(15,r[3]*(k?.047:.035));
          const inner=r[1]+(k?nightBottom+26:nightTop-26);
          const bound=small?y=>{
            const d=Math.abs(y-inner),soft=4*Math.log1p(Math.exp(-d/4));
            return k?Math.max(y,inner)+soft:Math.min(y,inner)-soft;
          }:null;
          yarn(f,r,x=>nightY(r,x,k,f.finalP),small?38:61,half,k?['#526677','#8a9aa5','#394d60']:['#a5b3aa','#c6cec2','#899c98'],k?.68:.79,.88,left,right,bound);
          yarn(f,r,x=>nightY(r,x,k,f.finalP),12,half*1.5,['#99a79f','#a5b8b0'],.23,.65,left,right,bound);
        }
        glyphInk(f,glyphs.final,r,'final',f.static?1:f.finalP);
      }
      sources(f);
    }
    function draw(frame){
      const dt=clamp(Number.isFinite(frame.dt)?frame.dt:1/60,0,.06),jump=Number.isFinite(lastY)?Math.abs(frame.y-lastY):h;
      const clear=frame.static||layoutChanged||jump>h*.36;
      clock+=frame.elapsed??dt;frames++;
      if(clock>=1&&!frame.static){
        const ms=clock*1000/frames,goal=small?21:16.8;
        const next=ms>goal*1.1?Math.max(.38,quality*.72):ms<goal*.8?Math.min(1,quality+.08):quality;
        if(Math.abs(next-quality)>.045){quality=next;sizeCanvas();historyBuffer();}
        clock=0;frames=0;
      }
      vectors(frame);
      if(frame.static){
        const steps=clamp(Math.round(Number(frame.settle)||8),4,12);
        for(let i=0;i<px.length;i++){px[i]=seed(i*3)*w;py[i]=seed(i*3+1)*h;}
        for(let j=0;j<steps;j++)backgroundInk(frame,1/30,j===0,0,j===steps-1);
      }else{
        backgroundInk(frame,dt,clear||layoutChanged,Number.isFinite(lastY)?clamp(frame.y-lastY,-h,h):0);
      }
      reaches(frame);
      protectTerms(frame);
      lastY=frame.y;layoutChanged=false;
    }
    function dispose(){trails.width=1;trails.height=1;glyphs=null;spine=null;field=null;px=null;py=null;weight=null;}
    layout(initial);
    return {layout,draw,dispose,stats};
  };
})();
