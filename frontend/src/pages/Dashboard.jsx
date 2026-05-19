/* eslint-disable */
import { useEffect, useState } from "react";
import * as api from "../api.js";
import { PieChart, Pie, Cell, Tooltip, Legend, BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer } from "recharts";

const COLORS = ["#0088FE", "#00C49F", "#FFBB28", "#FF8042"];

export default function Dashboard({ user }) {
  const [data, setData] = useState(null);

  useEffect(() => {
    api.fetchAnalytics()
      .then(d => {
        if (!d.error) setData(d);
      })
      .catch(err => console.error(err));
  }, []);

  if (!data) return <div className="p-8">Yükleniyor...</div>;

  const statusData = Object.keys(data.by_status || {}).map(k => ({ name: k, value: data.by_status[k] }));
  const prioData = Object.keys(data.by_priority || {}).map(k => ({ name: k, value: data.by_priority[k] }));

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Analiz Paneli</h1>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* KPI Cards */}
        <div className="p-6 rounded-lg shadow-sm border flex flex-col items-center justify-center" style={{ backgroundColor: 'var(--mau-card)', borderColor: 'var(--mau-border-subtle)' }}>
          <h2 className="mb-2" style={{ color: 'var(--mau-text-muted)' }}>Ortalama Çözüm Süresi</h2>
          <div className="text-4xl font-bold text-blue-600">
            {data.mttr_hours ? data.mttr_hours.toFixed(1) + " Saat" : "Veri Yok"}
          </div>
        </div>
        
        <div className="p-6 rounded-lg shadow-sm border flex flex-col items-center justify-center" style={{ backgroundColor: 'var(--mau-card)', borderColor: 'var(--mau-border-subtle)' }}>
          <h2 className="mb-2" style={{ color: 'var(--mau-text-muted)' }}>Müşteri Memnuniyeti (CSAT)</h2>
          <div className="text-4xl font-bold text-green-500">
            {data.avg_rating ? data.avg_rating.toFixed(1) + " / 5.0" : "Veri Yok"}
          </div>
        </div>

        {/* Charts */}
        <div className="p-6 rounded-lg shadow-sm border" style={{ backgroundColor: 'var(--mau-card)', borderColor: 'var(--mau-border-subtle)' }}>
          <h2 className="text-lg font-semibold mb-4" style={{ color: 'var(--mau-text)' }}>Talep Durumu Dağılımı</h2>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={statusData} cx="50%" cy="50%" outerRadius={80} fill="#8884d8" dataKey="value" label>
                  {statusData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="p-6 rounded-lg shadow-sm border" style={{ backgroundColor: 'var(--mau-card)', borderColor: 'var(--mau-border-subtle)' }}>
          <h2 className="text-lg font-semibold mb-4" style={{ color: 'var(--mau-text)' }}>Önceliğe Göre Talepler</h2>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={prioData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="value" fill="#82ca9d">
                  {prioData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}
