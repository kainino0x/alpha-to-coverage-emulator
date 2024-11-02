@group(0) @binding(0) var tex: texture_multisampled_2d<f32>;
@group(0) @binding(1) var<storage, read_write> out: array<u32>;

override kSize: u32;
override kSampleCount: u32;

@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) xyz: vec3u) {
    let xy = xyz.xy;

    // Reconstruct the mask from which samples were written
    var mask = 0u;
    for (var sampleIndex = 0u; sampleIndex < kSampleCount; sampleIndex += 1) {
        let color = textureLoad(tex, xy, sampleIndex);
        let maskBit = u32(color.r > 0.5); // color is either black or white
        mask |= maskBit << sampleIndex;
    }

    out[xy.y * kSize + xy.x] = mask;
}
