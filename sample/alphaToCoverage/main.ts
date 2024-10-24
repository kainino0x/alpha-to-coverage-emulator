import { GUI } from 'dat.gui';

import showMultisampleTextureWGSL from './showMultisampleTexture.wgsl';
import { quitIfWebGPUNotAvailable } from '../util';
import { kEmulatedAlphaToCoverage } from './emulatedAlphaToCoverage';

import { SolidColors } from './scenes/SolidColors';
import { Leaf } from './scenes/Leaf';

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
};

//
// GUI controls
//

const kSceneNames = ['SolidColors', 'Leaf'] as const;
type DeviceName = keyof typeof kEmulatedAlphaToCoverage;

const kInitConfig = {
  scene: 'Leaf' as (typeof kSceneNames)[number],
  emulatedDevice: 'Apple M1 Pro' as DeviceName,
  largeDotEmulate: false,
  smallDotEmulate: false,
  sizeLog2: 4,
  showResolvedColor: true,
  SolidColors_color1: 0x0000ff,
  SolidColors_alpha1: 0,
  SolidColors_color2: 0xff0000,
  SolidColors_alpha2: 16,
  animate: true,
};
export type Config = typeof kInitConfig;
const config = { ...kInitConfig };

const gui = new GUI();
gui.width = 300;
{
  const buttons = {
    initial() {
      Object.assign(config, kInitConfig);
      gui.updateDisplay();
    },
  };

  gui.add(buttons, 'initial').name('Reset all settings');

  const visualizationPanel = gui.addFolder('Visualization');
  visualizationPanel.open();
  visualizationPanel.add(config, 'sizeLog2', 0, 8, 1).name('size = 2**');
  visualizationPanel
    .add(config, 'emulatedDevice', Object.keys(kEmulatedAlphaToCoverage))
    .name('device for emulation');

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

  const scenes = gui.addFolder('Scenes');
  scenes.open();
  scenes.add(config, 'scene', kSceneNames);

  const sceneSolidColors = scenes.addFolder('SolidColors scene options');
  sceneSolidColors.open();

  const draw1Panel = sceneSolidColors.addFolder('Draw 1');
  draw1Panel.open();
  draw1Panel.addColor(config, 'SolidColors_color1').name('color');
  draw1Panel.add(config, 'SolidColors_alpha1', 0, 255).name('alpha');

  const draw2Panel = sceneSolidColors.addFolder('Draw 2');
  draw2Panel.open();
  draw2Panel.addColor(config, 'SolidColors_color2').name('color');
  draw2Panel.add(config, 'SolidColors_alpha2', 0, 255, 0.001).name('alpha');
  draw2Panel.add(config, 'animate', false);

  const sceneLeaf = scenes.addFolder('Leaf scene options');
  sceneLeaf.open();
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

    lastSizeLog2 = config.sizeLog2;
  }
}

function applyConfig() {
  // Update the colors in the (instance-step-mode) vertex buffer
  scenes.SolidColors.updateConfig(config);
  scenes.Leaf.updateConfig(config);

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
    if (config.scene === 'SolidColors') {
      // scrub alpha2 over 15 seconds
      let alpha = ((performance.now() / 15000) % 1) * (255 + 20) - 10;
      alpha = Math.max(0, Math.min(alpha, 255));
      config.SolidColors_alpha2 = alpha;
    }
    gui.updateDisplay();
  }
  updateCanvasSize();
  render();
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
