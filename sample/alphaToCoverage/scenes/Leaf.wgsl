@vertex
fn vmain(
  @location(0) pos: vec4f,
  @builtin(vertex_index) vertex_index: u32,
) -> Varying {
  var square = array(
    vec2f(-1, -1), vec2f(-1,  1), vec2f( 1, -1),
    vec2f( 1, -1), vec2f(-1,  1), vec2f( 1,  1),
  );

  let pos = square[vertex_index];
  return Varying(vec4(pos, 0, 1), pos);
}

struct Varying {
  @builtin(position) pos: vec4f,
  @location(0) uv: vec2f,
}

fn uvToAlpha(uv: vec2f) -> f32 {
  return clamp((1 - length(uv)) / 0.2, 0, 1);
}

@fragment
fn fmain_native(vary: Varying) -> @location(0) vec4f {
  return vec4f(0, 0.5, 0, uvToAlpha(vary.uv));
}

struct FragOut {
  @location(0) color: vec4f,
  @builtin(sample_mask) mask: u32,
}

@fragment
fn fmain_emulated(vary: Varying) -> FragOut {
  // emulatedAlphaToCoverage comes from emulatedAlphaToCoverage.ts depending
  // on the emulation mode.
  let mask = emulatedAlphaToCoverage(uvToAlpha(vary.uv), vec2u(vary.pos.xy));
  return FragOut(vec4f(0, 0.5, 0, 1), mask);
}
