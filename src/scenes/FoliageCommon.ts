import { mat4, vec3 } from 'wgpu-matrix';
import { Config } from '../main';
import { Scene } from './Scene';

export abstract class FoliageCommon extends Scene {
  protected readonly bindGroupLayout: GPUBindGroupLayout;
  protected readonly pipelineLayout: GPUPipelineLayout;
  protected readonly uniformBuffer: GPUBuffer;
  protected readonly bindGroup: GPUBindGroup;

  constructor(device: GPUDevice) {
    super(device);
    this.bindGroupLayout = device.createBindGroupLayout({
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
          buffer: {},
        },
      ],
    });
    this.pipelineLayout = device.createPipelineLayout({
      bindGroupLayouts: [this.bindGroupLayout],
    });

    this.uniformBuffer = device.createBuffer({
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      size: (16 + 4) * Float32Array.BYTES_PER_ELEMENT,
    });
    this.bindGroup = device.createBindGroup({
      layout: this.bindGroupLayout,
      entries: [{ binding: 0, resource: { buffer: this.uniformBuffer } }],
    });
  }

  applyConfig(config: Config) {
    this.device.queue.writeBuffer(
      this.uniformBuffer,
      0,
      getViewProjMatrix((config.Foliage_cameraRotation / 180) * Math.PI)
    );
    this.device.queue.writeBuffer(
      this.uniformBuffer,
      16 * Float32Array.BYTES_PER_ELEMENT,
      new Float32Array([config.FoliageCommon_featheringWidthPx])
    );
  }

  protected setBindGroup(pass: GPURenderPassEncoder) {
    pass.setBindGroup(0, this.bindGroup);
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
