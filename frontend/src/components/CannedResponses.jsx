import { useState, useRef, useEffect } from 'react';
import './CannedResponses.css';

const TEMPLATES = [
  'VPN bağlantınızı sıfırlamak için Ayarlar > VPN > Profili Sil yolunu izleyip yeniden ekleyin.',
  'Şifrenizi sıfırlamak için https://obs.mau.edu.tr/reset sayfasını kullanabilirsiniz.',
  'Sorununuz çözülmüş görünüyor. Başka bir ihtiyacınız olursa lütfen bildiriniz.',
  'Talebiniz ilgili birime yönlendirilmiştir. En kısa sürede geri dönüş yapılacaktır.',
  'Eduroam bağlantısı için kullanıcı adı olarak ogrencino@mau.edu.tr formatını kullanmanız gerekmektedir.',
  'Lütfen ekran görüntüsü veya hata mesajının tam metnini paylaşır mısınız?',
  'Laboratuvar yazılım talepleri dönem başında toplu olarak değerlendirilmektedir.',
  'Bilgisayarınızı yeniden başlatmayı ve sorunu tekrar kontrol etmeyi deneyiniz.'
];

export default function CannedResponses({ onSelect }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const popoverRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(event) {
      if (popoverRef.current && !popoverRef.current.contains(event.target)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filteredTemplates = TEMPLATES.filter(t => t.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="canned-responses" ref={popoverRef}>
      <button 
        type="button" 
        className="canned-responses-btn" 
        onClick={() => setOpen(!open)}
        title="Hazır Cevaplar"
      >
        <span role="img" aria-label="Hazır Cevaplar">⚡</span> Hazır Cevaplar
      </button>

      {open && (
        <div className="canned-responses-popover">
          <div className="canned-responses-search">
            <input 
              type="text" 
              placeholder="Cevap ara..." 
              value={search} 
              onChange={e => setSearch(e.target.value)} 
            />
          </div>
          <div className="canned-responses-list">
            {filteredTemplates.length > 0 ? (
              filteredTemplates.map((template, idx) => (
                <button
                  key={idx}
                  type="button"
                  className="canned-responses-item"
                  onClick={() => {
                    onSelect(template);
                    setOpen(false);
                    setSearch('');
                  }}
                >
                  {template}
                </button>
              ))
            ) : (
              <div className="canned-responses-empty">Sonuç bulunamadı.</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
