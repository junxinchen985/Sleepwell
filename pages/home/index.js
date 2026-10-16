const content = require('../../data/nightcat-content');
const selection = require('../../services/counselor-selection');
const { getNavigationMetrics } = require('../../utils/layout');

const BRAND_TOP_DESIGN_PX = 45; // 设计稿里「夜喵」距屏幕顶部的距离
const MAX_MESSAGE_LENGTH = 200;

Page({
  data: {
    assets: content.assets,
    counselors: content.counselors,
    books: content.books,
    suggestions: content.suggestions,
    selectedId: selection.DEFAULT_ID,
    draft: '',
    heroFailed: false,
    brandTop: 49
  },

  onLoad() {
    this.submitting = false;
    this.setData({
      selectedId: selection.read(),
      brandTop: this.computeBrandTop()
    });
  },

  onShow() {
    this.setData({ selectedId: selection.read() });
  },

  /**
   * 主标题顶部：设计稿是 45px，但真机上不能压到系统状态栏，
   * 取「设计稿位置」和「状态栏下方」里更大的那个。
   */
  computeBrandTop() {
    const nav = getNavigationMetrics();
    let windowWidth = 375;
    try {
      const info = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
      windowWidth = info.windowWidth || info.screenWidth || windowWidth;
    } catch (error) {}
    const designTop = Math.round((BRAND_TOP_DESIGN_PX * windowWidth) / 390);
    return Math.max(designTop, Math.round(nav.statusBarHeight + 2));
  },

  onHeroError() {
    this.setData({ heroFailed: true });
  },

  selectCounselor(event) {
    const id = event.currentTarget.dataset.id;
    if (!content.findCounselor(id)) return;
    if (id === this.data.selectedId) {
      this.startCounselorChat(id);
      return;
    }
    this.setData({ selectedId: selection.save(id) });
  },

  startCounselorChat(id) {
    const counselor = content.findCounselor(id);
    if (!counselor) return;
    wx.navigateTo({ url: `/pages/agent/index?prompt=${encodeURIComponent(counselor.prompt)}` });
  },

  openCounselors() {
    wx.navigateTo({ url: `/pages/counselors/index?id=${this.data.selectedId}` });
  },

  openSkills() {
    wx.navigateTo({ url: '/pages/skills/index' });
  },

  openSkill(event) {
    const id = event.currentTarget.dataset.id;
    if (!content.findBook(id)) return;
    wx.navigateTo({ url: `/pages/skill-detail/index?id=${id}` });
  },

  openTopic(event) {
    const id = event.currentTarget.dataset.id;
    if (!content.findTopic(id)) return;
    wx.navigateTo({ url: `/pages/topic/index?id=${id}` });
  },

  openSettings() {
    wx.navigateTo({ url: '/pages/night-settings/index' });
  },

  onDraftInput(event) {
    this.setData({ draft: event.detail.value });
  },

  /**
   * 发送：本地没有接入 AI 服务，这里把内容带进夜喵对话页，
   * 由该页已有的本地引导脚本给出回复，不做任何伪造的服务端成功。
   */
  onSend() {
    const text = (this.data.draft || '').trim();
    if (!text) {
      wx.showToast({ title: '说点什么再发送', icon: 'none' });
      return;
    }
    if (this.submitting) return;
    this.submitting = true;
    this.setData({ draft: '' });
    wx.navigateTo({
      url: `/pages/agent/index?draft=${encodeURIComponent(text.slice(0, MAX_MESSAGE_LENGTH))}`,
      complete: () => { this.submitting = false; }
    });
  }
});
