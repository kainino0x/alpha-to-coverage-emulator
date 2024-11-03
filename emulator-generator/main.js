/** Shows an error dialog if getting an adapter wasn't successful. */
function quitIfAdapterNotAvailable(adapter) {
    if (!('gpu' in navigator)) {
        fail('navigator.gpu is not defined - WebGPU not available in this browser');
    }
    if (!adapter) {
        fail("requestAdapter returned null - this sample can't run on this system");
    }
}
/**
 * Shows an error dialog if getting a adapter or device wasn't successful,
 * or if/when the device is lost or has an uncaptured error.
 */
function quitIfWebGPUNotAvailable(adapter, device) {
    if (!device) {
        quitIfAdapterNotAvailable(adapter);
        fail('Unable to get a device for an unknown reason');
        return;
    }
    device.lost.then((reason) => {
        fail(`Device lost ("${reason.reason}"):\n${reason.message}`);
    });
    device.onuncapturederror = (ev) => {
        fail(`Uncaptured error:\n${ev.error.message}`);
    };
}
/** Fail by showing a console error, and dialog box if possible. */
const fail = (() => {
    function createErrorOutput() {
        if (typeof document === 'undefined') {
            // Not implemented in workers.
            return {
                show(msg) {
                    console.error(msg);
                },
            };
        }
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
        return {
            show(msg) {
                // Don't overwrite the dialog message while it's still open
                // (show the first error, not the most recent error).
                if (!dialogBox.open) {
                    dialogText.textContent = msg;
                    dialogBox.showModal();
                }
            },
        };
    }
    let output;
    return (message) => {
        if (!output)
            output = createErrorOutput();
        output.show(message);
        throw new Error(message);
    };
})();

var instancedWhiteGradientWGSL = `// Vertex

// Number of steps such that:
// instance_index=0 -> alpha=0
// instance_index=kAlphaIncrements -> alpha=1
override kAlphaIncrements: f32;

@vertex
fn vmain(
  @builtin(vertex_index) vertex_index: u32,
  // The instance index tells us which alpha value to use.
  @builtin(instance_index) instance_index: u32,
) -> Varying {
  var square = array(
    vec2f(-1, -1), vec2f(-1,  1), vec2f( 1, -1),
    vec2f( 1, -1), vec2f(-1,  1), vec2f( 1,  1),
  );

  let alpha = f32(instance_index) / kAlphaIncrements;
  return Varying(vec4(square[vertex_index % 6], 0, 1), alpha);
}

// Varying

struct Varying {
  @builtin(position) pos: vec4f,
  // alpha from instance-step-mode vertex buffer
  @location(0) alpha: f32,
}

// Fragment (called by Scene.ts)

@fragment
fn fmain(vary: Varying) -> @location(0) vec4f {
  return vec4f(1, 1, 1, vary.alpha);
}
`;

var copyMaskToBufferWGSL = `@group(0) @binding(0) var tex: texture_multisampled_2d<f32>;
@group(0) @binding(1) var<storage, read_write> out: array<u32>;

override kSize: u32;
override kSampleCount: u32;

@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) xyz: vec3u) {
    let xy = xyz.xy;

    // Reconstruct the mask from which samples were written
    var mask = 0u;
    for (var sampleIndex = 0u; sampleIndex < kSampleCount; sampleIndex += 1) {
        let color = textureLoad(tex, xy, sampleIndex);
        let maskBit = u32(color.r > 0.5); // color is either black or white
        mask |= maskBit << sampleIndex;
    }

    out[xy.y * kSize + xy.x] = mask;
}
`;

const output = document.getElementById('output');
// Render target size. It's the maximum pattern size we can detect.
const kSize = 16;
const kSampleCount = 4;
const kAlphaIncrements = 25_000;
const [info, device] = await (async () => {
    const adapter = await navigator.gpu?.requestAdapter();
    const device = await adapter?.requestDevice();
    quitIfWebGPUNotAvailable(adapter, device);
    return [adapter.info, device];
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
    enc.copyBufferToBuffer(copyBuffer, 0, readbackBuffer, alphaStep * kBufferSize, kBufferSize);
    device.queue.submit([enc.finish()]);
    if (alphaStep % 1000 === 0) {
        const alpha = alphaStep / kAlphaIncrements;
        output.textContent = `// progress: alpha = ${(alpha * 100).toFixed(0)}%`;
        await device.queue.onSubmittedWorkDone();
    }
}
// Read back the buffer and extract the results
const results = [];
let lastSeenPatternString = '';
{
    await readbackBuffer.mapAsync(GPUMapMode.READ);
    const readback = readbackBuffer.getMappedRange();
    for (let alphaStep = 0; alphaStep <= kAlphaIncrements; ++alphaStep) {
        const data = new Uint32Array(readback, alphaStep * kBufferSize, kSize * kSize);
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
let tieBreakUpward = false;
const kAllowedError = 1 / kAlphaIncrements;
{
    const kCandidateDenominators = Array.from(
    // Powers of 2, and powers of 2 minus one
    (function* () {
        for (let d = 4; d <= 4096; d *= 2) {
            yield d - 1;
            yield d;
        }
    })());
    // Whether
    let tieBreakUpwardSoFar;
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
            const tieBreakUpwardAtValue = delta > kAllowedError;
            if (tieBreakUpwardAtValue === undefined) {
                tieBreakUpwardSoFar = tieBreakUpwardAtValue;
            }
            else {
                if (tieBreakUpwardAtValue !== tieBreakUpwardSoFar) {
                    continue dLoop;
                }
            }
        }
        // If we haven't continue'd, we found a good value!
        halfDenominator = d;
        tieBreakUpward = tieBreakUpwardSoFar;
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
const infoString = `${info.vendor} ${info.architecture} ${info.device} ${info.description}`.trim();
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
    const cmp = tieBreakUpward ? '<=' : '<';
    const alphaNumerator = Math.round(endAlpha * halfDenominator * 2) / 2;
    const alphaFraction = `${alphaNumerator} / ${halfDenominator}.0`;
    const array = Array.from(pattern, (v) => '0x' + v.toString(16)).join(', ');
    out += `  if (alpha ${cmp} ${alphaFraction}) { return array(${array}u)[i]; }\n`;
}
out += `\
  return 0xf;
}`;
output.textContent = out;
console.log(out);
//# sourceMappingURL=main.js.map
