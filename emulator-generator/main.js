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
// TODO: Use an explicit size (16*16) if needed as a workaround for https://crbug.com/379805731
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

const kNullEmulator = `\
  // No emulator yet! Click "Generate an emulator for this device".
  fn emulatedAlphaToCoverage(alpha: f32, xy: vec2u) -> u32 { return 0; }
`;
/**
 * For each device name, provides the source for a WGSL function which emulates
 * the alpha-to-coverage algorithm of that device by mapping (alpha, x, y) to
 * a sample mask.
 */
const kEmulatedAlphaToCoverage = {
    'NVIDIA GeForce RTX 3070': `\
    fn emulatedAlphaToCoverage(alpha: f32, xy: vec2u) -> u32 {
      if alpha <  253.0 / 2048.0 { return 0x0; }
      if alpha <  767.0 / 2048.0 { return 0x8; }
      if alpha < 1281.5 / 2048.0 { return 0x9; }
      if alpha < 1795.5 / 2048.0 { return 0xb; }
      return 0xf;
    }`,
    'Intel HD Graphics 4400': `\
    fn emulatedAlphaToCoverage(alpha: f32, xy: vec2u) -> u32 {
      if alpha <= 0.5 / 4.0 { return 0x0; }
      if alpha <= 1.5 / 4.0 { return 0x1; }
      if alpha <= 2.5 / 4.0 { return 0x3; }
      if alpha <= 3.5 / 4.0 { return 0x7; }
      return 0xf;
    }`,
    'Apple M1 Pro': `\
    fn emulatedAlphaToCoverage(alpha: f32, xy: vec2u) -> u32 {
      let i = (xy.y % 2) * 2 + (xy.x % 2);
      if alpha <   7.5 / 255.0 { return array(0x0, 0x0, 0x0, 0x0u)[i]; }
      if alpha <  23.5 / 255.0 { return array(0x1, 0x0, 0x0, 0x0u)[i]; }
      if alpha <  39.5 / 255.0 { return array(0x1, 0x0, 0x0, 0x1u)[i]; }
      if alpha <  55.5 / 255.0 { return array(0x1, 0x1, 0x0, 0x1u)[i]; }
      if alpha <  71.5 / 255.0 { return array(0x1, 0x1, 0x1, 0x1u)[i]; }
      if alpha <  87.5 / 255.0 { return array(0x9, 0x1, 0x1, 0x1u)[i]; }
      if alpha < 103.5 / 255.0 { return array(0x9, 0x1, 0x1, 0x9u)[i]; }
      if alpha < 119.5 / 255.0 { return array(0x9, 0x9, 0x1, 0x9u)[i]; }
      if alpha < 135.5 / 255.0 { return array(0x9, 0x9, 0x9, 0x9u)[i]; }
      if alpha < 151.5 / 255.0 { return array(0xb, 0x9, 0x9, 0x9u)[i]; }
      if alpha < 167.5 / 255.0 { return array(0xb, 0x9, 0x9, 0xbu)[i]; }
      if alpha < 183.5 / 255.0 { return array(0xb, 0xb, 0x9, 0xbu)[i]; }
      if alpha < 199.5 / 255.0 { return array(0xb, 0xb, 0xb, 0xbu)[i]; }
      if alpha < 215.5 / 255.0 { return array(0xf, 0xb, 0xb, 0xbu)[i]; }
      if alpha < 231.5 / 255.0 { return array(0xf, 0xb, 0xb, 0xfu)[i]; }
      if alpha < 247.5 / 255.0 { return array(0xf, 0xf, 0xb, 0xfu)[i]; }
      return 0xf;
    }`,
    'ARM Mali-G78': `\
    fn emulatedAlphaToCoverage(alpha: f32, xy: vec2u) -> u32 {
      let i = (xy.y % 2) * 2 + (xy.x % 2);
      if alpha <  0.5 / 16.0 { return array(0x0, 0x0, 0x0, 0x0u)[i]; }
      if alpha <  1.5 / 16.0 { return array(0x0, 0x8, 0x0, 0x0u)[i]; }
      if alpha <  2.5 / 16.0 { return array(0x1, 0x8, 0x0, 0x0u)[i]; }
      if alpha <  3.5 / 16.0 { return array(0x1, 0x8, 0x0, 0x1u)[i]; }
      if alpha <  4.5 / 16.0 { return array(0x1, 0x8, 0x8, 0x1u)[i]; }
      if alpha <  5.5 / 16.0 { return array(0x1, 0xa, 0x8, 0x1u)[i]; }
      if alpha <  6.5 / 16.0 { return array(0x5, 0xa, 0x8, 0x1u)[i]; }
      if alpha <  7.5 / 16.0 { return array(0x5, 0xa, 0x8, 0x5u)[i]; }
      if alpha <  8.5 / 16.0 { return array(0x5, 0xa, 0xa, 0x5u)[i]; }
      if alpha <  9.5 / 16.0 { return array(0x5, 0xe, 0xa, 0x5u)[i]; }
      if alpha < 10.5 / 16.0 { return array(0x7, 0xe, 0xa, 0x5u)[i]; }
      if alpha < 11.5 / 16.0 { return array(0x7, 0xe, 0xa, 0x7u)[i]; }
      if alpha < 12.5 / 16.0 { return array(0x7, 0xe, 0xe, 0x7u)[i]; }
      if alpha < 13.5 / 16.0 { return array(0x7, 0xf, 0xe, 0x7u)[i]; }
      if alpha < 14.5 / 16.0 { return array(0xf, 0xf, 0xe, 0x7u)[i]; }
      if alpha < 15.5 / 16.0 { return array(0xf, 0xf, 0xe, 0xfu)[i]; }
      return 0xf;
    }`,
    'Imagination PowerVR Rogue GE8300': `\
    fn emulatedAlphaToCoverage(alpha: f32, xy: vec2u) -> u32 {
      let i = (xy.y % 2) * 2 + (xy.x % 2);
      if alpha < 7.5 / 255.0 { return array(0x0, 0x0, 0x0, 0x0u)[i]; }
      if alpha < 23.5 / 255.0 { return array(0x1, 0x0, 0x0, 0x0u)[i]; }
      if alpha < 39.5 / 255.0 { return array(0x1, 0x0, 0x0, 0x1u)[i]; }
      if alpha < 55.5 / 255.0 { return array(0x1, 0x1, 0x0, 0x1u)[i]; }
      if alpha < 71.5 / 255.0 { return array(0x1, 0x1, 0x1, 0x1u)[i]; }
      if alpha < 87.5 / 255.0 { return array(0x9, 0x1, 0x1, 0x1u)[i]; }
      if alpha < 103.5 / 255.0 { return array(0x9, 0x1, 0x1, 0x9u)[i]; }
      if alpha < 119.5 / 255.0 { return array(0x9, 0x9, 0x1, 0x9u)[i]; }
      if alpha < 135.5 / 255.0 { return array(0x9, 0x9, 0x9, 0x9u)[i]; }
      if alpha < 151.5 / 255.0 { return array(0xb, 0x9, 0x9, 0x9u)[i]; }
      if alpha < 167.5 / 255.0 { return array(0xb, 0x9, 0x9, 0xbu)[i]; }
      if alpha < 183.5 / 255.0 { return array(0xb, 0xb, 0x9, 0xbu)[i]; }
      if alpha < 199.5 / 255.0 { return array(0xb, 0xb, 0xb, 0xbu)[i]; }
      if alpha < 215.5 / 255.0 { return array(0xf, 0xb, 0xb, 0xbu)[i]; }
      if alpha < 231.5 / 255.0 { return array(0xf, 0xb, 0xb, 0xfu)[i]; }
      if alpha < 247.5 / 255.0 { return array(0xf, 0xf, 0xb, 0xfu)[i]; }
      return 0xf;
    }`,
    'AMD Radeon RX 580': `\
    fn emulatedAlphaToCoverage(alpha: f32, xy: vec2u) -> u32 {
      let i = (xy.y % 2) * 2 + (xy.x % 2);
      if alpha <  1 / 32.0 { return array(0x0, 0x0, 0x0, 0x0u)[i]; }
      if alpha <  2 / 32.0 { return array(0x4, 0x0, 0x0, 0x0u)[i]; }
      if alpha <  3 / 32.0 { return array(0x2, 0x0, 0x0, 0x0u)[i]; }
      if alpha <  4 / 32.0 { return array(0x2, 0x0, 0x0, 0x4u)[i]; }
      if alpha <  5 / 32.0 { return array(0x1, 0x0, 0x0, 0x4u)[i]; }
      if alpha <  6 / 32.0 { return array(0x1, 0x4, 0x0, 0x4u)[i]; }
      if alpha <  7 / 32.0 { return array(0x1, 0x4, 0x0, 0x2u)[i]; }

      if alpha <  9 / 32.0 { return array(0x1, 0x4, 0x4, 0x2u)[i]; }
      if alpha < 10 / 32.0 { return array(0x5, 0x4, 0x4, 0x2u)[i]; }
      if alpha < 11 / 32.0 { return array(0x5, 0x2, 0x4, 0x2u)[i]; }
      if alpha < 12 / 32.0 { return array(0x5, 0x2, 0x4, 0x6u)[i]; }
      if alpha < 13 / 32.0 { return array(0x5, 0x2, 0x4, 0x5u)[i]; }
      if alpha < 14 / 32.0 { return array(0x5, 0x6, 0x4, 0x5u)[i]; }
      if alpha < 15 / 32.0 { return array(0x5, 0x6, 0x2, 0x5u)[i]; }

      if alpha < 17 / 32.0 { return array(0x5, 0x6, 0x6, 0x5u)[i]; }
      if alpha < 18 / 32.0 { return array(0xd, 0x6, 0x6, 0x5u)[i]; }
      if alpha < 19 / 32.0 { return array(0x7, 0x6, 0x6, 0x5u)[i]; }
      if alpha < 20 / 32.0 { return array(0x7, 0x6, 0x6, 0xdu)[i]; }
      if alpha < 21 / 32.0 { return array(0x7, 0x5, 0x6, 0xdu)[i]; }
      if alpha < 22 / 32.0 { return array(0x7, 0xd, 0x6, 0xdu)[i]; }
      if alpha < 23 / 32.0 { return array(0x7, 0xd, 0x6, 0x7u)[i]; }

      if alpha < 25 / 32.0 { return array(0x7, 0xd, 0xe, 0x7u)[i]; }
      if alpha < 26 / 32.0 { return array(0xf, 0xd, 0xe, 0x7u)[i]; }
      if alpha < 27 / 32.0 { return array(0xf, 0x7, 0xe, 0x7u)[i]; }
      if alpha < 28 / 32.0 { return array(0xf, 0x7, 0xe, 0xfu)[i]; }
      if alpha < 29 / 32.0 { return array(0xf, 0x7, 0xd, 0xfu)[i]; }
      if alpha < 30 / 32.0 { return array(0xf, 0xf, 0xd, 0xfu)[i]; }
      if alpha < 31 / 32.0 { return array(0xf, 0xf, 0x7, 0xfu)[i]; }
      return 0xf;
    }`,
    'Qualcomm Adreno 630': `\
    fn emulatedAlphaToCoverage(alpha: f32, xy: vec2u) -> u32 {
      let i = (xy.y % 4) * 4 + (xy.x % 4);
      if alpha <   0.5 / 255.0 { return array(0x0, 0x0, 0x0, 0x0, 0x0, 0x0, 0x0, 0x0, 0x0, 0x0, 0x0, 0x0, 0x0, 0x0, 0x0, 0x0u)[i]; }
      if alpha <  15.5 / 255.0 { return array(0x0, 0x0, 0x0, 0x0, 0x0, 0x0, 0x0, 0x0, 0x0, 0x0, 0x1, 0x0, 0x0, 0x0, 0x0, 0x0u)[i]; }
      if alpha <  31.5 / 255.0 { return array(0x1, 0x0, 0x8, 0x0, 0x0, 0x0, 0x0, 0x0, 0x0, 0x0, 0x0, 0x1, 0x0, 0x1, 0x0, 0x0u)[i]; }
      if alpha <  47.5 / 255.0 { return array(0x2, 0x0, 0x1, 0x0, 0x0, 0x2, 0x0, 0x1, 0x4, 0x1, 0x8, 0x0, 0x0, 0x4, 0x0, 0x8u)[i]; }
      if alpha <  63.5 / 255.0 { return array(0x0, 0x2, 0x8, 0x1, 0x1, 0x4, 0x2, 0x8, 0x4, 0x2, 0x0, 0x2, 0x2, 0x0, 0x1, 0x4u)[i]; }
      if alpha <  79.5 / 255.0 { return array(0x4, 0x1, 0x2, 0x8, 0x8, 0x2, 0x1, 0x4, 0x2, 0x8, 0x4, 0x1, 0x1, 0x4, 0x8, 0x3u)[i]; }
      if alpha <  95.5 / 255.0 { return array(0x4, 0x9, 0x2, 0x5, 0x1, 0x4, 0x9, 0x2, 0x6, 0x1, 0x6, 0x8, 0x8, 0x2, 0x1, 0x4u)[i]; }
      if alpha < 111.5 / 255.0 { return array(0x2, 0x9, 0x4, 0x6, 0x9, 0x6, 0xa, 0x1, 0x6, 0x8, 0x4, 0x9, 0x9, 0x4, 0x9, 0x6u)[i]; }
      if alpha < 127.5 / 255.0 { return array(0x1, 0x6, 0x9, 0x6, 0x6, 0x9, 0x6, 0x9, 0x9, 0x6, 0x1, 0x6, 0x6, 0x9, 0x6, 0x9u)[i]; }
      if alpha < 143.5 / 255.0 { return array(0x6, 0x9, 0x6, 0x9, 0xd, 0x6, 0x9, 0x9, 0x6, 0x9, 0x6, 0xd, 0x9, 0x6, 0x9, 0x6u)[i]; }
      if alpha < 159.5 / 255.0 { return array(0x7, 0x9, 0xe, 0x9, 0x9, 0x7, 0x9, 0x6, 0xe, 0x9, 0x7, 0x9, 0x9, 0x6, 0x9, 0x6u)[i]; }
      if alpha < 175.5 / 255.0 { return array(0xe, 0x9, 0xe, 0x5, 0x7, 0xe, 0xd, 0xb, 0x6, 0x7, 0x9, 0xd, 0x9, 0xe, 0x7, 0xeu)[i]; }
      if alpha < 191.5 / 255.0 { return array(0xb, 0x6, 0xd, 0x7, 0xe, 0xd, 0x7, 0xb, 0xd, 0x7, 0xb, 0xe, 0x7, 0xb, 0xe, 0xdu)[i]; }
      if alpha < 207.5 / 255.0 { return array(0x7, 0xe, 0xf, 0xd, 0xb, 0x7, 0xd, 0xe, 0xe, 0xd, 0x7, 0xf, 0xf, 0xb, 0xe, 0x7u)[i]; }
      if alpha < 223.5 / 255.0 { return array(0xd, 0xf, 0xf, 0xb, 0xf, 0x7, 0xe, 0xf, 0xf, 0xb, 0xf, 0xe, 0xe, 0xd, 0x7, 0xfu)[i]; }
      if alpha < 239.5 / 255.0 { return array(0xf, 0xf, 0xf, 0xe, 0xf, 0xe, 0xf, 0xf, 0x7, 0xf, 0xf, 0xf, 0xf, 0xf, 0xd, 0xfu)[i]; }
      if alpha < 254.5 / 255.0 { return array(0xf, 0xf, 0xf, 0xf, 0xf, 0xf, 0xf, 0xf, 0xf, 0xf, 0xb, 0xf, 0xf, 0xf, 0xf, 0xfu)[i]; }
      return 0xf;
    }`,
    '(generated from your device)': kNullEmulator,
};

const dialogBox = document.createElement('dialog');
dialogBox.close();
document.body.append(dialogBox);
const dialogText = document.createElement('pre');
dialogText.style.whiteSpace = 'pre-wrap';
dialogBox.append(dialogText);
async function generateAlphaToCoverage(adapter, device) {
    if (kEmulatedAlphaToCoverage['(generated from your device)'] !== kNullEmulator) {
        return kEmulatedAlphaToCoverage['(generated from your device)'];
    }
    dialogBox.showModal();
    const info = adapter.info;
    // Render target size. It's the maximum pattern size we can detect.
    const kSize = 16;
    const kSampleCount = 4;
    const kAlphaIncrements = 25_000;
    const renderTargetTexture = device.createTexture({
        label: 'renderTarget',
        format: 'rgba8unorm',
        usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
        size: [kSize, kSize],
        sampleCount: kSampleCount,
    });
    const renderTarget = renderTargetTexture.createView();
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
        enc.copyBufferToBuffer(copyBuffer, 0, readbackBuffer, alphaStep * kBufferSize, kBufferSize);
        device.queue.submit([enc.finish()]);
        if (alphaStep % 1000 === 0) {
            const alpha = alphaStep / kAlphaIncrements;
            dialogText.textContent = `// progress: alpha = ${(alpha * 100).toFixed(0)}%`;
            await device.queue.onSubmittedWorkDone();
        }
    }
    renderTargetTexture.destroy();
    copyBuffer.destroy();
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
        readbackBuffer.destroy();
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
        })());
        // Whether
        let tieBreakDownwardSoFar;
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
                    }
                    else {
                        if (tieBreakDownwardAtValue !== tieBreakDownwardSoFar) {
                            continue dLoop;
                        }
                    }
                }
            }
            // If we haven't continue'd, we found a good value!
            halfDenominator = d;
            tieBreakDownward = tieBreakDownwardSoFar;
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
        }
        else {
            const array = Array.from(pattern, (v) => '0x' + v.toString(16)).join(', ');
            out += `  if alpha ${cmp} ${alphaFraction} { return array(${array}u)[i]; }\n`;
        }
    }
    out += `\
  return 0xf;
}`;
    kEmulatedAlphaToCoverage['(generated from your device)'] = out;
    dialogBox.close();
    return out;
}

const [adapter, device] = await (async () => {
    const adapter = await navigator.gpu?.requestAdapter({
        compatibilityMode: true,
    });
    const device = await adapter?.requestDevice();
    quitIfWebGPUNotAvailable(adapter, device);
    return [adapter, device];
})();
const output = document.getElementById('output');
output.textContent = await generateAlphaToCoverage(adapter, device);
//# sourceMappingURL=main.js.map
