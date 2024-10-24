import { Config } from '../main';
import { kEmulatedAlphaToCoverage } from '../emulatedAlphaToCoverage';
import solidColorsWGSL from './SolidColors.wgsl';

export class SolidColors {
  private readonly bufInstanceColors: GPUBuffer;
  private readonly pipelineNative: GPURenderPipeline;
  private lastEmulatedDevice: Config['emulatedDevice'] | null = null;
  private pipelineEmulated: GPURenderPipeline | null = null;

  constructor(private device: GPUDevice) {
    const solidColorsNativeModule = device.createShaderModule({
      code:
        solidColorsWGSL +
        // emulatedAlphaToCoverage is not used
        `fn emulatedAlphaToCoverage(alpha: f32, xy: vec2u) -> u32 { return 0; }`,
    });
    this.pipelineNative = device.createRenderPipeline({
      label: 'SolidColors with native alpha-to-coverage',
      layout: 'auto',
      vertex: {
        module: solidColorsNativeModule,
        buffers: [
          {
            stepMode: 'instance',
            arrayStride: 4 * Float32Array.BYTES_PER_ELEMENT,
            attributes: [{ shaderLocation: 0, format: 'float32x4', offset: 0 }],
          },
        ],
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
      },
      primitive: { topology: 'triangle-list' },
    });

    this.bufInstanceColors = device.createBuffer({
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.VERTEX,
      size: 2 * 4 * Float32Array.BYTES_PER_ELEMENT,
    });
  }

  modifyConfigForAnimation(config: Config) {
    // scrub alpha2 over 15 seconds
    let alpha = ((performance.now() / 15000) % 1) * (255 + 20) - 10;
    alpha = Math.max(0, Math.min(alpha, 255));
    config.SolidColors_alpha2 = alpha;
  }

  applyConfig(config: Config) {
    const data = new Float32Array([
      // instance 0 color
      ((config.SolidColors_color1 >> 16) & 0xff) / 255, // R
      ((config.SolidColors_color1 >> 8) & 0xff) / 255, // G
      ((config.SolidColors_color1 >> 0) & 0xff) / 255, // B
      config.SolidColors_alpha1 / 255,
      // instance 1 color
      ((config.SolidColors_color2 >> 16) & 0xff) / 255, // R
      ((config.SolidColors_color2 >> 8) & 0xff) / 255, // G
      ((config.SolidColors_color2 >> 0) & 0xff) / 255, // B
      config.SolidColors_alpha2 / 255,
    ]);
    this.device.queue.writeBuffer(this.bufInstanceColors, 0, data);

    if (this.lastEmulatedDevice !== config.emulatedDevice) {
      // Pipeline to render to a multisampled texture using *emulated* alpha-to-coverage
      const solidColorsEmulatedModule = this.device.createShaderModule({
        code: solidColorsWGSL + kEmulatedAlphaToCoverage[config.emulatedDevice],
      });
      this.pipelineEmulated = this.device.createRenderPipeline({
        label: 'SolidColors with emulated alpha-to-coverage',
        layout: 'auto',
        vertex: {
          module: solidColorsEmulatedModule,
          buffers: [
            {
              stepMode: 'instance',
              arrayStride: 4 * Float32Array.BYTES_PER_ELEMENT,
              attributes: [
                { shaderLocation: 0, format: 'float32x4', offset: 0 },
              ],
            },
          ],
        },
        fragment: {
          module: solidColorsEmulatedModule,
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
    pass.setVertexBuffer(0, this.bufInstanceColors);
    pass.draw(6, 2);
  }
}
