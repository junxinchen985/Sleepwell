function backOrHome() {
  const pages = getCurrentPages();
  if (pages.length > 1) {
    wx.navigateBack({ delta: 1 });
    return;
  }
  wx.reLaunch({ url: '/pages/home/index' });
}

function exitMiniProgram() {
  if (typeof wx.exitMiniProgram === 'function') {
    wx.exitMiniProgram();
    return;
  }
  wx.showToast({ title: '请点击右上角关闭小程序', icon: 'none' });
}

module.exports = {
  backOrHome,
  exitMiniProgram
};
