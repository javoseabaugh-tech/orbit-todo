// GLSL for the Fire theme. WebGL 1, so it runs on every phone.
//
// PIT draws the home screen's dial on a transparent canvas: a fire pit seen
// from above, kept quiet: a bed of coals (EMB, the Gemini coal texture) under
// three charred logs, flames licking out from the middle, a ring of stones
// lit from inside. The flames grow as the day gets done (LV). Round it the
// progress ring is a line of embers catching light; reminders are glowing
// coals at their hour, lit brighter when ticked (and gone in a burst of
// sparks); a small bright chip marks the time. Sparks drift out of the fire
// all the time; BURST holds up to four recent bursts (x, y, start time).
// Units: q is measured in fire-bed radii from its centre, y up.

const COMMON = `
float hash(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y);}
float h1(float n){return fract(sin(n)*43758.5453);}
float noise(vec2 p){vec2 i=floor(p),f=fract(p);vec2 u=f*f*(3.-2.*f);
 return mix(mix(hash(i),hash(i+vec2(1.,0.)),u.x),mix(hash(i+vec2(0.,1.)),hash(i+vec2(1.,1.)),u.x),u.y);}
const mat2 M2=mat2(1.6,1.2,-1.2,1.6);
float fbm(vec2 p){float v=0.,a=.5;for(int i=0;i<4;i++){v+=a*noise(p);p=M2*p;a*=.5;}return v;}
// 0 = deep red, .5 = orange, 1 = near white
vec3 fireCol(float t){
 vec3 a=mix(vec3(.36,.07,.03),vec3(.88,.42,.16),smoothstep(0.,.45,t));
 vec3 b=mix(vec3(.95,.7,.38),vec3(1.,.93,.82),smoothstep(.75,1.,t));
 return mix(a,b,smoothstep(.45,.8,t));}
// coal-bed glow from the texture: bright where it's hot orange
float hot(vec3 e){return clamp((e.r-max(e.g,e.b))*2.4,0.,1.);}
`;

export const PIT = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
uniform vec2 C; uniform float RAD; uniform float T; uniform float LV; uniform float SURGE; uniform float NOW; uniform float TX;
uniform vec4 MK[6]; uniform vec3 BURST[4]; uniform sampler2D EMB; uniform float DY;
#define PI 3.14159265
#define RR 1.46
${COMMON}
void over(inout vec4 o,vec3 c,float k){o=vec4(c*k,k)+o*(1.-k);}
void glowAdd(inout vec4 o,vec3 c){o.rgb+=c;o.a=max(o.a,clamp(max(c.r,max(c.g,c.b)),0.,1.));}

void main(){
 vec2 q=(gl_FragCoord.xy-C)/RAD;float d=length(q);
 float aa=1.5/RAD;
 vec4 o=vec4(0.);
 if(d>RR+.45){gl_FragColor=o;return;}
 float flick=.86+.14*noise(vec2(T*3.2,0.))+.06*sin(T*11.);
 float heat=mix(.5,1.,LV)+SURGE*.6;

 // firelight pooling on the ground round the pit
 float pool=exp(-max(d-1.2,0.)*2.4)*step(1.2,d);
 glowAdd(o,vec3(1.,.5,.22)*pool*.07*heat*flick*(1.-DY));

 // progress: a line of embers round the pit, catching light from 12 clockwise
 float fr=fract(atan(q.x,q.y)/(2.*PI));float gd=abs(d-RR);float rw=.011;
 over(o,mix(vec3(.22,.18,.16),vec3(.35,.28,.24),DY),smoothstep(rw+aa,rw-aa,gd)*mix(.5,.22,DY));
 float on=step(fr,LV)*smoothstep(rw+aa,rw-aa,gd)*step(.001,LV);
 float grain=.55+.45*noise(vec2(fr*160.,T*.9));
 over(o,mix(fireCol(.4+.3*grain)*(.85+.15*flick),vec3(.72,.34,.14)*(.9+.2*grain),DY),on*.9);
 glowAdd(o,vec3(1.,.45,.12)*exp(-pow(gd/.06,2.))*step(fr,LV)*.06*step(.001,LV)*(1.-DY));
 vec2 tp=RR*vec2(sin(LV*2.*PI),cos(LV*2.*PI));
 glowAdd(o,vec3(1.,.8,.5)*exp(-dot(q-tp,q-tp)/.002)*.45*step(.001,LV)*step(LV,.999)*(1.-DY*.7));
 vec2 np=RR*vec2(sin(NOW),cos(NOW));
 over(o,mix(vec3(1.,.95,.86),vec3(.2,.13,.09),DY),smoothstep(.03,.03-aa,length(q-np)));

 // the bed: coals, logs and flames
 if(d<1.03){
  vec3 emb=TX>.5?texture2D(EMB,q*.55+.5).rgb:vec3(.08,.06,.05)+vec3(.5,.12,.02)*step(.7,noise(q*9.));
  float breathe=.5+.5*noise(q*2.6+vec2(T*.35,-T*.27));
  vec3 bed=emb*.2+vec3(.9,.38,.14)*hot(emb)*(.25+.45*breathe)*heat;
  // the heart of the fire glows through the coals
  bed+=vec3(.9,.36,.12)*smoothstep(.8,.1,d)*.08*heat*(.6+.4*breathe);
  // by day the same bed reads as grey ash over charcoal, the coals dull
  // (sooty charcoal in the middle, soft pale ash towards the stones, with
  // lumps of charcoal half buried in it)
  float pale=smoothstep(.3,1.,d+.35*(fbm(q*2.5)-.5));
  float grain=fbm(q*14.)*.7+noise(q*40.)*.3;
  float lf=fbm(q*11.+3.);float lump=smoothstep(.56,.64,lf)*(.6+.4*pale);
  vec3 dayBed=mix(vec3(.13,.12,.11),vec3(.6,.58,.55),pale)*(.72+.5*grain);
  dayBed=mix(dayBed,vec3(.1,.09,.085)*(.7+1.6*smoothstep(.6,.75,lf)),lump*.8);
  dayBed+=vec3(.7,.25,.08)*hot(emb)*(.12+.18*breathe)*heat*(1.-pale);
  bed=mix(bed,dayBed,DY);
  bed*=.55+.45*smoothstep(1.02,.7,d);
  // three charred logs meeting in the middle
  for(int i=0;i<3;i++){
   float ang=float(i)*2.0944+.45;vec2 dir=vec2(cos(ang),sin(ang));
   float along=dot(q,dir),across=abs(dot(q,vec2(-dir.y,dir.x)));
   float lw=.11;
   float lg=smoothstep(lw+aa,lw-aa,across)*smoothstep(-.06,-.02,along)*smoothstep(.8,.76,along);
   float bark=noise(vec2(along*18.,across*50.));
   vec3 lc=vec3(.1,.07,.05)*(.6+.8*bark);
   lc+=vec3(.9,.38,.14)*smoothstep(.66,.92,noise(vec2(along*13.+T*.25,across*32.)))*.35*heat*breathe;
   // by day: charred black with patches of white ash on top
   vec3 lcd=mix(vec3(.08,.07,.065)*(.7+.6*bark),vec3(.62,.6,.57),smoothstep(.42,.7,noise(vec2(along*9.,across*20.)))*.85);
   lcd+=lc*.35*smoothstep(.66,.92,noise(vec2(along*13.+T*.25,across*32.)));
   lc=mix(lc,lcd,DY);
   lc*=.55+.45*sqrt(max(1.-pow(across/lw,2.),0.));
   bed=mix(bed,lc,lg);
  }
  // flames licking outward from the middle, seen from above
  float ang=atan(q.y,q.x);
  vec2 w=vec2(cos(ang),sin(ang));
  float fl=fbm(vec2(w.x*2.2+w.y*1.3+sin(T*.6)*.2,d*3.4-T*2.3))*1.05+fbm(vec2(w.y*4.1-w.x*2.,d*6.5-T*3.6))*.5;
  float size=mix(.36,.72,LV)+SURGE*.25;
  float f=smoothstep(size,0.,d+(fl-.6)*.62)*flick;
  f*=.75+.5*smoothstep(.35,.7,fbm(vec2(ang*3.+T*.4,d*4.-T*2.)));
  vec3 fc=fireCol(clamp(f*1.15,0.,.93));
  float fa=smoothstep(.04,.5,f)*mix(.85,.7,DY);
  fc=mix(fc,fc*vec3(1.,.95,.9),DY);
  bed=mix(bed,fc,fa)+fc*fa*.08;
  over(o,bed,smoothstep(1.03,1.,d));
 }

 // the stone ring: rounded stones lit from the fire inside
 if(d>.94&&d<1.3){
  float a=atan(q.y,q.x);float N=13.;float base=floor((a/(2.*PI)+.5)*N);
  float best=9.;vec3 sc=vec3(0.);
  for(int k=-1;k<=1;k++){
   float cell=mod(base+float(k)+N,N);
   float ca=(cell+.5)/N*2.*PI-PI;float jr=hash(vec2(cell,1.));
   vec2 rad=vec2(cos(ca),sin(ca)),tang=vec2(-rad.y,rad.x);
   vec2 sq=q-rad*(1.1+.025*(jr-.5));
   vec2 lq=vec2(dot(sq,tang)/(.25+.04*jr),dot(sq,rad)/(.105+.02*hash(vec2(cell,2.))));
   float sd=length(lq)+(noise(lq*2.5+cell*3.)-.5)*.22;
   if(sd<best){
    best=sd;
    float h=sqrt(max(1.-sd*sd,0.));
    vec3 n=normalize(vec3(lq.x*.6*tang+lq.y*.6*rad,h+.2));
    vec3 st=mix(vec3(.16,.145,.135),vec3(.3,.27,.245),noise(q*14.+cell))*(.85+.2*noise(q*40.));
    float top=.2+.65*h*h;
    float fire=max(dot(n,vec3(-rad,.35)),0.)*heat*flick;
    sc=st*top+vec3(1.,.55,.3)*fire*.35*st*1.5;
    // by day, sunlight from the upper left
    vec3 sun=normalize(vec3(-.45,.55,.7));
    vec3 sd2=mix(vec3(.46,.43,.4),vec3(.66,.62,.57),noise(q*14.+cell))*(.85+.22*noise(q*40.));
    sc=mix(sc,sd2*(.3+.85*max(dot(n,sun),0.)),DY);
   }
  }
  float edge=smoothstep(1.,.92,best);
  // a soft dark gap round each stone
  over(o,vec3(.04,.03,.025),smoothstep(1.1,1.,best)*mix(.45,.3,DY));
  over(o,sc,edge);
 }

 // reminders: glowing coals on the ring. x angle, y alive, z assigned (gold),
 // w ticked (flares, then gone)
 for(int i=0;i<6;i++){vec4 m=MK[i];if(m.y>.01||m.w>.01){
  vec2 p=RR*vec2(sin(m.x),cos(m.x));vec2 dq=q-p;
  float r=.07*(.6+.4*m.y)*(1.+m.w*.6);
  float flare=1.+m.w*(1.-m.w)*6.;
  float pulse=.7+.3*sin(T*2.2+m.x*5.);
  vec3 gc=mix(vec3(.92,.48,.22),vec3(.95,.76,.42),m.z);
  glowAdd(o,gc*exp(-dot(dq,dq)/(r*r*5.))*.22*pulse*flare*(1.-m.w*.8)*(1.-DY*.75));
  float cs=length(dq/r)+(noise(dq/r*2.+m.x*7.)-.5)*.3;
  float body=smoothstep(1.,.9,cs)*smoothstep(0.,.3,m.y)*(1.-m.w);
  float cr=smoothstep(.55,.8,noise(dq/r*3.+m.x*3.));
  vec3 cc=mix(vec3(.1,.075,.06)+gc*cr*pulse*.7*flare,vec3(.42,.17,.08)+gc*(.25+.5*cr)*pulse*.6*flare,DY);
  over(o,cc,body);
 }}

 // sparks drifting out of the fire, and bursts from ticks
 for(int k=0;k<7;k++){
  float fk=float(k);
  float life=fract(T*(.18+.1*h1(fk))+h1(fk*3.1));
  float an=h1(fk*7.7)*6.2832+life*1.5;
  vec2 sp=vec2(cos(an),sin(an))*(.2+life*(1.1+SURGE));
  float b=exp(-dot(q-sp,q-sp)/.0012)*(1.-life)*step(.08,life);
  glowAdd(o,vec3(1.,.72,.4)*b*heat*.6*(1.-DY*.8));
 }
 for(int j=0;j<4;j++){vec3 bu=BURST[j];float age=T-bu.z;if(age>0.&&age<1.4){
  for(int k=0;k<14;k++){
   float fk=float(k)+float(j)*17.;
   float an=h1(fk*5.3)*6.2832,sp=.35+.7*h1(fk*2.9);
   vec2 pp=bu.xy+vec2(cos(an),sin(an))*sp*age*(1.-age*.25);
   float b=exp(-dot(q-pp,q-pp)/.0015)*exp(-age*2.2);
   glowAdd(o,vec3(1.,.8,.5)*b*.9*(1.-DY));
   // by day a tick throws up flecks of ash instead
   over(o,vec3(.3,.26,.24),clamp(b*1.4,0.,1.)*DY*.8);
  }
 }}
 gl_FragColor=o;
}`;

// HEARTH is the Fire home screen's backdrop. Above HY (CSS px from the top,
// where the list begins): night air lit by the fire, smoke drifting up and
// sparks rising from the pit (PC, its centre in CSS px; PRD its radius). At HY
// a faint warm edge, and below it the list sits on dark, mostly grey ash
// (EMB) where a few cracks slowly breathe. DK = 1 is light mode: the same pit
// by day, on pale ash and sand, with grey smoke and a soft shadow.
export const HEARTH = `
precision mediump float;
uniform vec2 RES; uniform float T; uniform float HY; uniform float PX; uniform vec2 PC; uniform float PRD; uniform float DK; uniform float TX;
uniform sampler2D EMB;
${COMMON}
void main(){
 float x=gl_FragCoord.x/PX,y=(RES.y-gl_FragCoord.y)/PX;
 float flick=.86+.14*noise(vec2(T*3.2,0.))+.06*sin(T*11.);
 float edge=HY+sin(x*.018+1.)*7.+(noise(vec2(x*.03,T*.2))-.5)*8.;
 vec3 col=vec3(0.);
 if(y<edge+8.){
  // the air: dark and warm by night, a sunset by day
  vec3 night=mix(vec3(.045,.028,.022),vec3(.075,.04,.03),smoothstep(0.,HY,y));
  vec3 day=mix(vec3(.957,.933,.9),vec3(.925,.89,.845),smoothstep(0.,HY,y));
  col=mix(night,day,DK);
  vec2 rel=(vec2(x,y)-PC)/PRD;
  col+=vec3(1.,.5,.22)*exp(-length(rel)*1.1)*.07*flick*(1.-DK);
  // by day the pit sits on the ground: a soft shadow under the stones
  col*=1.-DK*.2*exp(-pow((length(rel-vec2(.06,.1))-1.12)/.22,2.));
  // smoke rising from the pit, drifting and thinning
  float up=-rel.y;
  float sm=fbm(vec2(rel.x*1.1+sin(up*.7+T*.25)*.5,up*.8-T*.3))*smoothstep(.6,1.8,up)*smoothstep(mix(4.5,2.2,DK),.6,abs(rel.x-up*.15));
  col=mix(col,mix(vec3(.32,.27,.25),vec3(.52,.5,.49),DK),sm*mix(.14,.24,DK));
  // sparks rising out of the fire and swaying as they go
  for(int k=0;k<12;k++){
   float fk=float(k);
   float life=fract(T*(.07+.05*h1(fk))+h1(fk*1.7));
   vec2 st=PC+vec2((h1(fk*3.3)-.5)*PRD*1.2,-PRD*.3);
   vec2 pos=st+vec2(sin(T*1.1+fk)*14.*life+(h1(fk*9.1)-.5)*120.*life,-life*(PC.y+60.));
   float b=exp(-dot(vec2(x,y)-pos,vec2(x,y)-pos)/1.6)*(1.-life);
   col+=vec3(1.,.72,.4)*b*.6*(1.-DK);
  }
 }
 if(y>edge-6.){
  // the coal bed, kept dark enough to read over, its cracks breathing
  vec3 emb=TX>.5?texture2D(EMB,vec2(x,y)/360.).rgb:vec3(.07,.05,.04);
  float breathe=.45+.55*noise(vec2(x,y)*.012+vec2(T*.12,-T*.09));
  // mostly grey ash: the texture's colour is pulled right down, and only a
  // few cracks glow, fading out further under the list
  float ash=dot(emb,vec3(.3,.5,.2));
  float dep=exp(-max(y-edge,0.)/140.);
  vec3 bed=mix(vec3(ash),emb,.35)*vec3(.1,.085,.075)+vec3(.85,.36,.14)*hot(emb)*(.03+.08*dep)*breathe;
  bed+=vec3(.05,.03,.022)*(1.-dep*.5);
  bed*=.7+.3*smoothstep(0.,26.,y-edge)+.3*exp(-max(y-edge,0.)/10.);
  // by day: pale, sunlit ash with only its grain showing
  vec3 dayBed=vec3(.905,.875,.835)-vec3(.06,.065,.07)*(ash-.2)*(.4+.6*dep)-vec3(.05,.04,.03)*exp(-max(y-edge,0.)/14.);
  bed=mix(bed,dayBed,DK);
  float k=smoothstep(edge-5.,edge+6.,y);
  col=y<edge+8.?mix(col,bed,k):bed;
  // the hot edge
  col+=vec3(.95,.45,.18)*exp(-pow((y-edge)/4.,2.))*.14*(.6+.4*breathe)*flick*(1.-DK);
  col*=1.-DK*.06*exp(-pow((y-edge)/6.,2.));
 }
 // heat haze just above the edge
 col+=vec3(.95,.45,.18)*exp(-max(edge-y,0.)/22.)*step(y,edge)*.04*flick*(1.-DK);
 gl_FragColor=vec4(col,1.);
}`;

// NIGHTLY_FIRE brings nightly.jpg (a campfire in a pine clearing) to life:
// the flames shimmer and flicker, firelight pulses on the ground, sparks rise
// and sway, stars twinkle, and SS (x, y, start time) sends up a flurry of
// sparks on each tick. uv is the photo's own coordinates, y down.
export const NIGHTLY_FIRE = `
precision mediump float;
uniform sampler2D IMG; uniform vec2 RES; uniform float T; uniform float IA; uniform vec3 SS;
${COMMON}
void main(){
 vec2 s=gl_FragCoord.xy/RES;float ca=RES.x/RES.y;
 vec2 uv=vec2(s.x,1.-s.y);
 if(ca>IA){uv.y=.5+(uv.y-.5)*IA/ca;}else{uv.x=.5+(uv.x-.5)*ca/IA;}
 float flick=.86+.14*noise(vec2(T*3.,0.))+.07*sin(T*12.);
 // heat shimmer over and above the flames
 vec2 fd=(uv-vec2(.5,.47))*vec2(1.,1./IA);
 float hz=exp(-dot(fd*vec2(3.,1.2),fd*vec2(3.,1.2))*14.);
 uv.x+=sin(uv.y*90.-T*6.)*.0025*hz;
 vec3 c=texture2D(IMG,uv).rgb;
 // flicker: warm, lit parts brighten and dim with the fire
 float warm=clamp((c.r-c.b)*1.6,0.,1.);
 c*=1.+(flick-.93)*warm*1.4;
 vec2 gd=(uv-vec2(.5,.66))*vec2(1.,1./IA);
 c+=vec3(1.,.5,.15)*exp(-dot(gd,gd)*18.)*.06*(flick-.8);
 // stars: pixels brighter than their neighbourhood, in the upper sky
 vec2 o1=vec2(.003,0.),o2=vec2(0.,.003*IA);
 vec3 bl=(texture2D(IMG,uv+o1).rgb+texture2D(IMG,uv-o1).rgb+texture2D(IMG,uv+o2).rgb+texture2D(IMG,uv-o2).rgb)*.25;
 float star=max(dot(c-bl,vec3(.33)),0.)*(1.-warm)*step(uv.y,.5);
 vec2 cell=floor(uv*vec2(150.,150./IA));
 c+=vec3(star)*sin(T*(1.3+2.4*hash(cell))+hash(cell+7.)*6.28)*.8;
 // sparks rising from the fire; more for a moment after a tick
 float boost=exp(-max(T-SS.z,0.)*1.2)*step(0.,T-SS.z);
 for(int k=0;k<26;k++){
  float fk=float(k);
  float life=fract(T*(.12+.08*h1(fk))+h1(fk*2.3));
  float on=step(fk,10.)+boost*step(10.,fk);
  vec2 pos=vec2(.5+(h1(fk*5.1)-.5)*.06+sin(T*1.4+fk)*.012*life+(h1(fk*8.7)-.5)*.1*life,.54-life*.3);
  vec2 dd=(uv-pos)*vec2(1.,1./IA);
  c+=vec3(1.,.66,.28)*exp(-dot(dd,dd)*1.2e5)*(1.-life)*on*1.4;
 }
 gl_FragColor=vec4(c,1.);
}`;
