@group(0) @binding(0) var tex: texture_multisampled_2d<f32>;
@group(0) @binding(1) var<storage, read_write> out: array<u32>;

@compute @workgroup_size(8, 8) fn main() {
    _ = tex;
    _ = &out;
}
