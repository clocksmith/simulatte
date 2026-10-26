(function (root) {
  'use strict';
  const RECORD_SCHEMA = 'simulatte.privateDiagram.v1';
  const STORAGE_KEY = 'simulatte.systemDiagram.privatePractice.v1';
  function create({document: doc, sourcePath, onLoad, requestLoad, getRecord, onClear, onMessage}) {
    const crypto = root.SimulattePrivateCrypto;
    const dialog = doc.createElement('dialog'); dialog.className = 'wui-sheet private-collection'; dialog.setAttribute('aria-label', 'Private collection · Databricks Staff IC6 Interview Bank');
    const heading = doc.createElement('div'); heading.className = 'panel-heading';
    const title = doc.createElement('h2'); title.textContent = 'Private collection · Databricks Staff IC6';
    const close = button('Close', () => dialog.close()); heading.append(title, close);
    const status = doc.createElement('p'); status.setAttribute('role', 'status');
    const content = doc.createElement('div'); dialog.append(heading, status, content); doc.body.append(dialog);
    let session = null, active = false, epoch = 0;
    function element(tag, text) { const el = doc.createElement(tag); if (text !== undefined) el.textContent = text; return el; }
    function button(label, fn) {
      const b = root.SimulatteWorldUI.SimButton({document: doc, label, onAction: fn, onError: e => { status.textContent = e.message; }}).element;
      b.type = 'button'; return b;
    }
    function record(value) {
      if (value?.schema !== RECORD_SCHEMA || !value.diagram) throw Error('File is not an encrypted practice diagram.');
      return value;
    }
    async function loadProtected(value) {
      const token = epoch;
      dialog.close();
      await requestLoad(() => {
        if (!session || token !== epoch) return;
        onLoad(record(value), true); active = true;
      });
    }
    async function saveRecord(value, backup = false) {
      if (!session) throw Error('Unlock the private collection before saving.');
      const envelope = await session.seal({schema: RECORD_SCHEMA, ...value});
      localStorage.setItem(STORAGE_KEY + (backup ? '.backup' : ''), JSON.stringify(envelope));
      return true;
    }
    async function restoreSaved() {
      if (!session) { open(); throw Error('Unlock the private collection before loading a private diagram.'); }
      const saved = localStorage.getItem(STORAGE_KEY);
      if (!saved) throw Error('No encrypted practice diagram is saved in this browser.');
      const value = await session.open(JSON.parse(saved));
      await loadProtected(value); return true;
    }
    async function exportRecord(value) {
      if (!session) throw Error('Collection is locked.');
      const envelope = await session.seal({schema: RECORD_SCHEMA, ...value});
      root.SimulatteSystemDiagramFiles.downloadJson('private-diagram.enc.json', envelope);
    }
    function clear() {
      epoch++; session?.lock(); session = null;
      if (active) { active = false; onClear(); }
      status.textContent = 'Locked'; renderLocked();
    }
    async function lock() {
      let failed = false;
      try { if (active) await saveRecord(getRecord()); } catch { failed = true; }
      clear();
      if (failed) status.textContent = 'Locked. Latest edits could not be saved; browser storage may be full or disabled.';
      onMessage(failed ? 'Private collection locked; latest edits could not be saved.' : 'Private collection locked.');
    }
    function renderLocked() {
      const form = element('form'), label = element('label', 'Collection password');
      const password = element('input'); password.id = 'private-password'; password.type = 'password'; password.autocomplete = 'current-password'; password.required = true; password.className = 'wui-field';
      label.htmlFor = password.id;
      const unlock = button('Unlock', () => form.requestSubmit()); unlock.id = 'private-unlock';
      form.append(label, password, unlock); content.replaceChildren(element('p', 'Databricks Staff IC6 practice diagrams and interview notes are encrypted. Your password stays in this browser session.'), form);
      root.SimulatteWorldUI.adoptTree(content);
      form.addEventListener('submit', async event => {
        event.preventDefault(); const token = ++epoch; unlock.disabled = true; status.textContent = 'Unlocking...';
        let next;
        try {
          const response = await fetch(sourcePath);
          if (!response.ok) throw Error('Encrypted collection could not be loaded.');
          next = await crypto.unlock(await response.json(), password.value);
          password.value = '';
          if (token !== epoch) { next.lock(); return; }
          if (next.value?.schema !== 'simulatte.privatePracticeCollection.v1' || !Array.isArray(next.value.exercises) || typeof next.value.notesMarkdown !== 'string') throw Error('Unsupported private collection.');
          session = next; status.textContent = 'Unlocked for this session'; renderUnlocked();
        } catch (error) {
          next?.lock(); password.value = '';
          if (token === epoch) status.textContent = error.message;
        } finally { unlock.disabled = false; }
      });
    }
    function renderNotes(markdown) {
      const article = element('article'); article.className = 'private-notes';
      for (const line of markdown.split('\n')) {
        const heading = /^(#{1,4})\s+(.+)/.exec(line);
        if (heading) article.append(element(`h${Math.min(4, heading[1].length + 1)}`, heading[2]));
        else if (line.trim() && line !== '---') article.append(element('p', line));
      }
      return article;
    }
    function renderUnlocked() {
      const data = session.value, actions = element('div'); actions.className = 'properties-actions';
      const lockButton = button('Lock collection', lock); lockButton.id = 'private-lock';
      const saved = button('Load saved practice', restoreSaved); saved.id = 'private-restore';
      actions.append(saved, lockButton);
      const exercises = element('div'); exercises.className = 'private-exercises';
      for (const exercise of data.exercises) {
        const section = element('details'), summary = element('summary', exercise.title);
        const prompt = element('p', exercise.prompt);
        const start = button('Open practice diagram', () => loadProtected({schema: RECORD_SCHEMA, diagram: structuredClone(exercise.diagram)})); start.dataset.privateExercise = exercise.id;
        section.append(summary, prompt, element('p', exercise.boundary), start); exercises.append(section);
      }
      const notes = element('details'); notes.id = 'private-notes'; notes.append(element('summary', 'Interview notes'), renderNotes(data.notesMarkdown));
      content.replaceChildren(element('h3', data.title), element('p', data.provenanceNote), actions, element('h3', 'Practice diagrams'), exercises, notes);
      root.SimulatteWorldUI.adoptTree(content);
    }
    function open() {
      doc.getElementById('workspace-menu').open = false;
      if (!dialog.open) dialog.showModal();
      if (!session) doc.getElementById('private-password')?.focus();
    }
    root.addEventListener('pagehide', clear);
    renderLocked();
    return Object.freeze({open, lock, saveRecord, restoreSaved, exportRecord,
      get active() { return active; },
      setActive(value) { active = Boolean(value); doc.body.dataset.privateDocument = String(active); },
      async decodeFile(envelope) {
        if (!session) { open(); throw Error('Unlock this collection, then import the encrypted file again.'); }
        const token = epoch;
        const value = await session.open(envelope);
        if (!session || token !== epoch) throw Error('Collection was locked while importing.');
        return record(value);
      },
    });
  }
  root.SimulattePrivateCollection = Object.freeze({create, RECORD_SCHEMA, STORAGE_KEY});
})(globalThis);
