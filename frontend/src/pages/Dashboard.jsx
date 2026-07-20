/* eslint-disable */
import { useEffect, useState } from "react";
import * as api from "../api.js";
import { PieChart, Pie, Cell, Tooltip, Legend, BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer, LineChart, Line } from "recharts";
import "./Dashboard.css";

const COLORS = ["var(--mau-magenta)", "#0ea5e9", "#10b981", "#f59e0b"];

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [trend, setTrend] = useState([]);

  useEffect(() => {
    api.fetchAnalytics()
      .then(d => {
        if (!d.error) setData(d);
      })
      .catch(err => console.error(err));
    api.fetchAnalyticsTrend()
      .then(d => { if (Array.isArray(d)) setTrend(d) })
      .catch(() => {});
  }, []);

  if (!data) return (
    <div className="dash-analytics-loading">
      <div className="dash-analytics-spinner" />
      <span>Analiz verileri yükleniyor…</span>
    </div>
  );

  const statusData = Object.keys(data.by_status || {}).map(k => ({ name: k, value: data.by_status[k] }));
  const prioData = Object.keys(data.by_priority || {}).map(k => ({ name: k, value: data.by_priority[k] }));

  return (
    <div className="dash-analytics">
      <div className="dash-analytics-header">
        <h1 className="dash-analytics-title">Analiz Paneli</h1>
        <p className="dash-analytics-subtitle">Destek talep istatistikleri ve personel performansı</p>
      </div>

      {/* KPI Kartları */}
      <div className="dash-analytics-kpis">
        <div className="dash-kpi-card">
          <div className="dash-kpi-label">Ortalama Çözüm Süresi</div>
          <div className="dash-kpi-value dash-kpi-value--blue">
            {data.mttr_hours ? data.mttr_hours.toFixed(1) + " Saat" : "—"}
          </div>
          <div className="dash-kpi-desc">MTTR (Mean Time to Resolve)</div>
        </div>

        <div className="dash-kpi-card">
          <div className="dash-kpi-label">Müşteri Memnuniyeti</div>
          <div className="dash-kpi-value dash-kpi-value--green">
            {data.avg_rating ? data.avg_rating.toFixed(1) + " / 5.0" : "—"}
          </div>
          <div className="dash-kpi-desc">CSAT (Ortalama Yıldız)</div>
        </div>
      </div>

      {/* Grafikler */}
      <div className="dash-analytics-charts">
        <div className="dash-chart-card">
          <h2 className="dash-chart-title">Talep Durumu Dağılımı</h2>
          <div className="dash-chart-area">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={statusData} cx="50%" cy="50%" outerRadius={85} dataKey="value" label>
                  {statusData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ background: 'var(--mau-card)', border: '1px solid var(--mau-border-subtle)', borderRadius: '8px', color: 'var(--mau-text)' }} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="dash-chart-card">
          <h2 className="dash-chart-title">Önceliğe Göre Talepler</h2>
          <div className="dash-chart-area">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={prioData} barSize={40}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--mau-border-subtle)" />
                <XAxis dataKey="name" tick={{ fill: 'var(--mau-text-muted)', fontSize: 13 }} />
                <YAxis tick={{ fill: 'var(--mau-text-muted)', fontSize: 13 }} />
                <Tooltip contentStyle={{ background: 'var(--mau-card)', border: '1px solid var(--mau-border-subtle)', borderRadius: '8px', color: 'var(--mau-text)' }} />
                <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                  {prioData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Memnuniyet Dağılımı (Satisfaction Chart) */}
      <div className="dash-analytics-charts" style={{ marginTop: '2rem' }}>
        <div className="dash-chart-card">
          <h2 className="dash-chart-title">Memnuniyet Dağılımı</h2>
          <div className="dash-chart-area">
            {data.rating_distribution && Object.keys(data.rating_distribution).length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie 
                    data={Object.keys(data.rating_distribution).map(k => ({ name: `${k}⭐`, value: data.rating_distribution[k] }))} 
                    cx="50%" cy="50%" outerRadius={85} dataKey="value" label
                  >
                    {Object.keys(data.rating_distribution).map((k, index) => {
                      const colors = { "5": "#059669", "4": "#10b981", "3": "#f59e0b", "2": "#f97316", "1": "#ef4444" };
                      return <Cell key={`cell-${index}`} fill={colors[k] || "#8884d8"} />;
                    })}
                  </Pie>
                  <Tooltip contentStyle={{ background: 'var(--mau-card)', border: '1px solid var(--mau-border-subtle)', borderRadius: '8px', color: 'var(--mau-text)' }} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div style={{display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--mau-text-muted)'}}>
                Henüz veri yok
              </div>
            )}
          </div>
        </div>

        <div className="dash-chart-card">
          <h2 className="dash-chart-title">Personel Başına Talep Sayısı</h2>
          <div className="dash-chart-area" style={{ minHeight: '300px' }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.by_assignee || []} barSize={30} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--mau-border-subtle)" vertical={false} />
                <XAxis dataKey="name" tick={{ fill: 'var(--mau-text-muted)', fontSize: 13 }} />
                <YAxis tick={{ fill: 'var(--mau-text-muted)', fontSize: 13 }} />
                <Tooltip contentStyle={{ background: 'var(--mau-card)', border: '1px solid var(--mau-border-subtle)', borderRadius: '8px', color: 'var(--mau-text)' }} cursor={{fill: 'var(--mau-page-bg)'}} />
                <Legend wrapperStyle={{ paddingTop: '20px' }} />
                <Bar dataKey="active" name="Aktif Talepler" stackId="a" fill="var(--brand-warning)" radius={[0, 0, 0, 0]} />
                <Bar dataKey="closed" name="Kapatılan Talepler" stackId="a" fill="var(--brand-success)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* 30 Günlük Trend */}
      {trend.length > 0 && (
        <div className="dash-analytics-charts" style={{ marginTop: '2rem' }}>
          <div className="dash-chart-card" style={{ gridColumn: '1 / -1' }}>
            <h2 className="dash-chart-title">Son 30 Gün — Talep Trendi</h2>
            <div className="dash-chart-area" style={{ minHeight: '300px' }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trend} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--mau-border-subtle)" vertical={false} />
                  <XAxis dataKey="date" tick={{ fill: 'var(--mau-text-muted)', fontSize: 11 }} />
                  <YAxis tick={{ fill: 'var(--mau-text-muted)', fontSize: 13 }} />
                  <Tooltip contentStyle={{ background: 'var(--mau-card)', border: '1px solid var(--mau-border-subtle)', borderRadius: '8px', color: 'var(--mau-text)' }} />
                  <Legend wrapperStyle={{ paddingTop: '20px' }} />
                  <Line type="monotone" dataKey="opened" name="Açılan" stroke="var(--mau-magenta)" strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 6 }} />
                  <Line type="monotone" dataKey="closed" name="Çözülen" stroke="var(--brand-success)" strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 6 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
