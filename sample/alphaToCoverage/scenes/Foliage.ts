import { mat4, vec3 } from 'wgpu-matrix';
import { Config } from '../main';
import { kEmulatedAlphaToCoverage } from '../emulatedAlphaToCoverage';
import foliageWGSL from './Foliage.wgsl';

export class FoliageBase {
  protected readonly bindGroupLayout: GPUBindGroupLayout;
  protected readonly pipelineLayout: GPUPipelineLayout;
  protected readonly uniformBuffer: GPUBuffer;
  protected readonly bindGroup: GPUBindGroup;

  constructor(protected device: GPUDevice) {
    this.bindGroupLayout = device.createBindGroupLayout({
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
          buffer: {},
        },
      ],
    });
    this.pipelineLayout = device.createPipelineLayout({
      bindGroupLayouts: [this.bindGroupLayout],
    });

    this.uniformBuffer = device.createBuffer({
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      size: (16 + 4) * Float32Array.BYTES_PER_ELEMENT,
    });
    this.bindGroup = device.createBindGroup({
      layout: this.bindGroupLayout,
      entries: [{ binding: 0, resource: { buffer: this.uniformBuffer } }],
    });
  }

  applyConfig(config: Config) {
    this.device.queue.writeBuffer(
      this.uniformBuffer,
      0,
      getViewProjMatrix((config.Foliage_cameraRotation / 180) * Math.PI)
    );
    this.device.queue.writeBuffer(
      this.uniformBuffer,
      16 * Float32Array.BYTES_PER_ELEMENT,
      new Float32Array([config.Leaf_featheringWidthPx])
    );
  }

  protected setBindGroup(pass: GPURenderPassEncoder) {
    pass.setBindGroup(0, this.bindGroup);
  }
}

export class Foliage extends FoliageBase {
  private readonly pipelineNative: GPURenderPipeline;
  private lastEmulatedDevice: Config['emulatedDevice'] | null = null;
  private pipelineEmulated: GPURenderPipeline | null = null;

  constructor(device: GPUDevice) {
    super(device);
    const module = device.createShaderModule({
      code:
        foliageWGSL +
        `fn emulatedAlphaToCoverage(alpha: f32, xy: vec2u) -> u32 { return 0; }`,
    });
    this.pipelineNative = device.createRenderPipeline({
      label: 'Foliage with emulated alpha-to-coverage',
      layout: this.pipelineLayout,
      vertex: {
        module,
        entryPoint: 'vmainFoliage',
      },
      fragment: {
        module,
        entryPoint: 'fmain_native',
        targets: [{ format: 'rgba8unorm' }],
      },
      multisample: { count: 4, alphaToCoverageEnabled: true },
      depthStencil: {
        format: 'depth24plus',
        depthWriteEnabled: true,
        depthCompare: 'less',
      },
      primitive: { topology: 'triangle-list' },
    });
  }

  modifyConfigForAnimation(config: Config) {
    config.Foliage_cameraRotation = ((performance.now() / 60_000) % 1) * 360;
  }

  applyConfig(config: Config) {
    super.applyConfig(config);
    if (this.lastEmulatedDevice !== config.emulatedDevice) {
      // Pipeline to render to a multisampled texture using *emulated* alpha-to-coverage
      const module = this.device.createShaderModule({
        code: foliageWGSL + kEmulatedAlphaToCoverage[config.emulatedDevice],
      });
      this.pipelineEmulated = this.device.createRenderPipeline({
        label: 'Foliage with native alpha-to-coverage',
        layout: this.pipelineLayout,
        vertex: {
          module,
          entryPoint: 'vmainFoliage',
        },
        fragment: {
          module,
          entryPoint: 'fmain_emulated',
          targets: [{ format: 'rgba8unorm' }],
        },
        multisample: { count: 4, alphaToCoverageEnabled: false },
        depthStencil: {
          format: 'depth24plus',
          depthWriteEnabled: true,
          depthCompare: 'less',
        },
        primitive: { topology: 'triangle-list' },
      });
      this.lastEmulatedDevice = config.emulatedDevice;
    }
  }

  render(pass: GPURenderPassEncoder, emulated: boolean) {
    this.setBindGroup(pass);
    pass.setPipeline(emulated ? this.pipelineEmulated : this.pipelineNative);
    pass.draw(6, 1000);
  }
}

function getViewProjMatrix(cameraRotationRad: number) {
  const aspect = 1;

  const projectionMatrix = mat4.perspective(
    (2 * Math.PI) / 5,
    aspect,
    1,
    2000.0
  );

  const upVector = vec3.fromValues(0, 1, 0);
  const look = vec3.fromValues(0, 0.5, 0);
  const eyePosition = vec3.fromValues(0, 3, 8);

  const rotation = mat4.rotateY(mat4.translation(look), cameraRotationRad);
  vec3.transformMat4(eyePosition, rotation, eyePosition);

  const viewMatrix = mat4.lookAt(eyePosition, look, upVector);

  const viewProjMatrix = mat4.multiply(projectionMatrix, viewMatrix);
  return viewProjMatrix;
}
