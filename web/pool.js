export class Pool {
  constructor(count) {
    this.pending = new Map();
    this.nextId = 0;
    this.closed = false;
    this.workers = Array.from({length:count}, () => {
      const worker = new Worker(new URL('./worker.js', import.meta.url), {type:'module'});
      worker.onmessage = ({data}) => {
        const task = this.pending.get(data.id);
        if (!task) return;
        this.pending.delete(data.id); clearTimeout(task.timer);
        if (data.error) task.reject(new Error(data.error)); else task.resolve(data);
      };
      worker.onerror = () => this.close(new Error('Não foi possível executar os workers neste navegador.'));
      return worker;
    });
  }
  async step(state) {
    if (this.closed) throw new Error('Execução encerrada.');
    const n = state.length/6, count = this.workers.length;
    const jobs = this.workers.map((worker,index) => {
      const id=++this.nextId, start=Math.floor(index*n/count), end=Math.floor((index+1)*n/count);
      return new Promise((resolve,reject) => {
        const timer=setTimeout(()=>this.close(new Error('A execução excedeu 30 segundos. Reduza o número de corpos.')),30000);
        this.pending.set(id,{resolve,reject,timer});
        try { worker.postMessage({id,start,end,state:state.buffer}); }
        catch(error) { this.close(error); }
      });
    });
    const chunks = await Promise.all(jobs);
    const out = new Float32Array(state.length);
    for (const chunk of chunks) out.set(new Float32Array(chunk.out),chunk.start*6);
    return out;
  }
  close(reason=new Error('Execução interrompida.')) {
    if (this.closed) return;
    this.closed=true;
    for (const worker of this.workers) worker.terminate();
    for (const task of this.pending.values()) { clearTimeout(task.timer); task.reject(reason); }
    this.pending.clear();
  }
}
