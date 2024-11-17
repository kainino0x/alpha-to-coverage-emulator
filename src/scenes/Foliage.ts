import { Config, ModeName } from '../main';
import { DeviceName } from '../emulatedAlphaToCoverage';
import foliageCommonWGSL from './FoliageCommon.wgsl';
import { FoliageCommon } from './FoliageCommon';
import { absoluteAnimationTime } from '../animationTime';

export class Foliage extends FoliageCommon {
  modifyConfigForAnimation(config: Config) {
    if (!config.Foliage_animate) return;

    config.Foliage_cameraRotation =
      ((absoluteAnimationTime() / 60_000) % 1) * 360;
  }

  render(
    pass: GPURenderPassEncoder,
    mode: ModeName,
    emulatedDevice: DeviceName
  ) {
    const pipeline = this.getPipeline(
      {
        sceneName: 'Leaf',
        code: foliageCommonWGSL,
        vertexEntryPoint: 'vmainFoliage',
        pipelineLayout: this.pipelineLayout,
        depthTest: mode !== 'blending',
      },
      { mode, emulatedDevice }
    );

    this.setBindGroup(pass);
    pass.setPipeline(pipeline);
    pass.draw(6, 1000);
  }
}
