// crm-fronend\src\app\admin\rooms\page.js
'use client';

import { useState, useEffect, useContext, useCallback } from 'react';
import { toast } from 'react-toastify';
import { AuthContext } from "@/context/AuthContext"

const APP_PRIMARY_COLOR_FIELD = 'appPrimaryColor';
const APP_PRIMARY_COLOR_DEFAULT = '#E5A430';
const OUTGOING_BUBBLE_COLOR_FIELD = 'outgoingBubbleColor';
const OUTGOING_BUBBLE_COLOR_DEFAULT = '#FEF0D1';
const REMINDER_SENDER_USER_FIELD = 'consultProjectReminderSenderUserId';

const normalizeHexColor = (value) => {
  const raw = String(value ?? '').trim().replace(/^#/, '').toUpperCase();
  if (/^[0-9A-F]{6}$/.test(raw)) return `#${raw}`;
  return null;
};

export default function AdminRoomsPage() {

  const [chatType, _setChatType] = useState('room');
  const [chatId, setChatId]         = useState(null);
  const [chatName, setChatName]     = useState('');
  const [selectedUsers, setSelectedUsers] = useState(new Set());
  const [bossFoldersMode, setBossFoldersMode] = useState(false);
  const [bossRetentionDays, setBossRetentionDays] = useState('360');
  const { token } = useContext(AuthContext);

  // pick role → filter users
  const [roles, setRoles]           = useState([]);
  const [selectedRoleId, setSelectedRoleId] = useState(null);
  const [users, setUsers]           = useState([]);
  const [chats, setChats] = useState([]);
  const [consultAccessRows, setConsultAccessRows] = useState([]);
  const [appPrimaryColor, setAppPrimaryColor] = useState(APP_PRIMARY_COLOR_DEFAULT);
  const [appPrimaryColorRow, setAppPrimaryColorRow] = useState(null);
  const [savingAppPrimaryColor, setSavingAppPrimaryColor] = useState(false);
  const [outgoingBubbleColor, setOutgoingBubbleColor] = useState(OUTGOING_BUBBLE_COLOR_DEFAULT);
  const [outgoingBubbleColorRow, setOutgoingBubbleColorRow] = useState(null);
  const [savingOutgoingBubbleColor, setSavingOutgoingBubbleColor] = useState(false);
  const [allUsers, setAllUsers] = useState([]);
  const [reminderSenderUserId, setReminderSenderUserId] = useState('');
  const [reminderSenderRow, setReminderSenderRow] = useState(null);
  const [savingReminderSender, setSavingReminderSender] = useState(false);
  const getAuthHeaders = useCallback((extra = {}) => ({
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...extra,
  }), [token]);



   // обёртка — сброс формы и чатов
  const setChatType = value => {
    // сбрасываем форму редактирования
    resetForm();
    // очищаем список, чтобы сразу увидеть, что перезагружаем
    setChats([]);
    _setChatType(value);
  };

  // 1. load roles and chats on mount
  useEffect(() => {
   const loadData = async () => {
      try {
        // 1) роли всегда
        const rolesRes = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/admin/roles`, {
          headers: getAuthHeaders(),
        });
        setRoles(await rolesRes.json());

        const cfgRes = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/crm-config`);
        if (cfgRes.ok) {
          const cfgList = await cfgRes.json();
          const colorRow = Array.isArray(cfgList)
            ? cfgList.find((item) => item?.field === APP_PRIMARY_COLOR_FIELD)
            : null;
          const bubbleRow = Array.isArray(cfgList)
            ? cfgList.find((item) => item?.field === OUTGOING_BUBBLE_COLOR_FIELD)
            : null;
          const senderRow = Array.isArray(cfgList)
            ? cfgList.find((item) => item?.field === REMINDER_SENDER_USER_FIELD)
            : null;
          setAppPrimaryColorRow(colorRow || null);
          setOutgoingBubbleColorRow(bubbleRow || null);
          setReminderSenderRow(senderRow || null);
          const normalizedPrimary = normalizeHexColor(colorRow?.value);
          const normalizedBubble = normalizeHexColor(bubbleRow?.value);
          setAppPrimaryColor(normalizedPrimary || APP_PRIMARY_COLOR_DEFAULT);
          setOutgoingBubbleColor(normalizedBubble || OUTGOING_BUBBLE_COLOR_DEFAULT);
          setReminderSenderUserId(senderRow?.value ? String(senderRow.value) : '');
        } else {
          setAppPrimaryColorRow(null);
          setAppPrimaryColor(APP_PRIMARY_COLOR_DEFAULT);
          setOutgoingBubbleColorRow(null);
          setOutgoingBubbleColor(OUTGOING_BUBBLE_COLOR_DEFAULT);
          setReminderSenderRow(null);
          setReminderSenderUserId('');
        }

        if (token) {
          const usersRes = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/admin/users`, {
            headers: getAuthHeaders(),
          });
          if (usersRes.ok) {
            const usersData = await usersRes.json();
            setAllUsers(Array.isArray(usersData) ? usersData : []);
          } else {
            setAllUsers([]);
          }
        }

        // 2) подгружаем данные выбранного типа
        if (token) {
          // очищаем старые чаты сразу перед fetch, на всякий случай
          setChats([]);
          if (chatType === 'consult') {
            const res = await fetch(
              `${process.env.NEXT_PUBLIC_API_URL}/admin/consult/users`,
              { headers: { Authorization: `Bearer ${token}` } }
            );
            if (!res.ok) throw new Error('Ошибка загрузки доступа консультаций');
            const rows = await res.json();
            setConsultAccessRows(rows);
            setSelectedUsers(new Set(rows.filter(r => r.hasAccess).map(r => String(r.id))));
          } else {
            const endpoint = chatType === 'room' ? 'rooms' : 'boss/chats';
            const res = await fetch(
              `${process.env.NEXT_PUBLIC_API_URL}/admin/${endpoint}`,
              { headers: { Authorization: `Bearer ${token}` }
            });
            if (!res.ok) throw new Error('Ошибка загрузки чатов');
            setChats(await res.json());
          }
        }
      } catch (e) {
        console.error('loadData error', e);
      }
    };
    loadData();
  }, [token, chatType, getAuthHeaders]);



  
  // 2. load users when role changes
  useEffect(() => {
    if (!selectedRoleId) return setUsers([]);
    fetch(`${process.env.NEXT_PUBLIC_API_URL}/admin/users?roleId=${selectedRoleId}`, {
      headers: getAuthHeaders(),
    })
      .then(r => r.json())
      .then(raw => setUsers(raw.map(u => ({ ...u, id: u.id.toString() }))));
  }, [selectedRoleId, getAuthHeaders]);

  // toggle participant
  const toggleUser = id => {
    setSelectedUsers(prev => {
      const c = new Set(prev);
      if (c.has(id)) {
        c.delete(id);
      } else {
        c.add(id);
      }
      return c;
    });
  };


  const resetForm = () => {
    setChatId(null);
    setChatName('');
    setSelectedUsers(new Set());
    setBossFoldersMode(false);
    setBossRetentionDays('360');
  };

  const onEdit = (chat) => {
    setChatId(chat.id);
    setChatName(chat.name);
    setSelectedUsers(new Set(chat.Users.map((u) => u.id.toString())));
    setBossFoldersMode(Boolean(chat.mode));
    setBossRetentionDays(
      chat?.retentionDays == null || chat?.retentionDays === ''
        ? ''
        : String(chat.retentionDays)
    );
  };


  const handleDelete = async (id) => {
    if (!confirm('Удалить этот чат?')) return;
    try {
      const url =
        chatType === 'room'
          ? `${process.env.NEXT_PUBLIC_API_URL}/admin/rooms/${id}`
          : `${process.env.NEXT_PUBLIC_API_URL}/admin/boss/chats/${id}`;

      const res = await fetch(url, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error(await res.text());
      setChats(cs => cs.filter(c => c.id !== id));
    } catch (err) {
      console.error(err);
      toast(`Ошибка при удалении: ${err.message}`);
    }
  };


  const handleSubmit = async () => {
    if (chatType !== 'consult' && (!chatName.trim() || selectedUsers.size === 0)) {
      return toast('Введите имя и выберите пользователей');
    }

    const payload = {
      name: chatName.trim(),
      participants: Array.from(selectedUsers).map(Number),
      ...(chatType === 'boss'
        ? {
            mode: bossFoldersMode,
            retentionDays:
              bossRetentionDays === '' ? null : Math.max(0, Math.floor(Number(bossRetentionDays) || 0)),
          }
        : {}),
    };

    // 3. выбираем endpoint и метод
    const isEdit = !!chatId;
    const baseUrl =
      chatType === 'room'
        ? `${process.env.NEXT_PUBLIC_API_URL}/admin/rooms`
        : chatType === 'boss'
          ? `${process.env.NEXT_PUBLIC_API_URL}/admin/boss/chats`
          : `${process.env.NEXT_PUBLIC_API_URL}/admin/consult/users`;

    const url = chatType === 'consult' ? baseUrl : (isEdit ? `${baseUrl}/${chatId}` : baseUrl);
    const method = chatType === 'consult' ? 'PUT' : (isEdit ? 'PUT' : 'POST');

    try {
      const res = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const text = await res.text();
        return toast('Ошибка: ' + text);
      }
      const updated = await res.json();
      // 4. обновляем список
      if (chatType === 'consult') {
        const consultRes = await fetch(
          `${process.env.NEXT_PUBLIC_API_URL}/admin/consult/users`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        if (consultRes.ok) {
          const rows = await consultRes.json();
          setConsultAccessRows(rows);
          setSelectedUsers(new Set(rows.filter(r => r.hasAccess).map(r => String(r.id))));
        }
        toast('Доступ к консультациям обновлён');
      } else {
        setChats(prev => {
          const copy = [...prev.filter(c => c.id !== updated.id), updated];
          return copy.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        });
      }
      if (chatType !== 'consult') {
        resetForm();
      }
    } catch (err) {
      console.error(err);
      toast('Ошибка: ' + err.message);
    }
  };

  const saveAppPrimaryColor = async () => {
    const normalized = normalizeHexColor(appPrimaryColor);
    if (!normalized) {
      toast('Введите корректный HEX цвет, например #E5A430');
      return;
    }

    setSavingAppPrimaryColor(true);
    try {
      if (appPrimaryColorRow?.id) {
        const cfgRes = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/crm-config`);
        if (!cfgRes.ok) throw new Error('Ошибка загрузки конфигурации');
        const configs = await cfgRes.json();
        const nextConfigs = (Array.isArray(configs) ? configs : []).map((cfg) => {
          if (cfg?.id !== appPrimaryColorRow.id) return cfg;
          return { ...cfg, value: normalized };
        });

        const putRes = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/crm-config`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ configs: nextConfigs }),
        });
        if (!putRes.ok) throw new Error(await putRes.text());
        const updated = await putRes.json();
        const row = Array.isArray(updated)
          ? updated.find((item) => item?.field === APP_PRIMARY_COLOR_FIELD)
          : null;
        setAppPrimaryColorRow(row || appPrimaryColorRow);
      } else {
        const postRes = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/crm-config`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            field: APP_PRIMARY_COLOR_FIELD,
            label: 'Общий цвет приложения',
            width: '140px',
            order: 9999,
            active: true,
            activeInside: false,
            type: 'string',
            value: normalized,
          }),
        });
        if (!postRes.ok) throw new Error(await postRes.text());
        const created = await postRes.json();
        setAppPrimaryColorRow(created);
      }
      setAppPrimaryColor(normalized);
      toast('Цвет приложения сохранён');
    } catch (err) {
      console.error('saveAppPrimaryColor error', err);
      toast(`Ошибка сохранения цвета: ${err.message}`);
    } finally {
      setSavingAppPrimaryColor(false);
    }
  };

  const saveReminderSender = async () => {
    const normalizedUserId = Number(reminderSenderUserId);
    if (!Number.isFinite(normalizedUserId) || normalizedUserId <= 0) {
      toast('Выберите пользователя-отправителя');
      return;
    }

    setSavingReminderSender(true);
    try {
      if (reminderSenderRow?.id) {
        const cfgRes = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/crm-config`);
        if (!cfgRes.ok) throw new Error('Ошибка загрузки конфигурации');
        const configs = await cfgRes.json();
        const nextConfigs = (Array.isArray(configs) ? configs : []).map((cfg) => {
          if (cfg?.id !== reminderSenderRow.id) return cfg;
          return { ...cfg, value: String(normalizedUserId) };
        });

        const putRes = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/crm-config`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ configs: nextConfigs }),
        });
        if (!putRes.ok) throw new Error(await putRes.text());
        const updated = await putRes.json();
        const row = Array.isArray(updated)
          ? updated.find((item) => item?.field === REMINDER_SENDER_USER_FIELD)
          : null;
        setReminderSenderRow(row || reminderSenderRow);
      } else {
        const postRes = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/crm-config`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            field: REMINDER_SENDER_USER_FIELD,
            label: 'Отправитель напоминаний по готовности проекта',
            width: '260px',
            order: 10000,
            active: true,
            activeInside: false,
            type: 'string',
            value: String(normalizedUserId),
          }),
        });
        if (!postRes.ok) throw new Error(await postRes.text());
        const created = await postRes.json();
        setReminderSenderRow(created);
      }

      setReminderSenderUserId(String(normalizedUserId));
      toast('Пользователь-отправитель сохранён');
    } catch (err) {
      console.error('saveReminderSender error', err);
      toast(`Ошибка сохранения отправителя: ${err.message}`);
    } finally {
      setSavingReminderSender(false);
    }
  };

  const saveOutgoingBubbleColor = async () => {
    const normalized = normalizeHexColor(outgoingBubbleColor);
    if (!normalized) {
      toast('Введите корректный HEX цвет, например #FEF0D1');
      return;
    }

    setSavingOutgoingBubbleColor(true);
    try {
      if (outgoingBubbleColorRow?.id) {
        const cfgRes = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/crm-config`);
        if (!cfgRes.ok) throw new Error('Ошибка загрузки конфигурации');
        const configs = await cfgRes.json();
        const nextConfigs = (Array.isArray(configs) ? configs : []).map((cfg) => {
          if (cfg?.id !== outgoingBubbleColorRow.id) return cfg;
          return { ...cfg, value: normalized };
        });

        const putRes = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/crm-config`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ configs: nextConfigs }),
        });
        if (!putRes.ok) throw new Error(await putRes.text());
        const updated = await putRes.json();
        const row = Array.isArray(updated)
          ? updated.find((item) => item?.field === OUTGOING_BUBBLE_COLOR_FIELD)
          : null;
        setOutgoingBubbleColorRow(row || outgoingBubbleColorRow);
      } else {
        const postRes = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/crm-config`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            field: OUTGOING_BUBBLE_COLOR_FIELD,
            label: 'Цвет пузыря моего сообщения',
            width: '180px',
            order: 10001,
            active: true,
            activeInside: false,
            type: 'string',
            value: normalized,
          }),
        });
        if (!postRes.ok) throw new Error(await postRes.text());
        const created = await postRes.json();
        setOutgoingBubbleColorRow(created);
      }

      setOutgoingBubbleColor(normalized);
      toast('Цвет пузыря сохранён');
    } catch (err) {
      console.error('saveOutgoingBubbleColor error', err);
      toast(`Ошибка сохранения цвета пузыря: ${err.message}`);
    } finally {
      setSavingOutgoingBubbleColor(false);
    }
  };


return (
  <div style={{ maxWidth: 800, margin: '0 auto', padding: 20 }}>
    <h1>Создание чат‑групп</h1>

    <div style={{ border: '1px solid #ccc', padding: 16, marginBottom: 16 }}>
      <h2 style={{ marginTop: 0 }}>Общие настройки</h2>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        <div>
          <h3 style={{ marginTop: 0 }}>Цвет приложения</h3>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <input
              type="color"
              value={normalizeHexColor(appPrimaryColor) || APP_PRIMARY_COLOR_DEFAULT}
              onChange={(e) => setAppPrimaryColor(e.target.value)}
              style={{ width: 48, height: 40, padding: 0, border: 'none', background: 'transparent' }}
            />
            <input
              value={appPrimaryColor}
              onChange={(e) => setAppPrimaryColor(e.target.value)}
              placeholder="#E5A430"
              style={{ width: 140, padding: 8, textTransform: 'uppercase' }}
            />
            <button
              onClick={saveAppPrimaryColor}
              disabled={savingAppPrimaryColor}
              style={{ padding: '8px 14px' }}
            >
              {savingAppPrimaryColor ? 'Сохранение…' : 'Сохранить'}
            </button>
            <div
              title="Превью"
              style={{
                width: 26,
                height: 26,
                borderRadius: 6,
                border: '1px solid #ccc',
                backgroundColor: normalizeHexColor(appPrimaryColor) || APP_PRIMARY_COLOR_DEFAULT,
              }}
            />
          </div>
          <div style={{ marginTop: 8, color: '#666', fontSize: 13 }}>
            Основной цвет
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 12 }}>
            <input
              type="color"
              value={normalizeHexColor(outgoingBubbleColor) || OUTGOING_BUBBLE_COLOR_DEFAULT}
              onChange={(e) => setOutgoingBubbleColor(e.target.value)}
              style={{ width: 48, height: 40, padding: 0, border: 'none', background: 'transparent' }}
            />
            <input
              value={outgoingBubbleColor}
              onChange={(e) => setOutgoingBubbleColor(e.target.value)}
              placeholder="#FEF0D1"
              style={{ width: 140, padding: 8, textTransform: 'uppercase' }}
            />
            <button
              onClick={saveOutgoingBubbleColor}
              disabled={savingOutgoingBubbleColor}
              style={{ padding: '8px 14px' }}
            >
              {savingOutgoingBubbleColor ? 'Сохранение…' : 'Сохранить'}
            </button>
            <div
              title="Превью"
              style={{
                width: 26,
                height: 26,
                borderRadius: 6,
                border: '1px solid #ccc',
                backgroundColor: normalizeHexColor(outgoingBubbleColor) || OUTGOING_BUBBLE_COLOR_DEFAULT,
              }}
            />
          </div>
          <div style={{ marginTop: 8, color: '#666', fontSize: 13 }}>
            Цвет пузыря
          </div>
        </div>

        <div>
          <h3 style={{ marginTop: 0 }}>Отправитель напоминаний</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <select
              value={reminderSenderUserId}
              onChange={(e) => setReminderSenderUserId(e.target.value)}
              style={{ width: '100%', padding: 8 }}
            >
              <option value="">— выбрать пользователя —</option>
              {allUsers.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name} (id: {u.id})
                </option>
              ))}
            </select>
            <button
              onClick={saveReminderSender}
              disabled={savingReminderSender}
              style={{ padding: '8px 14px', width: 'fit-content' }}
            >
              {savingReminderSender ? 'Сохранение…' : 'Сохранить'}
            </button>
            <div style={{ color: '#666', fontSize: 13 }}>
              Уведомления по готовности проекта будут отправляться от выбранного пользователя.
            </div>
          </div>
        </div>
      </div>
    </div>

    {/* ► Тип чата */}
    <div style={{ marginBottom: 16 }}>
      <label style={{ marginRight: 8 }}>Тип чата:</label>
      <select
        value={chatType}
        onChange={e => setChatType(e.target.value)}
        style={{ padding: 8 }}
      >
        <option value="room">Обычный чат (room)</option>
        <option value="boss">Чат по доступу (boss)</option>
        <option value="consult">Консультации (доступ)</option>
      </select>
    </div>

    {/* ► Форма создания/редактирования */}
    <div style={{ border: '1px solid #ccc', padding: 16, marginBottom: 24 }}>
      <h2>
        {chatType === 'consult'
          ? 'Доступ к консультациям'
          : `${chatId ? 'Редактировать' : 'Новый'} ${chatType === 'boss' ? 'boss‑чат' : 'чат‑группа'}`}
      </h2>

            {/* Название */}
      {chatType !== 'consult' && (
        <input
          placeholder="Имя чат‑группы"
          value={chatName}
          onChange={e => setChatName(e.target.value)}
          style={{ width: '-webkit-fill-available', padding: 8, marginBottom: 12 }}
        />
      )}

      {chatType === 'boss' && (
        <>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <input
              type="checkbox"
              checked={bossFoldersMode}
              onChange={e => setBossFoldersMode(e.target.checked)}
            />
            Режим папок по сотрудникам
          </label>

          <label style={{ display: 'block', marginBottom: 12 }}>
            <div style={{ marginBottom: 6 }}>Хранение сообщений (дней)</div>
            <input
              type="number"
              min="0"
              step="1"
              value={bossRetentionDays}
              onChange={(e) => setBossRetentionDays(e.target.value)}
              placeholder="360"
              style={{ width: 180, padding: 8 }}
            />
            <div style={{ marginTop: 6, fontSize: 12, color: '#666' }}>
              0 или пусто — без ограничения. Для новых boss-чатов по умолчанию 360 дней.
            </div>
          </label>
        </>
      )}

      {/* Роль участников */}
      <select
        value={selectedRoleId || ''}
        onChange={e => setSelectedRoleId(e.target.value || null)}
        style={{ width: '100%', padding: 8, marginBottom: 12 }}
      >
        <option value="">— выбрать по роли —</option>
        {roles.map(r => (
          <option key={r.id} value={r.id}>{r.name}</option>
        ))}
      </select>

      {/* Список пользователей */}
      <div style={{ maxHeight: 200, overflowY: 'auto', marginBottom: 12 }}>
        {users.map(u => (
          <label key={u.id} style={{ display:'block' }}>
            <input
              type="checkbox"
              checked={selectedUsers.has(u.id)}
              onChange={() => toggleUser(u.id)}
            />
            {' '}{u.name} (role {u.roleId})
          </label>
        ))}
      </div>

      <div style={{ marginBottom: 12, fontStyle: 'italic' }}>
        ** Можно выбрать из разных ролей, затем нажать «Создать». **
      </div>

      {/* Кнопки */}
      <button onClick={handleSubmit} style={{ padding: '8px 16px' }}>
        {chatType === 'consult'
          ? 'Сохранить доступ'
          : `${chatId ? 'Обновить' : 'Создать'} ${chatType === 'boss' ? 'boss‑чат' : 'чат'}`}
      </button>
      {chatId && (
        <button
          onClick={resetForm}
          style={{ marginLeft: 12, padding: '8px 16px' }}
        >
          Отмена
        </button>
      )}
    </div>

    {/* ► Список существующих */}
    <div>
      <h2>
        {chatType === 'consult' ? 'Пользователи с доступом' : `Созданные ${chatType === 'boss' ? 'boss‑чаты' : 'чат‑группы'}`}
      </h2>
      {chatType === 'consult' ? (
        <p>
          Выбрано пользователей: {selectedUsers.size} из {consultAccessRows.length}
        </p>
      ) : chats.length === 0 ? (
        <p>Еще не создано</p>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0 }}>
          {chats.map(c => (
            <li
              key={c.id}
              style={{
                marginBottom: 12,
                borderBottom: '1px solid #eee',
                paddingBottom: 8
              }}
            >
              {/* Пометка boss-чата */}
              <strong>
                {c.name}
                {chatType === 'boss' && (
                  <>
                    <span style={{
                      marginLeft: 8,
                      padding: '2px 6px',
                      fontSize: 12,
                      backgroundColor: '#ffd700',
                      borderRadius: 4
                    }}>
                      BOSS
                    </span>
                    {Boolean(c.mode) && (
                      <span style={{
                        marginLeft: 6,
                        padding: '2px 6px',
                        fontSize: 12,
                        backgroundColor: '#d1fae5',
                        borderRadius: 4,
                        color: '#065f46'
                      }}>
                        ПАПКИ
                      </span>
                    )}
                    {Number.isFinite(Number(c.retentionDays)) && Number(c.retentionDays) > 0 && (
                      <span style={{
                        marginLeft: 6,
                        padding: '2px 6px',
                        fontSize: 12,
                        backgroundColor: '#eef2ff',
                        borderRadius: 4,
                        color: '#3730a3'
                      }}>
                        {Number(c.retentionDays)} дн.
                      </span>
                    )}
                  </>
                )}
              </strong>
              <br/>
              ID: {c.id}<br/>
              Сотрудники: {c.Users.map((u) => u.name).join(', ')}<br/>
              <button onClick={() => onEdit(c)} style={{ marginRight: 8 }}>
                Редактировать
              </button>
              <button onClick={() => handleDelete(c.id)}>
                Удалить
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  </div>
);



  // return (
  //   <div style={{ maxWidth: 800, margin: '0 auto', padding: 20 }}>
  //     <h1>Создание чат-групп</h1>

  //     {/* ► Room form */}
  //     <div style={{ border: '1px solid #ccc', padding: 16, marginBottom: 24 }}>
  //       <h2>{roomId ? 'Редактировать чат' : 'Новый чат'}</h2>
  //       <input
  //         placeholder="Имя чат-группы"
  //         value={roomName}
  //         onChange={e => setRoomName(e.target.value)}
  //         style={{ width: '-webkit-fill-available', padding: 8, marginBottom: 12 }}
  //       />

  //       <select
  //         value={selectedRoleId || ''}
  //         onChange={e => setSelectedRoleId(e.target.value || null)}
  //         style={{ width: '100%', padding: 8, marginBottom: 12 }}
  //       >
  //         <option value="">— выбрать по роли —</option>
  //         {roles.map(r=>(
  //           <option key={r.id} value={r.id}>{r.name}</option>
  //         ))}
  //       </select>

  //       <div style={{ maxHeight: 200, overflowY: 'auto', marginBottom: 12 }}>
  //         {users.map(u=>(
  //           <label key={u.id} style={{ display:'block' }}>
  //             <input
  //               type="checkbox"
  //               checked={selectedUsers.has(u.id)}
  //               onChange={()=>toggleUser(u.id)}
  //             />
  //             {' '}{u.name} (role {u.roleId})
  //           </label>
  //         ))}
  //       </div>
  //       <div>
  //         ** Выбрать можно из разных ролей, а потом нажать создать. **
  //       </div>

  //       <button onClick={handleSubmit} style={{ padding: '8px 16px' }}>
  //         {roomId ? 'Обновить' : 'Создать'}
  //       </button>
  //       {roomId && (
  //         <button
  //           onClick={resetForm}
  //           style={{ marginLeft: 12, padding: '8px 16px' }}
  //         >Cancel</button>
  //       )}
  //     </div>

  //     {/* ► Rooms list */}
  //     <div>
  //       <h2>Созданные чат-группы</h2>
  //       {rooms.length === 0 ? (
  //         <p>Еще не создано</p>
  //       ) : (
  //         <ul style={{ listStyle: 'none', padding: 0 }}>
  //           {rooms.map(room => (
  //             <li key={room.id} style={{ marginBottom: 12, borderBottom: '1px solid #eee', paddingBottom: 8 }}>
  //               <strong>{room.name}</strong> (ID: {room.id})<br/>
  //               Users: {room.Users.map(u=>u.name).join(', ')}<br/>
  //               <button onClick={()=>onEdit(room)} style={{ marginRight: 8 }}>Редактировать</button>
  //               <button onClick={() => handleDelete(room.id)}>
  //                 Удалить
  //               </button>
  //             </li>
  //           ))}
  //         </ul>
  //       )}
  //     </div>
  //   </div>
  // );
}

