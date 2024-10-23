export class SolidColors {
  private bufInstanceColors: GPUBuffer;
  constructor(private device: GPUDevice) {
    this.bufInstanceColors = device.createBuffer({
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.VERTEX,
      size: 8,
    });
  }

  updateConfig(color1: number, alpha1: number, color2: number, alpha2: number) {
    const data = new Uint8Array([
      // instance 0 color
      (color1 >> 16) & 0xff, // R
      (color1 >> 8) & 0xff, // G
      (color1 >> 0) & 0xff, // B
      alpha1,
      // instance 1 color
      (color2 >> 16) & 0xff, // R
      (color2 >> 8) & 0xff, // G
      (color2 >> 0) & 0xff, // B
      alpha2,
    ]);
    this.device.queue.writeBuffer(this.bufInstanceColors, 0, data);
  }

  render(pass: GPURenderPassEncoder) {
    pass.setVertexBuffer(0, this.bufInstanceColors);
    pass.draw(6, 2);
  }
}
