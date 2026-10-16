const content = require('../../data/nightcat-content');
const selection = require('../../services/counselor-selection');
const navigation = require('../../utils/navigation');
const { getNavigationMetrics } = require('../../utils/layout');

Page({
  data: {
    nav: getNavigationMetrics(),
    counselors: content.counselors,
    selectedId: selection.DEFAULT_ID
  },

  onLoad(options) {
    const fromQuery = options && options.id;
    this.setData({
      selectedId: content.findCounselor(fromQuery) ? fromQuery : selection.read()
    });
  },

  onShow() {
    this.setData({ nav: getNavigationMetrics() });
  },

  goBack() {
    navigation.backOrHome();
  },

  choose(event) {
    const id = event.currentTarget.dataset.id;
    const counselor = content.findCounselor(id);
    if (!counselor) return;
    this.setData({ selectedId: selection.save(id) });
    wx.navigateTo({ url: `/pages/agent/index?prompt=${encodeURIComponent(counselor.prompt)}` });
  }
});
