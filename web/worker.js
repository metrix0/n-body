import { stepRange } from './kernel.js';
self.onmessage = ({data}) => {
  try {
    const state = new Float32Array(data.state);
    const out = stepRange(state, data.start, data.end);
    self.postMessage({id:data.id, start:data.start, out:out.buffer}, [out.buffer]);
  } catch (error) {
    self.postMessage({id:data.id, error:error.message});
  }
};
