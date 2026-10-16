/**
 * 夜喵首页的内容与素材映射（单一数据源）
 *
 * - 素材路径集中在这里，页面不要各写一份。
 * - 咨询师、书中技能、快捷入口的文案来自 Figma 设计稿「首页 · 夜喵」。
 * - 这里的练习步骤、咨询师开场白都是本地内容，不依赖任何后端或 AI 接口。
 */

const assets = {
  hero: '/assets/home/night-bg.jpg',
  crescent: '/assets/home/icons/logo-crescent.png',
  flourish: '/assets/home/icons/flourish.png',
  sparkle: '/assets/home/icons/sparkle.png',
  settings: '/assets/home/icons/settings.png',
  counselorIcon: '/assets/home/icons/icon-counselor.png',
  bookIcon: '/assets/home/icons/icon-book.png',
  tryIcon: '/assets/home/icons/icon-try.png',
  chevron: '/assets/home/icons/icon-chevron.png',
  chipArrow: '/assets/home/icons/icon-chip-arrow.png',
  ctaArrow: '/assets/home/icons/icon-cta-arrow.png',
  composerIcon: '/assets/home/icons/icon-composer.png',
  sendIcon: '/assets/home/icons/icon-send.png'
};

/**
 * 咨询师卡片。avatar 用的是用户提供的三张原始插画（头像.png / 头像2.png / 头像3.png），
 * 按设计稿卡片比例（126×141）裁切，未替换人物。
 */
const counselors = [
  {
    id: 'empathy',
    name: '共情陪伴师',
    desc: '温柔倾听，陪你梳理情绪',
    tags: ['情绪', '安全感'],
    avatar: '/assets/home/avatar-empathy.jpg',
    prompt: '我在的，慢慢说就好。今天最让你难受的是什么？'
  },
  {
    id: 'cognitive',
    name: '认知重建师',
    desc: '帮你换个角度看问题',
    tags: ['焦虑', '压力'],
    avatar: '/assets/home/avatar-cognitive.jpg',
    prompt: '我们来拆一拆脑子里绕不过去的那件事，先从最让你紧绷的一句想法开始。'
  },
  {
    id: 'relation',
    name: '关系教练',
    desc: '帮你建立更健康的边界',
    tags: ['关系', '沟通'],
    avatar: '/assets/home/avatar-relation.jpg',
    prompt: '最近有哪段关系让你觉得累？我们先看看边界卡在哪里。'
  }
];

/**
 * 书中技能。封面来自用户提供的 山水.png / 书.png / 森林.png。
 * steps 是本地练习脚本，用于「开始练习」详情页。
 */
const books = [
  {
    id: 'courage',
    title: '被讨厌的勇气',
    desc: '学会课题分离，释放他人期待',
    cover: '/assets/home/cover-courage.jpg',
    summary: '把「别人的期待」和「自己的课题」分开，先从一件小事练习松手。',
    minutes: 5,
    steps: [
      { title: '写下此刻的期待', detail: '想一件最近让你有压力的事，写下「谁在期待我做什么」。' },
      { title: '划出课题边界', detail: '在那句话后面补一句：「这是谁的课题」。' },
      { title: '做一次小小松手', detail: '挑其中最小的一件事，今天先不替对方完成它。' }
    ],
    breathSeconds: 240
  },
  {
    id: 'mr-toad',
    title: '蛤蟆先生去看心理医生',
    desc: '认识情绪，照顾真实的自己',
    cover: '/assets/home/cover-toad.jpg',
    summary: '给情绪起个名字，再问它需要什么，而不是先批评自己。',
    minutes: 6,
    steps: [
      { title: '说出今天的情绪', detail: '用三个词描述今天，从最强烈的那个开始。' },
      { title: '给情绪找位置', detail: '感受它在身体的哪里，是紧、是沉，还是发烫。' },
      { title: '回应它的需要', detail: '写下此刻最想听到的一句话，自己对自己说一遍。' }
    ],
    breathSeconds: 300
  },
  {
    id: 'inferiority',
    title: '自卑与超越',
    desc: '接纳不完美的自己，走向成长',
    cover: '/assets/home/cover-inferiority.jpg',
    summary: '把「我不够好」改写成「我还在长」，用一次小行动代替自我攻击。',
    minutes: 7,
    steps: [
      { title: '找出那句评价', detail: '写出今天最常出现的那句自我评价。' },
      { title: '换成成长句式', detail: '把它改写为「我还在练习……」，只描述过程。' },
      { title: '安排一次小行动', detail: '选一件 10 分钟内能完成的事，做完就算过关。' }
    ],
    breathSeconds: 300
  }
];

/**
 * 「你可能想试试」快捷入口。每个入口对应 pages/topic 的一个本地引导脚本。
 */
const suggestions = [
  { id: 'exam', label: '考试焦虑', icon: '/assets/home/icons/icon-exam.png' },
  { id: 'thoughts', label: '睡前胡思乱想', icon: '/assets/home/icons/icon-thoughts.png' },
  { id: 'dorm', label: '宿舍难放松', icon: '/assets/home/icons/icon-dorm.png' }
];

/**
 * 快捷入口的本地引导内容。
 */
const topics = {
  exam: {
    id: 'exam',
    label: '考试焦虑',
    title: '考试焦虑',
    intro: '焦虑大多来自「还没发生」的那部分。先把身体放下来，再决定今晚做多少。',
    steps: [
      { title: '把担心写下来', detail: '写下三件最担心的事，写完就停在纸上，不继续推演。' },
      { title: '只留今晚能做的', detail: '从三件里挑出一件今晚能推进的，其余今天不再处理。' },
      { title: '给身体一个信号', detail: '做 4-7-8 呼吸 6 轮，让身体先知道现在安全。' }
    ],
    prompt: '最近考试让我有点焦虑，我想先慢下来。'
  },
  thoughts: {
    id: 'thoughts',
    label: '睡前胡思乱想',
    title: '睡前胡思乱想',
    intro: '睡前的念头不是问题，是它一直转个不停。给它们一个停放的地方。',
    steps: [
      { title: '设一个收尾时间', detail: '给今晚的思考定 5 分钟，时间到就停笔。' },
      { title: '把它们存放起来', detail: '每写一条都配上「明天几点处理」，交给明天的自己。' },
      { title: '回到身体感觉', detail: '把注意力放到呼吸和床垫的接触，做 4-7-8 呼吸。' }
    ],
    prompt: '到了晚上，我的脑子还是停不下来。'
  },
  dorm: {
    id: 'dorm',
    label: '宿舍难放松',
    title: '宿舍难放松',
    intro: '环境不安静的时候，可以先缩小自己的空间，而不是等环境变好。',
    steps: [
      { title: '缩小你的空间', detail: '戴上耳机或拉上帘子，把注意力收回到 1 平方米内。' },
      { title: '用声音盖住声音', detail: '播放雨声或湖水声，音量刚好盖住周围说话声。' },
      { title: '做一次身体扫描', detail: '从肩颈开始，把注意力一段一段往下移。' }
    ],
    prompt: '在宿舍里，我总是很难放松。'
  }
};

function findCounselor(id) {
  return counselors.find((item) => item.id === id) || null;
}

function findBook(id) {
  return books.find((item) => item.id === id) || null;
}

function findTopic(id) {
  return topics[id] || null;
}

module.exports = {
  assets,
  counselors,
  books,
  suggestions,
  topics,
  findCounselor,
  findBook,
  findTopic
};
