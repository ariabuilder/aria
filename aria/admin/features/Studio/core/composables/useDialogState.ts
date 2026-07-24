import { ref, type Ref } from "vue"

export interface DialogState {
  isOpen: Ref<boolean>
  open: () => void
  close: () => void
  toggle: () => void
}

export function useDialogState(initialState = false): DialogState {
  const isOpen = ref(initialState)

  function open() {
    isOpen.value = true
  }

  function close() {
    isOpen.value = false
  }

  function toggle() {
    isOpen.value = !isOpen.value
  }

  return { isOpen, open, close, toggle }
}
