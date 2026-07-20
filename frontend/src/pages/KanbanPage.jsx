import { useEffect, useState, useRef } from 'react';
import * as api from '../api.js';
import { useAuth } from '../auth.jsx';
import './KanbanPage.css';

// ─── Status mappings ───────────────────────────────────────────────────────────
const COLUMNS = [
  { key: 'open',     label: 'Açık',      statuses: ['open'] },
  { key: 'assigned', label: 'Atandı',    statuses: ['assigned', 'pending_close'] },
  { key: 'closed',   label: 'Kapatıldı', statuses: ['closed'] },
];

// Map column key → patch status value
const COLUMN_TO_STATUS = {
  open:     'open',
  assigned: 'assigned',
  closed:   'closed',
};

// ─── Priority badge ────────────────────────────────────────────────────────────
function PriorityBadge({ priority }) {
  const label = priority === 'high'
    ? 'Yüksek'
    : priority === 'low'
    ? 'Düşük'
    : 'Normal';

  return (
    <span className={`kb-priority kb-priority--${priority ?? 'normal'}`}>
      {label}
    </span>
  );
}

// ─── Ticket Card ───────────────────────────────────────────────────────────────
function TicketCard({ ticket, onDragStart }) {
  const formattedDate = ticket.created_at
    ? new Date(ticket.created_at).toLocaleDateString('tr-TR', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      })
    : '—';

  const ownerName =
    ticket.owner_name ||
    ticket.owner?.name ||
    ticket.owner?.email ||
    'Bilinmiyor';

  return (
    <div
      className="kb-card"
      draggable
      onDragStart={(e) => onDragStart(e, ticket.id)}
      role="article"
      aria-label={`Bilet: ${ticket.title}`}
    >
      <div className="kb-card__header">
        <span className="kb-card__id">#{ticket.id}</span>
        <div style={{display: 'flex', gap: '4px', alignItems: 'center'}}>
          {(() => {
            if (ticket.status === 'closed' || ticket.status === 'pending_close') return null
            const hours = ticket.priority === 'high' ? 24 : ticket.priority === 'normal' ? 48 : 72
            const target = new Date(new Date(ticket.created_at).getTime() + hours * 60 * 60 * 1000)
            if (new Date() > target) {
              return <span style={{background: '#ef4444', color: '#fff', fontSize: '0.65rem', padding: '2px 6px', borderRadius: '10px', fontWeight: 'bold'}}>SLA Aşıldı</span>
            }
            return null
          })()}
          <PriorityBadge priority={ticket.priority} />
        </div>
      </div>

      <h3 className="kb-card__title">{ticket.title}</h3>

      <div className="kb-card__footer">
        <span className="kb-card__owner">
          <svg className="kb-icon" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 12c2.7 0 4.8-2.1 4.8-4.8S14.7 2.4 12 2.4 7.2 4.5 7.2 7.2 9.3 12 12 12zm0 2.4c-3.2 0-9.6 1.6-9.6 4.8v2.4h19.2v-2.4c0-3.2-6.4-4.8-9.6-4.8z" />
          </svg>
          {ownerName}
        </span>
        <span className="kb-card__date">
          <svg className="kb-icon" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M19 4h-1V2h-2v2H8V2H6v2H5C3.9 4 3 4.9 3 6v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 16H5V9h14v11zM7 11h5v5H7z" />
          </svg>
          {formattedDate}
        </span>
      </div>
    </div>
  );
}

// ─── Kanban Column ─────────────────────────────────────────────────────────────
function KanbanColumn({ column, tickets, onDragStart, onDrop }) {
  const [isDragOver, setIsDragOver] = useState(false);

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = () => {
    setIsDragOver(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragOver(false);
    onDrop(e, column.key);
  };

  return (
    <div
      className={`kb-column${isDragOver ? ' kb-column--dragover' : ''}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      aria-label={`${column.label} sütunu`}
    >
      <div className="kb-column__header">
        <span className="kb-column__title">{column.label}</span>
        <span className="kb-column__count">{tickets.length}</span>
      </div>

      <div className="kb-column__body">
        {tickets.length === 0 ? (
          <div className="kb-empty">
            <span>Bilet yok</span>
          </div>
        ) : (
          tickets.map((ticket) => (
            <TicketCard
              key={ticket.id}
              ticket={ticket}
              onDragStart={onDragStart}
            />
          ))
        )}
      </div>
    </div>
  );
}

// ─── Loading Spinner ───────────────────────────────────────────────────────────
function Spinner() {
  return (
    <div className="kb-spinner-wrapper" aria-label="Yükleniyor">
      <div className="kb-spinner" />
      <p className="kb-spinner__label">Biletler yükleniyor…</p>
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────
export default function KanbanPage() {
  const { user } = useAuth();
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const dragTicketId = useRef(null);

  const isManagerOrSupport =
    user?.role === 'manager' || user?.role === 'support';

  // Fetch tickets on mount
  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await api.fetchTickets('all');
        if (!cancelled) {
          setTickets(Array.isArray(data) ? data : data?.tickets ?? []);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err?.message ?? 'Biletler yüklenemedi.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => { cancelled = true; };
  }, []);

  // Group tickets into columns
  const grouped = COLUMNS.reduce((acc, col) => {
    acc[col.key] = tickets.filter((t) => col.statuses.includes(t.status));
    return acc;
  }, {});

  // ── Drag handlers ──────────────────────────────────────────────────────────
  const handleDragStart = (e, ticketId) => {
    dragTicketId.current = ticketId;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(ticketId));
  };

  const handleDrop = async (e, columnKey) => {
    e.preventDefault();
    const id = dragTicketId.current;
    if (!id) return;

    const ticket = tickets.find((t) => t.id === id);
    if (!ticket) return;

    const newStatus = COLUMN_TO_STATUS[columnKey];
    if (ticket.status === newStatus) return;          // no-op

    // Optimistically update UI
    setTickets((prev) =>
      prev.map((t) => (t.id === id ? { ...t, status: newStatus } : t))
    );

    try {
      await api.patchTicket(id, { status: newStatus });
    } catch (err) {
      // Rollback on failure
      setTickets((prev) =>
        prev.map((t) => (t.id === id ? { ...t, status: ticket.status } : t))
      );
      console.error('Status güncellenemedi:', err);
    } finally {
      dragTicketId.current = null;
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <main className="kb-page">
      <header className="kb-page__header">
        <div>
          <h1 className="kb-page__title">Kanban Panosu</h1>
          <p className="kb-page__subtitle">
            Destek biletlerini sürükle &amp; bırak ile yönetin
          </p>
        </div>

        {isManagerOrSupport && (
          <span className="kb-role-badge">
            {user.role === 'manager' ? 'Yönetici' : 'Destek'}
          </span>
        )}
      </header>

      {loading && <Spinner />}

      {!loading && error && (
        <div className="kb-error" role="alert">
          <strong>Hata:</strong> {error}
        </div>
      )}

      {!loading && !error && (
        <div className="kb-board">
          {COLUMNS.map((col) => (
            <KanbanColumn
              key={col.key}
              column={col}
              tickets={grouped[col.key]}
              onDragStart={handleDragStart}
              onDrop={handleDrop}
            />
          ))}
        </div>
      )}
    </main>
  );
}
