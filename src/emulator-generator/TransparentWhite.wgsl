// Vertex

@vertex
fn vmain(
  @builtin(vertex_index) vertex_index: u32,
  @location(0) alpha: f32,
) -> Varying {
  var square = array(
    vec2f(-1, -1), vec2f(-1,  1), vec2f( 1, -1),
    vec2f( 1, -1), vec2f(-1,  1), vec2f( 1,  1),
  );

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
