// GLSL for the Water theme. Written for WebGL 1 so it runs on every phone.
//
// DISC draws the home screen's dial: a round basin of live water floating
// over the page, on a transparent canvas so the page's light patterns show
// around it. The water fills the basin as the day gets done; it has a calm
// uneven surface, light patterns and depth, a sheen of sky (the moon by
// night), sparkle, ripples, lily pads for reminders and a surge when the day
// is done. Round it runs the progress ring, with a chip for the current time.
// Units: q is measured in basin radii from its centre, y up.
//
// NIGHTLY brings nightly.jpg to life: the water moves, the candle flickers,
// fireflies drift and a tick sends a ripple out from the candle.

export const DISC = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
uniform vec2 C; uniform float RAD; uniform float T; uniform float LV; uniform float NT; uniform float SURGE; uniform float NOW;
uniform vec3 RIP[8]; uniform vec4 MK[6];
#define PI 3.14159265
#define RR 1.17
#define BW 1.1
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

vec2 padPos(vec4 m){float a=m.x;return E+RW*.68*vec2(sin(a),cos(a))+.02*vec2(sin(T*.5+a*3.),cos(T*.4+a*2.));}
float wh(vec2 q){
 vec2 s=q-E;float r=length(s);
 float h=.007*noise(q*4.+T*vec2(.1,.035))+.004*noise(q*9.3-T*vec2(.06,.12))+.0015*noise(q*21.+T*vec2(.19,-.08));
 h+=SURGE*.016*sin(r*26.-T*6.)*exp(-r*2.2);
 for(int i=0;i<8;i++){vec3 k=RIP[i];float a=T-k.z;if(a>0.&&a<5.){float x=length(q-k.xy)-a*.45;h+=.024*sin(x*48.)*exp(-x*x*80.)*exp(-a*.9);}}
 for(int i=0;i<6;i++){vec4 m=MK[i];if(m.y>.01){float r2=length(q-padPos(m));h+=.003*m.y*sin(r2*70.-T*3.)*exp(-r2*9.);}}
 return h;}

// Carved limestone: warm, softly clouded, with small round pores. p in
// basin radii.
float pores(vec2 p,float dens){vec2 n=floor(p),f=fract(p);float v=0.;
 for(int j=-1;j<=1;j++)for(int i=-1;i<=1;i++){vec2 g=vec2(float(i),float(j));
  float h=hash(n+g);if(h>dens){vec2 o=vec2(hash(n+g+19.7),hash(n+g+7.3));float r=.12+.22*hash(n+g+3.1);
   v=max(v,smoothstep(r,r*.35,length(g+o-f))*(.5+.5*hash(n+g+5.9)));}}
 return v;}
vec3 limestone(vec2 p){
 float f=fbm3(p*3.)*.6+fbm3(p*9.+3.)*.4;
 vec3 c=mix(vec3(.8,.77,.7),vec3(.93,.91,.86),smoothstep(.25,.75,f));
 c*=1.-.03*(noise(p*90.)-.5);
 float pr=pores(p*30.,.55)*.7+pores(p*13.+4.,.8);
 c*=1.-.22*pr;
 return mix(c,c*vec3(.42,.48,.58),NT);}

// Paints c with coverage k over what's there (premultiplied).
void over(inout vec4 o,vec3 c,float k){o=vec4(c*k,k)+o*(1.-k);}

void main(){
 vec2 q=(gl_FragCoord.xy-C)/RAD;float d=length(q);
 float aa=1.5/RAD;
 vec4 o=vec4(0.);
 if(d>RR+.12){gl_FragColor=o;return;}
 RW=mix(.72,1.,LV);E=vec2(0.,-(1.-LV)*.04);
 Ld=mix(normalize(vec3(-.35,.45,.82)),normalize(vec3(-.55,.5,.65)),NT);H=normalize(Ld+vec3(0.,0.,1.));
 vec3 lc=mix(vec3(1.),vec3(.72,.82,1.),NT);

 // a soft shadow under the basin
 float sd=length(q-vec2(.03,-.07));
 o.a=mix(.24,.5,NT)*smoothstep(1.2,.97,sd);

 // the progress ring, filling clockwise from 12, and the now-chip on it
 float fr=fract(atan(q.x,q.y)/(2.*PI));
 float rw=.024,gd=abs(d-RR);
 over(o,mix(vec3(.83,.88,.87),vec3(.16,.22,.26),NT),smoothstep(rw+aa,rw-aa,gd));
 float fa=fr*2.*PI,la=LV*2.*PI;
 float capA=length(q-RR*vec2(sin(0.),cos(0.))),capB=length(q-RR*vec2(sin(la),cos(la)));
 float on=max(step(fr,LV)*smoothstep(rw+aa,rw-aa,gd),max(smoothstep(rw+aa,rw-aa,capA),smoothstep(rw+aa,rw-aa,capB)))*step(.001,LV);
 vec3 rc=mix(vec3(.106,.541,.549),vec3(.486,.788,.878),NT);
 over(o,rc,on);
 float glow=exp(-pow(length(q-RR*vec2(sin(la),cos(la)))/.07,2.))*step(.001,LV)*step(LV,.999);
 o.rgb+=rc*glow*.25*o.a;
 vec2 np=RR*vec2(sin(NOW),cos(NOW));
 over(o,mix(vec3(.059,.129,.141),vec3(.89,.93,.94),NT),smoothstep(.052,.052-aa,length(q-np)));

 // the basin's wall: a raised rim in its own tone, lit on the side facing
 // the light and shaded on the other, with a fine outline so it stands off
 // the background
 float lit=dot(normalize(q+1e-4),normalize(Ld.xy));
 if(d<BW+aa){
  vec3 wc0=limestone(q)*(1.+mix(.08,.14,NT)*lit);
  wc0+=lc*exp(-pow((BW-.012-d)/.012,2.))*max(lit,0.)*mix(.25,.18,NT);
  wc0*=1.-mix(.1,.2,NT)*exp(-pow((BW-.012-d)/.014,2.))*max(-lit,0.);
  over(o,wc0,smoothstep(BW+aa,BW-aa,d));
 }
 over(o,mix(vec3(.42,.39,.33),vec3(.03,.05,.07),NT),exp(-pow((d-BW)/(.006+aa),2.))*mix(.45,.6,NT));

 if(d<1.+aa){
  // the empty basin: a floor a shade deeper than the page, with faint light
  // on it, shaded by the wall on the side the light comes from
  vec3 fl=limestone(q*1.3+5.)*mix(.86,.6,NT);
  fl*=1.-mix(.3,.4,NT)*smoothstep(.6,1.,d)*max(lit,0.);
  fl+=mix(.12,.03,NT)*caustic(q*.7,T*.25);
  vec3 col=fl;
  vec2 s=q-E;float ds=length(s);
  if(ds<RW+.03){
   float e=.004;float h0=wh(q);
   vec2 g=vec2(wh(q+vec2(e,0.))-h0,wh(q+vec2(0.,e))-h0)/e;
   vec3 n=normalize(vec3(-g,1.));
   float bowl=sqrt(max(1.-ds*ds/(RW*RW),0.));
   float dep=(.35+.65*LV)*(.45+.55*bowl);
   vec2 fq=q+n.xy*(.05+dep*.12);
   // the water's own colour: lighter toward the light, deep at the edges
   float gg=length(fq-vec2(-.16,.2))/1.25;
   vec3 w1=mix(vec3(.478,.796,.769),vec3(.122,.337,.439),NT);
   vec3 w2=mix(vec3(.2,.604,.612),vec3(.067,.196,.275),NT);
   vec3 w3=mix(vec3(.106,.416,.463),vec3(.031,.114,.165),NT);
   vec3 wc=mix(mix(w1,w2,smoothstep(0.,.55,gg)),w3,smoothstep(.55,1.,gg));
   wc*=mix(1.12,.9,dep);
   // the limestone floor showing through, most where it's shallow
   wc*=mix(1.,.78+.4*dot(limestone(fq*1.3+5.),vec3(.33)),mix(.45,.25,NT)*(1.-dep*.8));
   // light patterns through it, strongest where it's shallow
   float cs=caustic(fq*.75+(vec2(noise(fq*3.),noise(fq*3.+9.))-.5)*.2,T*.32);
   wc+=lc*cs*mix(.32,.07,NT)*mix(1.,.55,dep);
   for(int i=0;i<6;i++){vec4 m=MK[i];if(m.y>.01){float pd=length(fq-padPos(m)-Ld.xy*.05);wc*=1.-.3*m.y*smoothstep(.2,.13,pd);}}
   // a sheen of sky, stronger where the surface tilts
   vec3 R=reflect(vec3(0.,0.,-1.),n);
   float cl=fbm3((q*.5+R.xy*2.5)*1.3+vec2(T*.01,0.));
   vec3 sky=mix(vec3(.92,.97,.97),vec3(.08,.12,.2),NT)*(.85+.3*cl);
   float fres=clamp(.04+(1.-n.z)*8.,0.,.4);
   wc=mix(wc,sky,fres);
   vec2 sh=mat2(.848,.53,-.53,.848)*(q-vec2(-.35,.42));
   wc+=lc*exp(-dot(sh*vec2(1.,3.),sh*vec2(1.,3.))*4.)*mix(.16,.04,NT);
   // the moon
   vec2 mq=q-vec2(-.28,.32)+R.xy*.22;
   wc+=NT*(vec3(.86,.9,1.)*smoothstep(.07,.05,length(mq))*.85+vec3(.35,.45,.65)*exp(-dot(mq,mq)*40.)*.25);
   // sparkle and a broad sheen
   vec2 mg=(vec2(noise(q*85.+T*1.6),noise(q*85.+37.-T*1.4))-.5)*.22;
   float nh=max(dot(n,H),0.),ns=max(dot(normalize(n+vec3(mg,0.)),H),0.);
   wc+=lc*(pow(ns,600.)*mix(1.2,2.,NT)+pow(nh,30.)*.04);
   // meniscus: a bright lip at the water's edge
   wc+=lc*exp(-pow((RW-ds)/.01,2.))*mix(.22,.1,NT);
   wc=mix(wc,wc*.8,smoothstep(RW-.06,RW,ds)*.5);
   // lily pads
   for(int i=0;i<6;i++){vec4 m=MK[i];if(m.y>.01){
    vec2 pq=q-padPos(m);float sc=.6+.4*m.y;float pr=.17*sc;float pd=length(pq);
    wc*=1.-.28*m.y*smoothstep(pr+.03,pr-.01,length(pq-Ld.xy*.04));
    float ang=atan(pq.x,pq.y)-m.x*1.7-.4;float an=abs(atan(sin(ang),cos(ang)));
    float notch=smoothstep(.2,.16,an)*step(pr*.06,pd);
    float mask=smoothstep(pr,pr-aa,pd)*(1.-notch)*smoothstep(0.,.3,m.y);
    vec3 pc=mix(vec3(.3,.54,.22),vec3(.4,.64,.28),fbm3(pq*40.+m.x))*mix(1.,.5,NT);
    pc*=1.-.12*smoothstep(.9,1.,abs(cos(ang*11.)))*smoothstep(pr*.1,pr*.3,pd);
    pc=mix(pc,pc*1.2,smoothstep(pr*.8,pr*.97,pd));
    vec3 pn=normalize(vec3(pq/pr*.35*smoothstep(pr*.6,pr,pd),1.));
    pc=pc*(.8+.3*max(dot(pn,Ld),0.))+lc*pow(max(dot(pn,H),0.),60.)*.08;
    float fa2=atan(pq.x,pq.y);float flr=.05*sc*(.72+.28*abs(cos(fa2*4.+m.x)));
    vec3 lot=mix(vec3(.97,.94,.94),mix(vec3(.96,.72,.8),vec3(.96,.8,.45),m.z),smoothstep(0.,flr,pd)*.8);
    lot=mix(vec3(.98,.82,.32),lot,smoothstep(.008,.013,pd))*mix(1.,.6,NT);
    pc=mix(pc,lot,smoothstep(flr,flr-aa,pd));
    wc=mix(wc,pc,mask);
   }}
   col=mix(col,wc,smoothstep(RW+aa,RW-aa,ds+h0*.5));
  }
  // where the floor meets the wall: a fine dark crease
  col*=1.-mix(.3,.4,NT)*exp(-pow((1.-d)/.012,2.));
  over(o,col,smoothstep(1.+aa,1.-aa,d));
 }
 o.rgb+=(hash(gl_FragCoord.xy+fract(T))-.5)/255.*o.a;
 gl_FragColor=o;
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
