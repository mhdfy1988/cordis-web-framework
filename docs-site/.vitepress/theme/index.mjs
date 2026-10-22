import DefaultTheme from 'vitepress/theme';
import { onMounted, onUnmounted } from 'vue';

export default {
  extends: DefaultTheme,
  setup() {
    let pending;
    const restoreSearchFocus = event => {
      if (event.key !== 'Escape' || !event.target.closest?.('.VPLocalSearchBox')) return;
      // 默认主题卸载搜索框后可能把焦点留在 body；只修复这个明确状态。
      pending = setTimeout(() => {
        if (!document.querySelector('.VPLocalSearchBox') && document.activeElement === document.body) {
          document.querySelector('button.DocSearch-Button')?.focus();
        }
      }, 0);
    };
    onMounted(() => document.addEventListener('keydown', restoreSearchFocus, true));
    onUnmounted(() => { clearTimeout(pending); document.removeEventListener('keydown', restoreSearchFocus, true); });
  },
};
