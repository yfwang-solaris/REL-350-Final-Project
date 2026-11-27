/* All layout reads, font measurements and field-map construction happen here. */
window.RiverLayout = (() => {
  'use strict';
  const $ = s=>document.querySelector(s), all=s=>Array.from(document.querySelectorAll(s));
  const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
  const rect=e=>{const r=e.getBoundingClientRect();return [r.x,r.y+scrollY,r.width,r.height];};
  const context=document.createElement('canvas').getContext('2d',{willReadFrequently:true});
  const font=css=>[css.fontStyle,css.fontWeight,css.fontSize,css.fontFamily].join(' ');
  const paragraphWords=new Map();
  const quoteText=new Map(all('.quote-ribbon').map(n=>[n,n.textContent]));
  const svgNS='http://www.w3.org/2000/svg';

  function wordsIn(paragraph) {
    if(!paragraphWords.has(paragraph)){
      const walker=document.createTreeWalker(paragraph,NodeFilter.SHOW_TEXT);
      const nodes=[];while(walker.nextNode())nodes.push(walker.currentNode);
      const words=[];
      for(const node of nodes){
        const frag=document.createDocumentFragment();
        for(const part of node.data.match(/\S+|\s+/gu)||[]){
          if(!part.trim()){frag.append(part);continue;}
          const span=document.createElement('span');
          span.className='read-ink';span.textContent=part;
          frag.append(span);words.push(span);
        }
        node.replaceWith(frag);
      }
      paragraphWords.set(paragraph,words);
    }
    const words=paragraphWords.get(paragraph),lines=[];
    for(const word of words){word.style.removeProperty('transform');word.style.removeProperty('opacity');}
    let line=null;
    for(const word of words){
      const r=word.getBoundingClientRect(),middle=r.y+r.height*.5;
      if(!line||(!word.closest('sup')&&Math.abs(middle-line.middle)>9)){line={middle,parts:[]};lines.push(line);}
      line.parts.push(word);
    }
    if(paragraph.closest('#return')){
      let cursor=0;
      const pieces=[];
      for(const line of lines){
        for(const el of line.parts){pieces.push({el,delay:cursor});cursor++;}
        cursor+=.65;
      }
      return {el:paragraph,pieces,duration:cursor,fade:1,box:rect(paragraph)};
    }
    const pieces=lines.flatMap((line,i)=>line.parts.map((el,j)=>({el,delay:i*.060+j/line.parts.length*.145})));
    return {el:paragraph,pieces,duration:.62+lines.length*.060,box:rect(paragraph)};
  }

  function sampleLetters(width,height,rows) {
    const surface=document.createElement('canvas');
    surface.width=Math.max(1,Math.ceil(width));surface.height=Math.max(1,Math.ceil(height));
    const brush=surface.getContext('2d',{willReadFrequently:true});
    const bounds=[];
    for(const row of rows){
      brush.font=row.font;brush.fillStyle='#fff';brush.textAlign=row.align||'center';
      if(row.spacing)brush.letterSpacing=row.spacing;
      const info=brush.measureText(row.text);
      const baseline=row.mid+(info.actualBoundingBoxAscent-info.actualBoundingBoxDescent)/2;
      const scale=Math.min(1,row.maxWidth/Math.max(1,info.width));
      brush.save();brush.translate(row.x,baseline);brush.scale(scale,1);
      brush.fillText(row.text,0,0);brush.restore();
      row.baseline=baseline;row.scale=scale;
      bounds.push([row.x-info.actualBoundingBoxLeft*scale,baseline-info.actualBoundingBoxAscent,
        (info.actualBoundingBoxLeft+info.actualBoundingBoxRight)*scale,info.actualBoundingBoxAscent+info.actualBoundingBoxDescent]);
    }
    const image=brush.getImageData(0,0,surface.width,surface.height),points=[];
    for(let y=0;y<surface.height;y++)for(let x=0;x<surface.width;x++){
      if(image.data[(y*surface.width+x)*4+3]>82)points.push(x+.5,y+.5);
    }
    // Deterministic spatial coverage even at the lowest device particle budget.
    let seed=1749;
    for(let i=points.length/2-1;i>0;i--){
      seed=(Math.imul(seed,1664525)+1013904223)>>>0;const j=Math.floor((seed/4294967296)*(i+1))*2,k=i*2;
      [points[k],points[j]]=[points[j],points[k]];[points[k+1],points[j+1]]=[points[j+1],points[k+1]];
    }
    return {points:new Float32Array(points),bounds};
  }
  function textGlyph(el,box){
    const css=getComputedStyle(el);
    return sampleLetters(box[2],box[3],[{text:el.querySelector('.term-spelling')?.textContent??el.textContent,font:font(css),x:0,mid:box[3]*.5,maxWidth:Math.max(1,box[2]),align:'left',spacing:css.letterSpacing}]).points;
  }
  function guardTerm(el,wordBox){
    const ink=el.querySelector('.term-art text'),style=getComputedStyle(el);
    context.font=font(style);context.letterSpacing=style.letterSpacing;
    const metrics=context.measureText(ink.textContent);
    const origin=el.querySelector('.gild-origin').getBoundingClientRect(),outer=el.getBoundingClientRect();
    // The mobile vīṇā has an authored horizontal scale. Keep the italic overhang inside the viewport.
    const scale=ink.getScreenCTM().a/(Number(ink.dataset.fit)||1);
    const fit=Math.min(1,(innerWidth-origin.x-4)/Math.max(1,metrics.actualBoundingBoxRight*scale));
    ink.setAttribute('transform','scale('+fit+' 1)');ink.dataset.fit=fit;
    const x=wordBox[0]+origin.x-outer.x,y=wordBox[1]+origin.y-outer.y;
    return [x-metrics.actualBoundingBoxLeft*scale*fit-1,y-metrics.actualBoundingBoxAscent-1,
      (metrics.actualBoundingBoxLeft+metrics.actualBoundingBoxRight)*scale*fit+2,
      metrics.actualBoundingBoxAscent+metrics.actualBoundingBoxDescent+2];
  }
  function setInscription(rows){
    const group=$('.final-gilt g');
    const text=rows.map(row=>{
      const element=document.createElementNS(svgNS,'text');
      element.style.font=row.font;
      element.setAttribute('transform','translate('+row.x+' '+row.baseline+') scale('+row.scale+' 1)');
      element.textContent=row.text;
      return element;
    });
    group.replaceChildren(...text);
  }
  function prepareQuote(el,w){
    const text=quoteText.get(el),parts=(text+'　·　').match(/\S+\s*/gu)||[];
    context.font=font(getComputedStyle(el));context.letterSpacing='0px';
    const widths=parts.map(word=>context.measureText(word).width);
    const period=widths.reduce((a,b)=>a+b,0),repeats=Math.ceil(w/period)+2;
    const fragments=document.createDocumentFragment(),tokens=[];let x=0;
    for(let k=0;k<repeats;k++)for(let i=0;i<parts.length;i++){
      const token=document.createElement('span');token.className='ink-token';token.textContent=parts[i];fragments.append(token);
      tokens.push({el:token,x,width:widths[i]});x+=widths[i];
    }
    return {el,fragments,box:rect(el),period,tokens,fontSize:parseFloat(getComputedStyle(el).fontSize)};
  }
  function makeAtlasAsync(input){
    const source='self.onmessage=e=>{const atlas=('+makeRiverAtlas.toString()+')(e.data);self.postMessage(atlas,[atlas.channel.buffer,atlas.obstacles.buffer]);}';
    return new Promise((resolve,reject)=>{
      const url=URL.createObjectURL(new Blob([source],{type:'text/javascript'}));
      let worker;
      try{worker=new Worker(url);}catch(error){URL.revokeObjectURL(url);resolve(makeRiverAtlas(input));return;}
      const close=()=>{worker.terminate();URL.revokeObjectURL(url);};
      worker.onmessage=e=>{close();resolve(e.data);};
      worker.onerror=e=>{close();reject(new Error(e.message));};
      worker.postMessage(input);
    });
  }
  async function build(reduced) {
    const w=innerWidth,h=innerHeight,small=w<=760;
    const reach=$('.earth-stage'),earth=$('.earth-pin'),copy=$('#ford4 .spread');
    copy.style.removeProperty('transform');
    const finalSection=$('#return'),pin=$('.night-pin');
    reach.classList.toggle('hold',!reduced&&!small&&h>=580&&earth.offsetHeight<=h&&copy.offsetHeight<h*.78);
    finalSection.classList.toggle('hold-night',!reduced&&pin.offsetHeight<=h+2&&h>=640);
    const paragraphs=all('.copy p,.night-pin>p').map(wordsIn);
    const earthStage=rect(reach),night=rect(finalSection);
    const ebox=rect(earth),nbox=rect(pin),eHeld=reach.classList.contains('hold')?earthStage[3]-ebox[3]:0,
      nHeld=finalSection.classList.contains('hold-night')?night[3]-nbox[3]:0;
    const natural=e=>{
      const r=rect(e);
      if(earth.contains(e))r[1]-=ebox[1]-earthStage[1];
      if(pin.contains(e))r[1]-=nbox[1]-night[1];
      return r;
    };
    for(const p of paragraphs)p.box=natural(p.el);
    const earthParagraph=natural($('#ford4 .copy p'));
    const earthTextBottom=earthParagraph[1]+earthParagraph[3];
    const finale=natural($('.night-water')),terms=all('.term'),termBoxes=terms.map(natural);
    const termGuards=terms.map((el,i)=>guardTerm(el,termBoxes[i]));
    const words=all('.sentence span');
    // Measure the unmoved sentence when rebuilding during a resize.
    for(const word of words)word.style.removeProperty('transform');
    const wordBoxes=words.map(rect);
    const fontSize=small?clamp(w*.105,36,46):clamp(w*.046,36,64);
    const goldRows=(small?['vāc · soma · vīṇā','sarasvatī · tīrtha · kāla']:[$('.final-inscription').textContent]).map((text,index)=>({
      text,font:'italic 400 '+fontSize+'px Cormorant',x:finale[2]/2,mid:finale[3]*(small?(index?.595:.405):.52),maxWidth:finale[2]*(small?.92:.90)
    }));
    const finalGlyph=sampleLetters(finale[2],finale[3],goldRows);
    setInscription(goldRows);
    const glyphs={final:finalGlyph.points,vac:textGlyph($('.term'),termBoxes[0]),titleWords:all('.sentence span').map((e,i)=>textGlyph(e,wordBoxes[i]))};
    const quotes=all('.quote-ribbon').map(e=>prepareQuote(e,w));
    const obstacles=all('.title h1,.title .label,.subtitle,.question,.term,.copy,.mat,figcaption,blockquote,.identity .label,.night-pin>h2,.night-pin>.label,.night-pin>p,.footgrid').map(el=>{
      const r=natural(el);
      return [r[0]-4,r[1]-5,r[2]+8,r[3]+10];
    });
    for(const r of wordBoxes)obstacles.push([r[0]-5,r[1]-5,r[2]+(small?23:53)+10,r[3]+10]);
    const fords=all('.ford').map(rect),surface=rect($('.resurface')),strings=rect($('.strings'));
    const quote3=rect($('#ford3 blockquote')),streams=rect($('.streams'));
    streams[1]=Math.min(streams[1],quote3[1]-45);streams[3]=Math.max(104,quote3[1]+quote3[3]*.42-streams[1]);
    const dusk=rect($('#ford5+.current')),docH=document.documentElement.scrollHeight;
    const sentenceBottom=Math.max(...wordBoxes.map(r=>r[1]+r[3]));
    const timeBed=[0,sentenceBottom+12,w,clamp(dusk[1]+dusk[3]*.28-sentenceBottom-12,36,small?60:94)];
    const stopY=[0,fords[3][1],fords[3][1]+h*.245,surface[1],surface[1]+surface[3]*.99,dusk[1],dusk[1]+dusk[3]*.83,docH];
    if(reduced)for(const i of [2,6])stopY[i]=stopY[i-1];
    const colors=['#f1ece2','#f1ece2','#2b2622','#2b2622','#ece2d0','#ece2d0','#121a27','#121a27'];
    const paperStops=stopY.map((y,i)=>colors[i]+' '+Math.round(y)+'px');
    paperStops.splice(4,0,'#795e45 '+Math.round(stopY[3]+.43*(stopY[4]-stopY[3]))+'px');
    document.body.style.backgroundImage='linear-gradient(to bottom in oklab,'+paperStops.join(',')+')';
    const atlas=await makeAtlasAsync({w,docH,obstacles,start:rect($('#top'))[3]*.75,end:night[1]+h*.15});
    return {w,h,docH,small,dpr:Math.min(devicePixelRatio,2),atlas,glyphs,termBoxes,termGuards,wordBoxes,timeBed,quotes,paragraphs,earthTextBottom,
      imageBoxes:all(".mat").map(natural),stops:stopY,hero:rect($('.dawn-art')),fords,strings,streams,earthStage,earthBox:[ebox[0],earthStage[1],ebox[2],ebox[3]],earthHold:eHeld,
      surface,sentence:rect($('.sentence')),night,nightHold:nHeld,finale,finalGlyphBounds:finalGlyph.bounds};
  }
  return {build};
})();

