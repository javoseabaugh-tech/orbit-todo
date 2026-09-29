// GLSL for the Water theme. Written for WebGL 1 so it runs on every phone.
//
// POOL draws the whole dial scene from above: the rock (rock.jpg) around a
// photographed rim (rim.jpg), a bowl of pebbles (pebbles.jpg) and the water
// itself, which is computed live: a calm uneven surface, refraction that blurs
// with depth, light patterns on the floor, sky and bank reflections, glints,
// the spring and its waterfall, lily pads for reminders and drifting leaves.
// Units: q is measured in pool radii from the pool centre, y up.
//
// NIGHTLY brings nightly.jpg to life: the water moves, the candle flickers,
// fireflies drift and a tick sends a ripple out from the candle.

export const POOL = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
uniform vec2 C; uniform vec2 RES; uniform float RAD; uniform float T; uniform float LV; uniform float NT; uniform float SURGE;
uniform vec3 RIP[8]; uniform vec4 MK[6]; uniform float NOW;
uniform sampler2D ROCK; uniform sampler2D PEB; uniform sampler2D RIM; uniform float TX;
#define PI 3.14159265
#define RO 1.48
float lum(vec3 c){return dot(c,vec3(.3,.59,.11));}
float RW; vec2 E; vec3 Ld; vec3 H; vec3 sunC; float sunI; vec3 amb; vec2 l2;

float hash(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y);}
float noise(vec2 p){vec2 i=floor(p),f=fract(p);vec2 u=f*f*(3.-2.*f);
 return mix(mix(hash(i),hash(i+vec2(1.,0.)),u.x),mix(hash(i+vec2(0.,1.)),hash(i+vec2(1.,1.)),u.x),u.y);}
const mat2 M2=mat2(1.6,1.2,-1.2,1.6);
float fbm(vec2 p){float v=0.,a=.5;for(int i=0;i<5;i++){v+=a*noise(p);p=M2*p;a*=.5;}return v;}
float fbm3(vec2 p){float v=0.,a=.5;for(int i=0;i<3;i++){v+=a*noise(p);p=M2*p;a*=.5;}return v;}
vec3 voro(vec2 p){vec2 n=floor(p),f=fract(p);float d1=8.,d2=8.,id=0.;
 for(int j=-1;j<=1;j++)for(int i=-1;i<=1;i++){vec2 g=vec2(float(i),float(j));vec2 o=vec2(hash(n+g),hash(n+g+19.7));
  float d=length(g+o-f);if(d<d1){d2=d1;d1=d;id=hash(n+g+7.3);}else if(d<d2){d2=d;}}
 return vec3(d1,d2,id);}
vec4 peb(vec2 p){vec2 n=floor(p),f=fract(p);float md=8.,id=0.;vec2 mr=vec2(0.);
 for(int j=-1;j<=1;j++)for(int i=-1;i<=1;i++){vec2 g=vec2(float(i),float(j));vec2 o=.5+.6*(vec2(hash(n+g),hash(n+g+19.7))-.5);
  vec2 r=g+o-f;float d=length(r);if(d<md){md=d;mr=r;id=hash(n+g+7.3);}}
 return vec4(mr,md,id);}
float caustic(vec2 uv,float t){vec2 p=mod(uv*6.28318,6.28318)-250.;vec2 i=p;float c=1.,inten=.005;
 for(int n=0;n<4;n++){float tt=t*(1.-(3.5/float(n+1)));i=p+vec2(cos(tt-i.x)+sin(tt+i.y),sin(tt-i.y)+cos(tt+i.x));
  c+=1./length(vec2(p.x/(sin(i.x+tt)/inten),p.y/(cos(i.y+tt)/inten)));}
 c/=4.;c=1.17-pow(c,1.4);return pow(abs(c),8.);}
vec2 padPos(vec4 m){float a=m.x;return RW*.72*vec2(sin(a),cos(a))+.02*vec2(sin(T*.5+a*3.),cos(T*.4+a*2.));}
float wh(vec2 q){
 float h=.0075*noise(q*5.+T*vec2(.11,.04))+.005*noise(q*10.3-T*vec2(.07,.13))+.0018*noise(q*23.+T*vec2(.21,-.09));
 float r=length(q-E);
 h+=(.006+.02*SURGE)*sin(r*40.-T*7.+noise(q*7.)*2.5)*exp(-r*5.);
 for(int i=0;i<8;i++){vec3 s=RIP[i];float a=T-s.z;if(a>0.&&a<5.){float x=length(q-s.xy)-a*.5;h+=.028*sin(x*50.)*exp(-x*x*90.)*exp(-a*.9);}}
 for(int i=0;i<6;i++){vec4 m=MK[i];if(m.y>.01){float r2=length(q-padPos(m));h+=.004*m.y*sin(r2*70.-T*3.)*exp(-r2*9.);}}
 return h;}
vec3 floorCol(vec2 p,float bl){
 float dd=length(p);vec2 dir=p/max(dd,1e-3);
 vec4 pb=peb(p*13.);
 float pr=.36+.1*pb.w;
 float h=sqrt(max(pr*pr-pb.z*pb.z,0.));
 vec3 n=normalize(vec3(-pb.xy,h+.32));
 float m=smoothstep(pr,pr-.1,pb.z);
 vec3 c1=pb.w<.25?vec3(.46,.47,.47):pb.w<.5?vec3(.6,.54,.45):pb.w<.75?vec3(.43,.45,.4):vec3(.66,.64,.6);
 c1*=.85+.3*noise(p*60.);
 vec3 sand=vec3(.5,.45,.36)*(.8+.3*noise(p*90.));
 vec3 pc=c1*(amb+sunC*sunI*max(dot(n,Ld),0.)*1.1);
 vec3 c=mix(sand*(amb+sunC*sunI*.75)*.7,pc,m);
 if(TX>.5){
  vec2 pu=p*.7+.5;vec3 pt=texture2D(PEB,pu,bl).rgb*.62;float l0=lum(pt);
  vec3 pn=normalize(vec3(-(lum(texture2D(PEB,pu+vec2(1./1024.,0.),bl).rgb*.62)-l0)*7.,-(lum(texture2D(PEB,pu+vec2(0.,1./1024.),bl).rgb*.62)-l0)*7.,1.));
  c=pt*(amb*.75+sunC*sunI*max(dot(pn,Ld),0.)*1.05);
 }
 vec3 ws=TX>.5?texture2D(ROCK,p*.5,bl).rgb*.75:vec3(.28,.29,.27)*(.7+.6*fbm3(p*14.));
 vec3 wn=normalize(vec3(-dir*.9*dd,1.));
 ws*=amb+sunC*sunI*max(dot(wn,Ld),0.);
 c=mix(c,ws,smoothstep(.8,.95,dd));
 c*=1.-.5*sunI*smoothstep(.55,1.,dd)*max(dot(dir,l2),0.);
 return c;}
float rimH(float d){return smoothstep(.985,1.07,d)*smoothstep(RO+.02,RO-.1,d);}

void main(){
 vec2 fc=gl_FragCoord.xy;vec2 q=(fc-C)/RAD;vec2 w=fc/RAD;float d=length(q);vec2 dir=q/max(d,1e-4);
 float fr=fract(atan(q.x,q.y)/(2.*PI));
 float aa=1.5/RAD;
 RW=mix(.52,.95,LV);E=vec2(0.,RW-.035);
 Ld=normalize(vec3(-.45,.55,.7));H=normalize(Ld+vec3(0.,0.,1.));l2=normalize(Ld.xy);
 sunC=mix(vec3(1.,.96,.88),vec3(.62,.72,1.),NT);sunI=mix(1.,.4,NT);
 amb=mix(vec3(.46,.5,.55),vec3(.07,.1,.17),NT);

 // ground: dark wet rock with moss
 vec3 v=voro(w*1.2+3.+(vec2(fbm3(w*1.7),fbm3(w*1.7+5.2))-.5)*1.4);
 float gap=smoothstep(.02,.12,v.y-v.x);
 vec2 gp=w*4.;float g0=fbm3(gp);float ge=.03;
 vec3 gn=normalize(vec3(-(fbm3(gp+vec2(ge,0.))-g0)/ge*.5,-(fbm3(gp+vec2(0.,ge))-g0)/ge*.5,1.));
 vec3 alb=mix(vec3(.2,.21,.21),vec3(.32,.32,.3),v.z)*(.7+.6*fbm(w*10.));
 float moss=clamp(smoothstep(.5,.68,fbm3(w*2.5+7.))+(1.-gap)*.8,0.,1.);
 vec3 mc=mix(vec3(.12,.2,.08),vec3(.26,.36,.14),noise(w*60.))*(.75+.5*noise(w*25.));
 alb=mix(alb,mc,moss*.9);
 alb*=1.-.25*smoothstep(RO+.35,RO,d);
 vec3 col=alb*(amb+sunC*sunI*max(dot(gn,Ld),0.)*1.1);
 col+=sunC*mix(.9,.6,NT)*pow(max(dot(gn,H),0.),50.)*.2*(1.-moss);
 col*=mix(.55,1.,gap);
 if(TX>.5){
  vec2 ru=w*.23;vec3 rt=texture2D(ROCK,ru).rgb;float l0=lum(rt);
  vec3 tn=normalize(vec3(-(lum(texture2D(ROCK,ru+vec2(1./1024.,0.)).rgb)-l0)*6.,-(lum(texture2D(ROCK,ru+vec2(0.,1./1024.)).rgb)-l0)*6.,1.));
  float mo=smoothstep(.02,.08,rt.g-(rt.r+rt.b)*.5);
  col=rt*(amb*.7+sunC*sunI*max(dot(tn,Ld),0.)*1.02)+sunC*mix(.9,.6,NT)*pow(max(dot(tn,H),0.),30.)*.12*(1.-mo);
 }
 col*=1.-.45*smoothstep(RO+.14,RO-.02,d);
 col*=1.-.35*sunI*smoothstep(RO+.35,RO,d)*max(dot(dir,-l2),0.);

 // bowl and water
 if(d<1.){
  float D=.32;float hb=-D*(1.-d*d);float L=-D*(1.-RW*RW);
  vec3 inner=floorCol(q,0.);
  inner*=1.-.35*smoothstep(RW+.06,RW,d);
  if(d<RW+.03){
   float e=.004;float h0=wh(q);
   vec2 g=vec2(wh(q+vec2(e,0.))-h0,wh(q+vec2(0.,e))-h0)/e;
   vec3 n=normalize(vec3(-g,1.));
   float depth=max(L-hb,0.);
   vec2 fq=q+n.xy*(depth*1.4+.012);
   vec3 fl=floorCol(fq,depth*16.);
   // light patterns: broken up, fading with depth
   float cs=caustic(fq*.55+(vec2(noise(fq*3.),noise(fq*3.+9.))-.5)*.25,T*.35);
   fl*=1.+cs*mix(.95,.25,NT)*sunI*smoothstep(0.,.04,depth)*(1.-.6*smoothstep(.06,.2,depth));
   for(int i=0;i<6;i++){vec4 m=MK[i];if(m.y>.01){float sd=length(fq-padPos(m)+l2*depth*.25);fl*=1.-.5*m.y*smoothstep(.15,.09,sd);}}
   // natural green-teal absorption
   vec3 tr=exp(-vec3(3.1,1.3,1.1)*depth*7.);
   vec3 deep=mix(vec3(.025,.15,.14),vec3(.008,.04,.055),NT);
   vec3 wc=fl*tr+deep*(1.-tr)*(amb*1.1+sunC*sunI*.55);
   // reflection: sky in the middle, dark banks near the edge
   vec3 R=reflect(vec3(0.,0.,-1.),n);
   float cl=fbm3(R.xy*1.6+vec2(T*.012,0.)+q*.5);
   vec3 sky=mix(mix(vec3(.5,.68,.86),vec3(.93,.95,.98),smoothstep(.45,.8,cl)),
                vec3(.015,.025,.06)+vec3(.06,.08,.12)*smoothstep(.6,.9,cl)+step(.9985,hash(floor((R.xy*.5+q)*120.)))*.3,NT);
   float bk=smoothstep(RW*.45,RW*.98,length(q+R.xy*.4));
   vec3 bank=mix(vec3(.07,.09,.06),vec3(.008,.012,.012),NT)*(1.+.6*fbm3(q*9.+R.xy*3.));
   vec3 refl=mix(sky,bank,bk);
   float fres=clamp(.07+(1.-n.z)*10.+bk*.28,0.,.62);
   wc=mix(wc,refl,fres);
   // the moon's reflection, wavering with the surface
   vec2 mq=q*.55+R.xy*1.6-vec2(-.2,.24);
   wc+=NT*(1.-bk)*(vec3(.85,.9,1.)*smoothstep(.07,.045,length(mq))*.9+vec3(.35,.45,.65)*exp(-dot(mq,mq)*14.)*.22);
   // sun or moon: broad sheen plus sparkle on tiny ripples
   vec2 mg=(vec2(noise(q*85.+T*1.6),noise(q*85.+37.-T*1.4))-.5)*.22;
   float nh=max(dot(n,H),0.),ns=max(dot(normalize(n+vec3(mg,0.)),H),0.);
   wc+=sunC*pow(ns,900.)*mix(5.,2.6,NT)+sunC*pow(nh,50.)*.12*sunI;
   // meniscus: a thin bright lip and wet dark band, no foam ring
   float lip=exp(-pow((RW-d)/.006,2.));
   wc=mix(wc,wc*.7,smoothstep(RW-.05,RW,d)*.5)+sunC*lip*.18*(sunI+.2);
   // a few drifting leaves
   for(int i=0;i<3;i++){float fi=float(i);float a0=fi*2.1+T*.018*(1.+fi*.3);
    vec2 lp=RW*(.35+.2*fi)*vec2(sin(a0),cos(a0));vec2 lq=q-lp;float ra=fi*1.7+T*.05;
    lq=mat2(cos(ra),-sin(ra),sin(ra),cos(ra))*lq;
    float lf=length(lq*vec2(1.,2.1))-.05;
    fl=wc;wc*=1.-.3*sunI*smoothstep(.01,-.01,length((lq+vec2(.007,-.007))*vec2(1.,2.1))-.05);
    vec3 lc=mix(vec3(.45,.3,.1),vec3(.62,.5,.16),hash(vec2(fi,3.)))*(amb+sunC*sunI*.9);
    lc*=1.-.35*exp(-lq.y*lq.y*9000.);
    wc=mix(wc,lc,smoothstep(aa,-aa,lf)*step(length(lp),RW-.06));}
   inner=mix(inner,wc,smoothstep(RW+.004+aa,RW+.004,d+h0*.6));
   for(int i=0;i<6;i++){vec4 m=MK[i];if(m.y>.01){
    vec2 pq=q-padPos(m);float s=.6+.4*m.y;float pr=.13*s;float pd=length(pq);
    inner*=1.-.35*m.y*sunI*smoothstep(pr+.02,pr-.01,length(pq+l2*.018));
    float ang=atan(pq.x,pq.y)-m.x*1.7-.4;float an=abs(atan(sin(ang),cos(ang)));
    float notch=smoothstep(.24,.2,an)*step(pr*.08,pd);
    float mask=smoothstep(pr,pr-aa,pd)*(1.-notch)*smoothstep(0.,.3,m.y);
    vec3 pc=mix(vec3(.14,.33,.12),vec3(.3,.5,.18),fbm3(pq*55.+m.x));
    pc+=vec3(.07,.09,.03)*smoothstep(.85,1.,abs(cos(ang*9.)))*smoothstep(pr*.15,pr*.3,pd);
    pc*=mix(1.,.72,smoothstep(pr*.7,pr,pd));
    vec3 pl=pc*(amb*1.1+sunC*sunI*.95+vec3(1.,.62,.3)*.55*NT)+sunC*sunI*.04;
    float fa=atan(pq.x,pq.y);float flr=.045*s*(.7+.3*abs(cos(fa*4.+m.x)));
    float flower=smoothstep(flr,flr-aa,pd);
    vec3 lot=mix(vec3(.98,.9,.93),mix(vec3(.93,.55,.68),vec3(.98,.72,.3),m.z),smoothstep(0.,flr,pd))*(amb+sunC*sunI);
    lot=mix(vec3(1.,.83,.3)*(amb+sunC*sunI),lot,smoothstep(.008,.012,pd));
    float cr=.03*s;float cand=smoothstep(cr,cr-aa,pd);
    vec3 cc=mix(vec3(.95,.93,.88),vec3(.6,.6,.62),smoothstep(cr*.8,cr,pd))*(amb+vec3(1.,.7,.35)*.6);
    cc+=vec3(1.,.75,.4)*exp(-pd*pd*5000.)*2.;
    pl=mix(pl,mix(lot,cc,NT),mix(flower,cand,NT));
    inner=mix(inner,pl,mask);
   }}
  }
  col=mix(col,inner,smoothstep(.99+aa,.99,d));
 }

 // rim (photo ring) with hour chips and the progress channel
 if(d>.97&&d<RO+.08){
  float drh=(rimH(d+.006)-rimH(d-.006))/.012;
  vec2 ur=.5+vec2(q.x,-q.y)*.2396;
  vec3 rt=texture2D(RIM,ur).rgb;float l0=lum(rt);
  vec2 tg=vec2(lum(texture2D(RIM,ur+vec2(1./1024.,0.)).rgb)-l0,lum(texture2D(RIM,ur-vec2(0.,1./1024.)).rgb)-l0);
  vec3 rn=normalize(vec3(-dir*drh*.05-tg*5.*TX,1.));
  vec3 ra=TX>.5?rt*1.3:vec3(.28)*(.7+.6*fbm(w*12.));
  float hn=abs(fract(fr*12.+.5)-.5)*2.*PI/12.*d;
  ra*=1.+.9*smoothstep(.017,.01,hn)*step(1.34,d)*step(d,1.43)*step(.04,min(fr,1.-fr));
  float gd=abs(d-1.21);float gr=smoothstep(.026,.016,gd);
  ra*=1.-.55*gr;
  vec3 rc=ra*(amb*.8+sunC*sunI*max(dot(rn,Ld),0.)*1.05)+sunC*mix(.9,.6,NT)*pow(max(dot(rn,H),0.),40.)*.18;
  float fill=smoothstep(LV+.004,LV-.004,fr)*gr*step(.0001,LV);
  float st=noise(vec2(fr*90.-T*3.,gd*60.));
  vec3 gw=mix(vec3(.12,.5,.55),vec3(.75,.95,1.),st*.45)*(amb*1.5+sunC*sunI*.8)+vec3(.25,.7,.8)*.3*NT;
  gw+=vec3(.8,1.,1.)*pow(st,3.)*.6*sunI;
  rc=mix(rc,gw,fill);
  rc+=vec3(.6,.95,1.)*exp(-pow((fr-LV)*d*2.*PI/.024,2.))*gr*.6*step(.001,LV);
  float band=step(1.04,d)*step(d,RO-.05);
  float am=TX>.5?max(band,smoothstep(.03,.1,l0)):smoothstep(RO,RO-aa,d);
  col=mix(col,rc,am*smoothstep(.985,.985+aa,d)*smoothstep(RO+.05,RO+.02,d));
  // the current time: a small bright chip on the rim
  vec2 np=1.385*vec2(sin(NOW),cos(NOW));
  col+=vec3(.95,.97,1.)*smoothstep(.034,.02,length(q-np))*(.55+.45*sunI)*am;
 }

 // spring channel through the rim
 float cx=abs(q.x);
 if(q.y>.985&&q.y<RO+.5&&cx<.085){
  float fade=smoothstep(RO+.5,RO+.22,q.y);
  float st=noise(vec2(q.x*45.,q.y*9.+T*4.))*.6+noise(vec2(q.x*110.,q.y*20.+T*7.))*.4;
  vec3 cw=mix(vec3(.1,.45,.5),vec3(.85,.97,1.),smoothstep(.45,.9,st))*(amb*1.3+sunC*sunI*.8)+sunC*pow(st,6.)*.8*sunI;
  vec3 ch=mix(col*.45,cw,smoothstep(.06,.05,cx));
  col=mix(col,ch,smoothstep(.085,.07,cx)*fade);
 }
 // falling sheet down the bowl wall
 if(q.y>E.y-.01&&q.y<1.&&cx<.075){
  float t=(q.y-E.y)/(1.-E.y);float wd=.05+.012*t;
  float st=noise(vec2(q.x*60.,q.y*5.+T*6.))*.6+noise(vec2(q.x*140.,q.y*12.+T*10.))*.4;
  vec3 fw=mix(vec3(.3,.65,.72),vec3(.95,1.,1.),smoothstep(.35,.85,st))*(amb*1.2+sunC*sunI*.9);
  col=mix(col,fw,smoothstep(wd,wd-.015,cx)*.88);
 }
 // foam where it lands
 float fd=length((q-E)*vec2(1.,1.4));
 float foam=smoothstep(.13+.06*SURGE,.02,fd+(fbm3(q*16.+vec2(0.,T*2.5))-.5)*.12);
 col=mix(col,vec3(.95,.98,1.)*(amb+sunC*sunI*.9),foam*.85);

 // candlelight at night
 for(int i=0;i<6;i++){vec4 m=MK[i];if(m.y>.01){vec2 dq=q-padPos(m);col+=vec3(1.,.62,.3)*exp(-dot(dq,dq)*14.)*NT*m.y*.3;}}

 vec2 uv=fc/RES-.5;
 col*=1.-.28*dot(uv*vec2(1.,.8),uv*vec2(1.,.8))*2.;
 col+=(hash(fc+fract(T))-.5)/255.;
 gl_FragColor=vec4(col,1.);
}`;

export const NIGHTLY = `
precision mediump float;
uniform sampler2D IMG; uniform vec2 RES; uniform float T; uniform float IA; uniform vec3 RP;
float hash1(float n){return fract(sin(n)*43758.5453);}
float n1(float x){float i=floor(x),f=fract(x);return mix(hash1(i),hash1(i+1.),f*f*(3.-2.*f));}
void main(){
 vec2 s=gl_FragCoord.xy/RES;float ca=RES.x/RES.y;
 vec2 uv=vec2(s.x,1.-s.y);
 if(ca>IA){uv.y=.5+(uv.y-.5)*IA/ca;}else{uv.x=.5+(uv.x-.5)*ca/IA;}
 float wm=smoothstep(.475,.52,uv.y);float dp=clamp((uv.y-.48)*2.,0.,1.);
 vec2 off=vec2(sin(uv.y*230.-T*1.5+sin(uv.x*8.+T*.35)*2.)*.0016,sin(uv.x*55.+T*1.1)*.001)*wm*(.35+dp);
 vec2 dq=(uv-RP.xy)*vec2(1.,1./IA);float a=T-RP.z;
 if(a>0.&&a<4.){float r=length(dq);float x=r-a*.22;off+=normalize(dq+1e-5)*sin(x*140.)*exp(-x*x*900.)*exp(-a*1.)*.006*wm;}
 vec3 c=texture2D(IMG,uv+off).rgb;
 vec2 cp=vec2(.665,.492);vec2 cd=(uv-cp)*vec2(1.,1./IA);
 float fl=.8+.2*n1(T*9.)+.08*sin(T*23.);
 c+=vec3(1.,.62,.28)*exp(-dot(cd,cd)*700.)*.3*fl;
 c+=vec3(1.,.7,.35)*exp(-cd.x*cd.x*7000.)*step(0.,-cd.y*-1.)*exp(-max(cd.y*IA,0.)*30.)*.12*fl*wm;
 for(int i=0;i<14;i++){float fi=float(i);
  vec2 p=vec2(hash1(fi*1.31),.3+.2*hash1(fi*7.13))+.03*vec2(sin(T*.3+fi),cos(T*.23+fi*2.));
  float bl=pow(.5+.5*sin(T*(.7+hash1(fi+3.)*.9)+fi*3.),6.);
  vec2 d=(uv-p)*vec2(1.,1./IA);c+=vec3(.8,1.,.5)*exp(-dot(d,d)*90000.)*bl;}
 gl_FragColor=vec4(c,1.);
}`;
