@group(0) @binding(0) var tex: texture_multisampled_2d<f32>;
@group(0) @binding(1) var<storage, read_write> out: array<u32>;

const kSize = 8;
const kSampleCount = 4;

@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) xyz: vec3u) {
    let xy = xyz.xy;

    // reconstruct the mask from which samples got written
    var mask = 0u;
    for (var sampleIndex = 0u; sampleIndex < kSampleCount; sampleIndex += 1) {
        let color = textureLoad(tex, xy, sampleIndex);
        let maskBit = u32(color.r > 0.5);
        mask |= maskBit << sampleIndex;
    }

    out[xy.y * kSize + xy.x] = mask;
}
