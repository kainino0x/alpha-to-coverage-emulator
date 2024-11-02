/**
 * For each device name, provides the source for a WGSL function which emulates
 * the alpha-to-coverage algorithm of that device by mapping (alpha, x, y) to
 * a sample mask.
 */
export const kEmulatedAlphaToCoverage = {
  'Apple M1 Pro': `\
    fn emulatedAlphaToCoverage(alpha: f32, xy: vec2u) -> u32 {
      let i = (xy.y % 2) * 2 + (xy.x % 2);
      if (alpha <   7.5 / 255.0) { return ${0b0000}; }
      if (alpha <  23.5 / 255.0) { return array(${0b0001}u, ${0b0000}, ${0b0000}, ${0b0000})[i]; }
      if (alpha <  39.5 / 255.0) { return array(${0b0001}u, ${0b0000}, ${0b0000}, ${0b0001})[i]; }
      if (alpha <  55.5 / 255.0) { return array(${0b0001}u, ${0b0001}, ${0b0000}, ${0b0001})[i]; }
      if (alpha <  71.5 / 255.0) { return array(${0b0001}u, ${0b0001}, ${0b0001}, ${0b0001})[i]; }
      if (alpha <  87.5 / 255.0) { return array(${0b1001}u, ${0b0001}, ${0b0001}, ${0b0001})[i]; }
      if (alpha < 103.5 / 255.0) { return array(${0b1001}u, ${0b0001}, ${0b0001}, ${0b1001})[i]; }
      if (alpha < 119.5 / 255.0) { return array(${0b1001}u, ${0b1001}, ${0b0001}, ${0b1001})[i]; }
      if (alpha < 135.5 / 255.0) { return array(${0b1001}u, ${0b1001}, ${0b1001}, ${0b1001})[i]; }
      if (alpha < 151.5 / 255.0) { return array(${0b1011}u, ${0b1001}, ${0b1001}, ${0b1001})[i]; }
      if (alpha < 167.5 / 255.0) { return array(${0b1011}u, ${0b1001}, ${0b1001}, ${0b1011})[i]; }
      if (alpha < 183.5 / 255.0) { return array(${0b1011}u, ${0b1011}, ${0b1001}, ${0b1011})[i]; }
      if (alpha < 199.5 / 255.0) { return array(${0b1011}u, ${0b1011}, ${0b1011}, ${0b1011})[i]; }
      if (alpha < 215.5 / 255.0) { return array(${0b1111}u, ${0b1011}, ${0b1011}, ${0b1011})[i]; }
      if (alpha < 231.5 / 255.0) { return array(${0b1111}u, ${0b1011}, ${0b1011}, ${0b1111})[i]; }
      if (alpha < 247.5 / 255.0) { return array(${0b1111}u, ${0b1111}, ${0b1011}, ${0b1111})[i]; }
      return ${0b1111};
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
      if (alpha <   8 / 256.0) { return ${0b0000}; }
      if (alpha <  24 / 256.0) { return array(${0b0000}u, ${0b1000}, ${0b0000}, ${0b0000})[i]; }
      if (alpha <  40 / 256.0) { return array(${0b0001}u, ${0b1000}, ${0b0000}, ${0b0000})[i]; }
      if (alpha <  56 / 256.0) { return array(${0b0001}u, ${0b1000}, ${0b0000}, ${0b0001})[i]; }
      if (alpha <  72 / 256.0) { return array(${0b0001}u, ${0b1000}, ${0b1000}, ${0b0001})[i]; }
      if (alpha <  88 / 256.0) { return array(${0b0001}u, ${0b1010}, ${0b1000}, ${0b0001})[i]; }
      if (alpha < 104 / 256.0) { return array(${0b0101}u, ${0b1010}, ${0b1000}, ${0b0001})[i]; }
      if (alpha < 120 / 256.0) { return array(${0b0101}u, ${0b1010}, ${0b1000}, ${0b0101})[i]; }
      if (alpha < 136 / 256.0) { return array(${0b0101}u, ${0b1010}, ${0b1010}, ${0b0101})[i]; }
      if (alpha < 152 / 256.0) { return array(${0b0101}u, ${0b1110}, ${0b1010}, ${0b0101})[i]; }
      if (alpha < 168 / 256.0) { return array(${0b0111}u, ${0b1110}, ${0b1010}, ${0b0101})[i]; }
      if (alpha < 184 / 256.0) { return array(${0b0111}u, ${0b1110}, ${0b1010}, ${0b0111})[i]; }
      if (alpha < 200 / 256.0) { return array(${0b0111}u, ${0b1110}, ${0b1110}, ${0b0111})[i]; }
      if (alpha < 216 / 256.0) { return array(${0b0111}u, ${0b1111}, ${0b1110}, ${0b0111})[i]; }
      if (alpha < 232 / 256.0) { return array(${0b1111}u, ${0b1111}, ${0b1110}, ${0b0111})[i]; }
      if (alpha < 248 / 256.0) { return array(${0b1111}u, ${0b1111}, ${0b1110}, ${0b1111})[i]; }
      return ${0b1111};
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
