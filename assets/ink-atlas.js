/* Pure layout geometry. The expensive distance transforms run in a worker. */
function makeRiverAtlas({w, docH, obstacles, start, end}) {
  const width = Math.max(54, Math.min(160, Math.ceil(w / 10)));
  const height = Math.min(1600, Math.ceil(docH / 10));
  const dx = w / width, dy = docH / height;
  const calm = new Uint8Array(width * height * 4);
  const channel = new Uint8Array(calm.length);
  const distance = new Float32Array(width * height);
  const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
  const encode = x => Math.round((clamp(x, -1, 1) * .5 + .5) * 255);
  const parents = new Int16Array(width * height);
  let previous = new Float64Array(width), next = new Float64Array(width);

  for (let row=0; row<height; row++) {
    const y=(row+.5)*dy;
    const near=obstacles.filter(r=>y>r[1]-115 && y<r[1]+r[3]+115);
    const desired=w*(.5+.39*Math.sin((y-start)/495+.48*Math.sin(y/770)));
    for (let col=0; col<width; col++) {
      const x=(col+.5)*dx, k=row*width+col;
      let nearest=600, nx=0, ny=0, wake=0;
      for (const [left,top,rw,rh] of near) {
        const ax=x-left-rw/2, ay=y-top-rh/2;
        const radius=Math.min(58,rw*.24,rh*.25);
        const qx=Math.abs(ax)-rw/2+radius, qy=Math.abs(ay)-rh/2+radius;
        const ox=Math.max(qx,0), oy=Math.max(qy,0), len=Math.hypot(ox,oy);
        const d=len+Math.min(Math.max(qx,qy),0)-radius;
        if(d<nearest){
          nearest=d;
          nx=len?Math.sign(ax)*ox/len:qx>qy?Math.sign(ax):0;
          ny=len?Math.sign(ay)*oy/len:qx<=qy?Math.sign(ay):0;
        }
        if(ax>rw/2 && Math.abs(ay)<rh*.5+35){
          wake=Math.max(wake,Math.exp(-(ax-rw/2)/78)*Math.exp(-Math.abs(ay)/(rh*.35+14)));
        }
      }
      distance[k]=nearest;
      const calmness=clamp((72-nearest)/118,0,1);
      calm[k*4]=Math.round(255*calmness*calmness*(3-2*calmness));
      calm[k*4+1]=encode(nx);calm[k*4+2]=encode(ny);
      calm[k*4+3]=Math.round(255*Math.max(wake,Math.exp(-Math.abs(nearest)/44)));
      const clearance=Math.max(0,16-nearest)/12;
      const cost=((x-desired)/w)**2*9+clearance**2*18+(col===0||col===width-1?1:0);
      let best=Infinity, parent=col;
      const radiusCols=Math.ceil(6*dy/dx);
      for(let j=Math.max(0,col-radiusCols);j<=Math.min(width-1,col+radiusCols);j++){
        const value=previous[j]+.21*((col-j)*dx/dy)**2;
        if(value<best){best=value;parent=j;}
      }
      next[col]=best+cost;parents[k]=parent;
    }
    [previous,next]=[next,previous];
  }
  let exit=previous.indexOf(Math.min(...previous));
  const route=new Float32Array(height);
  for(let i=height-1;i>=0;i--){route[i]=(exit+.5)*dx;exit=parents[i*width+exit];}
  // Fair the route inside its clearance corridor, retaining a continuous downstream tangent.
  for(let pass=0;pass<8;pass++){
    const copy=route.slice();
    for(let i=1;i<height-1;i++){
      const candidate=(copy[i-1]+2*copy[i]+copy[i+1])*.25;
      if(distance[i*width+clamp(Math.floor(candidate/dx),0,width-1)]>5)route[i]=candidate;
    }
  }
  for(let row=0;row<height;row++){
    const y=(row+.5)*dy, active=clamp((y-start+80)/180,0,1)*clamp((end-y+100)/200,0,1);
    for(let col=0;col<width;col++){
      const x=(col+.5)*dx, k=(row*width+col)*4;
      let best=260*260, tx=0,ty=1;
      const reach=Math.ceil(260/dy);
      for(let j=Math.max(0,row-reach);j<Math.min(height-1,row+reach+1);j++){
        const ax=route[j],ay=(j+.5)*dy,vx=route[j+1]-ax;
        const len2=vx*vx+dy*dy;
        const t=clamp(((x-ax)*vx+(y-ay)*dy)/len2,0,1);
        const d2=(x-ax-t*vx)**2+(y-ay-t*dy)**2;
        if(d2<best){best=d2;const len=Math.sqrt(len2);tx=vx/len;ty=dy/len;}
      }
      channel[k]=encode(Math.sign(x-route[row])*Math.sqrt(best)/260);
      channel[k+1]=encode(tx);channel[k+2]=encode(ty);channel[k+3]=Math.round(255*active);
    }
  }
  return {width,height,channel,obstacles:calm};
}

