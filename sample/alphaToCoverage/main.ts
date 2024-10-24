import { GUI } from 'dat.gui';

import showMultisampleTextureWGSL from './showMultisampleTexture.wgsl';
import { quitIfWebGPUNotAvailable } from '../util';
import { kEmulatedAlphaToCoverage } from './emulatedAlphaToCoverage';

import { SolidColors } from './scenes/SolidColors';
import { Leaf } from './scenes/Leaf';
import { Foliage } from './scenes/Foliage';

const canvas = document.querySelector('canvas') as HTMLCanvasElement;
const adapter = await navigator.gpu?.requestAdapter();
const device = await adapter?.requestDevice();
quitIfWebGPUNotAvailable(adapter, device);

//
// Scene initialization
//

const scenes = {
  SolidColors: new SolidColors(device),
  Leaf: new Leaf(device),
  Foliage: new Foliage(device),
};

//
// GUI controls
//

const kSceneNames = ['SolidColors', 'Leaf', 'Foliage'] as const;
type DeviceName = keyof typeof kEmulatedAlphaToCoverage;

const kInitConfig = {
  scene: 'Foliage' as (typeof kSceneNames)[number],
  emulatedDevice: 'Apple M1 Pro' as DeviceName,
  largeDotEmulate: false,
  smallDotEmulate: false,
  sizeLog2: 8,
  showResolvedColor: true,
  SolidColors_color1: 0x0000ff,
  SolidColors_alpha1: 0,
  SolidColors_color2: 0xff0000,
  SolidColors_alpha2: 16,
  Foliage_cameraRotation: 30,
  animate: true,
};
export type Config = typeof kInitConfig;
const config = { ...kInitConfig };

const gui = new GUI();
gui.width = 300;
{
  const buttons = {
    foliageDemo() {
      Object.assign(config, kInitConfig);
      gui.updateDisplay();
    },
    leafEmulated() {
      Object.assign(config, kInitConfig);
      (config.scene = 'Leaf'), (config.sizeLog2 = 7);
      config.largeDotEmulate = true;
      config.smallDotEmulate = true;
      gui.updateDisplay();
    },
    patternInspector() {
      Object.assign(config, kInitConfig);
      (config.scene = 'SolidColors'), (config.sizeLog2 = 3);
      gui.updateDisplay();
    },
    patternInspectorEmulated() {
      this.patternInspector();
      config.largeDotEmulate = true;
      config.smallDotEmulate = true;
    },
  };

  const presets = gui.addFolder('Presets');
  presets.open();
  presets.add(buttons, 'foliageDemo').name('foliage demo (default)');
  presets.add(buttons, 'leafEmulated').name('leaf closeup (emulated) ');
  presets.add(buttons, 'patternInspector').name('pattern inspector');
  presets
    .add(buttons, 'patternInspectorEmulated')
    .name('pattern inspector (emulated)');

  const visualizationPanel = gui.addFolder('Visualization');
  visualizationPanel.open();
  visualizationPanel.add(config, 'sizeLog2', 0, 9, 1).name('size = 2**');
  visualizationPanel
    .add(config, 'emulatedDevice', Object.keys(kEmulatedAlphaToCoverage))
    .name('device to emulate');

  const largeDotPanel = visualizationPanel.addFolder(
    'Primary (large outer dot, used for resolve)'
  );
  largeDotPanel.open();
  largeDotPanel.add(config, 'largeDotEmulate', false).name('emulated');
  largeDotPanel.add(config, 'showResolvedColor', false);

  const smallDotPanel = visualizationPanel.addFolder(
    'Reference (small inner dot, for visual comparison)'
  );
  smallDotPanel.open();
  smallDotPanel.add(config, 'smallDotEmulate', false).name('emulated');

  const scenesPanel = gui.addFolder('Scenes');
  scenesPanel.open();
  scenesPanel.add(config, 'scene', kSceneNames);
  scenesPanel.add(config, 'animate', false);

  const sceneSolidColors = scenesPanel.addFolder('SolidColors scene options');
  sceneSolidColors.open();

  const draw1Panel = sceneSolidColors.addFolder('Draw 1');
  draw1Panel.open();
  draw1Panel.addColor(config, 'SolidColors_color1').name('color');
  draw1Panel.add(config, 'SolidColors_alpha1', 0, 255).name('alpha');

  const draw2Panel = sceneSolidColors.addFolder('Draw 2');
  draw2Panel.open();
  draw2Panel.addColor(config, 'SolidColors_color2').name('color');
  draw2Panel.add(config, 'SolidColors_alpha2', 0, 255, 0.001).name('alpha');

  const sceneFoliage = scenesPanel.addFolder('Foliage scene options');
  sceneFoliage.open();
  sceneFoliage
    .add(config, 'Foliage_cameraRotation', 0, 360, 1)
    .name('camera rotation');
}

//
// Canvas setup
//

function updateCanvasSize() {
  const devicePixelRatio = window.devicePixelRatio;
  canvas.width = canvas.clientWidth * devicePixelRatio;
  canvas.height = canvas.clientHeight * devicePixelRatio;
}
updateCanvasSize();
const presentationFormat = navigator.gpu.getPreferredCanvasFormat();

const context = canvas.getContext('webgpu') as GPUCanvasContext;
context.configure({
  device,
  format: presentationFormat,
});

//
// GPU state controlled by the config gui
//

let smallDotMSTexture: GPUTexture, smallDotMSTextureView: GPUTextureView;
let largeDotMSTexture: GPUTexture, largeDotMSTextureView: GPUTextureView;
let resolveTexture: GPUTexture, resolveTextureView: GPUTextureView;
let depthTexture: GPUTexture, depthTextureView: GPUTextureView;
let lastSizeLog2 = 0;
function reallocateRenderTargets() {
  if (lastSizeLog2 !== config.sizeLog2) {
    const size = 1 << config.sizeLog2;

    if (smallDotMSTexture) {
      smallDotMSTexture.destroy();
    }
    if (largeDotMSTexture) {
      largeDotMSTexture.destroy();
    }
    const msTextureDesc = {
      format: 'rgba8unorm' as const,
      usage:
        GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
      size: [size, size],
      sampleCount: 4,
    };
    smallDotMSTexture = device.createTexture(msTextureDesc);
    smallDotMSTextureView = smallDotMSTexture.createView();
    largeDotMSTexture = device.createTexture(msTextureDesc);
    largeDotMSTextureView = largeDotMSTexture.createView();

    if (resolveTexture) {
      resolveTexture.destroy();
    }
    resolveTexture = device.createTexture({
      format: 'rgba8unorm',
      usage:
        GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
      size: [size, size],
    });
    resolveTextureView = resolveTexture.createView();

    if (depthTexture) {
      depthTexture.destroy();
    }
    depthTexture = device.createTexture({
      format: 'depth24plus',
      usage: GPUTextureUsage.RENDER_ATTACHMENT,
      size: [size, size],
      sampleCount: 4,
    });
    depthTextureView = depthTexture.createView();

    lastSizeLog2 = config.sizeLog2;
  }
}

function applyConfig() {
  // Update the colors in the (instance-step-mode) vertex buffer
  scenes[config.scene].applyConfig(config);

  reallocateRenderTargets();
}

//
// "Debug" view of the actual texture contents
//

const showMultisampleTextureModule = device.createShaderModule({
  code: showMultisampleTextureWGSL,
});
const showMultisampleTexturePipeline = device.createRenderPipeline({
  label: 'showMultisampleTexturePipeline',
  layout: 'auto',
  vertex: { module: showMultisampleTextureModule },
  fragment: {
    module: showMultisampleTextureModule,
    targets: [{ format: presentationFormat }],
  },
  primitive: { topology: 'triangle-list' },
});
const showMultisampleTextureBGL =
  showMultisampleTexturePipeline.getBindGroupLayout(0);

function render() {
  applyConfig();

  const showMultisampleTextureBG = device.createBindGroup({
    layout: showMultisampleTextureBGL,
    entries: [
      {
        // group(0) @binding(0) var texLargeDot
        binding: 0,
        resource: largeDotMSTextureView,
      },
      {
        // group(0) @binding(1) var texSmallDot
        binding: 1,
        resource: smallDotMSTextureView,
      },
      {
        // @group(0) @binding(2) var resolved
        binding: 2,
        resource: resolveTextureView,
      },
    ],
  });

  const commandEncoder = device.createCommandEncoder();
  // clear resolveTextureView to black if it won't be used
  if (!config.showResolvedColor) {
    const pass = commandEncoder.beginRenderPass({
      colorAttachments: [
        {
          view: resolveTextureView,
          clearValue: [0, 0, 0, 1],
          loadOp: 'clear',
          storeOp: 'store',
        },
      ],
    });
    pass.end();
  }
  // large dot pass
  {
    const pass = commandEncoder.beginRenderPass({
      label: 'large dot pass',
      colorAttachments: [
        {
          view: largeDotMSTextureView,
          resolveTarget: config.showResolvedColor
            ? resolveTextureView
            : undefined,
          clearValue: [0, 0, 0, 1], // black background
          loadOp: 'clear',
          storeOp: 'store',
        },
      ],
      depthStencilAttachment: {
        view: depthTextureView,
        depthLoadOp: 'clear',
        depthClearValue: 1,
        depthStoreOp: 'discard',
      },
    });
    scenes[config.scene].render(pass, config.largeDotEmulate);
    pass.end();
  }
  // small dot pass
  {
    const pass = commandEncoder.beginRenderPass({
      label: 'small dot pass',
      colorAttachments: [
        {
          view: smallDotMSTextureView,
          clearValue: [0, 0, 0, 1], // black background
          loadOp: 'clear',
          storeOp: 'store',
        },
      ],
      depthStencilAttachment: {
        view: depthTextureView,
        depthLoadOp: 'clear',
        depthClearValue: 1,
        depthStoreOp: 'discard',
      },
    });
    scenes[config.scene].render(pass, config.smallDotEmulate);
    pass.end();
  }
  // showMultisampleTexture pass
  {
    const pass = commandEncoder.beginRenderPass({
      label: 'showMultisampleTexture pass',
      colorAttachments: [
        {
          view: context.getCurrentTexture().createView(),
          clearValue: [1, 0, 1, 1], // error color, will be overwritten
          loadOp: 'clear',
          storeOp: 'store',
        },
      ],
    });
    pass.setPipeline(showMultisampleTexturePipeline);
    pass.setBindGroup(0, showMultisampleTextureBG);
    pass.draw(6);
    pass.end();
  }
  device.queue.submit([commandEncoder.finish()]);
}

function frame() {
  if (config.animate) {
    scenes[config.scene].modifyConfigForAnimation(config);
    gui.updateDisplay();
  }
  updateCanvasSize();
  render();
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
