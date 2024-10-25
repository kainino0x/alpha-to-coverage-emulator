import { Config } from '../main';
import { kEmulatedAlphaToCoverage } from '../emulatedAlphaToCoverage';
import crossingGradientsWGSL from './CrossingGradients.wgsl';

export class CrossingGradients {
  private readonly bufVertexColors: GPUBuffer;
  private readonly pipelineNative: GPURenderPipeline;
  private lastEmulatedDevice: Config['emulatedDevice'] | null = null;
  private pipelineEmulated: GPURenderPipeline | null = null;

  constructor(private device: GPUDevice) {
    const crossingGradientsNativeModule = device.createShaderModule({
      code:
        crossingGradientsWGSL +
        // emulatedAlphaToCoverage is not used
        `fn emulatedAlphaToCoverage(alpha: f32, xy: vec2u) -> u32 { return 0; }`,
    });
    this.pipelineNative = device.createRenderPipeline({
      label: 'CrossingGradients with native alpha-to-coverage',
      layout: 'auto',
      vertex: {
        module: crossingGradientsNativeModule,
        buffers: [
          {
            arrayStride: 4 * Float32Array.BYTES_PER_ELEMENT,
            attributes: [{ shaderLocation: 0, format: 'float32x4', offset: 0 }],
          },
        ],
      },
      fragment: {
        module: crossingGradientsNativeModule,
        entryPoint: 'fmain_native',
        targets: [{ format: 'rgba8unorm' }],
      },
      multisample: { count: 4, alphaToCoverageEnabled: true },
      depthStencil: {
        format: 'depth24plus',
        depthWriteEnabled: false,
      },
      primitive: { topology: 'triangle-list' },
    });

    this.bufVertexColors = device.createBuffer({
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.VERTEX,
      size: 12 * 4 * Float32Array.BYTES_PER_ELEMENT,
    });
  }

  modifyConfigForAnimation(config: Config) {
    // scrub alpha2 over 15 seconds
    const alpha = ((performance.now() / 15000) % 1) * (100 + 10) - 5;
    config.CrossingGradients_alpha2 = Math.max(0, Math.min(alpha, 100));
  }

  applyConfig(config: Config) {
    const c1 = [
      ((config.CrossingGradients_color1 >> 16) & 0xff) / 255, // R
      ((config.CrossingGradients_color1 >> 8) & 0xff) / 255, // G
      ((config.CrossingGradients_color1 >> 0) & 0xff) / 255, // B
    ];
    const c2 = [
      ((config.CrossingGradients_color2 >> 16) & 0xff) / 255, // R
      ((config.CrossingGradients_color2 >> 8) & 0xff) / 255, // G
      ((config.CrossingGradients_color2 >> 0) & 0xff) / 255, // B
    ];
    const a1b = config.CrossingGradients_alpha1 / 100;
    const a2b = config.CrossingGradients_alpha2 / 100;
    const a1a = config.CrossingGradients_gradient ? 0 : a1b;
    const a2a = config.CrossingGradients_gradient ? 0 : a2b;
    const dataVertexColors =
      /* prettier-ignore */ new Float32Array([
        ...c1, a1b, ...c1, a1a, ...c1, a1b, ...c1, a1b, ...c1, a1a, ...c1, a1a,
        ...c2, a2a, ...c2, a2a, ...c2, a2b, ...c2, a2b, ...c2, a2a, ...c2, a2b,
      ]);
    this.device.queue.writeBuffer(this.bufVertexColors, 0, dataVertexColors);

    if (this.lastEmulatedDevice !== config.emulatedDevice) {
      // Pipeline to render to a multisampled texture using *emulated* alpha-to-coverage
      const crossingGradientsEmulatedModule = this.device.createShaderModule({
        code:
          crossingGradientsWGSL +
          kEmulatedAlphaToCoverage[config.emulatedDevice],
      });
      this.pipelineEmulated = this.device.createRenderPipeline({
        label: 'CrossingGradients with emulated alpha-to-coverage',
        layout: 'auto',
        vertex: {
          module: crossingGradientsEmulatedModule,
          buffers: [
            {
              arrayStride: 4 * Float32Array.BYTES_PER_ELEMENT,
              attributes: [
                { shaderLocation: 0, format: 'float32x4', offset: 0 },
              ],
            },
          ],
        },
        fragment: {
          module: crossingGradientsEmulatedModule,
          entryPoint: 'fmain_emulated',
          targets: [{ format: 'rgba8unorm' }],
        },
        multisample: { count: 4, alphaToCoverageEnabled: false },
        depthStencil: {
          format: 'depth24plus',
          depthWriteEnabled: false,
        },
        primitive: { topology: 'triangle-list' },
      });
      this.lastEmulatedDevice = config.emulatedDevice;
    }
  }

  render(pass: GPURenderPassEncoder, emulated: boolean) {
    pass.setPipeline(emulated ? this.pipelineEmulated : this.pipelineNative);
    pass.setVertexBuffer(0, this.bufVertexColors);
    pass.draw(12);
  }
}
