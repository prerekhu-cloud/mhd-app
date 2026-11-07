/* S-JTSK (EPSG:5514, Křovák) -> WGS84. Vstup: souřadnice EPSG:5514 (záporné x,y), výstup [lat, lon]. */
MG.jtsk = function(ex, ny, H){
 const X = -ny, Y = -ex; H = H || 245;
 const n=0.97992470462083, konst=12310230.12797036, sinUQ=0.863499969506341, cosUQ=0.504348889819882,
  sinVQ=0.420215144586493, cosVQ=0.907424504992097, alfa=1.000597498371542, k=1.003419163966575, e=0.081696831215303;
 const ro=Math.sqrt(X*X+Y*Y), eps=2*Math.atan(Y/(ro+X)), D=eps/n, S=2*Math.atan(Math.exp(1/n*Math.log(konst/ro)))-Math.PI/2;
 const sinS=Math.sin(S), cosS=Math.cos(S), sinU=sinUQ*sinS-cosUQ*cosS*Math.cos(D), cosU=Math.sqrt(1-sinU*sinU);
 const sinDV=Math.sin(D)*cosS/cosU, cosDV=Math.sqrt(1-sinDV*sinDV), sinV=sinVQ*cosDV-cosVQ*sinDV, cosV=cosVQ*cosDV+sinVQ*sinDV;
 const Lj=2*Math.atan(sinV/(1+cosV))/alfa, t=Math.exp(2/alfa*Math.log((1+sinU)/cosU/k));
 let pom=(t-1)/(t+1), sinB, it=0;
 do{sinB=pom;pom=t*Math.exp(e*Math.log((1+e*sinB)/(1-e*sinB)));pom=(pom-1)/(pom+1)}while(Math.abs(pom-sinB)>1e-15&&++it<50);
 const Bj=Math.atan(pom/Math.sqrt(1-pom*pom));
 const a=6377397.15508, f1=299.152812853, e2=1-(1-1/f1)*(1-1/f1), r=a/Math.sqrt(1-e2*Math.sin(Bj)**2);
 const x=(r+H)*Math.cos(Bj)*Math.cos(Lj), y=(r+H)*Math.cos(Bj)*Math.sin(Lj), z=((1-e2)*r+H)*Math.sin(Bj);
 const dx=570.69, dy=85.69, dz=462.84, wz=-5.2611/3600*Math.PI/180, wy=-1.58676/3600*Math.PI/180, wx=-4.99821/3600*Math.PI/180, m=3.543e-6;
 const xn=dx+(1+m)*(x+wz*y-wy*z), yn=dy+(1+m)*(-wz*x+y+wx*z), zn=dz+(1+m)*(wy*x-wx*y+z);
 const a2=6378137.0, f2=298.257223563, ab=f2/(f2-1), p=Math.sqrt(xn*xn+yn*yn), e22=1-(1-1/f2)**2;
 const th=Math.atan(zn*ab/p), st=Math.sin(th), ct=Math.cos(th);
 const B=Math.atan((zn+e22*ab*ab*a2/ab*st**3)/(p-e22*a2*ct**3)), L=2*Math.atan(yn/(p+xn));
 return [B*180/Math.PI, L*180/Math.PI];
};
