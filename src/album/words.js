// Names for albums that do not exist: a title, who made it, what is on it, and a few lines of
// liner notes. Mostly Korean, sometimes English.

const KO = {
  mood: ['새벽 세 시의', '한낮의', '늦여름', '투명한', '느린', '젖은', '먼', '낮은', '푸른', '은빛', '마지막', '작은', '조용한', '기울어진', '반짝이는', '오래된', '가벼운', '미지근한', '눅눅한', '희미한', '둥근', '어제의'],
  thing: ['굴절', '여름', '빈방', '거울', '주파수', '테이프', '정원', '바다', '신호', '파도', '오후', '도시', '먼지', '온도', '궤도', '잔상', '필름', '유리', '회전', '기억', '소음', '안부', '그림자', '햇빛', '창문', '계절', '버스', '골목', '수영장', '옥상', '우산', '편지'],
  band: ['클럽', '악단', '연구회', '상회', '전파사', '세탁소', '사서함', '우체국', '합주단', '사진관', '다방', '동호회'],
  solo: ['김굴절', '유리서랍', '낮잠', '반사광', '초록불', '모서리', '천천히', '이층', '물그림자', '여백'],
  tail: ['(간주)', '(다시)', '(데모)', '2', '(밤 버전)'],
  notes: [
    '이 음반에는 소리가 없다. 대신 조명 네 개와 투명한 플라스틱이 있다.',
    '디스크의 무지개는 1.6마이크론 간격의 트랙이 빛을 갈라서 생긴다.',
    '녹음실은 빌리지 않았다. 케이스를 기울이면 그게 연주다.',
    '좋은 스피커가 없어도 괜찮다. 어차피 눈으로 듣는 음반이다.',
    '모든 곡은 한 번에, 한 프레임에 녹음되었다.',
    '뚜껑을 여는 소리는 각자 상상하기로 한다.',
    '케이스에 난 흠집은 전부 빛이 만든 것이다.',
    '재생 시간은 화면을 보고 있는 만큼이다.',
  ],
};

const EN = {
  mood: ['Soft', 'Slow', 'Clear', 'Pale', 'Late', 'Quiet', 'Plastic', 'Silver', 'Warm', 'Distant', 'Tiny', 'Liquid', 'Glass', 'Hollow', 'Bright', 'Half', 'Second'],
  thing: ['Machines', 'Mirrors', 'Hours', 'Signals', 'Rooms', 'Tapes', 'Summers', 'Orbits', 'Static', 'Gardens', 'Echoes', 'Weather', 'Pools', 'Windows', 'Dust', 'Stairs', 'Lamps', 'Rivers'],
  band: ['Club', 'Ensemble', 'Society', 'Unit', 'Trio', 'Service', 'Bureau', 'Exchange'],
  solo: ['Refraction Kim', 'Glass Drawer', 'Nap', 'Low Sun', 'Greenlight', 'Corner', 'Second Floor'],
  tail: ['(Interlude)', '(Reprise)', '(Demo)', 'Pt. II', '(Night Version)'],
  notes: [
    'There is no sound on this record. There are four lamps and some clear plastic instead.',
    'The rainbow on the disc is its track, 1.6 microns a turn, pulling the light apart.',
    'No studio was booked. Tilting the case is the performance.',
    'You do not need good speakers. This one is listened to with the eyes.',
    'Every track was recorded in one take, in one frame.',
    'The sound of the lid opening is left to the listener.',
    'All scratches on the case are made of light.',
    'Running time: for as long as you keep looking.',
  ],
};

// 은/는, 와/과: which one a Korean word takes depends on whether it ends in a consonant
const closed = (word) => {
  const code = word.codePointAt(word.length - 1) - 0xac00;
  return code >= 0 && code <= 11171 && code % 28 !== 0;
};
const and = (word) => word + (closed(word) ? '과' : '와');

function titleKo(R) {
  const m = () => R.pick(KO.mood);
  const t = () => R.pick(KO.thing);
  return R.pick([
    () => `${m()} ${t()}`,
    () => `${m()} ${t()}`,
    () => `${t()}의 ${t()}`,
    () => `${and(t())} ${t()}`,
    () => `${m()} ${t()}의 ${t()}`,
    () => `${t()}, ${t()}`,
    () => `${t()} 제${R.int(8) + 2}번`,
  ])();
}
function titleEn(R) {
  const m = () => R.pick(EN.mood);
  const t = () => R.pick(EN.thing);
  return R.pick([
    () => `${m()} ${t()}`,
    () => `${m()} ${t()}`,
    () => `The ${t().replace(/s$/, '')} Tapes`,
    () => `${t()} & ${t()}`,
    () => `Songs for ${m()} ${t()}`,
    () => `${m()} ${t()}, Vol. ${R.int(3) + 2}`,
  ])();
}

const clock = (sec) => `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;

export function nameAlbum(R) {
  const ko = R.chance(0.68);
  const bank = ko ? KO : EN;
  const title = ko ? titleKo(R) : titleEn(R);
  const artist = R.chance(0.38) ? R.pick(bank.solo) : ko ? `${R.pick(KO.thing)} ${R.pick(KO.band)}` : `${R.pick(EN.mood)} ${R.pick(EN.thing).replace(/s$/, '')} ${R.pick(EN.band)}`;
  const count = 6 + R.int(6);
  const seen = new Set();
  const tracks = [];
  while (tracks.length < count) {
    let name = ko ? titleKo(R) : titleEn(R);
    if (seen.has(name)) continue;
    seen.add(name);
    if (tracks.length > 1 && R.chance(0.14)) name += ` ${R.pick(bank.tail)}`;
    const first = tracks.length === 0;
    tracks.push({ name, time: clock(first && R.chance(0.5) ? 48 + R.int(60) : 110 + R.int(260)) });
  }
  return { ko, title, artist, tracks, notes: R.shuffle(bank.notes).slice(0, 3) };
}

// "3:42" back to seconds, and a list of tracks to a total
export function total(tracks) {
  const sec = tracks.reduce((sum, t) => {
    const [m, s] = String(t.time || '0:00').split(':').map(Number);
    return sum + (m || 0) * 60 + (s || 0);
  }, 0);
  return clock(sec);
}

// what the editor's text box holds, turned into tracks: one name per line, with an optional time
// at the end ("바다 3:20"); lines without one are given a time by the seed
export function parseTracks(text, R) {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 14)
    .map((line) => {
      const m = line.match(/^(.*?)[\s·-]+(\d{1,2}:\d{2})$/);
      return m ? { name: m[1].trim(), time: m[2] } : { name: line, time: clock(110 + R.int(260)) };
    });
}
