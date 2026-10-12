// An album: everything the stage needs to show one, worked out from a seed and whatever the
// visitor has typed or dropped in over it.
import { rng, hash } from './rng.js';
import { nameAlbum, parseTracks } from './words.js';
import { seedPalette, imagePalette } from './palette.js';
import { pickStyle } from './art.js';
import { paintArt, paintFaces } from './faces.js';

// how each kind of disc is made up: where its print (or its grooves) begin and end, in millimetres
// from the centre, whether its middle is clear, and how dark a shadow it helps throw
export const KINDS = {
  print: { label: '은빛 인쇄', inner: 20, outer: 58, clearHub: true },
  holo: { label: '검은 홀로그램', inner: 16.2, outer: 59.1, clearHub: true },
  gold: { label: '금', inner: 20, outer: 58, clearHub: false },
  vinyl: { label: '바이닐', inner: 32, outer: 59.1, clearHub: false },
};

const coarse = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
export const SIZES = coarse ? { paper: 768, disc: 1024 } : { paper: 1024, disc: 1536 };

// input: { seed, title?, artist?, tracks? (text, a track a line), kind?, image? }
// last:  the album made before this one; its picture is kept if nothing it depends on has changed
export function makeAlbum(input, last) {
  const seed = String(input.seed);
  const words = nameAlbum(rng(seed, 'words'));
  const typed = (s) => (typeof s === 'string' && s.trim() ? s.trim() : null);
  const album = {
    seed,
    image: input.image || null,
    title: typed(input.title) || words.title,
    artist: typed(input.artist) || words.artist,
    tracks: typed(input.tracks) ? parseTracks(input.tracks, rng(seed, 'times')) : words.tracks,
    notes: words.notes,
    suggested: words, // what the seed came up with, for the editor to show as placeholders
    palette: input.image ? imagePalette(input.image) : seedPalette(rng(seed, 'palette')),
    style: pickStyle(rng(seed, 'style')),
    type: rng(seed, 'type').pick(['grotesk', 'grotesk', 'black', 'serif', 'mono', 'light']),
    kind: KINDS[input.kind] ? input.kind : rng(seed, 'kind').weighted({ print: 3, holo: 3, vinyl: 2, gold: 2 }),
    catalog: `OD-${String(hash(seed) % 10000).padStart(4, '0')}`,
  };
  if (!album.tracks.length) album.tracks = words.tracks;
  album.spec = KINDS[album.kind];
  // the picture is the slow part and depends only on the seed and the image
  album.art = last && last.seed === seed && last.image === album.image ? last.art : paintArt(album, SIZES.paper);
  album.faces = paintFaces(album, SIZES);
  return album;
}
