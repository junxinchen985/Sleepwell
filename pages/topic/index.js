const content = require('../../data/nightcat-content');
const navigation = require('../../utils/navigation');
const { getNavigationMetrics } = require('../../utils/layout');

Page({
  data: {
    nav: getNavigationMetrics(),
    topic: null
  },

  onLoad(options) {
    const topic = content.findTopic(options && options.id) || content.topics.exam;
    this.setData({ topic });
  },

  onShow() {
    this.setData({ nav: getNavigationMetrics() });
  },

  goBack() {
    navigation.backOrHome();
  },

  startBreath() {
    wx.reLaunch({ url: '/pages/breathe/index' });
  },

  talkToNightcat() {
    const topic = this.data.topic;
    if (!topic) return;
    wx.navigateTo({ url: `/pages/agent/index?prompt=${encodeURIComponent(topic.prompt)}` });
  }
});
