const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const navigation = require('../utils/navigation');
const { getRecordView } = require('../utils/record-view');

function harness(options = { prompt: '测试开场白' }) {
  let page;
  let timer;
  let keyboardListener;
  const routes = [];
  const wx = {
    getWindowInfo: () => ({ windowWidth: 375, statusBarHeight: 24 }),
    getMenuButtonBoundingClientRect: () => ({ top: 32, bottom: 64, left: 279 }),
    getStorageSync: () => [],
    showShareMenu() {}, hideKeyboard() {},
    onKeyboardHeightChange: (fn) => { keyboardListener = fn; },
    offKeyboardHeightChange: (fn) => { assert.equal(fn, keyboardListener); keyboardListener = null; },
    navigateTo: ({ url }) => routes.push(url), reLaunch: ({ url }) => routes.push(url)
  };
  const script = path.resolve(__dirname, '../pages/agent/index.js');
  const context = {
    wx,
    Page: (definition) => { page = definition; },
    require: (name) => require(path.resolve(path.dirname(script), name)),
    setTimeout: (fn) => { timer = fn; return 1; },
    clearTimeout: () => { timer = null; }
  };
  vm.runInNewContext(fs.readFileSync(script, 'utf8'), context);
  page.setData = (values) => Object.assign(page.data, values);
  page.onLoad(options);
  return { page, routes, finish: () => { const fn = timer; timer = null; if (fn) fn(); }, keyboard: (height) => keyboardListener({ height }), hasListener: () => Boolean(keyboardListener) };
}

test('new launch and fallback route use the Nightcat homepage', () => {
  const config = require('../app.json');
  assert.equal(config.pages[0], 'pages/home/index');
  const routes = [];
  global.wx = { reLaunch: ({ url }) => routes.push(url), navigateBack: () => routes.push('back') };
  global.getCurrentPages = () => [{}];
  navigation.backOrHome();
  global.getCurrentPages = () => [{}, {}];
  navigation.backOrHome();
  assert.deepEqual(routes, ['/pages/home/index', 'back']);
  delete global.wx;
  delete global.getCurrentPages;
});

test('each topic opens chat with its own draft, and an unknown topic is ignored', () => {
  const { page } = harness();
  for (const topic of page.data.topics) {
    page.chooseTopic({ currentTarget: { dataset: { id: topic.id } } });
    assert.equal(page.data.activeTopic, topic.id);
    assert.equal(page.data.messages.length, 1);
    assert.equal(page.data.showChat, true);
    assert.equal(page.data.canSend, false);
  }
  const draft = page.data.draft;
  page.chooseTopic({ currentTarget: { dataset: { id: 'unknown' } } });
  assert.equal(page.data.draft, draft);
});

test('chat rejects blank input, prevents duplicate sends and retains message on retry', () => {
  const { page, finish } = harness();
  page.onDraftChange({ detail: { value: '   ' } });
  page.sendMessage();
  assert.equal(page.data.chatState, 'idle');
  assert.equal(page.data.canSend, false);
  page.onDraftChange({ detail: { value: ' 最近睡不着 ' } });
  page.sendMessage();
  assert.equal(page.data.message, '最近睡不着');
  assert.equal(page.data.chatState, 'idle');
  page.sendMessage();
  finish();
  assert.equal(page.data.chatState, 'idle');
  assert.equal(page.data.message, '最近睡不着');
  page.onDraftChange({ detail: { value: '想安静休息，听雨声' } });
  page.sendMessage();
  assert.equal(page.data.homeState, 'recommendation');
  assert.equal(page.data.recommendation.sound, 'rain');
  finish();
  assert.equal(page.data.answers.length, 2);
});

test('chat manages keyboard inset and cancels pending work when hidden or unloaded', () => {
  const { page, keyboard, finish, hasListener } = harness();
  page.openChat();
  keyboard(300);
  assert.equal(page.data.keyboardHeight, 300);
  page.onDraftChange({ detail: { value: '考试焦虑' } });
  page.sendMessage();
  page.closeChat();
  assert.equal(page.data.keyboardHeight, 0);
  assert.equal(page.data.chatState, 'idle');
  finish();
  assert.equal(page.data.showChat, false);
  page.openChat();
  keyboard(280);
  page.onHide();
  assert.equal(page.data.keyboardHeight, 0);
  assert.equal(page.data.inputFocus, false);
  page.onUnload();
  assert.equal(hasListener(), false);
});

test('homepage actions target existing settings, breath and guide pages', () => {
  const { page, routes } = harness();
  page.openSettings(); page.goBreathe(); page.startGuide();
  assert.deepEqual(routes, ['/pages/night-settings/index', '/pages/breathe/index', '/pages/focus/index']);
  assert.equal(page.onShareAppMessage().path, '/pages/home/index');
});

test('record navigation opens the standalone calendar page', () => {
  const { page, routes } = harness();
  page.openRecords();
  assert.deepEqual(routes, ['/pages/record/index']);
  assert.equal(page.data.showRecords, false);
});

test('legacy homepage links redirect to the new homepage', () => {
  const { routes } = harness({});
  assert.deepEqual(routes, ['/pages/home/index']);
});

test('homepage counselor prompt uses the original chat page', () => {
  const { page, routes } = harness({ prompt: encodeURIComponent('今晚慢慢聊') });
  assert.equal(page.data.messages[0].text, '今晚慢慢聊');
  assert.equal(page.data.showChat, true);
  assert.deepEqual(routes, []);
  page.closeChat();
  assert.deepEqual(routes, ['/pages/home/index']);
});

test('homepage draft sends once using existing guide logic', () => {
  const { page, routes } = harness({ draft: encodeURIComponent('最近睡不着') });
  assert.equal(page.data.answers.length, 1);
  assert.equal(page.data.answers[0], '最近睡不着');
  assert.equal(page.data.draft, '');
  assert.equal(page.data.canSend, false);
  page.sendMessage();
  assert.equal(page.data.answers.length, 1);
  assert.deepEqual(routes, []);
});

test('record views share stored data and normalize legacy cycle counts', () => {
  global.wx = { getStorageSync: () => [{ id: 'a', startedAt: Date.now(), cycles: '3' }, { id: 'b', cycles: 2 }] };
  const view = getRecordView();
  assert.equal(view.totalBreaths, 5);
  assert.equal(view.recentSessions[0].cycles, 3);
  assert.equal(view.recentSessions[1].time, '时间未记录');
  delete global.wx;
});
