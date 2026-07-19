(function attachApplicationProfileSelect(root, factory) {
  const api = factory();
  root.SimulatteApplicationProfileSelect = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createApplicationProfileSelectApi() {
  function createApplicationProfileSelect({ select, root, trigger, label, listbox }) {
    if (!select || !root || !trigger || !label || !listbox) {
      throw new Error('Application profile select requires select, root, trigger, label, and listbox elements');
    }

    let optionElements = [];
    let isOpen = false;

    function groups() {
      return [...select.children].map((child) => {
        const isGroup = child.tagName === 'OPTGROUP';
        const options = isGroup ? [...child.children] : [child];
        return {
          label: isGroup ? child.label : null,
          options: options.filter((option) => option.tagName === 'OPTION').map((option) => ({
            label: option.textContent,
            value: option.value,
            isDisabled: option.disabled,
          })),
        };
      }).filter((group) => group.options.length > 0);
    }

    function selectedIndex() {
      const index = optionElements.findIndex((option) => option.dataset.value === select.value);
      return index < 0 ? 0 : index;
    }

    function focusOption(index) {
      const count = optionElements.length;
      if (!count) return;
      const next = ((index % count) + count) % count;
      optionElements[next].focus();
    }

    function setOpen(nextOpen, { focusSelected = false, returnFocus = false } = {}) {
      isOpen = Boolean(nextOpen) && !select.disabled && optionElements.length > 0;
      root.classList.toggle('open', isOpen);
      trigger.setAttribute('aria-expanded', String(isOpen));
      listbox.hidden = !isOpen;
      if (isOpen && focusSelected) focusOption(selectedIndex());
      if (!isOpen && returnFocus) trigger.focus();
    }

    function choose(value) {
      if (select.disabled || !value) return;
      const changed = select.value !== value;
      select.value = value;
      syncSelection();
      setOpen(false, { returnFocus: true });
      if (changed) select.dispatchEvent(new Event('change', { bubbles: true }));
    }

    function syncSelection() {
      const selected = optionElements.find((option) => option.dataset.value === select.value) || optionElements[0];
      label.textContent = selected?.textContent || select.selectedOptions?.[0]?.textContent || 'Choose experience';
      optionElements.forEach((option) => {
        const isSelected = option === selected;
        option.classList.toggle('selected', isSelected);
        option.setAttribute('aria-selected', String(isSelected));
      });
      trigger.disabled = select.disabled;
      root.classList.toggle('is-disabled', select.disabled);
      if (select.disabled) setOpen(false);
    }

    function rebuild() {
      const fragment = select.ownerDocument.createDocumentFragment();
      let optionIndex = 0;
      groups().forEach((group) => {
        if (group.label) {
          const heading = select.ownerDocument.createElement('div');
          heading.className = 'select-group-label';
          heading.setAttribute('role', 'presentation');
          heading.textContent = group.label;
          fragment.append(heading);
        }
        group.options.forEach((option) => {
          const row = select.ownerDocument.createElement('div');
          row.id = `${listbox.id}-option-${optionIndex}`;
          row.className = 'select-option';
          row.dataset.value = option.value;
          row.setAttribute('role', 'option');
          row.setAttribute('tabindex', '-1');
          row.setAttribute('aria-disabled', String(option.isDisabled));
          row.textContent = option.label;
          fragment.append(row);
          optionIndex += 1;
        });
      });
      listbox.replaceChildren(fragment);
      optionElements = [...listbox.querySelectorAll('[role="option"]')];
      syncSelection();
    }

    function onTriggerClick() {
      setOpen(!isOpen, { focusSelected: !isOpen });
    }

    function onTriggerKeydown(event) {
      if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
      event.preventDefault();
      setOpen(true, { focusSelected: true });
    }

    function onListboxClick(event) {
      const option = event.target.closest('[role="option"]');
      if (!option || option.getAttribute('aria-disabled') === 'true') return;
      choose(option.dataset.value);
    }

    function onListboxKeydown(event) {
      const currentIndex = optionElements.indexOf(event.target);
      if (currentIndex < 0) return;
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        focusOption(currentIndex + (event.key === 'ArrowDown' ? 1 : -1));
      } else if (event.key === 'Home' || event.key === 'End') {
        event.preventDefault();
        focusOption(event.key === 'Home' ? 0 : optionElements.length - 1);
      } else if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        if (event.target.getAttribute('aria-disabled') !== 'true') choose(event.target.dataset.value);
      } else if (event.key === 'Escape') {
        event.preventDefault();
        setOpen(false, { returnFocus: true });
      }
    }

    function onDocumentPointerDown(event) {
      if (!root.contains(event.target)) setOpen(false);
    }

    trigger.addEventListener('click', onTriggerClick);
    trigger.addEventListener('keydown', onTriggerKeydown);
    listbox.addEventListener('click', onListboxClick);
    listbox.addEventListener('keydown', onListboxKeydown);
    select.addEventListener('change', syncSelection);
    select.ownerDocument.addEventListener('pointerdown', onDocumentPointerDown);
    const observer = new MutationObserver(rebuild);
    observer.observe(select, { attributes: true, childList: true, subtree: true });
    rebuild();

    return Object.freeze({
      close: () => setOpen(false),
      sync: syncSelection,
      dispose() {
        observer.disconnect();
        trigger.removeEventListener('click', onTriggerClick);
        trigger.removeEventListener('keydown', onTriggerKeydown);
        listbox.removeEventListener('click', onListboxClick);
        listbox.removeEventListener('keydown', onListboxKeydown);
        select.removeEventListener('change', syncSelection);
        select.ownerDocument.removeEventListener('pointerdown', onDocumentPointerDown);
      },
    });
  }

  return { createApplicationProfileSelect };
});
