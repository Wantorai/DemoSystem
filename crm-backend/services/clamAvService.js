const net = require('net');
const { once } = require('events');

const scanStream = async (stream, { maxBytes } = {}) => new Promise((resolve, reject) => {
  const host = String(process.env.CLAMAV_HOST || '127.0.0.1');
  const port = Number(process.env.CLAMAV_PORT || 3310);
  const timeoutMs = Math.max(Number(process.env.CLAMAV_TIMEOUT_MS || 120000), 5000);
  const socket = net.createConnection({ host, port });
  let response = '';
  let settled = false;
  const finish = (error, result) => {
    if (settled) return;
    settled = true;
    socket.destroy();
    if (error) reject(error); else resolve(result);
  };
  socket.setTimeout(timeoutMs, () => finish(new Error('ClamAV scan timeout')));
  socket.on('error', (error) => finish(error));
  socket.on('data', (chunk) => {
    response += chunk.toString('utf8');
    if (!response.includes('\0')) return;
    const text = response.replace(/\0.*$/s, '').trim();
    if (/\bOK$/i.test(text)) finish(null, { clean: true, message: text });
    else if (/\bFOUND$/i.test(text)) finish(null, { clean: false, infected: true, message: text });
    else finish(new Error(`Unexpected ClamAV response: ${text || 'empty'}`));
  });
  socket.on('end', () => {
    if (!settled) finish(new Error(`Incomplete ClamAV response: ${response.trim() || 'empty'}`));
  });

  socket.on('connect', async () => {
    try {
      socket.write('zINSTREAM\0');
      let total = 0;
      for await (const rawChunk of stream) {
        const chunk = Buffer.isBuffer(rawChunk) ? rawChunk : Buffer.from(rawChunk);
        total += chunk.length;
        if (maxBytes && total > maxBytes) throw new Error(`File exceeds antivirus limit (${maxBytes} bytes)`);
        const size = Buffer.allocUnsafe(4);
        size.writeUInt32BE(chunk.length, 0);
        if (!socket.write(Buffer.concat([size, chunk]))) await once(socket, 'drain');
      }
      socket.write(Buffer.alloc(4));
    } catch (error) {
      if (typeof stream.destroy === 'function') stream.destroy();
      finish(error);
    }
  });
});

module.exports = { scanStream };
