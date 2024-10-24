// TODO: deduplicate code with Foliage.wgsl?

// Vertex

@vertex
fn vmain(
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

// TODO: This is NOT the appropriate way to produce alpha for alpha-to-coverage.
// Need to update it to do what's described in the article.
fn uvToAlpha(uv: vec2f) -> f32 {
  return clamp((1 - length(uv)) / 0.2, 0, 1);
}

fn uvToColor(uv: vec2f) -> vec3f {
  let g = 0.3 + 0.3 * (uv.x + 1);
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
