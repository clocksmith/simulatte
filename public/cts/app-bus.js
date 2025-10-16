export class AppBus extends EventTarget {
  emit(type, detail = {}) {
    const event = new CustomEvent(type, { detail, bubbles: false, cancelable: true });
    this.dispatchEvent(event);
    return !event.defaultPrevented;
  }

  on(type, listener, options) {
    this.addEventListener(type, listener, options);
    return () => this.removeEventListener(type, listener, options);
  }
}

export const appBus = new AppBus();
