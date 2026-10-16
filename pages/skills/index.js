const content = require('../../data/nightcat-content');
const navigation = require('../../utils/navigation');
const { getNavigationMetrics } = require('../../utils/layout');

Page({
  data: {
    nav: getNavigationMetrics(),
    assets: content.assets,
    books: content.books
  },

  onShow() {
    this.setData({ nav: getNavigationMetrics() });
  },

  goBack() {
    navigation.backOrHome();
  },

  openSkill(event) {
    const id = event.currentTarget.dataset.id;
    if (!content.findBook(id)) return;
    wx.navigateTo({ url: `/pages/skill-detail/index?id=${id}` });
  }
});
