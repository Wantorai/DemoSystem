// models/associations.js

const Order = require('./Order');
const Addon = require('./Addon');
const Configs = require('./Configs');
const Config = require('./Config');
const OrderConfig = require('./OrderConfig');
const User = require('./User');
const Role = require('./Role');
const Permission = require('./Permission');
const DomainPageAccess = require('./DomainPageAccess');
const RolePermission = require("./RolePermission");
const PermissionParam = require('./PermissionParam');
const RolePermissionParam = require("./RolePermissionParam");
const Installer = require('./Installer');
const Client = require('./Client');
const Technic = require('./Technic');
const Record = require('./Record');
const StatusColorCRM = require('./StatusColorCRM');
const Manager = require('./Manager');
const Room = require('./Room');
const RoomUsers = require('./RoomUsers');
const RoomMessage = require('./RoomMessage');
const RoomExternalParticipant = require('./RoomExternalParticipant');
const BossChat      = require('./BossChat');
const BossChatUsers = require('./BossChatUsers');
const BossMessage   = require('./BossMessage');
const RoomMessageReaction = require('./RoomMessageReaction');
const BossMessageReaction = require('./BossMessageReaction');
const PushToken   = require('./PushToken');
const UserConsultChat   = require('./UserConsultChat');
const ChatMessage = require('./ChatMessage');
const BossPinnedMessage = require('./BossPinnedMessage');
const RoomPinnedMessage = require('./RoomPinnedMessage');
const RoomPinnedArchive = require('./RoomPinnedArchive');
const MaxChat = require('./MaxChat');
const MaxMessage = require('./MaxMessage');
const TelegramChat = require('./TelegramChat');
const TelegramMessage = require('./TelegramMessage');
const WhatsAppChat = require('./WhatsAppChat');
const WhatsAppMessage = require('./WhatsAppMessage');
const MessageDelivery = require('./MessageDelivery');
let ScheduledMessage = null;
try {
  ScheduledMessage = require('./ScheduledMessage');
} catch (err) {
  console.warn('[associations] ScheduledMessage model is missing, skipping associations');
}
let Reminder = null;
try {
  Reminder = require('./Reminder');
} catch (err) {
  console.warn('[associations] Reminder model is missing, skipping associations');
}
let AlertNotice = null;
let AlertNoticeRecipient = null;
try {
  AlertNotice = require('./AlertNotice');
  AlertNoticeRecipient = require('./AlertNoticeRecipient');
} catch (err) {
  console.warn('[associations] Alert models are missing, skipping associations');
}



User.hasOne(Technic, { foreignKey: 'userId' });
Technic.belongsTo(User, { foreignKey: 'userId' });
// Связь: один пользователь может иметь одну роль

User.hasOne(Installer, { foreignKey: 'userId' });
Installer.belongsTo(User, { foreignKey: 'userId' });
// Связь: один пользователь может иметь одну роль

User.hasOne(Manager, { foreignKey: 'userId' });
Manager.belongsTo(User, { foreignKey: 'userId' });
// Связь: один пользователь может иметь одну роль

// Связи ролей и прав
Role.belongsToMany(Permission, { through: RolePermission, foreignKey: "roleId", otherKey: 'permissionId' });
Role.belongsToMany(PermissionParam, { through: RolePermissionParam, foreignKey: "roleId", otherKey: 'permissionParamId' });
Permission.belongsToMany(Role, { through: RolePermission, foreignKey: "permissionId", otherKey: 'roleId' });
Permission.hasOne(DomainPageAccess, { foreignKey: 'permissionId', as: 'domainAccess' });
DomainPageAccess.belongsTo(Permission, { foreignKey: 'permissionId', as: 'permission' });
PermissionParam.belongsToMany(Role, { through: RolePermissionParam, foreignKey: "permissionParamId", otherKey: 'roleId' });
Role.hasMany(User, { foreignKey: "roleId" });
User.belongsTo(Role, { foreignKey: "roleId" });

// Для того чтобы можно было делать include Permission при запросе RolePermission:
RolePermission.belongsTo(Permission, { foreignKey: 'permissionId' });
RolePermissionParam.belongsTo(PermissionParam, { foreignKey: 'permissionParamId' });

// Связь: один заказ может иметь один объект конфигурации
Order.hasOne(OrderConfig, {
  foreignKey: 'order_id', 
  as: 'orderConfig',
});

OrderConfig.belongsTo(Order, {
  foreignKey: 'order_id',
  as: 'order',
}); 


Addon.hasMany(OrderConfig, { as: "orderConfigs", foreignKey: "addon_id" });
OrderConfig.belongsTo(Addon, { as: "addon", foreignKey: "addon_id" });


// models/Order.js
Addon.belongsTo(Order, { as: "order", foreignKey: "orderId" });
Order.hasMany(Addon, { as: "addons", foreignKey: "orderId" });

// Конфигурация имеет одну надстройку через addonId
Configs.belongsTo(Addon, { foreignKey: 'addonId' });

// Надстройка может быть связана только с одной конфигурацией
Addon.hasOne(Configs, { foreignKey: 'addonId' });


// Конфигурация может иметь несколько параметров
Configs.hasMany(Config, { as: "params", foreignKey: "configId", onDelete: "CASCADE" });

// Параметр принадлежит одной конфигурации
Config.belongsTo(Configs, { as: "config", foreignKey: "configId" });

// Для CRM
Record.belongsTo(StatusColorCRM, { foreignKey: 'statusId', as: 'status' });



// Связь: пользователи и комнаты (многие ко многим)
Room.belongsToMany(User, {
  through: RoomUsers,
  foreignKey: 'roomId',
  otherKey: 'userId',
});

User.belongsToMany(Room, {
  through: RoomUsers,
  foreignKey: 'userId',
  otherKey: 'roomId',
});

// Связь: сообщения и комнаты/пользователи (один ко многим)
Room.hasMany(RoomMessage, { foreignKey: 'roomId' });
Room.hasMany(RoomExternalParticipant, { foreignKey: 'roomId', as: 'externalParticipants' });
RoomExternalParticipant.belongsTo(Room, { foreignKey: 'roomId', as: 'room' });
RoomExternalParticipant.belongsTo(User, { foreignKey: 'invitedByUserId', as: 'invitedBy' });
User.hasMany(RoomMessage, { foreignKey: 'userId' });

RoomMessage.hasMany(RoomMessageReaction, { foreignKey: 'messageId', as: 'reactions' });
User.hasMany(RoomMessageReaction, { foreignKey: 'userId' });

// Вызываем associate у моделей, если есть
[Room, User, RoomMessage, RoomUsers, RoomMessageReaction, RoomExternalParticipant].forEach((model) => {
  if (typeof model.associate === 'function') {
    model.associate({ Room, User, RoomMessage, RoomUsers, RoomMessageReaction });
  }
});



BossMessage.belongsTo(User, {
  foreignKey: 'userId',
  onDelete: 'CASCADE',
});

BossChat.belongsToMany(User, {
  through: BossChatUsers,
  foreignKey: 'chatId',
  otherKey: 'userId',
});

User.belongsToMany(BossChat, {
  through: BossChatUsers,
  foreignKey: 'userId',
  otherKey: 'chatId',
});

// Связь: сообщения и комнаты/пользователи (один ко многим)
BossChat.hasMany(BossMessage, { foreignKey: 'chatId' });
User.hasMany(BossMessage, { foreignKey: 'userId' });

BossMessage.hasMany(BossMessageReaction, { foreignKey: 'messageId', as: 'reactions' });
User.hasMany(BossMessageReaction, { foreignKey: 'userId' });

// Вызываем associate у моделей, если есть
[BossChat, User, BossMessage, BossChatUsers, BossMessageReaction].forEach((model) => {
  if (typeof model.associate === 'function') {
    model.associate({ BossChat, User, BossMessage, BossChatUsers, BossMessageReaction });
  }
});

  User.hasMany(PushToken, { foreignKey: 'userId', as: 'pushTokens' });
  PushToken.belongsTo(User, { foreignKey: 'userId', as: 'user' });


  // связь UserConsultChat <-> User
UserConsultChat.belongsTo(User, {
  foreignKey: 'userId',
  as: 'user',
});
User.hasMany(UserConsultChat, {
  foreignKey: 'userId',
  as: 'consultChats',
});


ChatMessage.belongsTo(User, { foreignKey: 'userRefId', as: 'user' });
User.hasMany(ChatMessage, { foreignKey: 'userRefId', as: 'chatMessages' });

BossChatUsers.belongsTo(User, { foreignKey: 'userId', as: 'user' });
BossChatUsers.belongsTo(BossChat, { foreignKey: 'chatId', as: 'bosschat' });

RoomUsers.belongsTo(User, { foreignKey: 'userId', as: 'user' });
RoomUsers.belongsTo(Room, { foreignKey: 'roomId', as: 'room' });


// ассоциации для пинов
BossPinnedMessage.belongsTo(BossMessage, { foreignKey: 'messageId', as: 'message' });
BossPinnedMessage.belongsTo(User, { foreignKey: 'pinnedByUserId', as: 'pinnedBy' });
BossPinnedMessage.belongsTo(BossChat, { foreignKey: 'chatId' });

RoomPinnedMessage.belongsTo(RoomMessage, { foreignKey: 'messageId', as: 'message' });
RoomPinnedMessage.belongsTo(User, { foreignKey: 'pinnedByUserId', as: 'pinnedBy' });
RoomPinnedMessage.belongsTo(Room, { foreignKey: 'roomId' });

RoomPinnedArchive.belongsTo(RoomMessage, { foreignKey: 'messageId', as: 'message' });
RoomPinnedArchive.belongsTo(User, { foreignKey: 'userId', as: 'user' });
RoomPinnedArchive.belongsTo(Room, { foreignKey: 'roomId', as: 'room' });



MaxChat.hasMany(MaxMessage, { foreignKey: 'mChatId' });
MaxMessage.belongsTo(MaxChat, { foreignKey: 'mChatId' });
MaxChat.belongsTo(User, {
  foreignKey: 'assigneeId',
  as: 'assignee'
});
TelegramChat.hasMany(TelegramMessage, { foreignKey: 'tChatId' });
TelegramMessage.belongsTo(TelegramChat, { foreignKey: 'tChatId' });
TelegramChat.belongsTo(User, {
  foreignKey: 'assigneeId',
  as: 'assignee',
});
WhatsAppChat.hasMany(WhatsAppMessage, { foreignKey: 'wChatId' });
WhatsAppMessage.belongsTo(WhatsAppChat, { foreignKey: 'wChatId' });
WhatsAppChat.belongsTo(User, {
  foreignKey: 'assigneeId',
  as: 'assignee',
});

MessageDelivery.belongsTo(RoomMessage, { foreignKey: 'messageId' });
MessageDelivery.belongsTo(User, { foreignKey: 'userId' });
if (ScheduledMessage) {
  User.hasMany(ScheduledMessage, { foreignKey: 'userId' });
  ScheduledMessage.belongsTo(User, { foreignKey: 'userId' });
}
if (Reminder) {
  User.hasMany(Reminder, { foreignKey: 'creatorUserId' });
  Reminder.belongsTo(User, { foreignKey: 'creatorUserId' });
}
if (AlertNotice && AlertNoticeRecipient) {
  User.hasMany(AlertNotice, { foreignKey: 'creatorUserId', as: 'createdAlerts' });
  AlertNotice.belongsTo(User, { foreignKey: 'creatorUserId', as: 'creator' });

  AlertNotice.hasMany(AlertNoticeRecipient, { foreignKey: 'alertId', as: 'recipients' });
  AlertNoticeRecipient.belongsTo(AlertNotice, { foreignKey: 'alertId', as: 'alert' });

  User.hasMany(AlertNoticeRecipient, { foreignKey: 'userId' });
  AlertNoticeRecipient.belongsTo(User, { foreignKey: 'userId', as: 'user' });
}





// -------------------------------------------------------------------- //

module.exports = { Installer,
   Client, 
   Technic, 
   Order, 
   Addon, 
   Configs, 
   OrderConfig, 
   Config, 
   User, 
   Role, 
   Permission, 
   RolePermission, 
   PermissionParam, 
   RolePermissionParam,
   Record,
   StatusColorCRM,
   Manager,
   Room,
  RoomUsers,
  RoomMessage,
  RoomExternalParticipant,
  BossChat,
  BossChatUsers,
  BossMessage,
  RoomMessageReaction,
  BossMessageReaction,
  PushToken,
  UserConsultChat,
  ChatMessage,
  BossPinnedMessage,
  RoomPinnedMessage,
  RoomPinnedArchive,
   MaxChat, MaxMessage,
   TelegramChat, TelegramMessage,
   WhatsAppChat, WhatsAppMessage,
   ...(ScheduledMessage ? { ScheduledMessage } : {}),
   ...(Reminder ? { Reminder } : {}),
   ...(AlertNotice ? { AlertNotice } : {}),
   ...(AlertNoticeRecipient ? { AlertNoticeRecipient } : {})
};

