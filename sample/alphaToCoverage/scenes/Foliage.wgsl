// Vertex

struct Uniforms {
  viewProj: mat4x4f,
};
@binding(0) @group(0) var<uniform> uniforms: Uniforms;

// Roughly evenly space leaves in a circle using this constant
const kPi: f32 = 3.14159265359;
const kPhi: f32 = 1.618033988749;

fn rotate(a: f32, b: f32, c: f32) -> mat3x3f {
  let t = a % (2 * kPi);
  let u = b % (kPi / 2);
  let v = c % (kPi / 2) - kPi / 4;
  // low-effort (inefficient) rotation matrix implementation
  return 
    // 3. third rotate the leaf around up to 360deg
    mat3x3f(cos(t), 0, -sin(t), 0, 1, 0, sin(t), 0, cos(t)) *
    // 2. second rotate the leaf toward the horizon up to 90deg
    mat3x3f(cos(u), sin(u), 0, -sin(u), cos(u), 0, 0, 0, 1) *
    // 1. first rotate the leaf on axis -45 to 45 degrees
    mat3x3f(cos(v), 0, -sin(v), 0, 1, 0, sin(v), 0, cos(v));
    // 0. leaf starts raised above the origin
}

@vertex
fn vmainFoliage(
  @builtin(vertex_index) vertex_index: u32,
  @builtin(instance_index) instance_index: u32,
) -> Varying {
  var square = array(
    vec2f(-1, -1), vec2f(-1,  1), vec2f( 1, -1),
    vec2f( 1, -1), vec2f(-1,  1), vec2f( 1,  1),
  );

  let uv = square[vertex_index];
  let leafSpacePos = vec3f(uv * 0.25, 0);
  let t = kPhi * f32(instance_index);
  // Low-effort leaf spacing
  let worldSpacePos = rotate(t * 3, t * 7, t * 11) * (leafSpacePos + vec3f(0, t % 5, 0));
  return Varying(uniforms.viewProj * vec4f(worldSpacePos, 1), uv);
}

@vertex
fn vmainLeaf(
  @builtin(vertex_index) vertex_index: u32,
) -> Varying {
  var square = array(
    vec2f(-1, -1), vec2f(-1,  1), vec2f( 1, -1),
    vec2f( 1, -1), vec2f(-1,  1), vec2f( 1,  1),
  );

  let pos = square[vertex_index];
  return Varying(vec4(pos, 0, 1), pos);
}

// Varying

struct Varying {
  @builtin(position) pos: vec4f,
  @location(0) uv: vec2f,
}

// Fragment helpers

fn uvToAlpha(uv: vec2f) -> f32 {
  let kRadius = 1.0;
  // t is a signed distance field which is >1 inside the circle and <1 outside.
  let t = kRadius - length(uv);
  // The return value "sharpens" the gradient so it's 1 pixel wide.
  return clamp(t / max(fwidth(t), 0.0001), 0, 1);
}

fn uvToColor(uv: vec2f) -> vec3f {
  let t = (uv.x + 1) / 2; // range 0..1
  let g = 0.7 * t;
  return vec3f(0, g, 1 - g);
}

// Fragment (native alpha-to-coverage)

@fragment
fn fmain_native(vary: Varying) -> @location(0) vec4f {
  return vec4f(uvToColor(vary.uv), uvToAlpha(vary.uv));
}

// Fragment (emulated alpha-to-coverage)

struct FragOut {
  @location(0) color: vec4f,
  @builtin(sample_mask) mask: u32,
}

@fragment
fn fmain_emulated(vary: Varying) -> FragOut {
  // emulatedAlphaToCoverage comes from emulatedAlphaToCoverage.ts depending
  // on the emulation mode.
  let mask = emulatedAlphaToCoverage(uvToAlpha(vary.uv), vec2u(vary.pos.xy));
  return FragOut(vec4f(uvToColor(vary.uv), 1), mask);
}
