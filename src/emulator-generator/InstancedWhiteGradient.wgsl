// Vertex

// Number of steps such that:
// instance_index=0 -> alpha=0
// instance_index=alphaIncrements -> alpha=1
override alphaIncrements: f32;

@vertex
fn vmain(
  @builtin(vertex_index) vertex_index: u32,
  // The instance index tells us which alpha value to use.
  @builtin(instance_index) instance_index: u32,
) -> Varying {
  var square = array(
    vec2f(-1, -1), vec2f(-1,  1), vec2f( 1, -1),
    vec2f( 1, -1), vec2f(-1,  1), vec2f( 1,  1),
  );

  let alpha = f32(instance_index) / alphaIncrements;
  return Varying(vec4(square[vertex_index % 6], 0, 1), alpha);
}

// Varying

struct Varying {
  @builtin(position) pos: vec4f,
  // alpha from instance-step-mode vertex buffer
  @location(0) alpha: f32,
}

// Fragment (called by Scene.ts)

@fragment
fn fmain(vary: Varying) -> @location(0) vec4f {
  return vec4f(1, 1, 1, vary.alpha);
}
