Component({
  options: {
    styleIsolation: 'apply-shared'
  },

  properties: {
    active: {
      type: Boolean,
      value: false
    }
  },

  methods: {
    handleStart() {
      this.touching = true;
      this.triggerEvent('start');
    },

    handleEnd() {
      if (!this.touching) return;
      this.touching = false;
      this.triggerEvent('end');
      this.triggerEvent('toggle');
    },

    handleCancel() {
      this.touching = false;
      this.triggerEvent('end');
    }
  }
});
