(function(root){
  const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y,(a.z||0)-(b.z||0));
  function create(buildings){
    const walls=[],cells=new Map(),buildingCells=new Map(),size=32;
    for(const building of buildings){
      const ring=building.footprint;if(!ring?.length)continue;
      for(let x=Math.floor(Math.min(...ring.map(p=>p.x))/size);x<=Math.floor(Math.max(...ring.map(p=>p.x))/size);x++)for(let y=Math.floor(Math.min(...ring.map(p=>p.y))/size);y<=Math.floor(Math.max(...ring.map(p=>p.y))/size);y++){const key=x+','+y;if(!buildingCells.has(key))buildingCells.set(key,[]);buildingCells.get(key).push(building);}
      const rings=[building.footprint,...(building.interiorRings||[])];
      for(const ring of rings){if(!ring?.length)continue;for(let i=0;i<ring.length;i++){
        const a=ring[i],b=ring[(i+1)%ring.length],length=Math.hypot(b.x-a.x,b.y-a.y);if(length<.1)continue;
        const wall={id:walls.length,a,b,height:Math.max(3,building.heightM||9),length,building:building.id};walls.push(wall);
        for(let x=Math.floor(Math.min(a.x,b.x)/size);x<=Math.floor(Math.max(a.x,b.x)/size);x++)for(let y=Math.floor(Math.min(a.y,b.y)/size);y<=Math.floor(Math.max(a.y,b.y)/size);y++){
          const key=`${x},${y}`;if(!cells.has(key))cells.set(key,[]);cells.get(key).push(wall);
        }
      }}
    }
    function hits(a,b,ignore=-1){
      const candidates=new Set(),vx=b.x-a.x,vy=b.y-a.y,sx=Math.sign(vx),sy=Math.sign(vy);
      let x=Math.floor(a.x/size),y=Math.floor(a.y/size);const endX=Math.floor(b.x/size),endY=Math.floor(b.y/size);
      const deltaX=sx?size/Math.abs(vx):Infinity,deltaY=sy?size/Math.abs(vy):Infinity;
      let tx=sx?((x+(sx>0?1:0))*size-a.x)/vx:Infinity,ty=sy?((y+(sy>0?1:0))*size-a.y)/vy:Infinity;
      const visit=(gx,gy)=>{for(const wall of cells.get(gx+','+gy)||[])if(wall.id!==ignore)candidates.add(wall);};
      visit(x,y);
      for(let step=0,limit=Math.abs(endX-x)+Math.abs(endY-y)+2;step<limit&&(x!==endX||y!==endY);step++){
        if(tx<ty){x+=sx;tx+=deltaX;}else if(ty<tx){y+=sy;ty+=deltaY;}else{visit(x+sx,y);visit(x,y+sy);x+=sx;y+=sy;tx+=deltaX;ty+=deltaY;}visit(x,y);
      }
      const out=[],rx=b.x-a.x,ry=b.y-a.y;
      for(const wall of candidates){const sx=wall.b.x-wall.a.x,sy=wall.b.y-wall.a.y,den=rx*sy-ry*sx;if(Math.abs(den)<1e-9)continue;
        const qx=wall.a.x-a.x,qy=wall.a.y-a.y,t=(qx*sy-qy*sx)/den,u=(qx*ry-qy*rx)/den;
        const z=(a.z||0)+t*((b.z||0)-(a.z||0));
        if(t>1e-4&&t<.9999&&u>=0&&u<=1&&z<wall.height&&z>=0)out.push({wall,t,x:a.x+t*rx,y:a.y+t*ry,z});
      }
      return out.sort((a,b)=>a.t-b.t);
    }
    function direct(a,b){
      const crossed=hits(a,b),straight=Math.max(1,distance(a,b));
      if(!crossed.length)return {id:'direct',length:straight,gain:1/straight,cutoff:3500,kind:'direct'};
      const height=Math.max(...crossed.map(row=>row.wall.height))+.15;
      const first={...crossed[0],z:height},last={...crossed[crossed.length-1],z:height};
      const length=distance(a,first)+distance(first,last)+distance(last,b),excess=Math.max(0,length-straight);
      // Geometrical roof detour with an explicit, approximate frequency-dependent edge loss.
      return {id:'roof',length:Math.max(1,length),gain:1/Math.max(1,length)/Math.sqrt(3+20*2*500*excess/343),
        cutoff:Math.max(160,1800/(1+excess)),kind:'roof-diffraction-approximation',excess};
    }
    function nearby(point){
      const found=new Set(),x=Math.floor(point.x/size),y=Math.floor(point.y/size);
      for(let dx=-2;dx<=2;dx++)for(let dy=-2;dy<=2;dy++)for(const wall of cells.get(`${x+dx},${y+dy}`)||[])found.add(wall);
      const metric=wall=>{const ux=(wall.b.x-wall.a.x)/wall.length,uy=(wall.b.y-wall.a.y)/wall.length,t=Math.max(0,Math.min(wall.length,(point.x-wall.a.x)*ux+(point.y-wall.a.y)*uy));return Math.hypot(point.x-wall.a.x-ux*t,point.y-wall.a.y-uy*t);};
      return [...found].filter(wall=>metric(wall)<65).sort((a,b)=>metric(a)-metric(b)).slice(0,12);
    }
    function reflected(a,b,wall){
      const ux=(wall.b.x-wall.a.x)/wall.length,uy=(wall.b.y-wall.a.y)/wall.length,nx=-uy,ny=ux;
      const sideA=(a.x-wall.a.x)*nx+(a.y-wall.a.y)*ny,sideB=(b.x-wall.a.x)*nx+(b.y-wall.a.y)*ny;
      if(sideA*sideB<=0)return null;
      const mirror={x:a.x-2*sideA*nx,y:a.y-2*sideA*ny,z:a.z},den=(b.x-mirror.x)*nx+(b.y-mirror.y)*ny;
      if(Math.abs(den)<1e-9)return null;
      const t=((wall.a.x-mirror.x)*nx+(wall.a.y-mirror.y)*ny)/den;
      const bounce={x:mirror.x+t*(b.x-mirror.x),y:mirror.y+t*(b.y-mirror.y),z:mirror.z+t*(b.z-mirror.z)};
      const along=(bounce.x-wall.a.x)*ux+(bounce.y-wall.a.y)*uy;
      if(t<=0||t>=1||along<0||along>wall.length||bounce.z<0||bounce.z>wall.height||hits(a,bounce,wall.id).length||hits(bounce,b,wall.id).length)return null;
      const length=Math.max(1,distance(a,bounce)+distance(bounce,b));
      return {id:`wall-${wall.id}`,length,gain:.55/length,cutoff:1800,kind:'facade-reflection',bounce};
    }
    function occupied(point){
      const x=Math.floor(point.x/size),y=Math.floor(point.y/size),candidates=buildingCells.get(`${x},${y}`)||[];
      const inside=ring=>{let yes=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++){
        const a=ring[i],b=ring[j];if((a.y>point.y)!==(b.y>point.y)&&point.x<(b.x-a.x)*(point.y-a.y)/(b.y-a.y)+a.x)yes=!yes;
      }return yes;};
      for(const building of candidates)if(inside(building.footprint)&&!(building.interiorRings||[]).some(inside))return true;
      return false;
    }
    return {hits,direct,nearby,reflected,occupied,walls};
  }
  root.MotorcycleCityPaths={create};
})(globalThis);
