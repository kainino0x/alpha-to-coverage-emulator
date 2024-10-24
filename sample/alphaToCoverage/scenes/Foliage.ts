import { mat4, vec3 } from 'wgpu-matrix';
import { Config } from '../main';
import { kEmulatedAlphaToCoverage } from '../emulatedAlphaToCoverage';
import foliageWGSL from './Foliage.wgsl';

export class Foliage {
  private readonly pipelineLayout: GPUPipelineLayout;
  private readonly pipelineNative: GPURenderPipeline;
  private readonly bindGroup: GPUBindGroup;
  private readonly uniformBuffer: GPUBuffer;
  private lastEmulatedDevice: Config['emulatedDevice'] | null = null;
  private pipelineEmulated: GPURenderPipeline | null = null;

  constructor(private device: GPUDevice) {
    const bgl = device.createBindGroupLayout({
      entries: [{ binding: 0, visibility: GPUShaderStage.VERTEX, buffer: {} }],
    });
    this.pipelineLayout = device.createPipelineLayout({
      bindGroupLayouts: [bgl],
    });

    const solidColorsNativeModule = device.createShaderModule({
      code:
        foliageWGSL +
        `fn emulatedAlphaToCoverage(alpha: f32, xy: vec2u) -> u32 { return 0; }`,
    });
    this.pipelineNative = device.createRenderPipeline({
      label: 'Foliage with emulated alpha-to-coverage',
      layout: this.pipelineLayout,
      vertex: {
        module: solidColorsNativeModule,
      },
      fragment: {
        module: solidColorsNativeModule,
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

    this.uniformBuffer = device.createBuffer({
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      size: 16 * Float32Array.BYTES_PER_ELEMENT,
    });
    this.bindGroup = device.createBindGroup({
      layout: bgl,
      entries: [{ binding: 0, resource: { buffer: this.uniformBuffer } }],
    });
  }

  modifyConfigForAnimation(config: Config) {
    config.Foliage_cameraRotation = ((performance.now() / 60_000) % 1) * 360;
  }

  applyConfig(config: Config) {
    this.device.queue.writeBuffer(
      this.uniformBuffer,
      0,
      getViewProjMatrix((config.Foliage_cameraRotation / 180) * Math.PI)
    );

    if (this.lastEmulatedDevice !== config.emulatedDevice) {
      // Pipeline to render to a multisampled texture using *emulated* alpha-to-coverage
      const solidColorsEmulatedModule = this.device.createShaderModule({
        code: foliageWGSL + kEmulatedAlphaToCoverage[config.emulatedDevice],
      });
      this.pipelineEmulated = this.device.createRenderPipeline({
        label: 'Foliage with native alpha-to-coverage',
        layout: this.pipelineLayout,
        vertex: { module: solidColorsEmulatedModule },
        fragment: {
          module: solidColorsEmulatedModule,
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
    pass.setPipeline(emulated ? this.pipelineEmulated : this.pipelineNative);
    pass.setBindGroup(0, this.bindGroup);
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
