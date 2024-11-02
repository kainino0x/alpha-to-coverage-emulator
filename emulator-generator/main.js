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

var transparentWhiteWGSL = `// Vertex

@vertex
fn vmain(
  @builtin(vertex_index) vertex_index: u32,
  @location(0) alpha: f32,
) -> Varying {
  var square = array(
    vec2f(-1, -1), vec2f(-1,  1), vec2f( 1, -1),
    vec2f( 1, -1), vec2f(-1,  1), vec2f( 1,  1),
  );

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

@compute @workgroup_size(8, 8) fn main() {
    _ = tex;
    _ = &out;
}
`;

const kSize = 8;
const kSampleCount = 4;
const device = await (async () => {
    const adapter = await navigator.gpu?.requestAdapter();
    const device = await adapter?.requestDevice();
    quitIfWebGPUNotAvailable(adapter, device);
    return device;
})();
const instanceBuffer = device.createBuffer({
    label: 'instanceBuffer',
    usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.VERTEX,
    size: Float32Array.BYTES_PER_ELEMENT,
});
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
    size: kBufferSize,
});
const quadModule = device.createShaderModule({ code: transparentWhiteWGSL });
const quadPipeline = device.createRenderPipeline({
    label: 'TransparentWhite',
    layout: 'auto',
    vertex: {
        module: quadModule,
        buffers: [
            {
                stepMode: 'instance',
                arrayStride: Float32Array.BYTES_PER_ELEMENT,
                attributes: [{ shaderLocation: 0, format: 'float32', offset: 0 }],
            },
        ],
    },
    fragment: { module: quadModule, targets: [{ format: 'rgba8unorm' }] },
    multisample: { count: kSampleCount, alphaToCoverageEnabled: true },
    primitive: { topology: 'triangle-list' },
});
const copyModule = device.createShaderModule({ code: copyMaskToBufferWGSL });
const copyPipeline = device.createComputePipeline({
    label: 'copyPipeline',
    compute: { module: copyModule },
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
// TODO: make this loop finer
for (let alpha = 0; alpha <= 1; alpha += 0.5) {
    // Update the alpha value for this iteration
    device.queue.writeBuffer(instanceBuffer, 0, new Float32Array([alpha]));
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
        pass.setVertexBuffer(0, instanceBuffer);
        pass.draw(6);
        pass.end();
    }
    // Copy the multisampled result into a buffer
    {
        const pass = enc.beginComputePass();
        pass.setPipeline(copyPipeline);
        pass.setBindGroup(0, copyBindGroup);
        pass.dispatchWorkgroups(1, 1);
        // TODO copy render result into buffer
        pass.end();
    }
    // Copy the buffer to a mappable readback buffer
    enc.copyBufferToBuffer(copyBuffer, 0, readbackBuffer, 0, kBufferSize);
    device.queue.submit([enc.finish()]);
    // Read back the buffer
    await readbackBuffer.mapAsync(GPUMapMode.READ);
    {
        const data = new Uint32Array(readbackBuffer.getMappedRange());
        console.log(data);
        // TODO do something with result
    }
    readbackBuffer.unmap();
}
//# sourceMappingURL=main.js.map
