// components/SearchCard.jsx
'use client';
import React from 'react';
import { formatChatDate, formatChatTime } from './dateFormat';

function escapeRegExp(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

function highlightText(text = '', query = '') {
  if (!query) return text;
  const re = new RegExp(`(${escapeRegExp(query)})`, 'ig');
  const parts = text.split(re);
  return parts.map((part, i) =>
    re.test(part) ? <mark key={i} style={{ background: '#ffe58f' }}>{part}</mark> : <span key={i}>{part}</span>
  );
}

export default function SearchCard({ message, query, onClick }) {
  const date = new Date(message.date);
  const timeStr = formatChatTime(date);
  const dateStr = formatChatDate(date);

  return (
    <div
      onClick={onClick}
      style={{
        padding: 10,
        borderBottom: '1px solid #eee',
        cursor: 'pointer',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <div style={{ fontWeight: 600 }}>{message.userName}</div>
        <div style={{ fontSize: 12, color: '#888' }}>{dateStr} {timeStr}</div>
      </div>

      <div style={{ color: '#333', fontSize: 14 }}>
        {highlightText(message.text, query)}
      </div>
    </div>
  );
}
