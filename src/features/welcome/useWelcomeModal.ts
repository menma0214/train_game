import { ref, onMounted } from 'vue';

const KEY = 'welcome_modal_session'
const visible = ref(false);

export function useWelcomeModal() {
  const open = () => { visible.value = true; };
  const close = () => {
    visible.value = false;
    try {
      sessionStorage.setItem(KEY, '1');
    } catch {}
  };
  const toggle = () => (visible.value ? close() : open());
  return { visible, open, close, toggle };
}

export function initWelcomeModalForThisSession() {
  onMounted(() => {
    try {
      const shown = sessionStorage.getItem(KEY);
      if(!shown) {
        visible.value = true;
      }
    } catch {
        //もし、sessionStorageが使えなくてもアプリは落とさない
        visible.value = true;
    }
  });
}