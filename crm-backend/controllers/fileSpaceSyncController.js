const sync = require('../services/fileSpaceSyncService');

const snapshot = async (req, res, next) => {
  try {
    res.json(await sync.createSnapshotPage(req.user, {
      cursor: req.query.cursor,
      limit: req.query.limit,
      eventCursor: req.query.eventCursor,
      clientVersion: req.get('x-filespace-client-version'),
    }));
  } catch (error) {
    next(error);
  }
};

const changes = async (req, res, next) => {
  try {
    res.json(await sync.getChanges(req.user, {
      cursor: req.query.cursor,
      limit: req.query.limit,
      clientVersion: req.get('x-filespace-client-version'),
    }));
  } catch (error) {
    next(error);
  }
};

module.exports = { snapshot, changes };
