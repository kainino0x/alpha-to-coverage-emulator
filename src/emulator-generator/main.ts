import { quitIfWebGPUNotAvailable } from '../util';
import { generateAlphaToCoverage } from './generateAlphaToCoverage.js';

const [adapter, device] = await (async () => {
  const adapter = await navigator.gpu?.requestAdapter({
    compatibilityMode: true,
  } as GPURequestAdapterOptions);
  const device = await adapter?.requestDevice();
  quitIfWebGPUNotAvailable(adapter, device);
  return [adapter!, device];
})();

const output = document.getElementById('output')! as HTMLPreElement;
output.textContent = await generateAlphaToCoverage(adapter, device);
