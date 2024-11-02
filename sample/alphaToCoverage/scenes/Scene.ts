import {
  DeviceName,
  kEmulatedAlphaTest,
  kEmulatedAlphaToCoverage,
} from '../emulatedAlphaToCoverage';
import { Config, ModeName } from '../main';

export abstract class Scene {
  private pipelineCache = new Map<string, GPURenderPipeline>();
  constructor(protected device: GPUDevice) {}

  abstract applyConfig(config: Config): void;
  abstract modifyConfigForAnimation(config: Config);
  abstract render(
    pass: GPURenderPassEncoder,
    mode: ModeName,
    emulatedDevice: DeviceName
  );

  protected getPipeline(
    opts: {
      sceneName: string;
      code: string;
      vertexEntryPoint?: string;
      pipelineLayout: GPUPipelineLayout | GPUAutoLayoutMode;
      vertexBuffers?: Iterable<GPUVertexBufferLayout | null>;
      depthTest: boolean;
    },
    keyOpts: {
      mode: ModeName;
      emulatedDevice: DeviceName;
    }
  ) {
    const key = JSON.stringify(keyOpts);
    let value = this.pipelineCache.get(key);

    if (value === undefined) {
      let code = opts.code;
      if (keyOpts.mode === 'emulated' || keyOpts.mode === 'alphatest') {
        code += `\
          struct FragOut {
            @location(0) color: vec4f,
            @builtin(sample_mask) mask: u32,
          }
          @fragment fn fmain(vary: Varying) -> FragOut {
            let color = computeFragment(vary);
            let mask = emulatedAlphaToCoverage(color.a, vec2u(vary.pos.xy));
            return FragOut(vec4f(color.rgb, 1), mask);
          }
        `;
      } else {
        code += `\
          @fragment fn fmain(vary: Varying) -> @location(0) vec4f {
            return computeFragment(vary);
          }
        `;
      }

      if (keyOpts.mode === 'emulated') {
        code += kEmulatedAlphaToCoverage[keyOpts.emulatedDevice];
      }
      if (keyOpts.mode === 'alphatest') {
        code += kEmulatedAlphaTest;
      }

      let label = `${opts.sceneName}, mode = ${keyOpts.mode}`;
      if (keyOpts.mode === 'emulated')
        label += `, device = ${keyOpts.emulatedDevice}`;

      const blend: GPUBlendState = {
        color: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha' },
        alpha: { srcFactor: 'zero', dstFactor: 'one' },
      };

      const module = this.device.createShaderModule({ code });
      value = this.device.createRenderPipeline({
        label,
        layout: opts.pipelineLayout,
        vertex: {
          module,
          entryPoint: opts.vertexEntryPoint,
          buffers: opts.vertexBuffers,
        },
        fragment: {
          module,
          targets: [
            {
              format: 'rgba8unorm',
              blend: keyOpts.mode === 'blending' ? blend : undefined,
            },
          ],
        },
        multisample: {
          count: 4,
          alphaToCoverageEnabled: keyOpts.mode === 'native',
        },
        depthStencil: {
          format: 'depth24plus',
          depthWriteEnabled: true,
          depthCompare: opts.depthTest ? 'less' : 'always',
        },
        primitive: { topology: 'triangle-list' },
      });

      this.pipelineCache.set(key, value);
    }
    return value;
  }
}
