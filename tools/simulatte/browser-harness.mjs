export class CdpClient {
  constructor(url) { this.url = url; this.socket = null; this.nextId = 1; this.pending = new Map(); this.listeners = new Map(); }
  async connect() {
    this.socket = new WebSocket(this.url);
    await new Promise((resolve, reject) => { this.socket.onopen = resolve; this.socket.onerror = reject; });
    this.socket.onmessage = ({ data }) => this.receive(JSON.parse(data));
  }
  receive(message) {
    if (message.id && this.pending.has(message.id)) {
      const pending = this.pending.get(message.id); this.pending.delete(message.id);
      if (message.error) pending.reject(new Error(JSON.stringify(message.error))); else pending.resolve(message.result);
    }
    for (const listener of this.listeners.get(message.method) || []) listener(message.params);
  }
  send(method, params = {}) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => { this.pending.set(id, { resolve, reject }); this.socket.send(JSON.stringify({ id, method, params })); });
  }
  once(method) {
    return new Promise((resolve) => {
      const callback = (params) => { this.listeners.set(method, (this.listeners.get(method) || []).filter((row) => row !== callback)); resolve(params); };
      this.on(method, callback);
    });
  }
  on(method, listener) { this.listeners.set(method, [...(this.listeners.get(method) || []), listener]); }
  close() { try { this.socket?.close(); } catch { /* already closed */ } }
}
