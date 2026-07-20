import { useState, useEffect } from 'react';
import './AuditLogPage.css';

export default function AuditLogPage() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    const fetchLogs = async () => {
      try {
        const res = await fetch('/api/audit-log', {
          headers: { 'Authorization': `Bearer ${localStorage.getItem('destek_token')}` }
        });
        if (res.ok) {
          const data = await res.json();
          setLogs(data);
        }
      } catch (error) {
        console.error('Fetch error:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchLogs();
  }, []);

  const filteredLogs = logs.filter(log => 
    (log.user_name && log.user_name.toLowerCase().includes(search.toLowerCase())) ||
    (log.action && log.action.toLowerCase().includes(search.toLowerCase())) ||
    (log.detail && log.detail.toLowerCase().includes(search.toLowerCase())) ||
    (log.ip_address && log.ip_address.includes(search))
  );

  const getActionColor = (action) => {
    if (action.includes('success')) return 'al-badge-success';
    if (action.includes('fail') || action.includes('error')) return 'al-badge-danger';
    if (action.includes('create') || action.includes('add')) return 'al-badge-primary';
    if (action.includes('update') || action.includes('edit')) return 'al-badge-warning';
    if (action.includes('delete') || action.includes('remove')) return 'al-badge-danger';
    return 'al-badge-default';
  };

  return (
    <div className="audit-log-page fade-in">
      <div className="al-header">
        <h1>Sistem Denetim Günlüğü</h1>
        <p>Sistemdeki önemli işlemleri ve güvenlik olaylarını izleyin.</p>
      </div>

      <div className="al-card">
        <div className="al-controls">
          <input 
            type="text" 
            className="al-search" 
            placeholder="Kullanıcı, işlem veya IP ara..." 
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>

        <div className="al-table-container">
          {loading ? (
            <p className="al-message">Günlükler yükleniyor...</p>
          ) : filteredLogs.length === 0 ? (
            <p className="al-message">Kayıt bulunamadı.</p>
          ) : (
            <table className="al-table">
              <thead>
                <tr>
                  <th>Tarih</th>
                  <th>Kullanıcı</th>
                  <th>İşlem</th>
                  <th>Detay</th>
                  <th>IP Adresi</th>
                </tr>
              </thead>
              <tbody>
                {filteredLogs.map(log => (
                  <tr key={log.id}>
                    <td className="al-date">{new Date(log.created_at).toLocaleString('tr-TR')}</td>
                    <td className="al-user">{log.user_name || '-'}</td>
                    <td>
                      <span className={`al-badge ${getActionColor(log.action)}`}>
                        {log.action}
                      </span>
                    </td>
                    <td className="al-detail">{log.detail}</td>
                    <td className="al-ip">{log.ip_address}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
