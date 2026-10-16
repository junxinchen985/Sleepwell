const navigation = require('../../utils/navigation');
const { getNavigationMetrics } = require('../../utils/layout');
const nightPreferences = require('../../services/night-preferences');
const guide = require('../../utils/agent-guide');

Page({
  data: {
    nav: getNavigationMetrics(),
    topics: [
      { id: 'exam', label: '考试焦虑', icon: 'graduation-cap', prompt: '最近考试让我有点焦虑。' },
      { id: 'research', label: '论文 / 科研压力', icon: 'file-text', prompt: '论文和科研的压力让我难以放松。' },
      { id: 'dorm', label: '宿舍难以放松', icon: 'bed-double', prompt: '在宿舍里，我总是很难放松。' },
      { id: 'thoughts', label: '脑子停不下来', icon: 'brain', prompt: '到了晚上，我的脑子还是停不下来。' }
    ],
    showChat: false,
    homeState: 'initial', messages: [], answers: [], recommendation: null, activeTopic: '', scrollAnchor: '',
    showRecords: false,
    draft: '',
    canSend: false,
    message: '',
    chatState: 'idle',
    recording: false,
    voiceReady: false,
    keyboardHeight: 0,
    inputFocus: false,
    recentSessions: [],
    totalBreaths: 0,
    sevenDay: { activeDays: 0, completedSessions: 0, outcomes: { relieved: 0, same: 0, tense: 0 } }
  },
  onLoad(options) {
    if (!options || (!options.prompt && !options.draft)) {
      wx.reLaunch({ url: '/pages/home/index' });
      return;
    }
    this.recorder = wx.getRecorderManager ? wx.getRecorderManager() : null;
    if (this.recorder && this.recorder.onStop) this.recorder.onStop((result) => this.setData({ recording: false, voiceReady: Boolean(result && result.tempFilePath) }));
    this.keyboardListener = (event) => {
      this.setData({ keyboardHeight: this.data.showChat ? Math.max(0, event.height || 0) : 0 });
    };
    if (wx.onKeyboardHeightChange) wx.onKeyboardHeightChange(this.keyboardListener);
    if (options.prompt) {
      this.beginConversation('', this.decodeEntryParam(options.prompt).slice(0, 120));
    } else if (options.draft) {
      const draft = this.decodeEntryParam(options.draft).slice(0, 200);
      this.beginConversation('');
      this.setData({ draft, canSend: Boolean(draft) });
      this.sendMessage();
    }
  },
  decodeEntryParam(value) {
    try { return decodeURIComponent(value); }
    catch (error) { return String(value); }
  },
  onShow() {
    const preferences = nightPreferences.read();
    this.setData({ nav: getNavigationMetrics(), preferences, welcomeQuestion: preferences.question, displayMode: preferences.display, fontMode: preferences.fontSize });
    wx.showShareMenu({ menus: ['shareAppMessage', 'shareTimeline'] });
  },
  onHide() {
    this.cancelPending();
    this.setData({ inputFocus: false, keyboardHeight: 0 });
  },
  onUnload() {
    this.cancelPending();
    if (wx.offKeyboardHeightChange && this.keyboardListener) wx.offKeyboardHeightChange(this.keyboardListener);
  },
  onShareAppMessage() { return { title: '夜喵，你的 AI 睡前陪伴助手', path: '/pages/home/index' }; },
  onShareTimeline() { return { title: '夜喵，你的 AI 睡前陪伴助手' }; },
  noop() {},
  openSettings() { wx.navigateTo({ url: '/pages/night-settings/index' }); },
  goBreathe() { wx.reLaunch({ url: '/pages/breathe/index' }); },
  startGuide() { wx.navigateTo({ url: '/pages/focus/index' }); },
  goPage(event) {
    this.setData({ showRecords: false });
    wx.navigateTo({ url: event.currentTarget.dataset.url });
  },
  openRecords() { wx.reLaunch({ url: '/pages/record/index' }); },
  closeRecords() { this.setData({ showRecords: false }); },
  openChat() { if (this.data.homeState === 'initial') this.beginConversation(''); this.setData({ inputFocus: true }); },
  beginConversation(topic, openingText) {
    this.setData({ homeState: 'chat', showChat: true, activeTopic: topic, answers: [], recommendation: null, messages: [{ id: 'intro', role: 'agent', text: openingText || guide.openings[topic] || this.data.welcomeQuestion || '今晚有什么让你难以放松？' }], draft: '', canSend: false, inputFocus: false, scrollAnchor: 'conversation-end' });
  },
  playRecommendation() {
    const item = this.data.recommendation;
    if (item) wx.navigateTo({ url: `/pages/sound/index?sound=${item.sound}&minutes=${item.minutes}` });
  },
  openChatSettings() { wx.navigateTo({ url: '/pages/night-settings/index?from=chat' }); },
  startVoice() {
    if (!this.recorder || this.data.recording) return;
    this.setData({ recording: true, voiceReady: false });
    try { this.recorder.start({ format: 'mp3', duration: 60000 }); } catch (error) { this.setData({ recording: false }); }
  },
  stopVoice() { if (this.recorder && this.data.recording) this.recorder.stop(); },
  cancelVoice() { if (this.recorder && this.data.recording) this.recorder.stop(); this.setData({ recording: false, voiceReady: false }); },
  chooseTopic(event) {
    const topic = this.data.topics.find((item) => item.id === event.currentTarget.dataset.id);
    if (!topic) return;
    this.beginConversation(topic.id);
  },
  closeChat() {
    this.cancelPending();
    if (wx.hideKeyboard) wx.hideKeyboard();
    this.setData({ homeState: 'initial', showChat: false, messages: [], answers: [], recommendation: null, draft: '', canSend: false, inputFocus: false, keyboardHeight: 0 });
    wx.reLaunch({ url: '/pages/home/index' });
  },
  onDraftChange(event) { this.setData({ draft: event.detail.value, canSend: Boolean(event.detail.value.trim()) }); },
  onInputFocus() { this.setData({ inputFocus: true }); },
  onInputBlur() { this.setData({ inputFocus: false }); },
  cancelPending() {
    clearTimeout(this.previewTimer);
    if (this.data.chatState === 'sending') this.setData({ chatState: 'error' });
  },
  sendMessage() {
    const message = this.data.draft.trim();
    if (!message || this.data.chatState === 'sending') return;
    const answers = this.data.answers.concat(message);
    const result = guide.next(this.data.activeTopic, answers);
    const messages = this.data.messages.concat([{ id: `user-${answers.length}`, role: 'user', text: message }, { id: `agent-${answers.length}`, role: 'agent', text: result.reply }]);
    this.setData({ message, answers, messages, recommendation: result.recommendation || null, homeState: result.recommendation ? 'recommendation' : 'chat', draft: '', canSend: false, chatState: 'idle', inputFocus: false, scrollAnchor: '' });
    this.setData({ scrollAnchor: 'conversation-end' });
    if (wx.hideKeyboard) wx.hideKeyboard();
  },
  retryMessage() {
    if (!this.data.message || this.data.chatState === 'sending') return;
    this.setData({ chatState: 'sending' });
    this.showConnectionState();
  },
  showConnectionState() {
    clearTimeout(this.previewTimer);
    // The UI preview has no Agent transport yet; never invent an AI response.
    this.previewTimer = setTimeout(() => this.setData({ chatState: 'error' }), 700);
  }
});
