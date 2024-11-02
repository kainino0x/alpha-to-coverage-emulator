import { Config, ModeName } from '../main';
import {
  DeviceName,
  kEmulatedAlphaToCoverage,
} from '../emulatedAlphaToCoverage';
import foliageCommonWGSL from './FoliageCommon.wgsl';
import { FoliageCommon } from './FoliageCommon';

export class Leaf extends FoliageCommon {
  constructor(device: GPUDevice) {
    super(device);
    const module = device.createShaderModule({
      code:
        foliageCommonWGSL +
        `fn emulatedAlphaToCoverage(alpha: f32, xy: vec2u) -> u32 { return 0; }`,
    });
  }

  modifyConfigForAnimation() {}

  render(
    pass: GPURenderPassEncoder,
    mode: ModeName,
    emulatedDevice: DeviceName
  ) {
    const pipeline = this.getPipeline(
      {
        sceneName: 'Leaf',
        code: foliageCommonWGSL,
        vertexEntryPoint: 'vmainLeaf',
        pipelineLayout: this.pipelineLayout,
      },
      { mode, emulatedDevice }
    );

    this.setBindGroup(pass);
    pass.setPipeline(pipeline);
    pass.draw(6, 1);
  }
}
