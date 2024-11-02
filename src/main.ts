// TODO: add a mode with very transparent leaves (like the gradient sample but arranged like foliage)
// TODO: different color for each leaf in the foliage example
// TODO: add a mode to the gradient that does alpha blending as a reference result
import { GUI } from 'dat.gui';

import showMultisampleTextureWGSL from './showMultisampleTexture.wgsl';
import { quitIfWebGPUNotAvailable } from './util';
import {
  DeviceName,
  kEmulatedAlphaToCoverage,
} from './emulatedAlphaToCoverage';

import { CrossingGradients } from './scenes/CrossingGradients';
import { Leaf } from './scenes/Leaf';
import { Foliage } from './scenes/Foliage';

const canvas = document.querySelector('canvas') as HTMLCanvasElement;
const device = await (async () => {
  const adapter = await navigator.gpu?.requestAdapter();
  const device = await adapter?.requestDevice();
  quitIfWebGPUNotAvailable(adapter, device);
  return device;
})();

//
// Scene initialization
//

const scenes = {
  CrossingGradients: new CrossingGradients(device),
  Leaf: new Leaf(device),
  Foliage: new Foliage(device),
};

//
// GUI controls
//

const kSceneNames = ['CrossingGradients', 'Leaf', 'Foliage'] as const;
const kModeNames = {
  'native alpha-to-coverage': 'native',
  'emulated alpha-to-coverage': 'emulated',
  'alpha test 50%': 'alphatest',
  'alpha blending': 'blending',
} as const;

type SceneName = (typeof kSceneNames)[number];
export type ModeName = (typeof kModeNames)[keyof typeof kModeNames];

const kInitConfig = {
  scene: 'Foliage' as SceneName,
  emulatedDevice: 'Apple M1 Pro' as DeviceName,
  mode: 'native' as ModeName,
  mode2: 'none' as ModeName | 'none',
  showComparisonDot: false,
  sizeLog2: 8,
  showResolvedColor: true,
  CrossingGradients_gradient: true,
  CrossingGradients_color1: 0xffffff,
  CrossingGradients_alpha1: 0,
  CrossingGradients_color2: 0x0000ff,
  CrossingGradients_alpha2: 5,
  FoliageCommon_featheringWidthPx: 1,
  Foliage_cameraRotation: 0,
  animate: true,
};
export type Config = typeof kInitConfig;
const config = { ...kInitConfig };

const gui = new GUI();
gui.width = 340;
{
  let isFullscreen = false;
  const buttons = {
    fullscreen() {
      if (isFullscreen) {
        document.exitFullscreen();
      } else {
        document.body.requestFullscreen();
      }
      isFullscreen = !isFullscreen;
    },
    foliageDemo() {
      Object.assign(config, kInitConfig);
      updateDisplay();
    },
    leaf() {
      Object.assign(config, kInitConfig);
      config.scene = 'Leaf';
      config.sizeLog2 = 7;
      updateDisplay();
    },
    overlappingGradientsA2C() {
      Object.assign(config, kInitConfig);
      config.scene = 'CrossingGradients';
      config.sizeLog2 = 8;
      config.animate = false;
      config.CrossingGradients_gradient = true;
      config.CrossingGradients_alpha1 = 100;
      config.CrossingGradients_alpha2 = 100;
      updateDisplay();
    },
    overlappingGradientsBlend() {
      this.overlappingGradientsA2C();
      config.mode = 'blending';
      updateDisplay();
    },
    solidInspector() {
      Object.assign(config, kInitConfig);
      config.scene = 'CrossingGradients';
      config.sizeLog2 = 3;
      config.animate = true;
      config.CrossingGradients_gradient = false;
      updateDisplay();
    },
  };

  gui.add(buttons, 'fullscreen').name('toggle fullscreen');

  const presets = gui.addFolder('Presets');
  presets.open();
  presets.add(buttons, 'foliageDemo').name('foliage demo (default)');
  presets.add(buttons, 'leaf').name('leaf closeup (emulated) ');
  presets
    .add(buttons, 'overlappingGradientsA2C')
    .name('overlapping gradients (alpha-to-coverage)');
  presets
    .add(buttons, 'overlappingGradientsBlend')
    .name('overlapping gradients (blending)');
  presets.add(buttons, 'solidInspector').name('solid pattern inspector');

  const visualizationPanel = gui.addFolder('Visualization');
  visualizationPanel.open();
  visualizationPanel.add(config, 'sizeLog2', 0, 9, 1).name('size = 2**');
  visualizationPanel.add(config, 'showResolvedColor', false);
  const enableDisableDevice = () => {
    emulatedDeviceElem.disabled = !(
      config.mode === 'emulated' || config.mode2 === 'emulated'
    );
  };
  visualizationPanel
    .add(config, 'mode', kModeNames)
    .onChange(enableDisableDevice);
  visualizationPanel
    .add(config, 'mode2', { none: 'none', ...kModeNames })
    .name('comparison dot')
    .onChange(enableDisableDevice);
  const emulatedDeviceElem = visualizationPanel
    .add(config, 'emulatedDevice', Object.keys(kEmulatedAlphaToCoverage))
    .name('device to emulate').domElement.childNodes[0] as HTMLSelectElement;
  enableDisableDevice();

  const scenesPanel = gui.addFolder('Scenes');
  scenesPanel.open();

  const scenePanels: GUI[] = [];
  const showHideScenePanels = () => {
    for (const scenePanel of scenePanels) {
      scenePanel.hide();
    }
    switch (config.scene) {
      case 'CrossingGradients':
        sceneCrossingGradients.show();
        break;
      case 'Foliage':
        sceneLeaf.show();
        sceneFoliage.show();
        break;
      case 'Leaf':
        sceneLeaf.show();
        break;
    }
  };
  scenesPanel.add(config, 'scene', kSceneNames).onChange(showHideScenePanels);
  scenesPanel.add(config, 'animate', false);

  const sceneCrossingGradients = scenesPanel.addFolder(
    'CrossingGradients scene options'
  );
  sceneCrossingGradients.open();
  scenePanels.push(sceneCrossingGradients);
  {
    sceneCrossingGradients
      .add(config, 'CrossingGradients_gradient', true)
      .name('use gradient');

    const draw1Panel = sceneCrossingGradients.addFolder('Draw 1 (top->bottom)');
    draw1Panel.open();
    draw1Panel.addColor(config, 'CrossingGradients_color1').name('color');
    draw1Panel
      .add(config, 'CrossingGradients_alpha1', 0, 100, 0.001)
      .name('alpha %');

    const draw2Panel = sceneCrossingGradients.addFolder('Draw 2 (left->right)');
    draw2Panel.open();
    draw2Panel.addColor(config, 'CrossingGradients_color2').name('color');
    draw2Panel
      .add(config, 'CrossingGradients_alpha2', 0, 100, 0.001)
      .name('alpha %');
  }

  const sceneLeaf = scenesPanel.addFolder('Leaf/Foliage scene options');
  sceneLeaf.open();
  scenePanels.push(sceneLeaf);
  {
    sceneLeaf
      .add(config, 'FoliageCommon_featheringWidthPx', 1, 25, 1)
      .name('feathering width (px)');
  }

  const sceneFoliage = scenesPanel.addFolder('Foliage scene options');
  sceneFoliage.open();
  scenePanels.push(sceneFoliage);
  {
    sceneFoliage
      .add(config, 'Foliage_cameraRotation', 0, 360, 1)
      .name('camera rotation');
  }

  showHideScenePanels();

  function updateDisplay() {
    enableDisableDevice();
    showHideScenePanels();
    gui.updateDisplay();
  }
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
    scenes[config.scene].render(pass, config.mode, config.emulatedDevice);
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
    scenes[config.scene].render(
      pass,
      config.mode2 === 'none' ? config.mode : config.mode2,
      config.emulatedDevice
    );
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
