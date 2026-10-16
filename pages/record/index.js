const storage = require('../../services/storage');
const sleep = require('../../utils/sleep-calendar');
const { getNavigationMetrics } = require('../../utils/layout');
const weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
Page({
  data: { nav: getNavigationMetrics(), year: 0, month: 0, monthLabel: '', rows: [], weekdays: ['日', '一', '二', '三', '四', '五', '六'], selected: '', detail: null, journals: [], allJournals: false, journalDetail: null, weekly: { early: 0, total: 0 }, weekCopy: '', legacyCount: 0 },
  onLoad() { const now = new Date(); this.setData({ year: now.getFullYear(), month: now.getMonth() }); },
  onShow() { this.refresh(); },
  refresh() {
    const records = storage.read(storage.KEYS.sleep, []);
    const weekly = sleep.weekly(records);
    const journals = storage.read(storage.KEYS.journal, []).map((item) => {
      const date = new Date(item.createdAt);
      return Object.assign({}, item, { summary: (item.items || []).join('；'), weekday: Number.isNaN(date.getTime()) ? '' : weekdays[date.getDay()] });
    });
    this.setData({ nav: getNavigationMetrics(), monthLabel: `${this.data.year} 年 ${this.data.month + 1} 月`, rows: sleep.calendar(this.data.year, this.data.month, records, this.data.selected), weekly, journals, legacyCount: records.filter((item) => !sleep.parseDate(item.nightDate)).length, weekCopy: weekly.difference > 0 ? `比上周多 ${weekly.difference} 天，继续保持呀！` : weekly.difference < 0 ? '今晚慢慢来，每一天都是新的开始。' : '和上周一样，继续照顾好自己。' });
  },
  changeMonth(event) { const date = new Date(this.data.year, this.data.month + Number(event.currentTarget.dataset.offset), 1); this.setData({ year: date.getFullYear(), month: date.getMonth(), selected: '', detail: null }); this.refresh(); },
  chooseDate(event) {
    const key = event.currentTarget.dataset.key;
    if (!sleep.parseDate(key)) return;
    this.setData({ selected: key }); this.refresh();
    const record = sleep.recordMap(storage.read(storage.KEYS.sleep, []))[key];
    if (record) this.setData({ detail: Object.assign({}, record, { category: sleep.category(record.bedTime).label }) });
    else if (key > sleep.dateKey(new Date())) wx.showToast({ title: '这一天还没到来', icon: 'none' });
    else wx.navigateTo({ url: `/pages/sleep/index?nightDate=${key}` });
  },
  closeDetail() { this.setData({ detail: null, journalDetail: null }); },
  editSleep() { const key = this.data.detail.nightDate; this.closeDetail(); wx.navigateTo({ url: `/pages/sleep/index?nightDate=${key}` }); },
  writeJournal() { wx.navigateTo({ url: '/pages/journal/index' }); },
  showAll() { this.setData({ allJournals: true }); },
  closeAll() { this.setData({ allJournals: false }); },
  openJournal(event) { this.setData({ journalDetail: this.data.journals.find((item) => item.id === event.currentTarget.dataset.id) || null }); },
  journalActions(event) {
    const id = event.currentTarget.dataset.id;
    wx.showActionSheet({ itemList: ['查看全文', '删除日记'], success: ({ tapIndex }) => {
      if (tapIndex === 0) this.openJournal(event);
      if (tapIndex === 1) wx.showModal({ title: '删除这篇日记？', content: '删除后无法恢复。', success: ({ confirm }) => {
        if (!confirm) return;
        if (storage.write(storage.KEYS.journal, storage.read(storage.KEYS.journal, []).filter((item) => item.id !== id))) this.refresh();
        else wx.showToast({ title: '删除未成功，请重试', icon: 'none' });
      } });
    } });
  },
  goNight() { wx.reLaunch({ url: '/pages/agent/index' }); },
  goBreathe() { wx.reLaunch({ url: '/pages/breathe/index' }); },
  noop() {}
});
