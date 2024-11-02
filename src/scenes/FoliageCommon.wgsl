// Uniforms (shared between vertex and fragment because it's easy)

struct Uniforms {
  viewProj: mat4x4f,
  featheringWidthPx: f32,
};
@binding(0) @group(0) var<uniform> uniforms: Uniforms;

// Vertex

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
  let gb = array(
      vec2f(0.3, 0.3),
      vec2f(0.8, 0.0),
      vec2f(1.0, 0.0),
      vec2f(1.0, 0.5),
      vec2f(1.0, 1.0),
      vec2f(0.5, 1.0),
      vec2f(0.0, 1.0),
      vec2f(0.0, 0.8),
    )[u32((t * 41) % 8)];
  return Varying(uniforms.viewProj * vec4f(worldSpacePos, 1), uv, gb);
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
  let gb = vec2f(0.8, 0);
  return Varying(vec4(pos, 0, 1), pos, gb);
}

// Varying

struct Varying {
  @builtin(position) pos: vec4f,
  @location(0) uv: vec2f,
  @location(1) gb: vec2f,
}

// Fragment helpers

fn uvToAlpha(uv: vec2f) -> f32 {
  let kRadius = 1.0;
  // t is a signed distance field which is >1 inside the circle and <1 outside.
  let t = kRadius - length(uv);
  // The return value "sharpens" the gradient so it's featheringWidthPx wide.
  let divisor = length(vec2(dpdx(t), dpdy(t))) * uniforms.featheringWidthPx;
  // fwidth would be cheaper, but doesn't work as well when feathering > 1px:
  //let divisor = fwidth(t) * uniforms.featheringWidthPx;
  return clamp(t / max(divisor, 0.0001), 0, 1);
}

// Fragment (called by Scene.ts)

fn computeFragment(vary: Varying) -> vec4f {
  return vec4f(0, vary.gb, uvToAlpha(vary.uv));
}
