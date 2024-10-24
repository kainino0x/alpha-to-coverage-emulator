import { Config } from '../main';
import { kEmulatedAlphaToCoverage } from '../emulatedAlphaToCoverage';
import leafWGSL from './Leaf.wgsl';

export class Leaf {
  private readonly pipelineNative: GPURenderPipeline;
  private lastEmulatedDevice: Config['emulatedDevice'] | null = null;
  private pipelineEmulated: GPURenderPipeline | null = null;

  constructor(private device: GPUDevice) {
    const solidColorsNativeModule = device.createShaderModule({
      code:
        leafWGSL +
        `fn emulatedAlphaToCoverage(alpha: f32, xy: vec2u) -> u32 { return 0; }`,
    });

    this.pipelineNative = device.createRenderPipeline({
      label: 'Leaf with emulated alpha-to-coverage',
      layout: 'auto',
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
        depthWriteEnabled: false,
        depthCompare: 'always',
      },
      primitive: { topology: 'triangle-list' },
    });
  }

  modifyConfigForAnimation() {}

  applyConfig(config: Config) {
    if (this.lastEmulatedDevice !== config.emulatedDevice) {
      // Pipeline to render to a multisampled texture using *emulated* alpha-to-coverage
      const solidColorsEmulatedModule = this.device.createShaderModule({
        code: leafWGSL + kEmulatedAlphaToCoverage[config.emulatedDevice],
      });
      this.pipelineEmulated = this.device.createRenderPipeline({
        label: 'Leaf with native alpha-to-coverage',
        layout: 'auto',
        vertex: { module: solidColorsEmulatedModule },
        fragment: {
          module: solidColorsEmulatedModule,
          entryPoint: 'fmain_emulated',
          targets: [{ format: 'rgba8unorm' }],
        },
        multisample: { count: 4, alphaToCoverageEnabled: false },
        depthStencil: {
          format: 'depth24plus',
          depthWriteEnabled: false,
          depthCompare: 'always',
        },
        primitive: { topology: 'triangle-list' },
      });
      this.lastEmulatedDevice = config.emulatedDevice;
    }
  }

  render(pass: GPURenderPassEncoder, emulated: boolean) {
    pass.setPipeline(emulated ? this.pipelineEmulated : this.pipelineNative);
    pass.draw(6, 1);
  }
}
