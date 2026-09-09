const AVATAR_COLORS = ['#e57373', '#64b5f6', '#81c784', '#ffb74d', '#9575cd', '#4db6ac'];

function getUserAvatarColor(userId) {
  const value = String(userId ?? '');
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = value.charCodeAt(index) + ((hash << 5) - hash);
    hash |= 0;
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

module.exports = { AVATAR_COLORS, getUserAvatarColor };
