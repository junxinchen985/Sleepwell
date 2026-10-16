const WORLDS = [
  { id: 'dandelion', name: '蒲公英', glyph: '✣', accent: '#d8e8cf' },
  { id: 'mist', name: '月光涟漪', glyph: '≋', accent: '#c9ded9' },
  { id: 'moon', name: '薰衣草花海', glyph: '✿', accent: '#ddc7f0' },
  { id: 'water', name: '云', glyph: '⌁', accent: '#a9d2ce', page: '/pages/cloud/index' },
  { id: 'stardust', name: '星空海', glyph: '✦', accent: '#d6d8c8' },
  { id: 'firefly', name: '萤火虫', glyph: '·', accent: '#dce89b', page: '/pages/breath-firefly/index' },
  { id: 'warmLight', name: '鲸鱼', glyph: '☼', accent: '#f2c99f', page: '/pages/whale/index' },
  { id: 'orb', name: '呼吸光团', glyph: '●', accent: '#c6e0d4', page: '/pages/breath-orb/index' }
];

const RHYTHMS = [
  { id: '478', name: '深缓 4-7-8', inhale: 4, hold: 7, exhale: 8 },
  { id: 'soothe', name: '舒缓', inhale: 4, hold: 0, exhale: 6 },
  { id: 'balance', name: '平衡', inhale: 4, exhale: 4 },
  { id: 'stretch', name: '舒展', inhale: 5, exhale: 7 }
];

const BODY_PARTS = [
  { id: 'head', name: '头', x: 50, y: 13 },
  { id: 'neck', name: '颈', x: 50, y: 24 },
  { id: 'shoulder', name: '肩', x: 50, y: 31 },
  { id: 'chest', name: '胸', x: 50, y: 40 },
  { id: 'abdomen', name: '腹', x: 50, y: 52 },
  { id: 'back', name: '腰', x: 50, y: 61 },
  { id: 'leg', name: '腿', x: 50, y: 76 },
  { id: 'wholeBody', name: '全身', x: 50, y: 48 }
];

const CARE_MESSAGES = [
  '不用赶它走。',
  '给这里多一点空间。',
  '允许它先待在这里。',
  '不舒服也可以。',
  '只是陪它一会儿。',
  '这里只需要注意到，不需要解释。',
  '呼吸没有变慢，也没关系。'
];

const DEFAULT_SETTINGS = {
  world: 'dandelion',
  rhythm: '478',
  inhaleSeconds: 4,
  holdSeconds: 7,
  exhaleSeconds: 8,
  targetCycles: 6,
  sound: 'breeze',
  soundEnabled: false,
  soundVolume: 0.42,
  soundTimerMinutes: 30,
  onboardingSeen: false,
  breathPatternVersion: 2,
  hapticEnabled: true,
  endSoundEnabled: false
};

module.exports = {
  WORLDS,
  RHYTHMS,
  BODY_PARTS,
  CARE_MESSAGES,
  DEFAULT_SETTINGS
};
