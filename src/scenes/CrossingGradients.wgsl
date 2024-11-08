// Vertex

@vertex
fn vmain(
  @builtin(vertex_index) vertex_index: u32,
  @location(0) color: vec4f,
) -> Varying {
  var square = array(
    vec2f(-1, -1), vec2f(-1,  1), vec2f( 1, -1),
    vec2f( 1, -1), vec2f(-1,  1), vec2f( 1,  1),
  );

  return Varying(vec4(square[vertex_index % 6], 0, 1), color);
}

// Varying

struct Varying {
  @builtin(position) pos: vec4f,
  // Color from instance-step-mode vertex buffer
  @location(0) color: vec4f,
}

// Fragment (called by Scene.ts)

fn computeFragment(vary: Varying) -> vec4f {
  return vary.color;
}
