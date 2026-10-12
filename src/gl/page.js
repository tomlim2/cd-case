// The white page the case floats over, and the shadows on it.
//
// Nothing is rendered from the light. Each thing that casts a shadow is flat (the tray, the disc,
// the lid), so for a point on the page the ray toward the lamp crosses that thing's plane at a spot
// that is a fixed linear function of where the point is. The stage works that function out once a
// frame as a 3x3 matrix per caster; here it only has to be applied and the outline tested. The
// further the caster floats above the page, the softer its edge.

export const CASTERS = 6; // two cases on stage at most, three casters each: tray, disc, lid

export const PAGE_VERT = /* glsl */ `
  varying vec2 vAt;
  void main() {
    vec4 w = modelMatrix * vec4(position, 1.0);
    vAt = w.xy;
    gl_Position = projectionMatrix * viewMatrix * w;
  }
`;

export const PAGE_FRAG = /* glsl */ `
  uniform mat3 uCast[${CASTERS}];    // page (x, y, 1) -> (x, y) in the caster's plane, and the distance up to it
  uniform float uShow[${CASTERS}];   // 0 = not there, 1 = fully there
  uniform float uSize[${CASTERS}];   // the caster's scale
  uniform float uDisc[2];           // how dark each disc's shadow is
  varying vec2 vAt;

  float roundBox(vec2 p, float half_, float r) {
    vec2 q = abs(p) - half_ + r;
    return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
  }
  // 1 inside an outline whose signed distance is d, through a penumbra of half width s
  float cover(float d, float s) { return 1.0 - smoothstep(-s, s, d); }

  void main() {
    float lit = 1.0;
    for (int i = 0; i < ${CASTERS}; i++) {
      if (uShow[i] <= 0.0) continue;
      vec3 h = uCast[i] * vec3(vAt, 1.0);
      if (h.z <= 0.0) continue;
      float soft = (1.0 + h.z * 0.07) / uSize[i];
      int kind = i - (i / 3) * 3;
      float shade;
      if (kind == 1) {
        // the disc: a ring
        float r = length(h.xy);
        shade = uDisc[i / 3] * cover(r - 60.0, soft) * (1.0 - cover(r - 7.5, soft));
      } else {
        // clear plastic: barely there across the sheet, a little more under the thick rails
        float d = roundBox(h.xy, 73.0, 8.0);
        float rail = kind == 0 ? smoothstep(-13.0 - soft, -8.0 + soft, d) : smoothstep(-4.0 - soft, -1.0 + soft, d);
        vec2 tone = kind == 0 ? vec2(0.025, 0.09) : vec2(0.035, 0.055);
        shade = cover(d, soft) * (tone.x + tone.y * rail);
      }
      lit *= 1.0 - shade * uShow[i];
    }
    // alpha -1 marks bare page (see the rod shader)
    gl_FragColor = vec4(vec3(lit), -1.0);
  }
`;
