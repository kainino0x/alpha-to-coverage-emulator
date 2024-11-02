import { ModeName } from '../main';
import { DeviceName } from '../emulatedAlphaToCoverage';
import foliageCommonWGSL from './FoliageCommon.wgsl';
import { FoliageCommon } from './FoliageCommon';

export class Leaf extends FoliageCommon {
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
        depthTest: false,
      },
      { mode, emulatedDevice }
    );

    this.setBindGroup(pass);
    pass.setPipeline(pipeline);
    pass.draw(6, 1);
  }
}
