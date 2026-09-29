// GLSL for the Space theme. WebGL 1, so it runs on every phone.
//
// PLANET draws the home screen's dial on a transparent canvas, so the stars
// show around it: a banded gas giant, slowly turning, lit by a sun that comes
// round as the day gets done (a thin crescent with nothing done, full when
// everything is). Its surface comes from MAP (the Gemini texture, planet.jpg)
// once loaded, or is drawn in code until then (TX = 0). Round it runs the
// orbit that doubles as the progress ring, with a chip for the current time;
// reminders are small moons on that orbit at their hour, lit by the same sun.
// A ticked moon breaks orbit and streaks away; finishing the day brings a
// sunrise flare over the planet's edge.
// Units: q is measured in planet radii from its centre, y up.

export const PLANET = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
uniform vec2 C; uniform float RAD; uniform float T; uniform float LV; uniform float NT; uniform float SURGE; uniform float NOW; uniform float TX;
uniform vec4 MK[6]; uniform sampler2D MAP;
#define PI 3.14159265
#define RR 1.42
vec3 L;

float hash(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y);}
float noise(vec2 p){vec2 i=floor(p),f=fract(p);vec2 u=f*f*(3.-2.*f);
 return mix(mix(hash(i),hash(i+vec2(1.,0.)),u.x),mix(hash(i+vec2(0.,1.)),hash(i+vec2(1.,1.)),u.x),u.y);}
const mat2 M2=mat2(1.6,1.2,-1.2,1.6);
float fbm(vec2 p){float v=0.,a=.5;for(int i=0;i<4;i++){v+=a*noise(p);p=M2*p;a*=.5;}return v;}

// Stand-in surface until the Gemini map loads: soft bands with turbulent
// edges and one amber storm. lon wraps via cos/sin so there's no seam.
vec3 bands(float lon,float lat){
 vec2 w=vec2(cos(lon),sin(lon));
 float tb=fbm(w*1.6+vec2(lat*7.,T*.004))*1.3;
 float y=lat*5.2+tb;
 float b=.5+.5*sin(y*3.);
 vec3 c=mix(vec3(.16,.17,.46),vec3(.46,.44,.9),b);
 c=mix(c,vec3(.78,.76,.98),smoothstep(.75,1.,sin(y*1.3+1.))*.55);
 c*=.9+.2*fbm(w*6.+lat*20.);
 vec2 sp=vec2(atan(sin(lon-1.1),cos(lon-1.1))*1.,lat+.38);
 float st=smoothstep(.2,.02,length(sp*vec2(.9,2.6)));
 c=mix(c,mix(vec3(.95,.55,.25),vec3(1.,.78,.5),smoothstep(.0,.6,st)),st*.85);
 return c;}

void over(inout vec4 o,vec3 c,float k){o=vec4(c*k,k)+o*(1.-k);}

// A small lit sphere (a moon) of radius r at p; returns colour in .rgb and
// coverage in .a.
vec4 moon(vec2 q,vec2 p,float r,vec3 tint,float aa){
 vec2 m=(q-p)/r;float d=length(m);
 if(d>1.+aa/r)return vec4(0.);
 vec3 n=vec3(m,sqrt(max(1.-d*d,0.)));
 float dif=smoothstep(-.05,.25,dot(n,L));
 vec3 alb=tint*(.8+.25*noise(m*4.+p*9.));
 vec3 c=alb*(mix(.32,.07,NT)+dif*1.05)+vec3(.55,.6,1.)*pow(1.-n.z,3.)*.35;
 return vec4(c,smoothstep(1.+aa/r,1.-aa/r,d));}

void main(){
 vec2 q=(gl_FragCoord.xy-C)/RAD;float d=length(q);
 float aa=1.5/RAD;
 vec4 o=vec4(0.);
 if(d>RR+.3){gl_FragColor=o;return;}
 // the sun comes round with progress: a crescent at 0, full at 1
 float ph=mix(.24,1.,LV)*PI;
 L=normalize(vec3(sin(ph)*.95,.28,-cos(ph)));
 vec2 l2=normalize(L.xy+1e-4);

 // atmosphere: a soft glow round the planet, brighter on the sunlit side
 float halo=exp(-max(d-1.,0.)*7.)*step(1.-aa,d);
 float hl=.25+.75*max(dot(normalize(q+1e-4),l2)*.5+.5*L.z+.3,0.);
 vec3 hc=mix(vec3(.46,.5,1.),vec3(.55,.52,1.),NT);
 over(o,hc,halo*hl*mix(.28,.42,NT));

 // the orbit, doubling as the progress ring, and the now-chip on it
 float fr=fract(atan(q.x,q.y)/(2.*PI));
 float rw=.012,gd=abs(d-RR);
 over(o,mix(vec3(.3,.34,.6),vec3(.55,.6,.95),NT),smoothstep(rw+aa,rw-aa,gd)*mix(.35,.28,NT));
 float la=LV*2.*PI;
 float capA=length(q-RR*vec2(0.,1.)),capB=length(q-RR*vec2(sin(la),cos(la)));
 float pw=.02;
 float on=max(step(fr,LV)*smoothstep(pw+aa,pw-aa,gd),max(smoothstep(pw+aa,pw-aa,capA),smoothstep(pw+aa,pw-aa,capB)))*step(.001,LV);
 vec3 rc=mix(vec3(.29,.36,.94),vec3(.46,.53,1.),NT);
 over(o,rc,on);
 o.rgb+=rc*exp(-pow(gd/.06,2.))*step(fr,LV)*step(.001,LV)*.18;
 o.a=max(o.a,dot(o.rgb,vec3(.33)));
 vec2 np=RR*vec2(sin(NOW),cos(NOW));
 over(o,mix(vec3(.1,.12,.3),vec3(.95,.96,1.),NT),smoothstep(.042,.042-aa,length(q-np)));

 // the planet
 if(d<1.+aa){
  float z=sqrt(max(1.-d*d,0.));
  vec3 n=vec3(q,z);
  // axial tilt for the surface, then a slow turn
  float tl=-.32;vec3 m=vec3(cos(tl)*n.x-sin(tl)*n.y,sin(tl)*n.x+cos(tl)*n.y,n.z);
  float lon=atan(m.x,m.z)+T*.03;float lat=asin(clamp(m.y,-1.,1.));
  vec3 alb=TX>.5?texture2D(MAP,vec2(fract(lon/(2.*PI)),.5-lat/PI)).rgb:bands(lon,lat);
  float nl=dot(n,L);
  float dif=smoothstep(-.12,.4,nl);
  vec3 col=alb*(mix(.26,.03,NT)+dif*mix(.9,1.08,NT));
  // the terminator glows faintly warm where sunlight grazes the clouds
  col+=vec3(1.,.55,.35)*alb*exp(-pow(nl/.12,2.))*.25;
  // limb darkening, then the atmosphere's rim on the lit side
  col*=.72+.28*pow(z,.5);
  col+=hc*pow(1.-z,2.2)*(.12+.9*max(nl+.25,0.))*.55;
  // a faint glint of sunlight on the cloud tops
  col+=vec3(1.)*pow(max(dot(reflect(-L,n),vec3(0.,0.,1.)),0.),40.)*.08;
  over(o,col,smoothstep(1.+aa,1.-aa,d));
 }

 // moons: reminders at their hour on the orbit. x = angle, y = alive,
 // z = assigned (amber), w = leaving (0..1, streaking outward)
 for(int i=0;i<6;i++){vec4 k=MK[i];if(k.y>.01||k.w>.01){
  float rad=RR*(1.+k.w*k.w*.9);
  vec2 p=rad*vec2(sin(k.x+k.w*.25),cos(k.x+k.w*.25));
  vec3 tint=mix(vec3(.82,.8,.9),vec3(1.,.72,.38),k.z);
  float r=.085*(.5+.5*k.y);
  // a streak behind a leaving moon
  if(k.w>.01){vec2 dir=normalize(p);float along=dot(q-p,-dir);float across=length((q-p)+dir*along);
   float tr=step(0.,along)*exp(-along*9.)*smoothstep(.014,.0,across)*(1.-k.w);
   over(o,tint*1.2,tr*.6);}
  // a soft glow so moons read against the dark
  float g=exp(-pow(length(q-p)/(r*2.4),2.))*(1.-k.w);
  over(o,tint,g*mix(.2,.35,NT));
  // by day, a soft dark edge so a moon reads against the pale sky
  over(o,vec3(.14,.16,.38),smoothstep(r*1.22+aa,r*1.22-aa,length(q-p))*(1.-NT)*.45*(1.-k.w)*smoothstep(0.,.3,k.y));
  vec4 mc=moon(q,p,r,tint,aa);
  over(o,mc.rgb,mc.a*(1.-k.w)*smoothstep(0.,.3,k.y));
 }}

 // finishing the day: a sunrise flare over the planet's edge
 if(SURGE>.01){
  vec2 fp=l2*1.02;vec2 fq=q-fp;
  float f=exp(-dot(fq,fq)*26.)+exp(-abs(fq.y)*60.)*exp(-abs(fq.x)*2.2)*.6;
  vec3 fc=vec3(1.,.9,.75)*f*SURGE;
  o.rgb+=fc;o.a=max(o.a,clamp(dot(fc,vec3(.33)),0.,1.));
 }
 o.rgb+=(hash(gl_FragCoord.xy+fract(T))-.5)/255.*o.a;
 gl_FragColor=o;
}`;
