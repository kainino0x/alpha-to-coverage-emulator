import { GUI } from 'dat.gui';

import showMultisampleTextureWGSL from './ShowMultisampleTexture.wgsl';
import { quitIfWebGPUNotAvailable } from './util';
import {
  DeviceName,
  kEmulatedAlphaToCoverage,
  kNullEmulator,
} from './emulatedAlphaToCoverage';

import { CrossingGradients } from './scenes/CrossingGradients';
import { Leaf } from './scenes/Leaf';
import { Foliage } from './scenes/Foliage';
import { generateAlphaToCoverage } from './emulator-generator/generateAlphaToCoverage';
import { setFrameTimeStep } from './animationTime';

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
  mode: 'native' as ModeName,
  mode2: 'none' as ModeName | 'none',
  emulatedDevice: 'Apple M1 Pro' as DeviceName,
  sampleCount: 4,
  sizeLog2: 8,
  showResolvedColor: true,
  CrossingGradients_color1: 0xffffff,
  CrossingGradients_alpha1top: 0,
  CrossingGradients_alpha1bottom: 0,
  CrossingGradients_color2: 0x0000ff,
  CrossingGradients_alpha2left: 0,
  CrossingGradients_alpha2right: 0,
  CrossingGradients_animate: true,
  FoliageCommon_featheringWidthPx: 1,
  Foliage_cameraDistanceLog: 0,
  Foliage_cameraRotation: 0,
  Foliage_animate: true,
};
export type Config = typeof kInitConfig;
const config = { ...kInitConfig };

const gui = new GUI();
document.getElementById('guibox')!.appendChild(gui.domElement);
gui.domElement.style.marginRight = '0';
gui.width = 340;
{
  const leftSide = document.getElementById('left')!;
  let isFullscreen = false;
  const buttons = {
    fullscreen() {
      if (isFullscreen) {
        document.exitFullscreen();
      } else {
        leftSide.requestFullscreen();
      }
      isFullscreen = !isFullscreen;
    },
  };
  gui.add(buttons, 'fullscreen').name('toggle fullscreen');

  const presets = gui.addFolder('Presets');
  {
    let sectionNumber = 1;
    const btn = (key: string, name: string, fn: () => void) => {
      const numberedName = `${sectionNumber++}. ${name}`;

      const element = document.getElementById(key)! as HTMLAnchorElement;
      const trigger = () => {
        Object.assign(config, kInitConfig);
        fn();
        updateEmulationPanels();
        showHideScenePanels();
        gui.updateDisplay();
        window.location.hash = key;
      };

      const hash = '#' + key;
      if (window.location.hash === hash) {
        setTimeout(trigger, 0);
      }

      presets.add({ [key]: trigger }, key).name(numberedName);
      element.href = hash;
      element.textContent = numberedName;
      element.onclick = trigger;
    };
    window.addEventListener('hashchange', () => {
      const hash = window.location.hash;
      (document.querySelector(hash) as HTMLAnchorElement | null)?.click();
    });

    btn(
      'foliageA2C',
      'foliage with alpha-to-coverage', //
      () => {}
    );
    btn(
      'foliageAlphaTest',
      'foliage with alpha-test (aliased)', //
      () => {
        config.mode = 'alphatest';
      }
    );
    btn(
      'foliageBlend',
      'foliage with blending (broken Z)', //
      () => {
        config.mode = 'blending';
      }
    );
    btn(
      'oneGradientBlend',
      'one gradient (blending)', //
      () => {
        config.mode = 'blending';
        config.scene = 'CrossingGradients';
        config.CrossingGradients_color1 = 0xffffff;
        config.CrossingGradients_alpha1top = 0;
        config.CrossingGradients_alpha1bottom = 100;
        config.CrossingGradients_color2 = 0x000000;
        config.CrossingGradients_alpha2left = 0;
        config.CrossingGradients_alpha2right = 0;
        config.CrossingGradients_animate = false;
      }
    );
    btn(
      'overlappingGradientsBlend',
      'overlapping gradients (blending)', //
      () => {
        config.mode = 'blending';
        config.scene = 'CrossingGradients';
        config.CrossingGradients_color1 = 0xffffff;
        config.CrossingGradients_alpha1top = 0;
        config.CrossingGradients_alpha1bottom = 100;
        config.CrossingGradients_color2 = 0x000000;
        config.CrossingGradients_alpha2left = 0;
        config.CrossingGradients_alpha2right = 100;
        config.CrossingGradients_animate = false;
      }
    );
    btn(
      'overlappingGradientsAlphaTest',
      'overlapping gradients (alpha-test)', //
      () => {
        config.mode = 'alphatest';
        config.scene = 'CrossingGradients';
        config.CrossingGradients_color1 = 0xffffff;
        config.CrossingGradients_alpha1top = 0;
        config.CrossingGradients_alpha1bottom = 100;
        config.CrossingGradients_color2 = 0x000000;
        config.CrossingGradients_alpha2left = 0;
        config.CrossingGradients_alpha2right = 100;
        config.CrossingGradients_animate = false;
      }
    );
    btn(
      'overlappingGradientsAlphaTestZoomed',
      'overlapping gradients (alpha-test, zoomed)', //
      () => {
        config.mode = 'alphatest';
        config.scene = 'CrossingGradients';
        config.sizeLog2 = 4;
        config.showResolvedColor = false;
        config.CrossingGradients_color1 = 0xffffff;
        config.CrossingGradients_alpha1top = 0;
        config.CrossingGradients_alpha1bottom = 100;
        config.CrossingGradients_color2 = 0x000000;
        config.CrossingGradients_alpha2left = 0;
        config.CrossingGradients_alpha2right = 100;
        config.CrossingGradients_animate = false;
      }
    );
    btn(
      'overlappingGradientsA2CNVIDIAZoomed',
      'overlapping gradients (A2C, NVIDIA, zoomed)', //
      () => {
        config.mode = 'emulated';
        config.emulatedDevice = 'NVIDIA GeForce RTX 3070';
        config.scene = 'CrossingGradients';
        config.sizeLog2 = 4;
        config.showResolvedColor = false;
        config.CrossingGradients_color1 = 0xffffff;
        config.CrossingGradients_alpha1top = 0;
        config.CrossingGradients_alpha1bottom = 100;
        config.CrossingGradients_color2 = 0x000000;
        config.CrossingGradients_alpha2left = 0;
        config.CrossingGradients_alpha2right = 100;
        config.CrossingGradients_animate = false;
      }
    );
    btn(
      'overlappingGradientsA2CNVIDIAZoomedResolved',
      'overlapping gradients (A2C, NVIDIA, zoomed/resolved)', //
      () => {
        config.mode = 'emulated';
        config.emulatedDevice = 'NVIDIA GeForce RTX 3070';
        config.scene = 'CrossingGradients';
        config.sizeLog2 = 4;
        config.CrossingGradients_color1 = 0xffffff;
        config.CrossingGradients_alpha1top = 0;
        config.CrossingGradients_alpha1bottom = 100;
        config.CrossingGradients_color2 = 0x000000;
        config.CrossingGradients_alpha2left = 0;
        config.CrossingGradients_alpha2right = 100;
        config.CrossingGradients_animate = false;
      }
    );
    btn(
      'overlappingGradientsA2CNVIDIA',
      'overlapping gradients (A2C, NVIDIA)', //
      () => {
        config.mode = 'emulated';
        config.emulatedDevice = 'NVIDIA GeForce RTX 3070';
        config.scene = 'CrossingGradients';
        config.CrossingGradients_color1 = 0xffffff;
        config.CrossingGradients_alpha1top = 0;
        config.CrossingGradients_alpha1bottom = 100;
        config.CrossingGradients_color2 = 0x000000;
        config.CrossingGradients_alpha2left = 0;
        config.CrossingGradients_alpha2right = 100;
        config.CrossingGradients_animate = false;
      }
    );
    btn(
      'overlappingGradientsA2CApple',
      'overlapping gradients (A2C, Apple)', //
      () => {
        config.mode = 'emulated';
        config.emulatedDevice = 'Apple M1 Pro';
        config.scene = 'CrossingGradients';
        config.CrossingGradients_color1 = 0xffffff;
        config.CrossingGradients_alpha1top = 0;
        config.CrossingGradients_alpha1bottom = 100;
        config.CrossingGradients_color2 = 0x000000;
        config.CrossingGradients_alpha2left = 0;
        config.CrossingGradients_alpha2right = 100;
        config.CrossingGradients_animate = false;
      }
    );
    btn(
      'solidInspectorApple',
      'solid pattern inspector (Apple)', //
      () => {
        config.mode = 'emulated';
        config.emulatedDevice = 'Apple M1 Pro';
        config.scene = 'CrossingGradients';
        config.sizeLog2 = 3;
        config.CrossingGradients_animate = true;
      }
    );
    btn(
      'solidInspectorAMD',
      'solid pattern inspector (AMD)', //
      () => {
        config.mode = 'emulated';
        config.emulatedDevice = 'AMD Radeon RX 580';
        config.scene = 'CrossingGradients';
        config.sizeLog2 = 3;
        config.CrossingGradients_animate = true;
      }
    );
    btn(
      'overlappingGradientsA2CAMD',
      'overlapping gradients (A2C, AMD)', //
      () => {
        config.mode = 'emulated';
        config.emulatedDevice = 'AMD Radeon RX 580';
        config.scene = 'CrossingGradients';
        config.CrossingGradients_color1 = 0xffffff;
        config.CrossingGradients_alpha1top = 0;
        config.CrossingGradients_alpha1bottom = 100;
        config.CrossingGradients_color2 = 0x000000;
        config.CrossingGradients_alpha2left = 0;
        config.CrossingGradients_alpha2right = 100;
        config.CrossingGradients_animate = false;
      }
    );
    btn(
      'solidInspectorQualcomm',
      'solid pattern inspector (Qualcomm)', //
      () => {
        config.mode = 'emulated';
        config.emulatedDevice = 'Qualcomm Adreno 630';
        config.scene = 'CrossingGradients';
        config.sizeLog2 = 3;
        config.CrossingGradients_animate = true;
      }
    );
    btn(
      'overlappingGradientsA2CQualcomm',
      'overlapping gradients (A2C, Qualcomm)', //
      () => {
        config.mode = 'emulated';
        config.emulatedDevice = 'Qualcomm Adreno 630';
        config.scene = 'CrossingGradients';
        config.CrossingGradients_color1 = 0xffffff;
        config.CrossingGradients_alpha1top = 0;
        config.CrossingGradients_alpha1bottom = 100;
        config.CrossingGradients_color2 = 0x000000;
        config.CrossingGradients_alpha2left = 0;
        config.CrossingGradients_alpha2right = 100;
        config.CrossingGradients_animate = false;
      }
    );
    btn(
      'blurryLeafNVIDIA',
      'blurry-leaf closeup (NVIDIA)', //
      () => {
        config.mode = 'emulated';
        config.emulatedDevice = 'NVIDIA GeForce RTX 3070';
        config.scene = 'Leaf';
        config.FoliageCommon_featheringWidthPx = 25;
      }
    );
    btn(
      'blurryLeafApple',
      'blurry-leaf closeup (Apple)', //
      () => {
        config.mode = 'emulated';
        config.emulatedDevice = 'Apple M1 Pro';
        config.scene = 'Leaf';
        config.FoliageCommon_featheringWidthPx = 25;
      }
    );
    btn(
      'blurryLeafQualcomm',
      'blurry-leaf closeup (Qualcomm)', //
      () => {
        config.mode = 'emulated';
        config.emulatedDevice = 'Qualcomm Adreno 630';
        config.scene = 'Leaf';
        config.FoliageCommon_featheringWidthPx = 25;
      }
    );
    btn(
      'blurryLeafNative',
      'blurry-leaf closeup (native)', //
      () => {
        config.mode = 'native';
        config.scene = 'Leaf';
        config.FoliageCommon_featheringWidthPx = 25;
      }
    );
    btn(
      'foliageBlurry',
      'blurry foliage (alpha-to-coverage, NVIDIA)', //
      () => {
        config.sizeLog2 = 13;
        config.mode = 'emulated';
        config.emulatedDevice = 'NVIDIA GeForce RTX 3070';
        config.FoliageCommon_featheringWidthPx = 20;
      }
    );
    btn('generator', 'Emulator generator', () => {
      config.scene = 'CrossingGradients';
      config.sizeLog2 = 3;
      config.mode = 'emulated';
      config.mode2 = 'native';
      config.emulatedDevice = '(generated from your device)';
      config.CrossingGradients_animate = true;
    });
  }

  const visualizationPanel = gui.addFolder('Visualization');
  visualizationPanel.open();
  visualizationPanel.add(config, 'sampleCount', [4]);
  visualizationPanel.add(config, 'sizeLog2', 0, 13, 1).name('size = 2**');
  visualizationPanel.add(config, 'showResolvedColor', false);
  const updateEmulationPanels = () => {
    emulatedDeviceElem.disabled = !(
      config.mode === 'emulated' || config.mode2 === 'emulated'
    );
    if (config.emulatedDevice === '(generated from your device)') {
      generatorFolder.show();
    } else {
      generatorFolder.hide();
    }
    if (
      kEmulatedAlphaToCoverage['(generated from your device)'] !== kNullEmulator
    ) {
      generatorFormFolder.show();
    }
  };
  visualizationPanel
    .add(config, 'mode', kModeNames)
    .onChange(updateEmulationPanels);
  visualizationPanel
    .add(config, 'mode2', { none: 'none', ...kModeNames })
    .name('comparison dot')
    .onChange(updateEmulationPanels);
  const emulatedDeviceElem = visualizationPanel
    .add(config, 'emulatedDevice', Object.keys(kEmulatedAlphaToCoverage))
    .name('device to emulate')
    .onChange(updateEmulationPanels).domElement
    .childNodes[0] as HTMLSelectElement;

  const generatorButtons = {
    async generate() {
      await generateAlphaToCoverage(adapter, device);
      updateEmulationPanels();
    },
    googleForm() {
      const formURL =
        'https://docs.google.com/forms/d/e/1FAIpQLScwAdI56MlLPms4ACR4EjGQ7nUwQLxYIigtwHnKm93zy2_4QQ/viewform?usp=pp_url&entry.1014162091=' +
        encodeURIComponent(
          kEmulatedAlphaToCoverage['(generated from your device)']
        );
      window.open(formURL, '_blank')?.focus();
    },
  };
  const generatorFolder = gui.addFolder('Emulator Generator');
  generatorFolder.open();
  generatorFolder.hide();
  generatorFolder
    .add(generatorButtons, 'generate')
    .name('Generate an emulator for this device');
  const generatorFormFolder = generatorFolder //
    .addFolder('Is your device different from the others here?');
  generatorFormFolder.open();
  generatorFormFolder.hide();
  generatorFormFolder
    .add(generatorButtons, 'googleForm')
    .name('Submit it here!');

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

  const sceneCrossingGradients = scenesPanel.addFolder(
    'CrossingGradients scene options'
  );
  sceneCrossingGradients.open();
  scenePanels.push(sceneCrossingGradients);
  {
    const draw1Panel = sceneCrossingGradients.addFolder('Draw 1 (top->bottom)');
    draw1Panel.open();
    draw1Panel.addColor(config, 'CrossingGradients_color1').name('color');
    draw1Panel
      .add(config, 'CrossingGradients_alpha1top', 0, 100, 0.001)
      .name('alpha % top');
    draw1Panel
      .add(config, 'CrossingGradients_alpha1bottom', 0, 100, 0.001)
      .name('alpha % bottom');

    const draw2Panel = sceneCrossingGradients.addFolder('Draw 2 (left->right)');
    draw2Panel.open();
    draw2Panel.addColor(config, 'CrossingGradients_color2').name('color');
    draw2Panel
      .add(config, 'CrossingGradients_alpha2left', 0, 100, 0.001)
      .name('alpha % left');
    draw2Panel
      .add(config, 'CrossingGradients_alpha2right', 0, 100, 0.001)
      .name('alpha % right');
    draw2Panel.add(config, 'CrossingGradients_animate', false).name('animate');
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
      .add(config, 'Foliage_cameraDistanceLog', 0, 9, 0.1)
      .name('camera dist = 1.5**');
    sceneFoliage
      .add(config, 'Foliage_cameraRotation', 0, 360, 1)
      .name('camera rotation');
    sceneFoliage.add(config, 'Foliage_animate', false).name('animate');
  }

  updateEmulationPanels();
  showHideScenePanels();
}

//
// Device + scene initialization
//

const canvas = document.querySelector('canvas') as HTMLCanvasElement;
const [adapter, device] = await (async () => {
  const adapter = await navigator.gpu?.requestAdapter();
  const device = await adapter?.requestDevice();
  quitIfWebGPUNotAvailable(adapter, device);
  return [adapter!, device];
})();

const scenes = {
  CrossingGradients: new CrossingGradients(device),
  Leaf: new Leaf(device),
  Foliage: new Foliage(device),
};

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
let lastSize = 0;
function reallocateRenderTargets() {
  // Use the requested resolution, but no larger than the canvas resolution.
  const size = Math.min(1 << config.sizeLog2, canvas.width);
  if (lastSize !== size) {
    lastSize = size;

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
      sampleCount: config.sampleCount,
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
      sampleCount: config.sampleCount,
    });
    depthTextureView = depthTexture.createView();
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

let lastFrameTime = 0;
function frame(time: DOMHighResTimeStamp) {
  setFrameTimeStep(time - lastFrameTime);
  lastFrameTime = time;

  scenes[config.scene].modifyConfigForAnimation(config);
  gui.updateDisplay();

  updateCanvasSize();
  render();
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
