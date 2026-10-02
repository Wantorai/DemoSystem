// Keep a message's visual position, not its old numeric scrollTop: prepending
// necessarily changes scrollTop by the height of the inserted messages.
export function captureHistoryAnchor(container) {
  const top = container.getBoundingClientRect().top;
  const anchor = Array.from(container.querySelectorAll('[data-message-id]'))
    .find(node => node.getBoundingClientRect().bottom > top);
  return {
    messageId: anchor?.dataset.messageId ?? null,
    offset: anchor ? anchor.getBoundingClientRect().top - top : 0,
    height: container.scrollHeight,
    scrollTop: container.scrollTop,
  };
}

export function restoreHistoryAnchor(container, saved) {
  const anchor = Array.from(container.querySelectorAll('[data-message-id]'))
    .find(node => node.dataset.messageId === saved.messageId);
  const offset = () => anchor.getBoundingClientRect().top - container.getBoundingClientRect().top;
  const delta = anchor ? offset() - saved.offset : container.scrollHeight - saved.height;
  if (Math.abs(delta) > 0.5) container.scrollTop += delta;
  return {
    anchorFound: Boolean(anchor),
    anchorOffsetAfter: anchor ? offset() : null,
    anchorErrorPx: anchor ? offset() - saved.offset : null,
    correctionPx: delta,
  };
}

// A resize follower must stop on an ongoing gesture/inertia as well as a new
// touch. Otherwise a later image load moves the reader back to an OLD anchor.
export function observeHistoryAnchor(container, content, saved, onRestore = () => {}) {
  if (!content || typeof ResizeObserver === 'undefined') return () => {};
  let expectedTop = container.scrollTop;
  let stopped = false;
  const stopEvents = ['touchstart', 'touchmove', 'wheel', 'pointerdown', 'keydown'];
  const stop = () => {
    stopped = true;
    observer.disconnect();
    stopEvents.forEach(name => container.removeEventListener(name, stop, true));
    container.removeEventListener('scroll', onScroll);
  };
  const onScroll = () => {
    if (Math.abs(container.scrollTop - expectedTop) > 0.5) stop();
  };
  const observer = new ResizeObserver(() => {
    if (stopped) return;
    // Scroll events can be delivered after ResizeObserver. Check the actual
    // position as well, so a queued resize cannot undo a user's movement.
    if (Math.abs(container.scrollTop - expectedTop) > 0.5) { stop(); return; }
    const result = restoreHistoryAnchor(container, saved);
    expectedTop = container.scrollTop;
    if (Math.abs(result.correctionPx) > 0.5) onRestore(result);
  });
  stopEvents.forEach(name => container.addEventListener(name, stop, { capture: true, passive: true }));
  container.addEventListener('scroll', onScroll, { passive: true });
  observer.observe(content);
  return stop;
}

// Fetch while scrolling, but on iOS avoid changing the scroll coordinate
// system during native touch momentum. Capture the anchor AFTER this wait.
export function waitForHistoryIdle(container, interaction, signal, quietMs = 120) {
  return new Promise((resolve, reject) => {
    let timer;
    const startedAt = performance.now();
    const cleanup = () => {
      clearTimeout(timer);
      container.removeEventListener('scroll', onActivity);
      container.removeEventListener('touchmove', onActivity);
      container.removeEventListener('touchstart', onTouch);
      container.removeEventListener('touchend', onTouch);
      container.removeEventListener('touchcancel', onTouch);
      signal?.removeEventListener('abort', onAbort);
    };
    const onAbort = () => { cleanup(); reject(new DOMException('History request cancelled', 'AbortError')); };
    const check = () => {
      clearTimeout(timer);
      if (signal?.aborted) { onAbort(); return; }
      const remaining = quietMs - (performance.now() - interaction.lastActivityAt);
      const maxTop = Math.max(0, container.scrollHeight - container.clientHeight);
      const bouncing = container.scrollTop < -0.5 || container.scrollTop > maxTop + 0.5;
      if (interaction.touching || bouncing || remaining > 0) {
        timer = setTimeout(check, Math.max(16, remaining > 0 ? remaining : 32));
        return;
      }
      cleanup();
      resolve(Math.round(performance.now() - startedAt));
    };
    const onActivity = () => { interaction.lastActivityAt = performance.now(); check(); };
    const onTouch = event => {
      interaction.touching = event.touches?.length > 0;
      onActivity();
    };
    container.addEventListener('scroll', onActivity, { passive: true });
    container.addEventListener('touchmove', onActivity, { passive: true });
    container.addEventListener('touchstart', onTouch, { passive: true });
    container.addEventListener('touchend', onTouch, { passive: true });
    container.addEventListener('touchcancel', onTouch, { passive: true });
    signal?.addEventListener('abort', onAbort, { once: true });
    check();
  });
}
