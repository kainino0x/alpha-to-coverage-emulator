import { Config } from '../main';
import { kEmulatedAlphaToCoverage } from '../emulatedAlphaToCoverage';
import foliageWGSL from './Foliage.wgsl';
import { FoliageBase } from './Foliage';

export class Leaf extends FoliageBase {
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
      label: 'Leaf with emulated alpha-to-coverage',
      layout: this.pipelineLayout,
      vertex: {
        module,
        entryPoint: 'vmainLeaf',
      },
      fragment: {
        module,
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
    super.applyConfig(config);
    if (this.lastEmulatedDevice !== config.emulatedDevice) {
      // Pipeline to render to a multisampled texture using *emulated* alpha-to-coverage
      const module = this.device.createShaderModule({
        code: foliageWGSL + kEmulatedAlphaToCoverage[config.emulatedDevice],
      });
      this.pipelineEmulated = this.device.createRenderPipeline({
        label: 'Leaf with native alpha-to-coverage',
        layout: this.pipelineLayout,
        vertex: {
          module,
          entryPoint: 'vmainLeaf',
        },
        fragment: {
          module,
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
    this.setBindGroup(pass);
    pass.setPipeline(emulated ? this.pipelineEmulated : this.pipelineNative);
    pass.draw(6, 1);
  }
}
