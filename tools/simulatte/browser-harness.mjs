const DEFAULT_TIMEOUT_MS = 60000;

export class CdpClient {
  constructor(url, { timeoutMs = DEFAULT_TIMEOUT_MS, WebSocketImpl = WebSocket } = {}) {
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new Error('CDP timeout must be positive');
    this.url = url;
    this.timeoutMs = timeoutMs;
    this.nextId = 1;
    this.pending = new Map();
    this.listeners = new Map();
    this.eventWaiters = new Map();
    this.diagnosticEvents = [];
    this.closedError = null;
    this.ws = new WebSocketImpl(url);
    this.socket = this.ws;
    this.ready = new Promise((resolve, reject) => {
      const timer = setTimeout(() => { reject(new Error('CDP connection timed out')); void this.close(); }, timeoutMs);
      this.ws.addEventListener('open', () => { clearTimeout(timer); resolve(); }, { once: true });
      this.ws.addEventListener('error', () => { clearTimeout(timer); reject(new Error('CDP connection failed')); }, { once: true });
      this.ws.addEventListener('close', () => { clearTimeout(timer); reject(new Error('CDP connection closed')); }, { once: true });
    });
    this.ws.addEventListener('message', ({ data }) => {
      try { this.receive(JSON.parse(String(data))); }
      catch (error) { this.failPending(error); }
    });
    this.ws.addEventListener('close', () => this.failPending(this.closedError || new Error('CDP connection closed')));
    this.ws.addEventListener('error', () => this.failPending(new Error('CDP connection failed')));
  }

  async connect() { await this.ready; }

  receive(message) {
    if (message.id && this.pending.has(message.id)) {
      const request = this.pending.get(message.id);
      this.pending.delete(message.id);
      clearTimeout(request.timer);
      if (message.error) request.reject(new Error(JSON.stringify(message.error)));
      else request.resolve(message.result || {});
      return;
    }
    const params = message.params || {};
    if (message.method === 'Runtime.exceptionThrown' ||
      message.method === 'Runtime.consoleAPICalled' && ['error', 'warning', 'assert'].includes(params.type) ||
      message.method === 'Log.entryAdded' && ['error', 'warning'].includes(params.entry?.level)) {
      this.diagnosticEvents.push({ method: message.method, params });
      if (this.diagnosticEvents.length > 50) this.diagnosticEvents.shift();
    }
    const waiters = this.eventWaiters.get(message.method) || [];
    this.eventWaiters.delete(message.method);
    for (const waiter of waiters) { clearTimeout(waiter.timer); waiter.resolve(params); }
    for (const listener of this.listeners.get(message.method) || []) listener(params);
  }

  async send(method, params = {}) {
    await this.ready;
    if (this.closedError || this.ws.readyState >= 2) throw this.closedError || new Error('CDP connection closed');
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`CDP command timed out: ${method}`));
      }, this.timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      try { this.ws.send(JSON.stringify({ id, method, params })); }
      catch (error) { clearTimeout(timer); this.pending.delete(id); reject(error); }
    });
  }

  waitForEvent(method) {
    if (this.closedError || this.ws.readyState >= 2) return Promise.reject(this.closedError || new Error('CDP connection closed'));
    const result = new Promise((resolve, reject) => {
      const waiter = { resolve, reject, timer: null };
      waiter.timer = setTimeout(() => {
        this.eventWaiters.set(method, (this.eventWaiters.get(method) || []).filter((row) => row !== waiter));
        reject(new Error(`CDP event timed out: ${method}`));
      }, this.timeoutMs);
      this.eventWaiters.set(method, [...(this.eventWaiters.get(method) || []), waiter]);
    });
    void result.catch(() => {});
    return result;
  }

  once(method) { return this.waitForEvent(method); }
  on(method, listener) {
    this.listeners.set(method, [...(this.listeners.get(method) || []), listener]);
    return () => this.listeners.set(method, (this.listeners.get(method) || []).filter((row) => row !== listener));
  }
  diagnostics() { return this.diagnosticEvents.slice(); }

  failPending(error) {
    for (const request of this.pending.values()) { clearTimeout(request.timer); request.reject(error); }
    this.pending.clear();
    for (const waiters of this.eventWaiters.values()) {
      for (const waiter of waiters) { clearTimeout(waiter.timer); waiter.reject(error); }
    }
    this.eventWaiters.clear();
  }

  async close(error = null) {
    this.closedError ||= error || new Error('CDP connection closed');
    this.failPending(this.closedError);
    this.listeners.clear();
    if (this.ws.readyState === 3) return;
    await new Promise((resolve) => {
      const timer = setTimeout(resolve, 1000);
      this.ws.addEventListener('close', () => { clearTimeout(timer); resolve(); }, { once: true });
      this.ws.close();
    });
  }
}
