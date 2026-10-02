// Preserve formats we cannot safely re-encode (animations, HEIC, SVG, etc.).
export async function prepareChatPhoto(file) {
  const sourceType = String(file.type || '').toLowerCase();
  if (!['image/jpeg', 'image/png'].includes(sourceType) || file.size < 512 * 1024) return file;
  const url = URL.createObjectURL(file);
  const image = new window.Image();
  const canvas = document.createElement('canvas');
  try {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Image decode timeout')), 15000);
      image.onload = () => { clearTimeout(timer); resolve(); };
      image.onerror = () => { clearTimeout(timer); reject(new Error('Image decode failed')); };
      image.src = url;
    });
    const scale = Math.min(1, 1600 / Math.max(image.naturalWidth, image.naturalHeight));
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext('2d');
    // JPEG has no alpha channel; use white for transparent PNG pixels.
    if (sourceType === 'image/png') {
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, canvas.width, canvas.height);
    }
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.72));
    return blob && blob.size < file.size
      ? new File([blob], file.name, { type: 'image/jpeg', lastModified: file.lastModified }) : file;
  } catch {
    return file; // Sending the original is safer than dropping an unsupported photo.
  } finally {
    image.onload = image.onerror = null;
    image.src = '';
    URL.revokeObjectURL(url);
    canvas.width = canvas.height = 0;
  }
}

export function uploadChatMedia(url, form, token, timing, report) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const start = performance.now();
    let uploadEnd = null;
    let reportedAt = 0;
    const update = () => {
      timing.requestMs = Math.round(performance.now() - start);
      report({ ...timing });
    };
    xhr.open('POST', url);
    xhr.withCredentials = !token;
    xhr.timeout = 180000;
    if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    xhr.upload.onprogress = event => {
      timing.phase = 'uploading';
      if (event.lengthComputable) timing.percent = Math.round(event.loaded / event.total * 100);
      if (performance.now() - reportedAt > 500) { reportedAt = performance.now(); update(); }
    };
    xhr.upload.onload = () => {
      uploadEnd = performance.now();
      timing.browserUploadMs = Math.round(uploadEnd - start);
      timing.phase = 'waiting for response';
      update();
    };
    xhr.onload = () => {
      timing.status = xhr.status;
      timing.waitAfterUploadMs = uploadEnd == null ? null : Math.round(performance.now() - uploadEnd);
      timing.serverTiming = xhr.getResponseHeader('Server-Timing');
      try {
        const parseStart = performance.now();
        const data = JSON.parse(xhr.responseText);
        timing.parseMs = Math.round(performance.now() - parseStart);
        if (xhr.status < 200 || xhr.status >= 300) throw new Error(data.error || `HTTP ${xhr.status}`);
        if (!data?.id) throw new Error('Сервер не подтвердил сообщение');
        timing.phase = 'server confirmed';
        update();
        resolve(data);
      } catch (error) { timing.phase = 'error'; update(); reject(error); }
    };
    const fail = phase => {
      timing.phase = phase; update();
      reject(new Error('Нет подтверждения отправки. Проверьте чат перед повторной отправкой.'));
    };
    xhr.onerror = () => fail('network error');
    xhr.ontimeout = () => fail('timeout');
    xhr.onabort = () => fail('aborted');
    timing.phase = 'uploading'; update();
    xhr.send(form);
  });
}
