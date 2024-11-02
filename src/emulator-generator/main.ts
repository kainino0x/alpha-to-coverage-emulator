import { quitIfWebGPUNotAvailable } from '../util';
import transparentWhiteWGSL from './TransparentWhite.wgsl';
import copyMaskToBufferWGSL from './CopyMaskToBuffer.wgsl';

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
