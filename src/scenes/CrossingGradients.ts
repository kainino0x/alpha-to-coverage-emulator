import { Config, ModeName } from '../main';
import { DeviceName } from '../emulatedAlphaToCoverage';
import crossingGradientsWGSL from './CrossingGradients.wgsl';
import { Scene } from './Scene';
import { animationTime } from '../animationTime';

export class CrossingGradients extends Scene {
  private readonly bufVertexColors: GPUBuffer;

  constructor(device: GPUDevice) {
    super(device);
    this.bufVertexColors = device.createBuffer({
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.VERTEX,
      size: 12 * 4 * Float32Array.BYTES_PER_ELEMENT,
    });
  }

  modifyConfigForAnimation(config: Config) {
    if (!config.CrossingGradients_animate) return;

    // scrub alpha2 over 15 seconds
    const alpha = ((animationTime() / 15000) % 1) * (100 + 10) - 5;
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
  }

  render(
    pass: GPURenderPassEncoder,
    mode: ModeName,
    emulatedDevice: DeviceName
  ) {
    const pipeline = this.getPipeline(
      {
        sceneName: 'CrossingGradients',
        code: crossingGradientsWGSL,
        pipelineLayout: 'auto',
        vertexBuffers: [
          {
            arrayStride: 4 * Float32Array.BYTES_PER_ELEMENT,
            attributes: [{ shaderLocation: 0, format: 'float32x4', offset: 0 }],
          },
        ],
        depthTest: false,
      },
      { mode, emulatedDevice }
    );

    pass.setPipeline(pipeline);
    pass.setVertexBuffer(0, this.bufVertexColors);
    pass.draw(12);
  }
}
