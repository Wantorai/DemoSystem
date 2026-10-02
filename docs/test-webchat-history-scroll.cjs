const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// Exercise the actual browser helper with deterministic geometry and time.
// No React, network, database, device, or real-time sleeps are involved.
class FakeTarget {
  constructor() { this.listeners = new Map(); }
  addEventListener(type, callback, options) {
    const capture = options === true || Boolean(options?.capture);
    const entries = this.listeners.get(type) || [];
    if (!entries.some(entry => entry.callback === callback && entry.capture === capture)) {
      entries.push({ callback, capture, once: Boolean(options?.once) });
    }
    this.listeners.set(type, entries);
  }
  removeEventListener(type, callback, options) {
    const capture = options === true || Boolean(options?.capture);
    this.listeners.set(type, (this.listeners.get(type) || [])
      .filter(entry => entry.callback !== callback || entry.capture !== capture));
  }
  emit(type, properties = {}) {
    for (const entry of [...(this.listeners.get(type) || [])]) {
      if (entry.once) this.removeEventListener(type, entry.callback, entry.capture);
      entry.callback({ type, ...properties });
    }
  }
  get listenerCount() {
    return [...this.listeners.values()].reduce((total, entries) => total + entries.length, 0);
  }
}

class FakeContainer extends FakeTarget {
  constructor(scrollTop = 560) {
    super();
    this.position = scrollTop;
    this.scrollHeight = 3400;
    this.clientHeight = 605;
    this.writes = [];
    this.nodes = [];
  }
  get scrollTop() { return this.position; }
  set scrollTop(value) { this.position = value; this.writes.push(value); }
  getBoundingClientRect() { return { top: 100 }; }
  querySelectorAll() { return this.nodes; }
  addMessage(id, contentTop, height = 100) {
    const node = { dataset: { messageId: String(id) }, contentTop, height, isConnected: true };
    node.getBoundingClientRect = () => ({
      top: 100 + node.contentTop - this.position,
      bottom: 100 + node.contentTop + node.height - this.position,
    });
    this.nodes.push(node);
    return node;
  }
  growAboveMessages(height) {
    this.nodes.forEach(node => { node.contentTop += height; });
    this.scrollHeight += height;
  }
}

class FakeResizeObserver {
  static instances = [];
  constructor(callback) {
    this.callback = callback;
    this.disconnected = false;
    FakeResizeObserver.instances.push(this);
  }
  observe(content) { this.content = content; }
  disconnect() { this.disconnected = true; }
  fire() { this.callback([]); }
}

class FakeSignal extends FakeTarget {
  aborted = false;
  abort() { this.aborted = true; this.emit('abort'); }
}

class FakeClock {
  time = 1000;
  nextId = 1;
  timers = new Map();
  setTimeout = (callback, delay) => {
    const id = this.nextId++;
    this.timers.set(id, { at: this.time + Math.max(0, delay), callback });
    return id;
  };
  clearTimeout = id => { this.timers.delete(id); };
  advance(ms) {
    const end = this.time + ms;
    let iterations = 0;
    while (true) {
      const next = [...this.timers.entries()].sort((a, b) => a[1].at - b[1].at)[0];
      if (!next || next[1].at > end) break;
      assert.ok(++iterations < 10000, 'timer must not spin');
      this.time = next[1].at;
      this.timers.delete(next[0]);
      next[1].callback();
    }
    this.time = end;
  }
}

async function withClock(run) {
  const clock = new FakeClock();
  const originalTimeout = global.setTimeout;
  const originalClearTimeout = global.clearTimeout;
  const originalPerformance = Object.getOwnPropertyDescriptor(global, 'performance');
  global.setTimeout = clock.setTimeout;
  global.clearTimeout = clock.clearTimeout;
  Object.defineProperty(global, 'performance', { configurable: true, value: { now: () => clock.time } });
  try { await run(clock); }
  finally {
    global.setTimeout = originalTimeout;
    global.clearTimeout = originalClearTimeout;
    Object.defineProperty(global, 'performance', originalPerformance);
  }
}

async function main() {
  const source = fs.readFileSync(path.join(__dirname, '../crm-fronend/src/components/webchats/historyScroll.js'), 'utf8');
  const { captureHistoryAnchor, restoreHistoryAnchor, observeHistoryAnchor, waitForHistoryIdle } =
    await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
  const originalObserver = global.ResizeObserver;
  global.ResizeObserver = FakeResizeObserver;
  let passed = 0;
  const test = async (name, run) => {
    await run();
    passed++;
    console.log(`PASS ${name}`);
  };
  try {
    await test('prepend preserves partially visible message and zero delta never writes scrollTop', () => {
      const container = new FakeContainer();
      container.addMessage('old', 0);
      container.addMessage('anchor', 500, 200);
      const saved = captureHistoryAnchor(container);
      assert.equal(saved.messageId, 'anchor');
      assert.equal(saved.offset, -60);
      container.growAboveMessages(3602);
      const restored = restoreHistoryAnchor(container, saved);
      assert.equal(container.scrollTop, 4162);
      assert.equal(restored.anchorErrorPx, 0);
      assert.equal(restored.anchorOffsetAfter, -60);
      assert.equal(restored.correctionPx, 3602);
      assert.equal(captureHistoryAnchor(container).messageId, 'anchor');
      restoreHistoryAnchor(container, saved);
      assert.deepEqual(container.writes, [4162]);
    });
    await test('missing anchor uses height delta without scrolling to the new oldest message', () => {
      const container = new FakeContainer();
      container.addMessage('anchor', 500, 200);
      const saved = captureHistoryAnchor(container);
      container.nodes = [];
      container.scrollHeight += 1200;
      const restored = restoreHistoryAnchor(container, saved);
      assert.equal(container.scrollTop, 1760);
      assert.equal(restored.anchorFound, false);
    });
    await test('resize during existing momentum cannot restore the previous page anchor', () => {
      for (const deliverScrollFirst of [false, true]) {
        const container = new FakeContainer(4400);
        container.scrollHeight = 7240;
        container.addMessage('anchor', 4380, 200);
        const saved = captureHistoryAnchor(container);
        let callbacks = 0;
        const stop = observeHistoryAnchor(container, {}, saved, () => callbacks++);
        const observer = FakeResizeObserver.instances.at(-1);
        container.position = 200; // Native momentum, without any new touchstart.
        if (deliverScrollFirst) container.emit('scroll');
        container.growAboveMessages(10);
        observer.fire(); // Also covers ResizeObserver delivered before scroll.
        assert.equal(container.scrollTop, 200);
        assert.deepEqual(container.writes, []);
        assert.equal(callbacks, 0);
        assert.equal(observer.disconnected, true);
        assert.equal(container.listenerCount, 0);
        stop();
      }
    });
    await test('continued touchmove cancels follower even if gesture began before installation', () => {
      const container = new FakeContainer();
      container.addMessage('anchor', 500, 200);
      const stop = observeHistoryAnchor(container, {}, captureHistoryAnchor(container));
      const observer = FakeResizeObserver.instances.at(-1);
      container.emit('touchmove', { touches: [{}] });
      container.growAboveMessages(30);
      observer.fire();
      assert.deepEqual(container.writes, []);
      assert.equal(container.listenerCount, 0);
      stop();
    });
    await test('initial observer callback does not move reader; its own corrections keep follower alive', () => {
      const container = new FakeContainer();
      container.addMessage('anchor', 500, 200);
      const saved = captureHistoryAnchor(container);
      const corrections = [];
      const stop = observeHistoryAnchor(container, {}, saved, value => corrections.push(value.correctionPx));
      const observer = FakeResizeObserver.instances.at(-1);
      observer.fire();
      assert.deepEqual(container.writes, []);
      container.growAboveMessages(10);
      observer.fire();
      container.emit('scroll'); // Browser reports our own correction asynchronously.
      assert.equal(observer.disconnected, false);
      container.growAboveMessages(20);
      observer.fire();
      container.emit('scroll');
      assert.deepEqual(corrections, [10, 20]);
      assert.equal(container.scrollTop, 590);
      assert.equal(captureHistoryAnchor(container).offset, saved.offset);
      stop();
      assert.equal(container.listenerCount, 0);
      assert.equal(observer.disconnected, true);
    });
    await test('idle wait respects held touch, inertia, rubber-band overscroll and cleanup', () => withClock(async clock => {
      const container = new FakeContainer();
      const signal = new FakeSignal();
      const interaction = { touching: true, lastActivityAt: clock.time - 1000 };
      let settled = false;
      const waiting = waitForHistoryIdle(container, interaction, signal).then(value => { settled = true; return value; });
      clock.advance(500);
      await Promise.resolve();
      assert.equal(settled, false, 'already-held finger must prevent prepend');
      container.emit('touchend', { touches: [] });
      clock.advance(90);
      container.position -= 20;
      container.emit('scroll');
      clock.advance(100);
      await Promise.resolve();
      assert.equal(settled, false, 'momentum scroll restarts quiet interval');
      container.position = -8;
      container.emit('scroll');
      clock.advance(500);
      await Promise.resolve();
      assert.equal(settled, false, 'rubber-band must settle before prepend');
      container.position = 0;
      container.emit('scroll');
      clock.advance(119);
      await Promise.resolve();
      assert.equal(settled, false);
      clock.advance(1);
      const waitMs = await waiting;
      assert.ok(waitMs >= 120);
      assert.equal(container.listenerCount, 0);
      assert.equal(signal.listenerCount, 0);
      assert.equal(clock.timers.size, 0);
    }));
    await test('abort while waiting and pre-aborted signal both release listeners and timers', () => withClock(async clock => {
      for (const preAborted of [false, true]) {
        const container = new FakeContainer();
        const signal = new FakeSignal();
        if (preAborted) signal.abort();
        const waiting = waitForHistoryIdle(container, { touching: true, lastActivityAt: clock.time }, signal);
        const rejected = assert.rejects(waiting, error => error.name === 'AbortError');
        if (!preAborted) signal.abort();
        await rejected;
        assert.equal(container.listenerCount, 0);
        assert.equal(signal.listenerCount, 0);
        assert.equal(clock.timers.size, 0);
      }
    }));
  } finally {
    if (originalObserver === undefined) delete global.ResizeObserver;
    else global.ResizeObserver = originalObserver;
  }
  console.log(`${passed} webchat history scroll regression scenarios passed`);
}

main().catch(error => { console.error(error); process.exitCode = 1; });
