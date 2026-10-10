(function registerActivityLiquid(root) {
  const registry = typeof module === 'object' && module.exports
    ? require('../../app/runtime/phase-module-registry.js') : root.SimulattePhaseModuleRegistry;
  const scope = registry.family('physicsModel');
  // Conservative depth-averaged Euler flux in a rectangular moving container.
  function liquidFlux(left, right, gravity, output = [0, 0]) {
    const [lh,lq]=left,[rh,rq]=right;
    const a=Math.max((lh>0?Math.abs(lq/lh):0)+Math.sqrt(gravity*lh),(rh>0?Math.abs(rq/rh):0)+Math.sqrt(gravity*rh));
    const lm=lh>0?lq*lq/lh+gravity*lh*lh/2:0,rm=rh>0?rq*rq/rh+gravity*rh*rh/2:0;
    output[0]=(lq+rq-a*(rh-lh))/2; output[1]=(lm+rm-a*(rq-lq))/2; return output;
  }
  function createActivityLiquid(container, cells) {
    const height = container.heightMeters * container.fillFraction;
    return { schema: 'simulatte.activityLiquid.v1', depthMeters: Array(cells).fill(height),
      dischargeSquareMetersPerSecond: Array(cells).fill(0),
      initialVolumeCubicMeters: container.widthMeters * container.depthMeters * height,
      remainingVolumeCubicMeters: container.widthMeters * container.depthMeters * height,
      consumedVolumeCubicMeters: 0, spilledVolumeCubicMeters: 0,
      outflowMomentumKgMetersPerSecond: [0, 0], outflowAngularMomentumKgSquareMetersPerSecond: 0,
      consumedMomentumKgMetersPerSecond: [0, 0], consumedAngularMomentumKgSquareMetersPerSecond: 0, transferEvents: [],
      stepCount: 0, maxCfl: 0, minDepthMeters: height };
  }
  function stepActivityLiquid(input, container, environment, seconds, policy) {
    if (!Number.isFinite(seconds) || seconds <= 0 || !Number.isFinite(environment.angleRadians) ||
        !environment.acceleration.every(Number.isFinite)) throw new Error('Invalid liquid integration input');
    const state = { ...input, depthMeters: input.depthMeters.slice(),
      dischargeSquareMetersPerSecond: input.dischargeSquareMetersPerSecond.slice(),
      outflowMomentumKgMetersPerSecond: [0, 0], outflowAngularMomentumKgSquareMetersPerSecond: 0,
      consumedMomentumKgMetersPerSecond: [0, 0], consumedAngularMomentumKgSquareMetersPerSecond: 0, transferEvents: [] };
    const n = state.depthMeters.length, dx = container.widthMeters / n;
    const c = Math.cos(environment.angleRadians), s = Math.sin(environment.angleRadians);
    const gx = -environment.acceleration[0], gy = -policy.gravityMetersPerSecondSquared - environment.acceleration[1];
    const tangent = gx * c + gy * s, baseNormal = -(gy * c - gx * s);
    const omega = environment.angularVelocity, alpha = environment.angularAcceleration;
    if (!Number.isFinite(omega) || !Number.isFinite(alpha)) throw new Error('Liquid requires finite angular state');
    let elapsed = 0, steps = 0;
    const transferIndices=Array(n).fill(-1);
    // Scratch storage belongs to this invocation. Published input/output arrays
    // remain distinct; numerical substeps reuse only these private buffers.
    const tangents=new Float64Array(n),normals=new Float64Array(n),velocity=new Float64Array(n);
    const lh=new Float64Array(n),lq=new Float64Array(n),rh=new Float64Array(n),rq=new Float64Array(n);
    const originalLh=new Float64Array(n),originalLq=new Float64Array(n),originalRh=new Float64Array(n),originalRq=new Float64Array(n);
    const faceH=new Float64Array(n+1),faceQ=new Float64Array(n+1);
    let nextH=new Float64Array(n),nextQ=new Float64Array(n);
    state.depthMeters=Float64Array.from(state.depthMeters);state.dischargeSquareMetersPerSecond=Float64Array.from(state.dischargeSquareMetersPerSecond);
    const minmod=(a,b)=>a*b<=0?0:Math.sign(a)*Math.min(Math.abs(a),Math.abs(b));
    const speed=maximumNormal=>{let value=0;for(let i=0;i<n;i++) {
      const gravity=policy.liquidSpatialOrder===2?maximumNormal:normals[i];
      value=Math.max(value,(lh[i]>policy.dryDepthMeters?Math.abs(lq[i]/lh[i]):0)+Math.sqrt(gravity*lh[i]));
      value=Math.max(value,(rh[i]>policy.dryDepthMeters?Math.abs(rq[i]/rh[i]):0)+Math.sqrt(gravity*rh[i]));
    }return value;};
    function flux(i,leftH,leftQ,rightH,rightQ,gravity) {
      const a=Math.max((leftH>0?Math.abs(leftQ/leftH):0)+Math.sqrt(gravity*leftH),(rightH>0?Math.abs(rightQ/rightH):0)+Math.sqrt(gravity*rightH));
      const lm=leftH>0?leftQ*leftQ/leftH+gravity*leftH*leftH/2:0,rm=rightH>0?rightQ*rightQ/rightH+gravity*rightH*rightH/2:0;
      faceH[i]=(leftQ+rightQ-a*(rightH-leftH))/2;faceQ[i]=(lm+rm-a*(rightQ-leftQ))/2;
    }
    while (elapsed < seconds - 1e-12) {
      if (++steps > policy.maxLiquidSubsteps) throw new Error('Liquid integration resource bound exceeded');
      const h = state.depthMeters, q = state.dischargeSquareMetersPerSecond;
      let maximumNormal=0,stationary=true,empty=true;
      for(let i=0;i<n;i++) {
        const v=h[i],x=(i+0.5)*dx-container.widthMeters/2,y=(v-container.heightMeters)/2;
        const u=v>policy.dryDepthMeters?q[i]/v:0;
        tangents[i]=tangent+alpha*y+omega*omega*x;
        const normal=baseNormal+alpha*x-omega*omega*y+2*omega*u;
        if(v>policy.dryDepthMeters&&normal<=0)throw new Error('Liquid depth model requires positive effective normal gravity');
        normals[i]=Math.max(0,normal);maximumNormal=Math.max(maximumNormal,normals[i]);
        velocity[i]=v>policy.dryDepthMeters?q[i]/v:0;
        stationary=stationary&&v===h[0]&&q[i]===0&&tangents[i]===0;
        empty=empty&&v===0&&q[i]===0;
      }
      if(policy.liquidSpatialOrder===2&&(empty||stationary)){state.stepCount++;break;}
      for(let i=0;i<n;i++) {
        const depth=h[i],rawDh=policy.liquidSpatialOrder===2?(i===0?h[1]-depth:i===n-1?depth-h[n-2]:minmod(depth-h[i-1],h[i+1]-depth)):0;
        const dh=Math.max(-2*depth,Math.min(2*depth,rawDh));
        const du=policy.liquidSpatialOrder===2&&i>0&&i<n-1?minmod(velocity[i]-velocity[i-1],velocity[i+1]-velocity[i]):0;
        lh[i]=depth-dh/2;lq[i]=(depth-dh/2)*(velocity[i]-du/2);
        rh[i]=depth+dh/2;rq[i]=(depth+dh/2)*(velocity[i]+du/2);
      }
      let maxSpeed=speed(maximumNormal);
      let dt=Math.min(seconds-elapsed,policy.maxStepSeconds,maxSpeed>0?policy.cfl*dx/maxSpeed:policy.maxStepSeconds);
      if(policy.liquidSpatialOrder===2) {
        originalLh.set(lh);originalLq.set(lq);originalRh.set(rh);originalRq.set(rq);
        for(let attempt=0;;attempt++) {
          if(attempt>=16)throw Error('Liquid predictor CFL bound exceeded');
          for(let i=0;i<n;i++) {
            const leftH=originalLh[i],leftQ=originalLq[i],rightH=originalRh[i],rightQ=originalRq[i];
            const lm=leftH>0?leftQ*leftQ/leftH+normals[i]*leftH*leftH/2:0,rm=rightH>0?rightQ*rightQ/rightH+normals[i]*rightH*rightH/2:0;
            const dh=-(rightQ-leftQ)*dt/(2*dx),dq=-(rm-lm)*dt/(2*dx)+dt*tangents[i]*h[i]/2-dt*policy.liquidDragPerSecond*q[i]/2;
            const factor=dh<0?Math.min(1,Math.min(leftH,rightH)/-dh):1;
            lh[i]=leftH+factor*dh;lq[i]=leftQ+factor*dq;
            rh[i]=rightH+factor*dh;rq[i]=rightQ+factor*dq;
          }
          maxSpeed=speed(maximumNormal);
          if(maxSpeed*dt/dx<=policy.cfl+1e-12)break;
          dt=Math.min(dt,policy.cfl*dx/maxSpeed)*.99;
        }
      }
      flux(0,lh[0],-lq[0],lh[0],lq[0],normals[0]);
      flux(n,rh[n-1],rq[n-1],rh[n-1],-rq[n-1],normals[n-1]);
      for(let i=1;i<n;i++)flux(i,rh[i-1],rq[i-1],lh[i],lq[i],(normals[i-1]+normals[i])/2);
      for (let i = 0; i < n; i++) {
        const depth = h[i] - dt / dx * (faceH[i + 1] - faceH[i]);
        if (depth < -1e-12 || !Number.isFinite(depth)) throw new Error('Liquid positivity/stability failure');
        nextH[i] = Math.max(0, depth);
        nextQ[i] = (q[i] - dt / dx * (faceQ[i + 1] - faceQ[i]) + dt * tangents[i] * (h[i] + nextH[i]) / 2)
          * Math.exp(-policy.liquidDragPerSecond * dt);
        if (nextH[i] <= policy.dryDepthMeters) nextQ[i] = 0;
        if (nextH[i] > container.heightMeters) {
          const overflow = nextH[i] - container.heightMeters, volume = overflow * dx * container.depthMeters;
          const x = (i + 0.5) * dx - container.widthMeters / 2, y = container.heightMeters / 2;
          const outlet = [environment.position[0] + c * x - s * y, environment.position[1] + s * x + c * y];
          const mouthContact = environment.mouth && Math.hypot(outlet[0] - environment.mouth[0], outlet[1] - environment.mouth[1]) <= policy.mouthCaptureRadiusMeters;
          state[mouthContact ? 'consumedVolumeCubicMeters' : 'spilledVolumeCubicMeters'] += volume;
          const u = nextQ[i] / nextH[i], velocity = [environment.velocity[0] + c * u - environment.angularVelocity * (s * x + c * y),
            environment.velocity[1] + s * u + environment.angularVelocity * (c * x - s * y)];
          for (let j = 0; j < 2; j++) state.outflowMomentumKgMetersPerSecond[j] += volume * policy.liquidDensityKgPerCubicMeter * velocity[j];
          state.outflowAngularMomentumKgSquareMetersPerSecond += volume * policy.liquidDensityKgPerCubicMeter * (outlet[0] * velocity[1] - outlet[1] * velocity[0]);
          if (mouthContact) {
            for (let j = 0; j < 2; j++) state.consumedMomentumKgMetersPerSecond[j] += volume * policy.liquidDensityKgPerCubicMeter * velocity[j];
            state.consumedAngularMomentumKgSquareMetersPerSecond += volume * policy.liquidDensityKgPerCubicMeter * (outlet[0] * velocity[1] - outlet[1] * velocity[0]);
          }
          const event={cellIndex:i,volumeCubicMeters:volume,outlet,containerAngleRadians:environment.angleRadians,disposition:mouthContact?'consumed':'spilled'};
          if(policy.liquidSpatialOrder===2 && transferIndices[i]>=0) {
            // The body-step environment, opening and destination are fixed.
            // Sum repeated transfers at that same cell; momentum is still
            // integrated separately at every actual liquid substep above.
            const prior=state.transferEvents[transferIndices[i]];
            if(prior.disposition!==event.disposition)throw Error('Liquid transfer destination changed inside a fixed body step');
            prior.volumeCubicMeters+=volume;
          }else {
            transferIndices[i]=state.transferEvents.length;state.transferEvents.push(event);
          }
          nextQ[i] *= container.heightMeters / nextH[i]; nextH[i] = container.heightMeters;
        }
      }
      state.depthMeters = nextH; state.dischargeSquareMetersPerSecond = nextQ;
      state.maxCfl = Math.max(state.maxCfl, maxSpeed * dt / dx);
      state.minDepthMeters = Math.min(state.minDepthMeters, ...nextH);nextH=h;nextQ=q;
      elapsed += dt; state.stepCount++;
    }
    state.depthMeters=Array.from(state.depthMeters);state.dischargeSquareMetersPerSecond=Array.from(state.dischargeSquareMetersPerSecond);
    state.remainingVolumeCubicMeters = state.depthMeters.reduce((a, b) => a + b, 0) * dx * container.depthMeters;
    return state;
  }
  registry.define('physicsModel', 'simulatte-activity-liquid.js', { liquidFlux, createActivityLiquid, stepActivityLiquid });
})(typeof globalThis !== 'undefined' ? globalThis : window);
