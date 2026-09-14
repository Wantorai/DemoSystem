function handlePayloadTooLarge(err, req, res, next) {
  if (err?.type !== 'entity.too.large') return next(err);
  return res.status(413).json({
    error: 'Слишком большой запрос. Сократите текст или отправьте его файлом.',
    code: 'PAYLOAD_TOO_LARGE',
    retryable: false,
  });
}

module.exports = { handlePayloadTooLarge };
