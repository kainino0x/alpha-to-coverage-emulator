/**
 * For each device name, provides the source for a WGSL function which emulates
 * the alpha-to-coverage algorithm of that device by mapping (alpha, x, y) to
 * a sample mask.
 */
export const kEmulatedAlphaToCoverage = {
  'Apple M1 Pro': `\
    fn emulatedAlphaToCoverage(alpha: f32, xy: vec2u) -> u32 {
      let i = (xy.y % 2) * 2 + (xy.x % 2);
      if (alpha < 7.5 / 255.0) { return array(0x0, 0x0, 0x0, 0x0u)[i]; }
      if (alpha < 23.5 / 255.0) { return array(0x1, 0x0, 0x0, 0x0u)[i]; }
      if (alpha < 39.5 / 255.0) { return array(0x1, 0x0, 0x0, 0x1u)[i]; }
      if (alpha < 55.5 / 255.0) { return array(0x1, 0x1, 0x0, 0x1u)[i]; }
      if (alpha < 71.5 / 255.0) { return array(0x1, 0x1, 0x1, 0x1u)[i]; }
      if (alpha < 87.5 / 255.0) { return array(0x9, 0x1, 0x1, 0x1u)[i]; }
      if (alpha < 103.5 / 255.0) { return array(0x9, 0x1, 0x1, 0x9u)[i]; }
      if (alpha < 119.5 / 255.0) { return array(0x9, 0x9, 0x1, 0x9u)[i]; }
      if (alpha < 135.5 / 255.0) { return array(0x9, 0x9, 0x9, 0x9u)[i]; }
      if (alpha < 151.5 / 255.0) { return array(0xb, 0x9, 0x9, 0x9u)[i]; }
      if (alpha < 167.5 / 255.0) { return array(0xb, 0x9, 0x9, 0xbu)[i]; }
      if (alpha < 183.5 / 255.0) { return array(0xb, 0xb, 0x9, 0xbu)[i]; }
      if (alpha < 199.5 / 255.0) { return array(0xb, 0xb, 0xb, 0xbu)[i]; }
      if (alpha < 215.5 / 255.0) { return array(0xf, 0xb, 0xb, 0xbu)[i]; }
      if (alpha < 231.5 / 255.0) { return array(0xf, 0xb, 0xb, 0xfu)[i]; }
      if (alpha < 247.5 / 255.0) { return array(0xf, 0xf, 0xb, 0xfu)[i]; }
      return 0xf;
    }
  `.trimEnd(),
  '(?) NVIDIA GeForce RTX 3070': `\
    fn emulatedAlphaToCoverage(alpha: f32, xy: vec2u) -> u32 {
      // TODO: this isn't verified yet
      if (alpha < 0.5 / 4) { return ${0b0000}; }
      if (alpha < 1.5 / 4) { return ${0b1000}; }
      if (alpha < 2.5 / 4) { return ${0b1001}; }
      if (alpha < 3.5 / 4) { return ${0b1011}; }
      return ${0b1111};
    }
  `.trimEnd(),
  'ARM Mali-G78': `\
    fn emulatedAlphaToCoverage(alpha: f32, xy: vec2u) -> u32 {
      let i = (xy.y % 2) * 2 + (xy.x % 2);
      if (alpha < 0.5 / 16.0) { return array(0x0, 0x0, 0x0, 0x0u)[i]; }
      if (alpha < 1.5 / 16.0) { return array(0x0, 0x8, 0x0, 0x0u)[i]; }
      if (alpha < 2.5 / 16.0) { return array(0x1, 0x8, 0x0, 0x0u)[i]; }
      if (alpha < 3.5 / 16.0) { return array(0x1, 0x8, 0x0, 0x1u)[i]; }
      if (alpha < 4.5 / 16.0) { return array(0x1, 0x8, 0x8, 0x1u)[i]; }
      if (alpha < 5.5 / 16.0) { return array(0x1, 0xa, 0x8, 0x1u)[i]; }
      if (alpha < 6.5 / 16.0) { return array(0x5, 0xa, 0x8, 0x1u)[i]; }
      if (alpha < 7.5 / 16.0) { return array(0x5, 0xa, 0x8, 0x5u)[i]; }
      if (alpha < 8.5 / 16.0) { return array(0x5, 0xa, 0xa, 0x5u)[i]; }
      if (alpha < 9.5 / 16.0) { return array(0x5, 0xe, 0xa, 0x5u)[i]; }
      if (alpha < 10.5 / 16.0) { return array(0x7, 0xe, 0xa, 0x5u)[i]; }
      if (alpha < 11.5 / 16.0) { return array(0x7, 0xe, 0xa, 0x7u)[i]; }
      if (alpha < 12.5 / 16.0) { return array(0x7, 0xe, 0xe, 0x7u)[i]; }
      if (alpha < 13.5 / 16.0) { return array(0x7, 0xf, 0xe, 0x7u)[i]; }
      if (alpha < 14.5 / 16.0) { return array(0xf, 0xf, 0xe, 0x7u)[i]; }
      if (alpha < 15.5 / 16.0) { return array(0xf, 0xf, 0xe, 0xfu)[i]; }
      return 0xf;
    }
  `.trimEnd(),
  'Qualcomm Adreno 630': `\
    fn emulatedAlphaToCoverage(alpha: f32, xy: vec2u) -> u32 {
      let i = (xy.y % 4) * 4 + (xy.x % 4);
      if (alpha < 0.5 / 255.0) { return array(0x0, 0x0, 0x0, 0x0, 0x0, 0x0, 0x0, 0x0, 0x0, 0x0, 0x0, 0x0, 0x0, 0x0, 0x0, 0x0u)[i]; }
      if (alpha < 15.5 / 255.0) { return array(0x0, 0x0, 0x0, 0x0, 0x0, 0x0, 0x0, 0x0, 0x0, 0x0, 0x1, 0x0, 0x0, 0x0, 0x0, 0x0u)[i]; }
      if (alpha < 31.5 / 255.0) { return array(0x1, 0x0, 0x8, 0x0, 0x0, 0x0, 0x0, 0x0, 0x0, 0x0, 0x0, 0x1, 0x0, 0x1, 0x0, 0x0u)[i]; }
      if (alpha < 47.5 / 255.0) { return array(0x2, 0x0, 0x1, 0x0, 0x0, 0x2, 0x0, 0x1, 0x4, 0x1, 0x8, 0x0, 0x0, 0x4, 0x0, 0x8u)[i]; }
      if (alpha < 63.5 / 255.0) { return array(0x0, 0x2, 0x8, 0x1, 0x1, 0x4, 0x2, 0x8, 0x4, 0x2, 0x0, 0x2, 0x2, 0x0, 0x1, 0x4u)[i]; }
      if (alpha < 79.5 / 255.0) { return array(0x4, 0x1, 0x2, 0x8, 0x8, 0x2, 0x1, 0x4, 0x2, 0x8, 0x4, 0x1, 0x1, 0x4, 0x8, 0x3u)[i]; }
      if (alpha < 95.5 / 255.0) { return array(0x4, 0x9, 0x2, 0x5, 0x1, 0x4, 0x9, 0x2, 0x6, 0x1, 0x6, 0x8, 0x8, 0x2, 0x1, 0x4u)[i]; }
      if (alpha < 111.5 / 255.0) { return array(0x2, 0x9, 0x4, 0x6, 0x9, 0x6, 0xa, 0x1, 0x6, 0x8, 0x4, 0x9, 0x9, 0x4, 0x9, 0x6u)[i]; }
      if (alpha < 127.5 / 255.0) { return array(0x1, 0x6, 0x9, 0x6, 0x6, 0x9, 0x6, 0x9, 0x9, 0x6, 0x1, 0x6, 0x6, 0x9, 0x6, 0x9u)[i]; }
      if (alpha < 143.5 / 255.0) { return array(0x6, 0x9, 0x6, 0x9, 0xd, 0x6, 0x9, 0x9, 0x6, 0x9, 0x6, 0xd, 0x9, 0x6, 0x9, 0x6u)[i]; }
      if (alpha < 159.5 / 255.0) { return array(0x7, 0x9, 0xe, 0x9, 0x9, 0x7, 0x9, 0x6, 0xe, 0x9, 0x7, 0x9, 0x9, 0x6, 0x9, 0x6u)[i]; }
      if (alpha < 175.5 / 255.0) { return array(0xe, 0x9, 0xe, 0x5, 0x7, 0xe, 0xd, 0xb, 0x6, 0x7, 0x9, 0xd, 0x9, 0xe, 0x7, 0xeu)[i]; }
      if (alpha < 191.5 / 255.0) { return array(0xb, 0x6, 0xd, 0x7, 0xe, 0xd, 0x7, 0xb, 0xd, 0x7, 0xb, 0xe, 0x7, 0xb, 0xe, 0xdu)[i]; }
      if (alpha < 207.5 / 255.0) { return array(0x7, 0xe, 0xf, 0xd, 0xb, 0x7, 0xd, 0xe, 0xe, 0xd, 0x7, 0xf, 0xf, 0xb, 0xe, 0x7u)[i]; }
      if (alpha < 223.5 / 255.0) { return array(0xd, 0xf, 0xf, 0xb, 0xf, 0x7, 0xe, 0xf, 0xf, 0xb, 0xf, 0xe, 0xe, 0xd, 0x7, 0xfu)[i]; }
      if (alpha < 239.5 / 255.0) { return array(0xf, 0xf, 0xf, 0xe, 0xf, 0xe, 0xf, 0xf, 0x7, 0xf, 0xf, 0xf, 0xf, 0xf, 0xd, 0xfu)[i]; }
      if (alpha < 254.5 / 255.0) { return array(0xf, 0xf, 0xf, 0xf, 0xf, 0xf, 0xf, 0xf, 0xf, 0xf, 0xb, 0xf, 0xf, 0xf, 0xf, 0xfu)[i]; }
      return 0xf;
    }
  `.trimEnd(),
  '(??) AMD Radeon PRO WX 3200': `\
    fn emulatedAlphaToCoverage(alpha: f32, xy: vec2u) -> u32 {
      let i = (xy.y % 2) * 2 + (xy.x % 2);
      // TODO: this is probably spaced very incorrectly
      if (alpha <  1 / 29.0) { return ${0b0000}; }
      if (alpha <  2 / 29.0) { return array(${0b0100}u, ${0b0000}, ${0b0000}, ${0b0000})[i]; }
      if (alpha <  3 / 29.0) { return array(${0b0010}u, ${0b0000}, ${0b0000}, ${0b0000})[i]; }
      if (alpha <  4 / 29.0) { return array(${0b0010}u, ${0b0000}, ${0b0000}, ${0b0100})[i]; }
      if (alpha <  5 / 29.0) { return array(${0b0001}u, ${0b0000}, ${0b0000}, ${0b0100})[i]; }
      if (alpha <  6 / 29.0) { return array(${0b0001}u, ${0b0100}, ${0b0000}, ${0b0100})[i]; }
      if (alpha <  7 / 29.0) { return array(${0b0001}u, ${0b0100}, ${0b0000}, ${0b0010})[i]; }
      if (alpha <  8 / 29.0) { return array(${0b0001}u, ${0b0100}, ${0b0100}, ${0b0010})[i]; }
      if (alpha <  9 / 29.0) { return array(${0b0101}u, ${0b0100}, ${0b0100}, ${0b0010})[i]; }
      if (alpha < 10 / 29.0) { return array(${0b0101}u, ${0b0010}, ${0b0100}, ${0b0010})[i]; }
      if (alpha < 11 / 29.0) { return array(${0b0101}u, ${0b0010}, ${0b0100}, ${0b0110})[i]; }
      if (alpha < 12 / 29.0) { return array(${0b0101}u, ${0b0010}, ${0b0100}, ${0b0101})[i]; }
      if (alpha < 13 / 29.0) { return array(${0b0101}u, ${0b0110}, ${0b0100}, ${0b0101})[i]; }
      if (alpha < 14 / 29.0) { return array(${0b0101}u, ${0b0110}, ${0b0010}, ${0b0101})[i]; }
      if (alpha < 15 / 29.0) { return array(${0b0101}u, ${0b0110}, ${0b0110}, ${0b0101})[i]; }
      if (alpha < 16 / 29.0) { return array(${0b1101}u, ${0b0110}, ${0b0110}, ${0b0101})[i]; }
      if (alpha < 17 / 29.0) { return array(${0b0111}u, ${0b0110}, ${0b0110}, ${0b0101})[i]; }
      if (alpha < 18 / 29.0) { return array(${0b0111}u, ${0b0110}, ${0b0110}, ${0b1101})[i]; }
      if (alpha < 19 / 29.0) { return array(${0b0111}u, ${0b0101}, ${0b0110}, ${0b1101})[i]; }
      if (alpha < 20 / 29.0) { return array(${0b0111}u, ${0b1101}, ${0b0110}, ${0b1101})[i]; }
      if (alpha < 21 / 29.0) { return array(${0b0111}u, ${0b1101}, ${0b0110}, ${0b0111})[i]; }
      if (alpha < 22 / 29.0) { return array(${0b0111}u, ${0b1101}, ${0b1110}, ${0b0111})[i]; }
      if (alpha < 23 / 29.0) { return array(${0b1111}u, ${0b1101}, ${0b1110}, ${0b0111})[i]; }
      if (alpha < 24 / 29.0) { return array(${0b1111}u, ${0b0111}, ${0b1110}, ${0b0111})[i]; }
      if (alpha < 25 / 29.0) { return array(${0b1111}u, ${0b0111}, ${0b1110}, ${0b1111})[i]; }
      if (alpha < 26 / 29.0) { return array(${0b1111}u, ${0b0111}, ${0b1101}, ${0b1111})[i]; }
      if (alpha < 27 / 29.0) { return array(${0b1111}u, ${0b1111}, ${0b1101}, ${0b1111})[i]; }
      if (alpha < 28 / 29.0) { return array(${0b1111}u, ${0b1111}, ${0b0111}, ${0b1111})[i]; }
      return ${0b1111};
    }
  `.trimEnd(),
};

export type DeviceName = keyof typeof kEmulatedAlphaToCoverage;

export const kEmulatedAlphaTest = `\
  fn emulatedAlphaToCoverage(alpha: f32, xy: vec2u) -> u32 {
    if (alpha < 0.5) { return 0; }
    return 0xf;
  }
`;
