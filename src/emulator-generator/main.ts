import { quitIfWebGPUNotAvailable } from '../util';
import instancedWhiteGradientWGSL from './InstancedWhiteGradient.wgsl';
import copyMaskToBufferWGSL from './CopyMaskToBuffer.wgsl';

const output = document.getElementById('output')! as HTMLPreElement;

// Render target size. It's the maximum pattern size we can detect.
const kSize = 16;
const kSampleCount = 4;
const kAlphaIncrements = 10_000;

const [info, device] = await (async () => {
  const adapter = await navigator.gpu?.requestAdapter();
  const device = await adapter?.requestDevice();
  quitIfWebGPUNotAvailable(adapter, device);
  return [adapter!.info, device];
})();

const renderTarget = device
  .createTexture({
    label: 'renderTarget',
    format: 'rgba8unorm',
    usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
    size: [kSize, kSize],
    sampleCount: kSampleCount,
  })
  .createView();

const kBufferSize = kSize * kSize * Uint32Array.BYTES_PER_ELEMENT;
const copyBuffer = device.createBuffer({
  label: 'copyBuffer',
  usage: GPUBufferUsage.COPY_SRC | GPUBufferUsage.STORAGE,
  size: kBufferSize,
});
const readbackBuffer = device.createBuffer({
  label: 'readbackBuffer',
  usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
  size: kBufferSize * (kAlphaIncrements + 1),
});

const quadModule = device.createShaderModule({
  code: instancedWhiteGradientWGSL,
});
const quadPipeline = device.createRenderPipeline({
  label: 'quadPipeline',
  layout: 'auto',
  vertex: {
    module: quadModule,
    constants: { kAlphaIncrements },
  },
  fragment: { module: quadModule, targets: [{ format: 'rgba8unorm' }] },
  multisample: { count: kSampleCount, alphaToCoverageEnabled: true },
  primitive: { topology: 'triangle-list' },
});

const copyModule = device.createShaderModule({ code: copyMaskToBufferWGSL });
const copyPipeline = device.createComputePipeline({
  label: 'copyPipeline',
  compute: {
    module: copyModule,
    constants: { kSize, kSampleCount },
  },
  layout: 'auto',
});
const copyBindGroup = device.createBindGroup({
  label: 'copyBindGroup',
  layout: copyPipeline.getBindGroupLayout(0),
  entries: [
    { binding: 0, resource: renderTarget },
    { binding: 1, resource: { buffer: copyBuffer } },
  ],
});

output.textContent = '// initialized';

for (let alphaStep = 0; alphaStep <= kAlphaIncrements; ++alphaStep) {
  const enc = device.createCommandEncoder();
  // Render a white quad with that alpha value, using alpha-to-coverage
  {
    const pass = enc.beginRenderPass({
      colorAttachments: [
        {
          view: renderTarget,
          loadOp: 'clear',
          clearValue: [0, 0, 0, 0],
          storeOp: 'store',
        },
      ],
    });
    pass.setPipeline(quadPipeline);
    pass.draw(6, 1, 0, alphaStep);
    pass.end();
  }
  // Copy the multisampled result into a buffer
  {
    const pass = enc.beginComputePass();
    pass.setPipeline(copyPipeline);
    pass.setBindGroup(0, copyBindGroup);
    pass.dispatchWorkgroups(kSize / 8, kSize / 8);
    pass.end();
  }
  // Copy the buffer to a mappable readback buffer
  enc.copyBufferToBuffer(
    copyBuffer,
    0,
    readbackBuffer,
    alphaStep * kBufferSize,
    kBufferSize
  );
  device.queue.submit([enc.finish()]);
  if (alphaStep % 1000 === 0) {
    const alpha = alphaStep / kAlphaIncrements;
    output.textContent = `// progress: alpha = ${(alpha * 100).toFixed(0)}%`;
    await device.queue.onSubmittedWorkDone();
  }
}

// Read back the buffer and extract the results
const results: Array<{ startAlpha: number; pattern: number[] }> = [];
let lastSeenPatternString = '';
{
  await readbackBuffer.mapAsync(GPUMapMode.READ);

  const readback = readbackBuffer.getMappedRange();
  for (let alphaStep = 0; alphaStep <= kAlphaIncrements; ++alphaStep) {
    const data = new Uint32Array(
      readback,
      alphaStep * kBufferSize,
      kSize * kSize
    );

    const patternString = data.toString();
    if (patternString !== lastSeenPatternString) {
      const alpha = alphaStep / kAlphaIncrements;
      results.push({ startAlpha: alpha, pattern: Array.from(data) });
      lastSeenPatternString = patternString;
    }
  }

  readbackBuffer.unmap();
}

// Try to determine a denominator for the alpha values we saw.
let halfDenominator = kAlphaIncrements; // use this if we can't find better
const kAllowedError = 1 / kAlphaIncrements;
{
  const kCandidateDenominators = [
    // Powers of 4, plus or minus 1
    3, 4, 5, 15, 16, 17, 63, 64, 65, 255, 256, 257, 1023, 1024, 1025,
  ];
  dLoop: for (const d of kCandidateDenominators) {
    // Check if this denominator works for all results
    for (let i = 0; i < results.length; ++i) {
      const { startAlpha } = results[i];
      const numerator = Math.floor(startAlpha * d * 2) / 2;
      if (startAlpha - numerator / d > kAllowedError) {
        continue dLoop;
      }
    }

    // If we haven't continue'd, we found a good value!
    halfDenominator = d;
    break;
  }
}

// Try determine a smaller pattern size than the one we captured.
let patternSize = kSize; // use this if we can't find better
sLoop: for (let s = 1; s < kSize; s *= 2) {
  // Check if this pattern size works for all results
  for (let i = 0; i < results.length; ++i) {
    const pattern = results[i].pattern;
    // (lx,ly) is a "local" coordinate inside the first block
    for (let ly = 0; ly < s; ++ly) {
      for (let lx = 0; lx < s; ++lx) {
        const maskInFirstBlock = pattern[ly * kSize + lx];
        for (let y = ly + s; y < kSize; y += s) {
          for (let x = lx + s; x < kSize; x += s) {
            if (pattern[y * kSize + x] !== maskInFirstBlock) {
              continue sLoop;
            }
          }
        }
      }
    }
  }

  // If we haven't continue'd, we found a good value!
  patternSize = s;
  break;
}

// Generate the shader!
const infoString =
  `${info.vendor} ${info.architecture} ${info.device} ${info.description}`.trim();
let out = `\
// ${infoString}
fn emulatedAlphaToCoverage(alpha: f32, xy: vec2u) -> u32 {
  let i = (xy.y % ${patternSize}) * ${patternSize} + (xy.x % ${patternSize});
`;
for (let i = 0; i < results.length - 1; ++i) {
  const endAlpha = results[i + 1].startAlpha;
  const capturedPattern = results[i].pattern;

  // Extract the patternSize-sized pattern from the captured result.
  const pattern = [];
  for (let y = 0; y < patternSize; ++y) {
    for (let x = 0; x < patternSize; ++x) {
      pattern.push(capturedPattern[y * kSize + x]);
    }
  }

  const alphaNumerator = Math.round(endAlpha * halfDenominator * 2) / 2;
  const alphaFraction = `${alphaNumerator} / ${halfDenominator}.0`;
  const array = Array.from(pattern, (v) => '0x' + v.toString(16)).join(', ');
  out += `  if (alpha < ${alphaFraction}) { return array(${array}u)[i]; }\n`;
}
out += `\
  return 0xf;
}`;
output.textContent = out;
console.log(out);
