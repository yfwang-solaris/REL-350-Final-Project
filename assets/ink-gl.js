/* The moving plate. Coordinates in the simulation are CSS pixels, y downward. */
(()=>{
  'use strict';
  const header='#version 300 es\nprecision highp float;\nprecision highp int;\n';
  const globals=`
    layout(std140) uniform River {
      vec4 view;                  // width, height, document height, display DPR
      vec4 clock;                 // elapsed seconds, step, scroll Y, current speed
      vec4 phase;                 // ledger, confluence, underground front, tributary merge
      vec4 story;                 // passing sentence, gathered voice, section, static edition
      vec4 lamp;                  // center in CSS pixels, seed, previous scroll Y
      vec4 stopsA; vec4 stopsB;
      vec4 ground;
      vec4 areas[10];             // dawn, strings, tributaries, earth, spring, time, night, current, voice, spare
      vec4 letters[4];
      vec4 sourceA[8];            // center.xy, direction.xy
      vec4 sourceB[8];            // radius, strength, age in seconds, radial flag
      vec4 stringsA; vec4 stringsB;
      vec4 gifts[5];              // position, age, active
      vec4 nameGuards[5];         // viewport-space ink bounds, including every diacritic
      vec4 timeBed;
      vec4 dissolveAges;
      vec4 finalInk;              // upper and lower ink extrema in night-water CSS pixels
    };
    const float TAU=6.28318530718;
    float saturate(float x){return clamp(x,0.,1.);}
    float hashU(uint x){
      x ^= x>>16u; x*=2246822519u; x^=x>>13u; x*=3266489917u; x^=x>>16u;
      return float(x>>8u)/16777216.;
    }
    bool visible(vec4 r){return r.z>1. && r.w>1. && r.y<view.y+10. && r.y+r.w>-10.;}
    vec2 rockUV(vec2 p){
      float docY=p.y+clock.z,held=0.;
      if(p.y>=areas[3].y&&p.y<=areas[3].y+areas[3].w)held=areas[9].x;
      if(docY>=areas[9].z&&docY<areas[9].z+areas[9].w)held=areas[9].y;
      return clamp(vec2(p.x/view.x,(docY-held)/view.z),vec2(0.),vec2(1.));
    }
    vec2 safeUnit(vec2 v){return v*inversesqrt(max(dot(v,v),.0001));}
    vec2 curlAt(vec2 p){
      float t=clock.x*.20+lamp.z;
      return vec2(.67*cos(p.y*.009+t)+.34*cos(p.x*.005+p.y*.006-t*.67),
                 -.71*cos(p.x*.008+t)-.34*cos(p.x*.005+p.y*.006-t*.67));
    }
    vec2 impulseAt(vec2 p){
      vec2 result=vec2(0.);
      for(int i=0;i<8;i++){
        vec4 b=sourceB[i]; if(b.x<1. || b.y<=0.)continue;
        vec2 d=p-sourceA[i].xy;float radius=b.x;float dd=dot(d,d);
        if(dd>radius*radius*5.)continue;
        float l=sqrt(max(dd,.001)),q=l/radius;
        if(b.w>.5){
          float wave=sin(q*19.-b.z*9.)*exp(-9.*abs(q-b.z*.35));
          result+=safeUnit(d)*wave*b.y*65.*exp(-b.z*.65);
        }else{
          vec2 direction=safeUnit(sourceA[i].zw);
          result+=(direction*53.+vec2(-d.y,d.x)/radius*18.)*b.y*exp(-3.*q*q-b.z*2.2);
        }
      }
      return result;
    }
    float bandCenter(float x,vec4 r){
      return r.y+r.w*(.55+.115*sin((x-r.x)/r.z*TAU+.24*sin(clock.x*.2+lamp.z)));
    }
    float markClearance(vec2 p){
      float nearest=12.;
      for(int i=0;i<5;i++){
        vec4 r=nameGuards[i];if(r.z<=0.||r.w<=0.)continue;
        vec2 outside=max(r.xy-p,p-r.xy-r.zw);
        nearest=min(nearest,max(outside.x,outside.y));
      }
      return smoothstep(.80,8.,nearest);
    }
    float timeChannel(float u){
      return .505+.105*sin(TAU*u-.55)+.035*cos(13.*u+.2);
    }
    float pluck(int k){return k<4?stringsA[k]:stringsB[k-4];}
    float earthBed(float u){
      if(view.x<=760.&&ground.w>0.){
        vec4 r=areas[3];
        float bottom=ground.w-clock.z+areas[9].x*.58;
        float room=r.y+r.w-bottom;
        float center=clamp(room*.62,36.,49.);
        float swing=min(10.,max(0.,room-center-5.)*.58);
        return (bottom-r.y+center+swing*(.62*sin(u*TAU*1.2)+.28*cos(17.*u)-.10*smoothstep(.52,1.,u)))/max(1.,r.w);
      }
      return .85+.029*sin(u*TAU*1.2)+.017*cos(17.*u)-.055*smoothstep(.52,1.,u);
    }
    vec2 springCenter(){return areas[4].xy+areas[4].zw*vec2(.76,.58);}
    float springWave(vec2 p){
      vec4 r=areas[4];if(!visible(r))return 0.;
      vec2 d=(p-springCenter())/max(vec2(1.),r.zw*vec2(.37,.31));
      float l=length(d);
      return sin(l*28.-clock.x*2.)*exp(-2.8*l)*smoothstep(0.,.13,l);
    }
  `;
  const full=header+`
    out vec2 uv;
    void main(){vec2 p=vec2((gl_VertexID<<1)&2,gl_VertexID&2);uv=p;gl_Position=vec4(p*2.-1.,0.,1.);}
  `;
  const sim=header+globals+`
    uniform sampler2D stateTex,channelTex,obstacleTex;
    uniform bool seedStatic;
    out vec4 updated;
    void main(){
      vec4 state=texelFetch(stateTex,ivec2(gl_FragCoord.xy),0);
      if(seedStatic){
        uint id=uint(int(gl_FragCoord.y)*textureSize(stateTex,0).x+int(gl_FragCoord.x));
        state=vec4(hashU(id+137u),hashU(id+951u),20.,0.);
      }
      if(!seedStatic&&story.w<.5)state.y=fract(state.y-(clock.z-lamp.w)/view.y+1.);
      vec2 p=state.xy*view.xy,doc=vec2(p.x,p.y+clock.z);
      vec2 sampleAt=clamp(doc/vec2(view.x,view.z),vec2(0.),vec2(1.));
      vec4 channel=texture(channelTex,sampleAt),rock=texture(obstacleTex,rockUV(p));
      float distanceToBank=(channel.r-.5)*520.;
      float channelWeight=channel.a*exp(-distanceToBank*distanceToBank*.00065);
      vec2 tangent=safeUnit(channel.gb*2.-1.);
      vec2 current=vec2(24.,0.)+curlAt(doc)*vec2(5.,8.);
      vec4 ford=areas[5];
      if(timeBed.z>0.&&p.y>=ford.y&&p.y<=ford.y+ford.w){
        float u=(p.x-timeBed.x)/timeBed.z;
        float cy=timeBed.y+timeBed.w*timeChannel(u),dy=p.y-cy;
        float slope=timeBed.w*(timeChannel(u+.001)-timeChannel(u))/(.001*timeBed.z);
        float reach=max(16.,timeBed.w*.40);
        float pull=exp(-(dy*dy)/(reach*reach));
        current=mix(current,safeUnit(vec2(1.,slope))*43.,.9*pull);
        current.y-=clamp(dy*.23,-8.,8.)*pull;
      }else current=mix(current,tangent*41.,channelWeight*.87);
      vec2 normal=safeUnit(rock.gb*2.-1.),along=vec2(-normal.y,normal.x);
      along*=along.x<0.?-1.:1.;
      float edge=rock.a*(1.-rock.r);
      current+=(-min(dot(current,normal),0.)*normal+along*13.)*edge;
      current+=vec2(-normal.y,normal.x)*sin(doc.y*.037+clock.x*.32)*edge*max(normal.x,0.)*13.;
      current+=impulseAt(p);
      vec4 strings=areas[1];
      if(visible(strings)&&abs(p.y-strings.y-strings.w*.5)<strings.w*1.3){
        for(int k=0;k<7;k++){
          float age=pluck(k);if(age<0. || age>3.)continue;
          float py=strings.y+strings.w*(.12+float(k)*.12);
          float q=abs(p.y-py)-age*53.;
          current.y+=sin(p.x*.012-age*13.)*exp(-abs(q)*.035-age*1.6)*33.;
        }
      }
      current.y+=springWave(p)*18.;
      current*=mix(1.,.39,step(abs(story.z-4.),.45))*(1.+min(abs(clock.w),3.)*.52);
      current*=mix(1.,.08,rock.r);
      vec2 v=mix(state.zw,current,1.-exp(-clock.y*4.8));
      vec2 pos=fract(state.xy+v*clock.y/view.xy+1.);
      updated=vec4(pos,v);
    }
  `;
  const paletteMath=`
    uniform sampler2D paletteTex;
    vec3 paper(vec2 point){
      float y=point.y;
      if(stopsB.w<=stopsA.x)return ground.rgb;
      if(y<stopsA.y)return texelFetch(paletteTex,ivec2(0,0),0).rgb;
      float k;
      if(y<stopsA.z){k=saturate((y-stopsA.y)/max(1.,stopsA.z-stopsA.y));return texture(paletteTex,vec2((.5+255.*k)/256.,1./6.)).rgb;}
      if(y<stopsA.w)return texelFetch(paletteTex,ivec2(255,0),0).rgb;
      if(y<stopsB.x){
        k=saturate((y-stopsA.w)/max(1.,stopsB.x-stopsA.w));float u=point.x/view.x;
        k=clamp(k+sin(k*3.14159265)*(.055*sin(TAU*u+.4)+.021*sin(TAU*u*2.-.7)),0.,1.);
        return texture(paletteTex,vec2((.5+255.*k)/256.,.5)).rgb;
      }
      if(y<stopsB.y)return texelFetch(paletteTex,ivec2(255,1),0).rgb;
      if(y<stopsB.z){k=saturate((y-stopsB.y)/max(1.,stopsB.z-stopsB.y));return texture(paletteTex,vec2((.5+255.*k)/256.,5./6.)).rgb;}
      return texelFetch(paletteTex,ivec2(255,2),0).rgb;
    }
  `;
  const fade=header+globals+`
    uniform sampler2D historyTex,obstacleTex;
    uniform float retention;
    uniform vec2 historyUV;
    in vec2 uv;out vec4 color;
    void main(){
      float canvasY=(1.-uv.y)*view.y;
      // RGB16F stores the signed difference from local paper, with opaque alpha.
      // Multiplication here is precisely C_new = paper_now + (C_old-paper_old)*retention.
      // Untouched paper has an exactly representable zero difference at every stop.
      vec2 previous=vec2(uv.x,uv.y-(clock.z-lamp.w)/view.y);
      vec3 prev=previous.y<0.||previous.y>1.?vec3(0.):texture(historyTex,previous*historyUV).rgb;
      float quiet=smoothstep(.07,.86,texture(obstacleTex,rockUV(vec2(uv.x*view.x,canvasY))).r);
      color=vec4(prev*retention*mix(1.,.30,quiet)*markClearance(vec2(uv.x*view.x,canvasY)),1.);
    }
  `;
  const present=header+globals+paletteMath+`
    uniform sampler2D historyTex,grainTex;uniform vec2 historyUV;in vec2 uv;out vec4 color;
    void main(){
      float dither=(texelFetch(grainTex,ivec2(gl_FragCoord.xy)%64,0).r-.5)*.0035;
      vec2 halfTexel=.5/vec2(textureSize(historyTex,0));
      vec2 sampleAt=clamp(uv*historyUV,halfTexel,historyUV-halfTexel);
      vec2 p=vec2(uv.x*view.x,(1.-uv.y)*view.y);
      vec3 bg=paper(vec2(p.x,p.y+clock.z));
      color=vec4(bg+texture(historyTex,sampleAt).rgb*markClearance(p)+dither,1.);
    }
  `;
  const filaments=header+globals+paletteMath+`
    uniform sampler2D stateTex,obstacleTex,spineTex,glyphTex;
    uniform ivec2 glyphSets[6];
    uniform int stateWidth,particleStride,glyphSupplement;
    uniform float pixelRatio,inkCoverage;
    out vec2 local;out vec2 screenPoint;flat out vec4 ink;flat out vec3 stroke;
    vec2 glyphPoint(int group,float sampleId){
      ivec2 record=glyphSets[group];
      int texel=record.x+int(sampleId*float(max(1,record.y)));
      return texelFetch(glyphTex,ivec2(texel%512,texel/512),0).rg;
    }
    vec4 ridge(float docY){
      int height=textureSize(spineTex,0).y;
      float v=clamp(docY/view.z*float(height)-.5,0.,float(height-1));
      int j=int(v);
      return mix(texelFetch(spineTex,ivec2(0,j),0),texelFetch(spineTex,ivec2(0,min(j+1,height-1)),0),fract(v));
    }
    float bankY(float u,bool lower,bool night){
      if(night){
        float d=(u-.52)*2.9;
        float pinch=exp(-d*d)*smoothstep(0.,.35,phase.y);
        return lower?.98-.17*pinch+.036*sin(u*TAU*1.35+1.):
                      .01+.20*pinch+.029*sin(u*TAU*1.1-.7);
      }
      float shoal=(u-.36)/.25;
      return (lower?.92-.66*u+.10*sin(TAU*u-1.15):.74-.42*u+.12*sin(TAU*u+.6))+.095*exp(-shoal*shoal);
    }
    void main(){
      uint id=uint(gl_InstanceID*particleStride);
      // Additional letter samples need no simulated position. Their motion uses the same
      // scroll phase and glyph atlas as the ordinary gold particles.
      bool letterOnly=glyphSupplement!=0;
      vec4 state=vec4(0.);
      if(letterOnly)id=100u*(uint(glyphSupplement)+id/9u)+id%9u;
      else state=texelFetch(stateTex,ivec2(int(id)%stateWidth,int(id)/stateWidth),0);
      uint block=id/100u,slot=id%100u;
      float cohort=(float(slot)+hashU(block+29u))*.01,a=hashU(id+371u),b=hashU(id+983u),c=hashU(id+5011u),j=hashU(id+7867u);
      float u=state.x*1.1-.05;
      vec2 p=state.xy*view.xy;
      vec2 dir=safeUnit(state.zw+vec2(1.,0.));float len=6.+11.*c,width=.30+.42*j;
      bool night=story.z>=6.,underground=abs(story.z-4.)<.5;
      vec3 dayLight=vec3(.46,.56,.53),dayDark=vec3(.19,.27,.29);
      vec3 nightLight=vec3(.72,.76,.73),nightDark=vec3(.34,.41,.49);
      vec3 gold=night||underground?vec3(.88,.755,.48):vec3(.51,.38,.17);
      vec3 pigment=night?mix(nightDark,nightLight,a):(underground?mix(vec3(.36,.31,.27),vec3(.55,.49,.41),a):mix(dayDark,dayLight,a));
      float alpha=(.022+.038*b)*(.43+.57*a);
      bool isGold=letterOnly||cohort<phase.x;
      bool literal=false,assigned=false;
      int material=0; // ambient, dawn bank, night bank, silt, subterranean gold, strings/tributaries
      // Four independent packets of 56 physical filaments, each with an actual
      // elapsed lifetime. They start at their own word's ink and cannot leave a trail.
      if(story.w<.5&&id>=4096u&&id<4320u&&visible(areas[5])){
        int word=int((id-4096u)/56u);float age=dissolveAges[word];
        if(age>=0.&&age<1.2&&glyphSets[word+2].y>0){
          float life=age/1.2;
          vec2 start=letters[word].xy+glyphPoint(word+2,b);
          p=start+vec2((25.+48.*j)*life,(a-.5)*8.*life+sin(life*3.+c*TAU)*2.5*life);
          pigment=vec3(28.,38.,54.)/255.;
          alpha=(.32+.34*a)*(1.-smoothstep(.05,1.,life));
          width=.43+.28*b;len=1.2+1.8*c+life;dir=safeUnit(vec2(1.,.14*(a-.5)));
          literal=true;assigned=true;
        }
      }
      vec4 r=areas[6];
      if(!assigned&&visible(r)&&isGold&&glyphSets[0].y>0){
        float form=smoothstep(.13,.50,phase.y);
        float x=fract(a+clock.x*.020)*1.10-.05;
        // Stratify the reserved gold: even at the mobile floor the serifs and diacritics get ink.
        float glyphIndex=fract(float(block*10u+slot)*.618033989);
        vec2 target=r.xy+glyphPoint(0,glyphIndex);
        float wave=sin(x*TAU+b*.4+clock.x*.15);
        vec2 loose=r.xy+vec2(x*r.z,(.51+.034*wave+(b-.5)*.026)*r.w);
        p=mix(loose,target,form);
        p.y+=sin(c*32.+clock.x*.54)*(.22+2.6*(1.-form));
        p.x+=sin(j*11.+clock.x*.43)*.28;
        dir=safeUnit(vec2(1.,.17*wave*(1.-form)));width=mix(.67,1.18+.36*b,form);
        len=mix(9.+c*11.,.58+c*.70,form);pigment=mix(vec3(.78,.60,.32),vec3(1.,.9,.67),.47+.48*b);
        alpha=mix(.50,.93+.06*sin(clock.x*1.5+c*61.),form);
        float foil=smoothstep(.50,.60,phase.y);
        float twinkle=.13+.28*pow(max(0.,sin(clock.x*1.12+c*61.)),3.);
        alpha=mix(alpha,twinkle*smoothstep(.68,.95,j),foil);
        width=mix(width,.52+.20*b,foil);len=mix(len,.55+.50*c,foil);
        literal=true;assigned=true;
      }
      r=timeBed;
      if(!assigned&&visible(r)&&cohort<.36){
        float lane=a*2.-1.,family=b<.50?-1.:1.;
        float side=family*.082*sin(TAU*u+.3);
        float fiber=lane*.088*(.75+.21*sin(13.*u+family))+.012*sin(lane*14.+10.*u);
        if(c>.86)fiber+=sign(lane)*pow((c-.86)/.14,1.4)*.068;
        p=r.xy+vec2(u*r.z,(timeChannel(u)+side+fiber)*r.w);
        float slope=(timeChannel(u+.001)-timeChannel(u)+family*.082*(sin(TAU*(u+.001)+.3)-sin(TAU*u+.3)))*r.w/(.001*r.z);
        dir=safeUnit(vec2(1.,slope));pigment=family>0.?mix(dayDark,dayLight,.32*a):mix(dayDark,dayLight,.59+.36*a);
        alpha=c>.86?.075+.085*b:.085+.20*a;width=.34+.50*j;len=6.+20.*c;
        material=6;assigned=true;
      }
      bool duskQuote=visible(timeBed)&&visible(areas[7])&&areas[7].y>timeBed.y&&cohort>=.36&&cohort<.51;
      bool nightBank=visible(areas[6]);r=nightBank?areas[6]:areas[0];
      if(!assigned&&visible(r)&&cohort<.86&&!duskQuote){
        bool lower=b>.48;float bank=bankY(u,lower,nightBank);
        float lane=2.*a-1.;
        float spread=nightBank?r.w*.083:min(r.w*.055,33.);
        // A fine cut twists and gathers into small shoals inside the broader stream.
        float widthAtX=.65+.34*sin(u*13.+(lower?2.:0.))+.15*cos(u*31.);
        float fiber=lane*spread*widthAtX+sin(lane*17.+u*13.)*spread*.115;
        p=r.xy+vec2(u*r.z,bank*r.w+fiber);
        float slope=(bankY(u+.001,lower,nightBank)-bank)*r.w/(.001*r.z);
        dir=safeUnit(vec2(1.,slope));
        float outside=abs(lane);
        if(c>.79){
          p.y+=sign(lane)*pow((c-.79)/.21,1.6)*spread*2.4*(.7+.3*cos(u*19.+lane));
          alpha=.045+.14*b;len=6.+j*31.;
        }else{alpha=(.13+.32*a)*(.78+.22*cos(lane*37.));len=8.+j*25.;}
        width=.34+j*.66;
        pigment=nightBank?(lower?mix(nightDark,nightLight,a*.60):mix(nightDark,nightLight,.38+a*.62)):
                    (lower?mix(dayDark,dayLight,.32*a):mix(dayDark,dayLight,.56+.43*a));
        if(nightBank&&lower)pigment=mix(vec3(.14,.20,.27),nightLight,.07+.58*smoothstep(.51,.995,outside)+.035*j);
        if(!nightBank&&isGold){
          float center=(bankY(u,false,false)+bankY(u,true,false))*.5;
          p.y=r.y+center*r.w+lane*spread*.13;
          alpha=.72*(1.-smoothstep(35.,130.,distance(p,lamp.xy)));pigment=gold;
        }
        assigned=true;material=nightBank?2:1;
      }
      r=areas[3];
      if(!assigned&&visible(r)&&(isGold||cohort<.49)&&!(isGold&&visible(areas[4])&&c<.52)){
        float off=2.*a-1.;
        if(isGold){
          p=r.xy+vec2(u*r.z,(earthBed(u)+off*.004)*r.w);
          float front=.07+.86*phase.z;
          float delta=(u-front)*13.;float pulse=exp(-delta*delta);
          pigment=mix(vec3(.63,.49,.26),vec3(.98,.84,.54),pulse);
          alpha=.18+.70*pulse;width=.5+1.2*pulse;len=3.+7.*j+6.*pulse;material=4;
          dir=safeUnit(vec2(1.,(earthBed(u+.001)-earthBed(u))*r.w/(r.z*.001)));
        }else{
          // Beds of sediment are the same long-cut filaments, anchored to gently drifting strata.
          float level=floor(a*89.)/89.;
          float k=u*12.+level*3.+phase.z*.72+clock.x*.012;
          float base=level+.036*sin(k)+.014*cos(k*2.1+level*3.)+.003*sin(k*5.);
          p=r.xy+vec2(u*r.z,(base+(c-.5)*.006)*r.w);
          dir=safeUnit(vec2(1.,(.43*cos(k)-.353*sin(k*2.1+level*3.))*r.w/r.z));
          // Silt remains readable through the reading pockets. Its brightest pigment
          // itself is a dark earth tone, so a dense vein never competes with light ink.
          pigment=mix(vec3(.265,.235,.205),vec3(.38,.345,.30),j);alpha=(.065+.15*b)*smoothstep(0.,.13,level)*(1.-smoothstep(.84,1.,level));
          len=11.+36.*c;width=.33+.39*j;
          material=3;
        }
        assigned=true;
      }
      r=areas[4];
      if(!assigned&&visible(r)&&isGold){
        float lane=fract(floor(a*5.)*.2+clock.x*.067);
        float angle=u*TAU,rad=.035+lane*.34+(j-.5)*.007;
        p=springCenter()+vec2(cos(angle)*r.z,sin(angle)*r.w*.60)*rad;
        dir=safeUnit(vec2(-sin(angle)*r.z,cos(angle)*r.w*.60));
        pigment=gold;alpha=(1.-lane)*.73;len=4.+9.*c;width=.65+.34*b;assigned=true;material=4;
      }
      r=areas[1];
      if(!assigned&&visible(r)&&cohort<.18){
        int k=min(6,int(a*7.));float age=pluck(k);
        float amp=(age>=0.&&age<3.)?11.*exp(-age*1.65)*sin(age*14.):0.;
        float yN=.12+.12*float(k);
        p=r.xy+vec2(u*r.z,r.w*yN)+vec2(0.,amp*sin(u*TAU*2.)*sin(u*3.14159)+(c-.5)*1.5);
        dir=safeUnit(vec2(1.,amp*12.6*cos(u*TAU*2.)/max(r.z,1.)));
        pigment=mix(dayDark,dayLight,c);width=.37+.45*b;alpha=.08+.14*j;len=9.+22.*a;assigned=true;material=5;
      }
      r=areas[2];
      if(!assigned&&visible(r)&&cohort<.57){
        float branch=floor(a*15.)/14.;
        float k=smoothstep(.13,1.,u+.17*phase.w);
        float bed=mix(.08+.85*branch,.54,k)+.10*sin(u*TAU+1.8*branch)*(1.-k)+.049*sin(u*11.);
        p=r.xy+vec2(u*r.z,bed*r.w+(c-.5)*4.);
        float slope=(.54-branch)*r.w/r.z+.26*cos(u*11.)*r.w/r.z;
        dir=safeUnit(vec2(1.,slope));alpha=.06+.21*c;len=7.+19.*j;assigned=true;material=5;
      }
      r=areas[7];
      if(!assigned&&visible(r)&&cohort<.51){
        p.x=r.x+u*r.z;p.y=bandCenter(p.x,r)+(a-.5)*(.09*r.w+5.)*(.4+.6*c);
        dir=safeUnit(vec2(1.,(bandCenter(p.x+1.,r)-bandCenter(p.x-1.,r))*.5));
        width=.38+.43*j;len=7.+15.*c;alpha=.06+.12*b;assigned=true;material=5;
      }
      if(isGold&&!assigned&&visible(areas[8])&&glyphSets[1].y>0&&story.y>0.&&story.y<1.){
        vec2 dest=areas[8].xy+glyphPoint(1,j);
        float arrive=smoothstep(0.,.47,story.y),depart=smoothstep(.60,1.,story.y);
        p=dest+vec2(-100.-75.*a,(b-.5)*74.)*(1.-arrive)+vec2(175.+85.*c,19.*sin(a*TAU))*depart;
        pigment=gold;alpha=.5*(1.-depart);len=1.8+2.*c;width=.85;literal=true;assigned=true;
      }
      if(!assigned&&cohort<.115&&b<.86){
        p.y=fract(state.y+clock.x*.017)*view.y;vec4 bed=ridge(p.y+clock.z);
        float lane=(floor(a*24.)+.5+(j-.5)*.44)/24.;
        float side=(lane-.5)*(21.+20.*c);
        p.x=bed.r*view.x+side+sin(p.y*.010+a*3.+clock.x*.1)*1.6;
        dir=safeUnit(bed.gb);alpha=(.052+.18*j)*bed.a;width=.34+.47*b;len=5.+11.*c;assigned=true;
        // Turn the arriving/leaving reach toward its nearest bank. The long
        // interior is carried by timeBed, which crosses beneath the sentence.
        vec4 ford=areas[5];
        if(timeBed.z>0.&&p.y>=ford.y&&p.y<=ford.y+ford.w){
          float distanceInside=min(p.y-ford.y,ford.y+ford.w-p.y);
          float bend=smoothstep(0.,min(100.,ford.w*.11),distanceInside);
          float edge=p.x<view.x*.5?-30.:view.x+30.;
          p.x=mix(p.x,edge,bend);dir=safeUnit(mix(dir,vec2(sign(edge-view.x*.5),.22),bend));
          alpha*=1.-bend;
        }
        if(isGold){pigment=gold;alpha*=night||underground?1.3:.68;}
      }
      if(!assigned&&isGold){pigment=gold;alpha=night?.25:.078;}
      if(!literal){
        vec2 wake=impulseAt(p)+vec2(0.,springWave(p)*13.);
        p+=wake*.28;dir=safeUnit(dir+wake*.008);
        if(material!=2&&material!=4){
          // Night banks and the gold vein already have dedicated, unobstructed reading
          // registers. Cutting them with a projected text obstacle would break the river.
          vec4 rock=texture(obstacleTex,rockUV(p));
          vec2 normal=safeUnit(rock.gb*2.-1.);
          float edge=rock.a*(1.-rock.r),calm=smoothstep(.03,.98,rock.r);
          p+=normal*edge*(7.+9.*max(0.,-dot(dir,normal)));
          dir=safeUnit(dir-min(dot(dir,normal),0.)*normal*edge);
          float floorInk=material==3?.58:material==1?.53:material==5?.38:.16;
          alpha*=mix(1.,floorInk,calm);
          if(material==1||material==5)pigment=mix(pigment,vec3(.84,.84,.79),calm*.86);
        }
        for(int k=0;k<5;k++){
          vec4 event=gifts[k];
          if(!isGold||j>.046||event.w<.5||event.z>2.2||event.z<0.)continue;
          p=event.xy+vec2((c-.5)*36.+event.z*(26.+56.*b),(a-.5)*(19.+20.*event.z));
          pigment=gold;len=1.6+2.8*b;width=.53+.36*c;alpha=(.21+.25*b)*(1.-smoothstep(.30,2.2,event.z));
        }
      }
      // Preserve the weight of the river when software adapters draw fewer samples.
      if(inkCoverage>1.&&!literal){len*=sqrt(inkCoverage);alpha=1.-pow(1.-clamp(alpha,0.,1.),inkCoverage);}
      if(material==2&&view.x<=760.&&finalInk.y>finalInk.x){
        // Route the complete ribbon, including the outermost fibers, pointer
        // wake, antialias coverage and both ends of each pen cut, outside the
        // two-row inscription. A smooth monotone projection preserves its banks.
        vec4 nr=areas[6];bool lower=b>.48;
        float reach=abs(dir.y)*len*.5+width+.75+2.4/max(.35,pixelRatio);
        float lo=lower?nr.y+finalInk.y+25.+reach:nr.y+1.;
        float hi=lower?nr.y+nr.w-1.:nr.y+finalInk.x-25.-reach;
        if(lower)hi=max(hi,lo+2.);else lo=min(lo,hi-2.);
        float z=((p.y-nr.y)/nr.w-(lower?.89:.14))*5.;
        float curve=tanh(z);
        p.y=mix(lo,hi,.5+.47*curve);
        dir=safeUnit(vec2(dir.x,dir.y*min(1.,(hi-lo)*2.35*(1.-curve*curve)/nr.w)));
      }
      if(particleStride>1){pigment-=paper(vec2(p.x,p.y+clock.z));alpha*=literal||(material==2&&view.x<=760.)?0.:.19;len*=1.4;}
      float aa=.85/max(.35,pixelRatio),halfW=.5*width;
      float end=float(gl_VertexID>>1),side=float(gl_VertexID&1)*2.-1.;
      float px=mix(-aa-halfW,len+aa+halfW,end);
      vec2 xy=p+dir*(px-len*.5)+vec2(-dir.y,dir.x)*side*(halfW+aa);
      local=vec2(px,side*(halfW+aa));screenPoint=xy;stroke=vec3(len,halfW,aa);ink=vec4(pigment,alpha);
      gl_Position=vec4(xy/view.xy*vec2(2.,-2.)+vec2(-1.,1.),0.,1.);
    }
  `;
  const engraving=header+globals+`
    in vec2 local;in vec2 screenPoint;flat in vec4 ink;flat in vec3 stroke;out vec4 color;
    void main(){
      float cap=max(max(-local.x,local.x-stroke.x),0.);
      float taper=.63+.37*sin(3.14159*clamp(local.x/max(stroke.x,.001),0.,1.));
      float signedEdge=length(vec2(cap,local.y))-stroke.y*taper;
      float a=ink.a*(1.-smoothstep(-stroke.z,stroke.z,signedEdge))*markClearance(screenPoint);
      color=vec4(ink.rgb*a,a);
    }
  `;
  function paperPalette(){
    const lin=v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4;
    const srgb=v=>255*Math.max(0,Math.min(1,v<=.0031308?12.92*v:1.055*Math.max(0,v)**(1/2.4)-.055));
    const colors=[[241,236,226],[43,38,34],[236,226,208],[18,26,39],[121,94,69]];
    const lab=colors.map(rgb=>{
      const [r,g,b]=rgb.map(c=>lin(c/255));
      const l=Math.cbrt(.41222147*r+.53633254*g+.05144599*b);
      const m=Math.cbrt(.21190350*r+.68069955*g+.10739696*b);
      const s=Math.cbrt(.08830246*r+.28171884*g+.62997870*b);
      return [.21045426*l+.79361779*m-.00407205*s,1.97799850*l-2.42859221*m+.45059371*s,.02590404*l+.78277177*m-.80867577*s];
    });
    const out=new Uint8Array(256*3*4);
    for(let row=0;row<3;row++)for(let i=0;i<256;i++){
      const t=i/255;
      const a=row===1&&t>=.43?4:row,b=row===1&&t<.43?4:row+1;
      const weight=row===1?(t<.43?t/.43:(t-.43)/.57):t;
      const [L,A,B]=lab[a].map((v,j)=>v+(lab[b][j]-v)*weight);
      const l=(L+.39633778*A+.21580376*B)**3,m=(L-.10556135*A-.06385417*B)**3,s=(L-.08948418*A-1.29148555*B)**3;
      out.set([srgb(4.07674166*l-3.30771159*m+.23096993*s),srgb(-1.268438*l+2.60975740*m-.34131940*s),srgb(-.00419609*l-.70341861*m+1.70761470*s),255].map(Math.round),(row*256+i)*4);
    }
    return out;
  }
  function grain(){
    let seed=17;const white=new Uint8Array(64*64),out=new Uint8Array(white.length);
    for(let i=0;i<white.length;i++){seed=(Math.imul(seed,1664525)+1013904223)>>>0;white[i]=seed>>>24;}
    // Periodic high-pass noise suppresses low-frequency clusters in the paper grain.
    for(let y=0;y<64;y++)for(let x=0;x<64;x++){
      const i=y*64+x;
      const average=(white[y*64+((x+1)&63)]+white[y*64+((x+63)&63)]+white[((y+1)&63)*64+x]+white[((y+63)&63)*64+x])*.25;
      out[i]=Math.min(255,Math.max(0,128+.65*(white[i]-average)));
    }
    return out;
  }
  function ridgeFromAtlas(atlas){
    const rows=new Float32Array(atlas.height*4),{width,height,channel}=atlas;
    for(let y=0;y<height;y++){
      let closest=Infinity,best=0;
      for(let x=0;x<width;x++){
        const i=4*(y*width+x),err=Math.abs(channel[i]-127.5)+(255-channel[i+3])*.001;
        if(err<closest){closest=err;best=x;}
      }
      const i=(y*width+best)*4;
      let center=(best+.5)/width;
      if(best>0&&best<width-1){
        const slope=(channel[i+4]-channel[i-4])*.5;
        if(Math.abs(slope)>.01)center+=Math.max(-.5,Math.min(.5,(127.5-channel[i])/slope))/width;
      }
      rows.set([center,channel[i+1]/127.5-1,channel[i+2]/127.5-1,channel[i+3]/255],y*4);
    }
    return rows;
  }
  window.RiverGL=(canvas,initial)=>{
    const gl=canvas.getContext('webgl2',{alpha:false,antialias:false,depth:false,stencil:false,premultipliedAlpha:true,preserveDrawingBuffer:false,powerPreference:'high-performance'});
    if(!gl||!gl.getExtension('EXT_color_buffer_float'))return null;
    const info=gl.getExtension('WEBGL_debug_renderer_info');
    const rendererName=gl.getParameter(info?info.UNMASKED_RENDERER_WEBGL:gl.RENDERER);
    let leanInk=/swiftshader|llvmpipe|softpipe|software rasterizer|microsoft basic render/i.test(rendererName);
    if(leanInk){gl.getExtension('WEBGL_lose_context')?.loseContext();return null;}
    const programs=[],textures=[],buffers=[],framebuffers=[];
    let vao,ubo,model,disposed=false;
    const pendingFrames=[];
    function clearFences(){
      for(const fence of pendingFrames)gl.deleteSync(fence);
      pendingFrames.length=0;
    }
    function dispose(){
      if(disposed)return;disposed=true;
      clearFences();
      for(const p of programs)gl.deleteProgram(p);
      for(const t of textures)gl.deleteTexture(t);
      for(const f of framebuffers)gl.deleteFramebuffer(f);
      for(const b of buffers)gl.deleteBuffer(b);
      if(vao)gl.deleteVertexArray(vao);
    }
    function shader(type,src){
      const s=gl.createShader(type);gl.shaderSource(s,src);gl.compileShader(s);return s;
    }
    function link(vertex,fragment){
      const v=shader(gl.VERTEX_SHADER,vertex),f=shader(gl.FRAGMENT_SHADER,fragment);
      const p=gl.createProgram();programs.push(p);gl.attachShader(p,v);gl.attachShader(p,f);gl.linkProgram(p);
      if(!gl.getProgramParameter(p,gl.LINK_STATUS)){
        const message=[gl.getProgramInfoLog(p),gl.getShaderInfoLog(v),gl.getShaderInfoLog(f)].filter(Boolean).join('\n');
        gl.deleteShader(v);gl.deleteShader(f);throw new Error(message);
      }
      gl.deleteShader(v);gl.deleteShader(f);
      const block=gl.getUniformBlockIndex(p,'River');if(block!==gl.INVALID_INDEX)gl.uniformBlockBinding(p,block,0);
      return p;
    }
    function texture(filter){
      const t=gl.createTexture();textures.push(t);gl.bindTexture(gl.TEXTURE_2D,t);
      for(const p of [gl.TEXTURE_MIN_FILTER,gl.TEXTURE_MAG_FILTER])gl.texParameteri(gl.TEXTURE_2D,p,filter);
      for(const p of [gl.TEXTURE_WRAP_S,gl.TEXTURE_WRAP_T])gl.texParameteri(gl.TEXTURE_2D,p,gl.CLAMP_TO_EDGE);
      return t;
    }
    function storage(t,internal,w,h,format,type,data){
      gl.bindTexture(gl.TEXTURE_2D,t);gl.texImage2D(gl.TEXTURE_2D,0,internal,w,h,0,format,type,data);
    }
    function framebuffer(t){
      const f=gl.createFramebuffer();framebuffers.push(f);gl.bindFramebuffer(gl.FRAMEBUFFER,f);
      gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,t,0);return f;
    }
    function bind(unit,t){gl.activeTexture(gl.TEXTURE0+unit);gl.bindTexture(gl.TEXTURE_2D,t);}
    function inputs(program,mapping){
      gl.useProgram(program);
      for(const [name,unit] of Object.entries(mapping))gl.uniform1i(gl.getUniformLocation(program,name),unit);
    }
    try{
      const simulate=link(full,sim),deposit=link(filaments,engraving),fadePaper=link(full,fade),display=link(full,present);
      inputs(simulate,{stateTex:0,channelTex:1,obstacleTex:2});
      inputs(deposit,{stateTex:0,obstacleTex:2,spineTex:3,glyphTex:4,paletteTex:6});
      inputs(fadePaper,{historyTex:5,obstacleTex:2});inputs(display,{historyTex:5,grainTex:7,paletteTex:6});
      const loc={
        ranges:gl.getUniformLocation(deposit,'glyphSets[0]'),
        stateWidth:gl.getUniformLocation(deposit,'stateWidth'),
        stride:gl.getUniformLocation(deposit,'particleStride'),
        coverage:gl.getUniformLocation(deposit,'inkCoverage'),
        supplement:gl.getUniformLocation(deposit,'glyphSupplement'),
        density:gl.getUniformLocation(deposit,'pixelRatio'),
        retain:gl.getUniformLocation(fadePaper,'retention'),
        fadeUV:gl.getUniformLocation(fadePaper,'historyUV'),
        displayUV:gl.getUniformLocation(display,'historyUV'),
        seed:gl.getUniformLocation(simulate,'seedStatic')
      };
      vao=gl.createVertexArray();gl.bindVertexArray(vao);
      ubo=gl.createBuffer();buffers.push(ubo);gl.bindBuffer(gl.UNIFORM_BUFFER,ubo);
      const frameData=new Float32Array(53*4);gl.bufferData(gl.UNIFORM_BUFFER,frameData.byteLength,gl.DYNAMIC_DRAW);
      gl.bindBufferBase(gl.UNIFORM_BUFFER,0,ubo);
      const state=[texture(gl.NEAREST),texture(gl.NEAREST)];
      const history=[texture(gl.LINEAR),texture(gl.LINEAR)];
      const channel=texture(gl.LINEAR),rocks=texture(gl.LINEAR),ridge=texture(gl.NEAREST),glyph=texture(gl.NEAREST);
      const palette=texture(gl.LINEAR),paper=texture(gl.NEAREST);
      const simFbo=state.map(framebuffer),trailFbo=history.map(framebuffer);
      storage(palette,gl.RGBA8,256,3,gl.RGBA,gl.UNSIGNED_BYTE,paperPalette());
      storage(paper,gl.R8,64,64,gl.RED,gl.UNSIGNED_BYTE,grain());
      const N=384,capacity=N*320;
      const initialState=new Float32Array(capacity*4);
      let seed=17;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
      for(let i=0;i<capacity;i++)initialState.set([random(),random(),18+random()*11,(random()-.5)*5],i*4);
      for(const t of state)storage(t,gl.RGBA32F,N,320,gl.RGBA,gl.FLOAT,initialState);
      gl.bindFramebuffer(gl.FRAMEBUFFER,simFbo[0]);
      if(gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE)throw new Error('Floating-point state framebuffer is unavailable.');
      gl.useProgram(deposit);gl.uniform1i(loc.stateWidth,N);
      const stats={backend:'webgl2',renderer:rendererName,particles:0,trailScale:.62,dpr:1,frames:0};
      let stateIndex=0,trailIndex=0,trailW=0,trailH=0,capacityW=0,capacityH=0,lastY=NaN;
      let lastStaticSection=-1,wallTime=0,finalTop=0,finalBottom=0;
      let minCount=40000,maxCount=120000,windowTime=0,windowFrames=0,fastWindows=0,warmFrames=0;
      function sizeHistory(){
        const w=Math.max(1,Math.round(canvas.width*stats.trailScale)),h=Math.max(1,Math.round(canvas.height*stats.trailScale));
        if(w===trailW&&h===trailH)return;
        trailW=w;trailH=h;
        lastY=NaN;
      }
      let densityLimit=leanInk?.68:2;
      function sizeSurface(){
        const dpr=Math.min(densityLimit,model.dpr||devicePixelRatio||1,Math.sqrt(6400000/(model.w*model.h)));
        const w=Math.max(1,Math.round(model.w*dpr)),h=Math.max(1,Math.round(model.h*dpr));
        if(canvas.width!==w)canvas.width=w;if(canvas.height!==h)canvas.height=h;
        stats.dpr=dpr;
      }
      function layout(m){
        clearFences();
        model=m;sizeSurface();
        const lines=m.finalGlyphBounds||[];
        finalTop=lines.length?Math.min(...lines.map(box=>box[1])):0;
        finalBottom=lines.length?Math.max(...lines.map(box=>box[1]+box[3])):0;
        const mobile=Boolean(m.small),min=leanInk?4800:mobile?15000:40000,max=leanInk?12000:mobile?30000:120000;
        if(min!==minCount||!stats.particles){stats.particles=leanInk?8000:mobile?21000:56000;stats.trailScale=leanInk?.48:mobile?.56:.62;}
        minCount=min;maxCount=max;
        // The trail buffers have spare capacity. Quality changes move the viewport
        // inside them without allocating GPU memory during a gesture.
        const maxW=Math.max(1,Math.ceil(canvas.width*.78)),maxH=Math.max(1,Math.ceil(canvas.height*.78));
        if(maxW!==capacityW||maxH!==capacityH){
          capacityW=maxW;capacityH=maxH;
          for(const t of history)storage(t,gl.RGBA16F,capacityW,capacityH,gl.RGBA,gl.HALF_FLOAT,null);
          gl.bindFramebuffer(gl.FRAMEBUFFER,trailFbo[0]);
          if(gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE)throw new Error('Ink accumulation framebuffer is incomplete.');
        }
        sizeHistory();
        const at=m.atlas;
        gl.activeTexture(gl.TEXTURE0);
        storage(channel,gl.RGBA8,at.width,at.height,gl.RGBA,gl.UNSIGNED_BYTE,at.channel);
        storage(rocks,gl.RGBA8,at.width,at.height,gl.RGBA,gl.UNSIGNED_BYTE,at.obstacles);
        storage(ridge,gl.RGBA32F,1,at.height,gl.RGBA,gl.FLOAT,ridgeFromAtlas(at));
        const g=m.glyphs||{},sets=[g.final,g.vac,...(g.titleWords||[])];
        const ranges=new Int32Array(12);let total=0;
        for(let i=0;i<6;i++){ranges[2*i]=total;ranges[2*i+1]=Math.floor((sets[i]?.length||0)/2);total+=ranges[2*i+1];}
        const rows=Math.max(1,Math.ceil(total/512)),points=new Float32Array(512*rows*2);
        for(let i=0;i<6;i++)if(sets[i])points.set(sets[i],ranges[2*i]*2);
        storage(glyph,gl.RG32F,512,rows,gl.RG,gl.FLOAT,points);
        gl.useProgram(deposit);gl.uniform2iv(loc.ranges,ranges);
        bind(1,channel);bind(2,rocks);bind(3,ridge);bind(4,glyph);bind(6,palette);bind(7,paper);
        gl.bindFramebuffer(gl.FRAMEBUFFER,null);lastY=NaN;warmFrames=0;lastStaticSection=-1;wallTime=0;
      }
      const empty=[0,-1e6,0,0],emptySource=[0,0,0,0];
      const areaNames=['hero','ford2','ford3','ford4','surface','ford5','final','band','term'];
      function fillFrame(f,dt){
        const data=frameData;data.fill(0);
        data.set([model.w,model.h,model.docH,stats.dpr],0);
        data.set([f.static?.75:f.t,f.static?1/48:dt,f.y,f.speed||0],4);
        data.set([f.gold,f.finalP,f.earthP,f.mergeP],8);
        data.set([f.sentencePhase,f.vacP,f.section,f.static?1:0],12);
        data.set([f.light?.[0]??model.w*.7,f.light?.[1]??model.h*.65,f.noiseSeed??17,Number.isFinite(lastY)?lastY:f.y],16);
        data.set(f.stops,20);data.set(f.bg,28);data[31]=model.earthTextBottom||0;
        for(let i=0;i<9;i++)data.set(f[areaNames[i]]||empty,(8+i)*4);
        data.set([f.earthHeld||0,f.nightHeld||0,model.night?.[1]||1e7,model.night?.[3]||0],17*4);
        for(let i=0;i<4;i++)data.set(f.glyphBoxes?.[i]||empty,(18+i)*4);
        for(let i=0;i<Math.min(8,f.impulses?.length||0);i++){
          const impulse=f.impulses[i];for(let j=0;j<4;j++){data[(22+i)*4+j]=impulse[j];data[(30+i)*4+j]=impulse[j+4];}
        }
        for(let i=0;i<7;i++)data[38*4+i]=f.plucks?.[i]??10;
        for(let i=0;i<5;i++){
          const e=f.emissions?.[i];data.set(e?[e.x,e.y,e.age,1]:emptySource,(40+i)*4);
          data.set(f.termGuards?.[i]||empty,(45+i)*4);
        }
        data.set(f.timeBed||empty,50*4);
        for(let i=0;i<4;i++)data[51*4+i]=f.dissolveAges?.[i]??-1;
        data[52*4]=finalTop;data[52*4+1]=finalBottom;
        gl.bindBuffer(gl.UNIFORM_BUFFER,ubo);gl.bufferSubData(gl.UNIFORM_BUFFER,0,data);
      }
      function adapt(dt){
        if(dt<=0||warmFrames++<4)return;
        windowTime+=dt;windowFrames++;if(windowTime<1)return;
        const average=windowTime/windowFrames,slow=model.small?1/51:1/58;
        if(average>slow){
          if(!leanInk&&average>.085&&stats.particles===minCount&&densityLimit<=1){
            leanInk=true;minCount=4800;maxCount=12000;stats.particles=8000;
            densityLimit=.68;sizeSurface();
          }
          if(average>.029&&stats.particles===minCount&&densityLimit>.75){
            densityLimit=Math.max(.75,Math.min(stats.dpr,densityLimit)*.8);sizeSurface();
          }
          const next=Math.max(minCount,Math.floor(stats.particles*.84));
          stats.particles=next;stats.trailScale=Math.max(.34,stats.trailScale-.055);fastWindows=0;
        }else if(average<1/66&&++fastWindows>=4){
          stats.particles=Math.min(maxCount,Math.round(stats.particles*1.12));
          stats.trailScale=Math.min(.78,stats.trailScale+.035);fastWindows=0;
        }
        sizeHistory();windowTime=0;windowFrames=0;
      }
      function advance(seed=false){
        gl.disable(gl.BLEND);gl.useProgram(simulate);bind(0,state[stateIndex]);
        gl.uniform1i(loc.seed,seed?1:0);
        stateIndex=1-stateIndex;gl.bindFramebuffer(gl.FRAMEBUFFER,simFbo[stateIndex]);
        gl.viewport(0,0,N,Math.ceil(stats.particles/N));gl.drawArrays(gl.TRIANGLES,0,3);
      }
      function inkPass(stride,dpr){
        gl.useProgram(deposit);bind(0,state[stateIndex]);
        gl.uniform1i(loc.supplement,0);
        gl.uniform1f(loc.coverage,leanInk?Math.min(4,Math.sqrt((model.small?21000:56000)/stats.particles)):1);
        gl.uniform1i(loc.stride,stride);gl.uniform1f(loc.density,dpr);
        gl.enable(gl.BLEND);gl.blendFunc(gl.ONE,gl.ONE_MINUS_SRC_ALPHA);
        gl.drawArraysInstanced(gl.TRIANGLE_STRIP,0,4,Math.floor(stats.particles/stride));gl.disable(gl.BLEND);
      }
      function draw(f){
        if(disposed||gl.isContextLost())return false;
        // Do not queue stale scroll positions behind a busy GPU. The next free frame uses the current position.
        if(!f.static&&f.dt>0){
          while(pendingFrames.length){
            const status=gl.clientWaitSync(pendingFrames[0],0,0);
            if(status===gl.TIMEOUT_EXPIRED)break;
            gl.deleteSync(pendingFrames.shift());
          }
          if(pendingFrames.length>=1)return false;
        }
        const now=performance.now();
        const elapsed=f.dt>0&&wallTime?(now-wallTime)/1000:f.dt;
        const dt=Math.max(0,Math.min(.06,elapsed));
        if(!f.static)adapt(elapsed);
        wallTime=now;
        gl.bindVertexArray(vao);fillFrame(f,dt);
        if(f.static){
          if(lastStaticSection!==f.section){
            advance(true);
            for(let i=1;i<Math.max(1,Math.min(18,f.settle||1));i++)advance();
            lastStaticSection=f.section;
          }
        }else{lastStaticSection=-1;advance();}
        const old=trailIndex;trailIndex=1-old;
        gl.bindFramebuffer(gl.FRAMEBUFFER,trailFbo[trailIndex]);gl.viewport(0,0,trailW,trailH);
        gl.useProgram(fadePaper);bind(5,history[old]);
        const distance=Number.isFinite(lastY)?Math.abs(f.y-lastY):1e9;
        const retention=f.static?0:Math.exp(-dt*2.2-distance/50);
        gl.uniform1f(loc.retain,retention);gl.uniform2f(loc.fadeUV,trailW/capacityW,trailH/capacityH);gl.drawArrays(gl.TRIANGLES,0,3);
        inkPass(8,stats.dpr*stats.trailScale);
        gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.viewport(0,0,canvas.width,canvas.height);
        gl.useProgram(display);bind(5,history[trailIndex]);gl.uniform2f(loc.displayUV,trailW/capacityW,trailH/capacityH);gl.drawArrays(gl.TRIANGLES,0,3);
        inkPass(1,stats.dpr);
        if(leanInk&&f.final&&f.final[1]<model.h&&f.final[1]+f.final[3]>0&&f.finalP>.13&&f.finalP<.6){
          const group=Math.ceil(stats.particles/100);
          // Match the reference count at the point where individual letters must be legible.
          const ramp=Math.min(1,(f.finalP-.13)/.30);
          const extra=Math.round(((model.small?21000:56000)*.09-group*9)*ramp*ramp*(3-2*ramp));
          if(extra>0){
            gl.uniform1i(loc.supplement,group);gl.enable(gl.BLEND);
            gl.drawArraysInstanced(gl.TRIANGLE_STRIP,0,4,extra);gl.disable(gl.BLEND);
          }
        }
        stats.frames++;lastY=f.y;
        if(!f.static&&f.dt>0){
          const fence=gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE,0);
          if(fence)pendingFrames.push(fence);
        }
        return true;
      }
      layout(initial);return {layout,draw,dispose,stats};
    }catch(error){
      dispose();console.warn('Engraved river: WebGL initialization could not finish.',error.message);return null;
    }
  };
})();
