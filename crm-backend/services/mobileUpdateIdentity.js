'use strict';
const crypto = require('crypto');

function mobileUpdateId(metadataBuffer, releaseId, platform) {
  const hash = value => crypto.createHash('sha256').update(value).digest('hex');
  const value = hash(Buffer.from(`${hash(metadataBuffer)}:${releaseId}:${platform}`));
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20, 32)}`;
}

module.exports = { mobileUpdateId };
