const COLORS = ['#77a0ff','#72e4c0','#e6b985','#c89aee','#ed8daa','#7acfe5','#ced888','#b9c7e9'];
export class Universe {
  constructor(canvas, parallel=false) {
    this.canvas=canvas; this.ctx=canvas.getContext('2d'); this.parallel=parallel;
    this.yaw=0.38; this.pitch=0.55; this.three=true; this.count=4; this.state=null;
    let dragging=false, lastX=0, lastY=0;
    canvas.addEventListener('pointerdown', e=>{dragging=true;lastX=e.clientX;lastY=e.clientY;canvas.setPointerCapture(e.pointerId);});
    canvas.addEventListener('pointermove', e=>{
      if(!dragging) return;
      this.yaw+=(e.clientX-lastX)*0.008;
      this.pitch=Math.max(-1.4,Math.min(1.4,this.pitch+(e.clientY-lastY)*0.008));
      lastX=e.clientX;lastY=e.clientY;
      canvas.dispatchEvent(new CustomEvent('orbit',{detail:{yaw:this.yaw,pitch:this.pitch}}));
    });
    for(const event of ['pointerup','pointercancel','lostpointercapture']) canvas.addEventListener(event,()=>{dragging=false;});
    this.observer=new ResizeObserver(()=>this.draw());this.observer.observe(canvas);
  }
  draw() {
    const {canvas,ctx,state}=this;
    if(!ctx) return;
    const box=canvas.getBoundingClientRect(), ratio=Math.min(devicePixelRatio||1,2);
    if(!box.width||!box.height) return;
    const width=Math.round(box.width*ratio),height=Math.round(box.height*ratio);
    if(canvas.width!==width||canvas.height!==height) { canvas.width=width;canvas.height=height; }
    ctx.setTransform(ratio,0,0,ratio,0,0);
    const w=box.width,h=box.height;
    ctx.clearRect(0,0,w,h);
    for(let i=0;i<75;i++){
      ctx.fillStyle='rgba(137,169,215,'+(0.08+(i%5)*0.03)+')';
      ctx.fillRect(((i*139.37)%997)/997*w,((i*239.71)%991)/991*h,1,1);
    }
    const project=(x,y,z,scale)=>{
      const rx=x*Math.cos(this.yaw)+z*Math.sin(this.yaw), rz=-x*Math.sin(this.yaw)+z*Math.cos(this.yaw);
      const ry=this.three?y*Math.cos(this.pitch)-rz*Math.sin(this.pitch):rz;
      return [w/2+rx*scale,h/2+ry*scale];
    };
    let extent=22;
    if(state) for(let i=0;i<state.length;i+=6) extent=Math.max(extent,Math.hypot(state[i],state[i+1],state[i+2]));
    const scale=Math.min(w,h)*0.39/Math.min(extent,300);
    ctx.strokeStyle='#34516d38';ctx.lineWidth=0.6;
    for(const radius of [6,12,18,24]){
      ctx.beginPath();
      for(let j=0;j<=100;j++){
        const a=j/100*Math.PI*2,p=project(Math.cos(a)*radius,0,Math.sin(a)*radius,scale);
        if(j===0)ctx.moveTo(...p);else ctx.lineTo(...p);
      }
      ctx.stroke();
    }
    ctx.strokeStyle='#34516d22';
    for(const axis of [[-24,0,0,24,0,0],[0,0,-24,0,0,24]]) {
      ctx.beginPath();ctx.moveTo(...project(...axis.slice(0,3),scale));ctx.lineTo(...project(...axis.slice(3),scale));ctx.stroke();
    }
    if(!state)return;
    const n=state.length/6;
    for(let i=0;i<n;i++){
      const p=project(state[i*6],state[i*6+1],state[i*6+2],scale);
      const color=this.parallel?COLORS[Math.min(this.count-1,Math.floor(i*this.count/n))%COLORS.length]:COLORS[0];
      ctx.globalAlpha=0.2;ctx.fillStyle=color;ctx.beginPath();ctx.arc(p[0],p[1],2.8,0,Math.PI*2);ctx.fill();
      ctx.globalAlpha=0.85;ctx.beginPath();ctx.arc(p[0],p[1],0.85,0,Math.PI*2);ctx.fill();
    }
    ctx.globalAlpha=1;
  }
  set(state,count=this.count) { this.state=state;this.count=count;this.draw(); }
}
