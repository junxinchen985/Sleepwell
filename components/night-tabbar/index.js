const ROUTES = {
  home: '/pages/home/index',
  relax: '/pages/breathe/index',
  records: '/pages/record/index'
};

Component({
  properties: {
    active: { type: String, value: 'home' }
  },

  data: {
    items: [
      {
        key: 'home',
        label: '首页',
        icon: '/assets/home/icons/icon-nav-home-muted.png',
        iconActive: '/assets/home/icons/icon-nav-home.png'
      },
      {
        key: 'relax',
        label: '放松',
        icon: '/assets/home/icons/icon-nav-relax-muted.png',
        iconActive: '/assets/home/icons/icon-nav-relax.png'
      },
      {
        key: 'records',
        label: '记录',
        icon: '/assets/home/icons/icon-nav-record-muted.png',
        iconActive: '/assets/home/icons/icon-nav-record.png'
      }
    ]
  },

  methods: {
    onTap(event) {
      const key = event.currentTarget.dataset.key;
      const url = ROUTES[key];
      if (!url || key === this.data.active) return;
      wx.reLaunch({ url });
    }
  }
});
