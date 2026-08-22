// services/tokenStorage.js
const Tele2Token = require('../models/Tele2Token');

async function loadTokensFromDB() {
  const tokenRecord = await Tele2Token.findOne();
  if (!tokenRecord) throw new Error('Токены не найдены в базе');
  return {
    accessToken: tokenRecord.accessToken,
    refreshToken: tokenRecord.refreshToken,
  };
}

async function saveTokensToDB(accessToken, refreshToken) {
  const tokenRecord = await Tele2Token.findOne();
  if (tokenRecord) {
    tokenRecord.accessToken = accessToken;
    tokenRecord.refreshToken = refreshToken;
    tokenRecord.updatedAt = new Date();
    await tokenRecord.save();
  } else {
    await Tele2Token.create({ accessToken, refreshToken });
  }
}

module.exports = { loadTokensFromDB, saveTokensToDB };
