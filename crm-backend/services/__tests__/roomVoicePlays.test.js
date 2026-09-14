jest.mock('../../config/database', () => ({ query: jest.fn() }));
jest.mock('../../models/RoomUsers', () => ({ findOne: jest.fn() }));
jest.mock('../../models/RoomMessage', () => ({ findOne: jest.fn() }));
jest.mock('../../socket', () => ({ getIO: jest.fn() }));
const sequelize = require('../../config/database');
const RoomUsers = require('../../models/RoomUsers');
const RoomMessage = require('../../models/RoomMessage');
const { getIO } = require('../../socket');
const { getUnplayedVoices, markVoicePlayed } = require('../../controllers/roomVoicePlaysController');

const request = () => ({ params: { roomId: '17', messageId: '200' }, user: { id: 7 }, query: {} });
const response = () => ({ status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis(), set: jest.fn().mockReturnThis() });
beforeEach(() => {
  jest.clearAllMocks();
  RoomUsers.findOne.mockResolvedValue({ userId: 7 });
  RoomMessage.findOne.mockResolvedValue({ id: 200, userId: 8, mediaUrl: '/voice.m4a' });
  sequelize.query.mockResolvedValue([{ count: 3, nextMessageId: 200 }]);
});

test('denies a non-member without querying history', async () => {
  RoomUsers.findOne.mockResolvedValue(null);
  const res = response();
  await getUnplayedVoices(request(), res, jest.fn());
  expect(res.status).toHaveBeenCalledWith(403);
  expect(sequelize.query).not.toHaveBeenCalled();
});

test('requires active membership and returns only count and next ID', async () => {
  const res = response();
  const req = request(); req.query.before = '300';
  await getUnplayedVoices(req, res, jest.fn());
  expect(RoomUsers.findOne).toHaveBeenCalledWith(expect.objectContaining({ where: { roomId: 17, userId: 7, deletedAt: null } }));
  expect(res.json).toHaveBeenCalledWith({ count: 3, nextMessageId: 200 });
  const [sql, options] = sequelize.query.mock.calls[0];
  expect(options.replacements).toEqual({ roomId: 17, userId: 7, before: 300 });
  expect(sql).toContain('room_voice_tracking_start');
  expect(sql).toContain('m."createdAt" >=');
  expect(sql).toContain("m.type = 'audio'");
  expect(sql).toContain('m."userId" IS DISTINCT FROM :userId');
  expect(sql).toContain('NOT EXISTS');
  expect(sql).toContain('COALESCE(MAX(m.id) FILTER');
});

test('rejects malformed cursor before querying history', async () => {
  const req = request(); req.query.before = '1 OR 1=1';
  const res = response();
  await getUnplayedVoices(req, res, jest.fn());
  expect(res.status).toHaveBeenCalledWith(400);
  expect(sequelize.query).not.toHaveBeenCalled();
});

test('does not mark own or deleted audio', async () => {
  for (const message of [null, { userId: 7, mediaUrl: '/voice.m4a' }, { userId: 8, mediaUrl: null }]) {
    RoomMessage.findOne.mockResolvedValue(message);
    const res = response();
    await markVoicePlayed(request(), res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(404);
  }
  expect(sequelize.query).not.toHaveBeenCalled();
});

test('idempotent receipt is scoped to the authenticated user and broadcasts only to their devices', async () => {
  const emit = jest.fn(); const to = jest.fn(() => ({ emit }));
  getIO.mockReturnValue({ to });
  const req = request(); req.body = { userId: 999 };
  const res = response();
  await markVoicePlayed(req, res, jest.fn());
  expect(sequelize.query.mock.calls[0][0]).toContain('ON CONFLICT ("userId", "messageId") DO NOTHING');
  expect(sequelize.query.mock.calls[0][1].replacements).toEqual({ userId: 7, messageId: 200 });
  expect(RoomMessage.findOne).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 200, roomId: 17, type: 'audio' } }));
  expect(to).toHaveBeenCalledWith('user:7');
  expect(emit).toHaveBeenCalledWith('roomVoicePlayed', { roomId: 17, messageId: 200 });
  expect(res.json).toHaveBeenCalledWith({ ok: true, messageId: 200 });
});

test('database failures go to error middleware, not a false zero count', async () => {
  const error = new Error('database unavailable'); sequelize.query.mockRejectedValueOnce(error);
  const next = jest.fn(); const res = response();
  await getUnplayedVoices(request(), res, next);
  expect(next).toHaveBeenCalledWith(error);
  expect(res.json).not.toHaveBeenCalled();
});
