export class ModalHost {
  constructor({ root }) {
    this.root = root;
    this.openModals = [];
    if (this.root) {
      this.root.addEventListener('click', (event) => {
        if (event.target === this.root) {
          this.closeTop();
        }
      });
    }
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        this.closeTop();
      }
    });
  }

  async open({ renderer, props = {} }) {
    if (!this.root) return null;
    this.root.hidden = false;
    const modal = document.createElement('div');
    modal.className = 'cts-modal';
     modal.setAttribute('role', 'dialog');
     modal.setAttribute('aria-modal', 'true');
    this.root.appendChild(modal);
    const context = {
      close: () => this.close(modal),
      props
    };
    if (typeof renderer === 'function') {
      await renderer(modal, context);
    }
    this.openModals.push(modal);
    return modal;
  }

  close(modal) {
    if (!modal) return;
    modal.remove();
    this.openModals = this.openModals.filter((entry) => entry !== modal);
    if (this.openModals.length === 0 && this.root) {
      this.root.hidden = true;
    }
  }

  closeTop() {
    const modal = this.openModals[this.openModals.length - 1];
    if (modal) {
      this.close(modal);
    }
  }
}
