// GLSL for the Water theme. Written for WebGL 1 so it runs on every phone.
//
// WELL_SHADER draws the whole home screen: the forest photo (well-day.jpg or
// well-night.jpg) fills the screen, and only the water inside the photo's
// well is computed live: a calm uneven surface that refracts the photo's own
// pebbles, murk that deepens toward the middle, reflections of the sky and
// canopy, sparkle, ripples, lily pads for reminders, and the level rising as
// the day gets done. The rim carries the progress channel and the now-chip.
// Units: q is measured in well radii from the centre of the opening, y up.
//
// NIGHTLY brings nightly.jpg to life: the water moves, the candle flickers,
// fireflies drift and a tick sends a ripple out from the candle.

export const WELL_SHADER = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
uniform vec2 RES; uniform vec4 IR; uniform vec3 WC; uniform vec2 RIMO; uniform float RO;
uniform float T; uniform float LV; uniform float NT; uniform float SURGE; uniform float NOW;
uniform vec3 RIP[8]; uniform vec4 MK[6];
uniform sampler2D IMG; uniform sampler2D BLR;
#define PI 3.14159265
#define RCH 1.3
float lum(vec3 c){return dot(c,vec3(.2126,.7152,.0722));}
float RW; vec2 E; vec3 Ld; vec3 H;

float hash(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y);}
float noise(vec2 p){vec2 i=floor(p),f=fract(p);vec2 u=f*f*(3.-2.*f);
 return mix(mix(hash(i),hash(i+vec2(1.,0.)),u.x),mix(hash(i+vec2(0.,1.)),hash(i+vec2(1.,1.)),u.x),u.y);}
const mat2 M2=mat2(1.6,1.2,-1.2,1.6);
float fbm3(vec2 p){float v=0.,a=.5;for(int i=0;i<3;i++){v+=a*noise(p);p=M2*p;a*=.5;}return v;}
float caustic(vec2 uv,float t){vec2 p=mod(uv*6.28318,6.28318)-250.;vec2 i=p;float c=1.,inten=.005;
 for(int n=0;n<4;n++){float tt=t*(1.-(3.5/float(n+1)));i=p+vec2(cos(tt-i.x)+sin(tt+i.y),sin(tt-i.y)+cos(tt+i.x));
  c+=1./length(vec2(p.x/(sin(i.x+tt)/inten),p.y/(cos(i.y+tt)/inten)));}
 c/=4.;c=1.17-pow(c,1.4);return pow(abs(c),8.);}

// The photo, addressed in screen pixels (top-left origin) or in well units.
vec2 uvPx(vec2 p){return clamp((p-IR.xy)/IR.zw,0.,1.);}
vec2 uvQ(vec2 q){return uvPx(WC.xy+WC.z*vec2(q.x,-q.y));}
// On a screen wider than the photo, its sides soften into a blurred, darker
// continuation of the photo's own edge instead of stopping hard.
vec3 photo(vec2 p){
 vec2 uv=(p-IR.xy)/IR.zw;float e=max(-uv.x,uv.x-1.)*IR.z/IR.w;
 vec3 c=texture2D(IMG,clamp(uv,0.,1.)).rgb;
 if(e>-.04){vec3 b=texture2D(BLR,clamp(uv,0.,1.),6.).rgb*mix(1.,.7,smoothstep(0.,.25,e));c=mix(c,b,smoothstep(-.04,.01,e));}
 return c;}

vec2 padPos(vec4 m){float a=m.x;return E+RW*.7*vec2(sin(a),cos(a))+.02*vec2(sin(T*.5+a*3.),cos(T*.4+a*2.));}
float wh(vec2 q){
 vec2 s=q-E;float r=length(s);
 float h=.0075*noise(q*4.+T*vec2(.1,.035))+.004*noise(q*9.3-T*vec2(.06,.12))+.0015*noise(q*21.+T*vec2(.19,-.08));
 h+=SURGE*.016*sin(r*26.-T*6.)*exp(-r*2.2);
 for(int i=0;i<8;i++){vec3 k=RIP[i];float a=T-k.z;if(a>0.&&a<5.){float x=length(q-k.xy)-a*.45;h+=.024*sin(x*48.)*exp(-x*x*80.)*exp(-a*.9);}}
 for(int i=0;i<6;i++){vec4 m=MK[i];if(m.y>.01){float r2=length(q-padPos(m));h+=.003*m.y*sin(r2*70.-T*3.)*exp(-r2*9.);}}
 return h;}

void main(){
 vec2 p=vec2(gl_FragCoord.x,RES.y-gl_FragCoord.y);
 vec3 col=photo(p);
 vec2 q=vec2(p.x-WC.x,WC.y-p.y)/WC.z;float d=length(q);
 float dith=(hash(gl_FragCoord.xy+fract(T))-.5)/255.;
 if(d>RO+.08){gl_FragColor=vec4(col+dith,1.);return;}
 float aa=1.5/WC.z;
 RW=mix(.6,.975,LV);E=vec2(0.,-(1.-LV)*.05);
 Ld=mix(normalize(vec3(-.25,.35,.9)),normalize(vec3(-.55,.5,.65)),NT);H=normalize(Ld+vec3(0.,0.,1.));
 vec3 lc=mix(vec3(1.,.99,.96),vec3(.7,.8,1.),NT);   // light colour: overcast sky / moon
 vec2 s=q-E;float ds=length(s);

 // stones just above the waterline are wet: darker and a touch richer
 if(d<1.03){float wet=(1.-smoothstep(RW,RW+.08,ds))*smoothstep(RW-.01,RW+.01,ds);
  col=mix(col,col*col*1.9,wet*.35)*(1.-.3*wet);}

 if(ds<RW+.03){
  float e=.004;float h0=wh(q);
  vec2 g=vec2(wh(q+vec2(e,0.))-h0,wh(q+vec2(0.,e))-h0)/e;
  vec3 n=normalize(vec3(-g,1.));
  float bowl=sqrt(max(1.-ds*ds/(RW*RW),0.));
  float depth=(.06+.14*LV)*(.25+.75*bowl);
  vec2 fq=q+n.xy*(depth*1.4+.01);
  vec3 sharp=texture2D(IMG,uvQ(fq)).rgb;
  vec3 soft=texture2D(BLR,uvQ(fq),1.+depth*16.).rgb;
  vec3 fl=mix(sharp,soft,smoothstep(.05,.18,depth));
  fl=max(mix(vec3(lum(fl)),fl,1.05),0.)*.85;   // wet pebbles: a little deeper
  // soft light patterns on the floor, strongest in the shallows
  float cs=caustic(fq*.6+(vec2(noise(fq*3.),noise(fq*3.+9.))-.5)*.25,T*.3);
  fl*=1.+cs*mix(.4,.1,NT)*(1.-.7*smoothstep(.06,.18,depth));
  // pads shade the floor under them
  for(int i=0;i<6;i++){vec4 m=MK[i];if(m.y>.01){float sd=length(fq-padPos(m)-Ld.xy*depth*.4);fl*=1.-.5*m.y*smoothstep(.22,.14,sd);}}
  // murk: tea-coloured forest water, darker toward the middle
  vec3 tr=exp(-vec3(1.55,1.5,2.3)*depth*mix(8.,4.,NT));
  vec3 deep=mix(vec3(.05,.052,.035),vec3(.004,.008,.01),NT);
  vec3 wc=fl*tr+deep*(1.-tr);
  // the wall shades the water on the side the light comes from
  float ws=smoothstep(.5,.97,ds/RW)*max(dot(normalize(s+1e-4),normalize(Ld.xy)),0.);
  wc*=1.-mix(.3,.55,NT)*ws;
  // reflection: sky between the leaves of the canopy overhead
  vec3 R=reflect(vec3(0.,0.,-1.),n);
  vec2 rq=q*.55+R.xy*3.;
  float cl=fbm3(rq*1.3+vec2(T*.008,0.));
  vec3 sky=mix(mix(vec3(.62,.66,.68),vec3(.84,.86,.87),smoothstep(.35,.75,cl)),vec3(.07,.09,.13)+vec3(.05,.06,.08)*cl,NT);
  sky*=.8+.35*clamp(dot(rq,normalize(Ld.xy))*.9+.5,0.,1.);   // brighter toward the light
  float can=smoothstep(.52,.66,fbm3(rq*.9+3.7)+.3*smoothstep(RW*.4,RW,ds));
  vec3 canopy=mix(vec3(.05,.07,.045),vec3(.004,.006,.008),NT)*(.8+.4*noise(rq*14.));
  vec3 refl=mix(sky,canopy,can);
  float fres=clamp(mix(.13,.2,NT)+(1.-n.z)*9.,0.,.5);
  wc=mix(wc,refl,fres);
  // the moon, wavering with the surface
  vec2 mq=q-vec2(-.26,.24)+R.xy*.22;
  wc+=NT*(1.-can*.7)*(vec3(.85,.9,1.)*smoothstep(.034,.024,length(mq))*.8+vec3(.4,.5,.7)*exp(-dot(mq,mq)*60.)*.22+vec3(.3,.4,.6)*exp(-dot(mq,mq)*10.)*.12);
  // sparkle on tiny ripples, and a broad sheen
  vec2 mg=(vec2(noise(q*85.+T*1.6),noise(q*85.+37.-T*1.4))-.5)*.22;
  float nh=max(dot(n,H),0.),ns=max(dot(normalize(n+vec3(mg,0.)),H),0.);
  wc+=lc*(pow(ns,600.)*mix(1.4,2.2,NT)+pow(nh,30.)*mix(.05,.04,NT))*(1.-can*.5);
  // meniscus: a thin bright lip and a dark contact line
  float lip=exp(-pow((RW-ds)/.008,2.));
  wc=mix(wc,wc*.6,smoothstep(RW-.05,RW,ds)*.6)+lc*lip*mix(.16,.08,NT);
  // lily pads: glossy, with a slit, veins, a lifted rim and a flower
  for(int i=0;i<6;i++){vec4 m=MK[i];if(m.y>.01){
   vec2 pq=q-padPos(m);float sc=.6+.4*m.y;float pr=.17*sc;float pd=length(pq);
   wc*=1.-.35*m.y*smoothstep(pr+.03,pr-.01,length(pq-Ld.xy*.035));
   float ang=atan(pq.x,pq.y)-m.x*1.7-.4;float an=abs(atan(sin(ang),cos(ang)));
   float notch=smoothstep(.2,.16,an)*step(pr*.06,pd);
   float edge=pr*(1.+.03*sin(ang*7.+m.x*5.));
   float mask=smoothstep(edge,edge-aa,pd)*(1.-notch)*smoothstep(0.,.3,m.y);
   vec3 pc=mix(vec3(.12,.19,.07),vec3(.22,.3,.11),fbm3(pq*40.+m.x));
   pc*=1.-.18*smoothstep(.9,1.,abs(cos(ang*11.)))*smoothstep(pr*.1,pr*.3,pd);
   pc=mix(pc,pc*1.35+vec3(.02,.02,0.),smoothstep(pr*.82,pr*.97,pd));
   vec3 pn=normalize(vec3(pq/pr*.35*smoothstep(pr*.6,pr,pd),1.));
   vec3 pl=pc*mix(1.,.42,NT)*(.7+.45*max(dot(pn,Ld),0.));
   pl=mix(pl,refl,.1)+lc*pow(max(dot(pn,H),0.),60.)*mix(.12,.1,NT);
   float fa=atan(pq.x,pq.y);float flr=.05*sc*(.72+.28*abs(cos(fa*4.+m.x)));
   float flower=smoothstep(flr,flr-aa,pd);
   vec3 lot=mix(vec3(.96,.93,.93),mix(vec3(.9,.6,.7),vec3(.96,.76,.4),m.z),smoothstep(0.,flr,pd)*.8);
   lot=mix(vec3(.98,.82,.32),lot,smoothstep(.008,.013,pd));
   lot*=mix(1.,.6,NT)*(.8+.3*max(dot(normalize(vec3(pq*3.,1.)),Ld),0.));
   pl=mix(pl,lot,flower);
   wc=mix(wc,pl,mask);
  }}
  col=mix(col,wc,smoothstep(RW+aa,RW-aa,ds+h0*.5));
 }

 // the progress channel: water running round the rim from 12, wetting the
 // stones it has reached, with a bright leading edge
 vec2 qr=q-RIMO;float dr=length(qr);
 if(dr>1.05&&dr<RO-.05){
  float fr=fract(atan(qr.x,qr.y)/(2.*PI));
  float rc=RCH+.012*sin(fr*31.4159+1.3)+.012*(noise(vec2(fr*46.,.5))-.5);
  float across=(dr-rc)/.032;
  float band=exp(-across*across*1.6)*(.85+.3*noise(vec2(fr*90.,across*2.)));
  float fill=smoothstep(LV+.003,LV-.003,fr)*step(.0001,LV);
  float st=noise(vec2(fr*170.-T*2.2,across*2.5))*.6+noise(vec2(fr*360.-T*3.6,across))*.4;
  float core=exp(-across*across*5.);
  vec3 wetc=col*.5+mix(vec3(.3,.37,.39),vec3(.11,.16,.24),NT)*core*(.55+.6*st);
  wetc+=lc*pow(st,6.)*mix(.8,.9,NT)*core;
  col=mix(col,wetc,fill*clamp(band,0.,1.));
  col+=mix(vec3(.75,.95,1.),vec3(.5,.8,1.),NT)*exp(-pow((fr-LV)*dr*2.*PI/.03,2.))*exp(-across*across*3.)*mix(.4,.5,NT)*step(.001,LV);
  // now: a small pale pebble sitting in the groove
  vec2 np=RIMO+(RCH+.012*sin(NOW/(2.*PI)*31.4159+1.3))*vec2(sin(NOW),cos(NOW));vec2 nq=q-np;float nd=length(nq*vec2(1.,1.15));
  col*=1.-.45*smoothstep(.055,.035,length(nq+Ld.xy*.02));
  vec3 nn=normalize(vec3(nq/.042*.8,1.));
  vec3 pc=mix(vec3(.86,.85,.8),vec3(.62,.68,.78),NT)*mix(1.,.55,NT)*(.55+.55*max(dot(nn,Ld),0.))+lc*pow(max(dot(nn,H),0.),40.)*.25;
  col=mix(col,pc,smoothstep(.042,.042-aa,nd));
 }
 gl_FragColor=vec4(col+dith,1.);
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
