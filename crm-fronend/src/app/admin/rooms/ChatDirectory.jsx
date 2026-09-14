'use client';

import { useMemo, useState } from 'react';
import styles from './rooms.module.css';

const PAGE_SIZE = 10;
const normalize = (value) => String(value ?? '').trim().replace(/\s+/g, ' ').toLocaleLowerCase('ru');

function Pagination({ page, total, onChange }) {
  if (total <= 1) return null;
  return (
    <nav className={styles.pagination} aria-label="Страницы списка чатов">
      <button type="button" disabled={page === 1} onClick={() => onChange(page - 1)}>Назад</button>
      <span aria-live="polite">{page} / {total}</span>
      <button type="button" disabled={page === total} onClick={() => onChange(page + 1)}>Далее</button>
    </nav>
  );
}

function ChatGroup({ group, chatType, onEdit, onDelete }) {
  const [requestedPage, setPage] = useState(1);
  const totalPages = Math.ceil(group.chats.length / PAGE_SIZE);
  const page = Math.min(requestedPage, totalPages);
  return (
    <details className={styles.group}>
      <summary>
        <span className={styles.groupName}>{group.name}</span>
        <span className={styles.count}>{group.chats.length}</span>
      </summary>
      <ul className={styles.chatList}>
        {group.chats.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE).map((chat) => (
          <li key={chat.id} className={styles.chat}>
            <div className={styles.chatInfo}>
              <strong>{chat.name || 'Без названия'}</strong>
              <div className={styles.meta}>ID: {chat.id}</div>
              <div className={styles.meta}>Сотрудники: {chat.Users?.map((user) => user.name).join(', ') || 'Не указаны'}</div>
              {chatType === 'boss' && (
                <div className={styles.badges}>
                  <span>BOSS</span>
                  {Boolean(chat.mode) && <span>ПАПКИ</span>}
                  {Number(chat.retentionDays) > 0 && <span>{Number(chat.retentionDays)} дн.</span>}
                </div>
              )}
            </div>
            <div className={styles.actions}>
              <button type="button" onClick={() => onEdit(chat)}>Редактировать</button>
              <button type="button" className={styles.deleteButton} onClick={() => onDelete(chat.id)}>Удалить</button>
            </div>
          </li>
        ))}
      </ul>
      <Pagination page={page} total={totalPages} onChange={setPage} />
    </details>
  );
}

export default function ChatDirectory({ chats, chatType, onEdit, onDelete }) {
  const [query, setQuery] = useState('');
  const [requestedPage, setPage] = useState(1);
  const groups = useMemo(() => {
    const terms = normalize(query).split(' ').filter(Boolean);
    const grouped = new Map();
    for (const chat of chats) {
      const searchable = normalize([chat.name, chat.id, ...(chat.Users || []).map((user) => user.name)].join(' '));
      if (!terms.every((term) => searchable.includes(term))) continue;
      const name = String(chat.name || 'Без названия').trim().replace(/\s+/g, ' ');
      const key = normalize(name);
      if (!grouped.has(key)) grouped.set(key, { key, name, chats: [] });
      grouped.get(key).chats.push(chat);
    }
    return [...grouped.values()].sort((a, b) => a.name.localeCompare(b.name, 'ru', { numeric: true }));
  }, [chats, query]);
  const totalPages = Math.max(1, Math.ceil(groups.length / PAGE_SIZE));
  const page = Math.min(requestedPage, totalPages);
  const foundCount = groups.reduce((sum, group) => sum + group.chats.length, 0);

  return (
    <div>
      <label className={styles.searchLabel} htmlFor="chat-search">Найти чат</label>
      <input
        id="chat-search"
        type="search"
        className={styles.search}
        placeholder="Название, имя сотрудника или ID"
        value={query}
        onChange={(event) => { setQuery(event.target.value); setPage(1); }}
      />
      <p className={styles.meta} aria-live="polite">Чатов: {foundCount} из {chats.length} · Групп: {groups.length}</p>
      <p className={styles.hint}>Чаты с одинаковым названием объединены. Нажмите на группу, чтобы посмотреть чаты.</p>
      {groups.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE).map((group) => (
        <ChatGroup key={`${query}:${group.key}`} group={group} chatType={chatType} onEdit={onEdit} onDelete={onDelete} />
      ))}
      {groups.length === 0 && <p>{chats.length === 0 ? 'Чаты ещё не созданы.' : 'Ничего не найдено. Измените запрос.'}</p>}
      <Pagination page={page} total={totalPages} onChange={setPage} />
    </div>
  );
}
