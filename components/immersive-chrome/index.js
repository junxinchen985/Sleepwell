const { getNavigationMetrics } = require('../../utils/layout');
const navigation = require('../../utils/navigation');

Component({
  options: {
    styleIsolation: 'apply-shared'
  },

  data: {
    topStyle: '',
    rightStyle: ''
  },

  properties: {
    showTop: {
      type: Boolean,
      value: true
    },
    showBottom: {
      type: Boolean,
      value: true
    },
    customEvents: {
      type: Boolean,
      value: false
    }
  },

  lifetimes: {
    attached() {
      const nav = getNavigationMetrics();
      this.setData({
        topStyle: `height:${Math.max(88, nav.navigationBottom)}px;`,
        rightStyle: `right:${Math.max(24, nav.rightInset)}px;`
      });
    }
  },

  methods: {
    noop() {},

    handleExit() {
      navigation.exitMiniProgram();
    },

    handleSettings() {
      wx.navigateTo({ url: '/pages/settings/index' });
    },

    handleFocus() {
      wx.navigateTo({ url: '/pages/focus/index' });
    },

    handleBody() {
      if (this.data.customEvents) {
        this.triggerEvent('body');
        return;
      }
      wx.navigateTo({ url: '/pages/body/index' });
    },

    handleWorld() {
      if (this.data.customEvents) {
        this.triggerEvent('world');
        return;
      }
      wx.reLaunch({ url: '/pages/breathe/index' });
    },

    handleRecords() {
      if (this.data.customEvents) {
        this.triggerEvent('records');
        return;
      }
      wx.navigateTo({ url: '/pages/journal/index' });
    }
  }
});
