const navigation = require('./navigation');
const { getNavigationMetrics } = require('./layout');

function getLayoutStyles() {
  const nav = getNavigationMetrics();
  return {
    topStyle: `height:${Math.max(88, nav.navigationBottom)}px;`,
    rightStyle: `right:${Math.max(24, nav.rightInset)}px;`
  };
}

function run(action) {
  if (action === 'exit') {
    navigation.exitMiniProgram();
    return;
  }
  if (action === 'settings') {
    wx.navigateTo({ url: '/pages/settings/index' });
    return;
  }
  if (action === 'focus') {
    wx.navigateTo({ url: '/pages/focus/index' });
    return;
  }
  if (action === 'body') {
    wx.navigateTo({ url: '/pages/body/index' });
    return;
  }
  if (action === 'world') {
    wx.reLaunch({ url: '/pages/breathe/index' });
    return;
  }
  if (action === 'records') {
    wx.navigateTo({ url: '/pages/journal/index' });
  }
}

module.exports = { getLayoutStyles, run };
