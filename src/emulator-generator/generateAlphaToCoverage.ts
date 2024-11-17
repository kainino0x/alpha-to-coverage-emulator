import instancedWhiteGradientWGSL from './InstancedWhiteGradient.wgsl';
import copyMaskToBufferWGSL from './CopyMaskToBuffer.wgsl';
import { kEmulatedAlphaToCoverage, kNullEmulator } from '../emulatedAlphaToCoverage';

const dialogBox = document.createElement('dialog');
dialogBox.close();
document.body.append(dialogBox);

const dialogText = document.createElement('pre');
dialogText.style.whiteSpace = 'pre-wrap';
dialogBox.append(dialogText);

const closeBtn = document.createElement('button');
closeBtn.textContent = 'OK';
closeBtn.onclick = () => dialogBox.close();
dialogBox.append(closeBtn);

export async function generateAlphaToCoverage(
  adapter: GPUAdapter,
  device: GPUDevice
) {
  dialogBox.showModal();

  if (kEmulatedAlphaToCoverage['(generated from your device)'] !== kNullEmulator) {
    return;
  }

  const info = adapter.info;

  // Render target size. It's the maximum pattern size we can detect.
  const kSize = 16;
  const kSampleCount = 4;
  const kAlphaIncrements = 25_000;

  const renderTarget = device
    .createTexture({
      label: 'renderTarget',
      format: 'rgba8unorm',
      usage:
        GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
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

  dialogText.textContent = '// initialized';

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
      dialogText.textContent = `// progress: alpha = ${(alpha * 100).toFixed(
        0
      )}%`;
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
  let tieBreakDownward = false;
  const kAllowedError = 1 / kAlphaIncrements;
  {
    const kCandidateDenominators = Array.from(
      // Powers of 2, and powers of 2 minus one
      (function* () {
        for (let d = 4; d <= 4096; d *= 2) {
          yield d - 1;
          yield d;
        }
      })()
    );
    // Whether
    let tieBreakDownwardSoFar: boolean | undefined;
    dLoop: for (const d of kCandidateDenominators) {
      // Check if this denominator works for all results
      for (let i = 0; i < results.length; ++i) {
        const { startAlpha } = results[i];
        const numerator = Math.floor(startAlpha * d * 2) / 2;

        const delta = startAlpha - numerator / d;
        // Extra tolerance accepts thresholds that tie break up or down.
        if (delta > kAllowedError * 1.0001) {
          continue dLoop;
        }

        // This is a good candidate, now check if it tie-breaks consistently.
        // If it fails without the extra threshold, that means the device might be
        // tie-breaking upward (so we found the threshold one step too late).

        // (skip i=0 because that's not a real threshold)
        if (i > 0) {
          const tieBreakDownwardAtValue = delta > kAllowedError * 0.999;
          if (tieBreakDownwardSoFar === undefined) {
            tieBreakDownwardSoFar = tieBreakDownwardAtValue;
          } else {
            if (tieBreakDownwardAtValue !== tieBreakDownwardSoFar) {
              continue dLoop;
            }
          }
        }
      }

      // If we haven't continue'd, we found a good value!
      halfDenominator = d;
      tieBreakDownward = tieBreakDownwardSoFar!;
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
`;
  if (patternSize > 1) {
    out += `\
  let i = (xy.y % ${patternSize}) * ${patternSize} + (xy.x % ${patternSize});
`;
  }
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

    const cmp = tieBreakDownward ? '<=' : '<';
    const alphaNumerator = Math.round(endAlpha * halfDenominator * 2) / 2;
    const alphaFraction = `${alphaNumerator} / ${halfDenominator}.0`;
    if (patternSize === 1) {
      const mask = `0x${pattern[0].toString(16)}`;
      out += `  if alpha ${cmp} ${alphaFraction} { return ${mask}; }\n`;
    } else {
      const array = Array.from(pattern, (v) => '0x' + v.toString(16)).join(
        ', '
      );
      out += `  if alpha ${cmp} ${alphaFraction} { return array(${array}u)[i]; }\n`;
    }
  }
  out += `\
  return 0xf;
}`;
  dialogText.textContent = out;

  kEmulatedAlphaToCoverage['(generated from your device)'] = out;
  return out;
}
