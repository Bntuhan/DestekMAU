import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import './FaqPage.css';

export default function FaqPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [openIndex, setOpenIndex] = useState(null);

  const faqs = [
    { q: 'OBS şifre sıfırlama', a: 'OBS şifrenizi sıfırlamak için obs.maltepe.edu.tr adresinden "Şifremi Unuttum" bağlantısına tıklayın. Öğrenci numaranız ve kayıtlı e-posta adresiniz ile şifrenizi yenileyebilirsiniz.' },
    { q: 'Eduroam Wi-Fi bağlantısı', a: 'Eduroam ağına bağlanmak için kullanıcı adı olarak ogrencinumaraniz@maltepe.edu.tr ve şifrenizi kullanın. Bağlantı sorunlarında sertifikayı kabul etmeniz gerekebilir.' },
    { q: 'VPN kurulumu', a: 'Kampüs dışından kütüphane veritabanlarına ve iç sistemlere erişmek için vpn.maltepe.edu.tr adresinden GlobalProtect istemcisini indirip kurmanız gerekmektedir.' },
    { q: 'E-posta hesabı açma', a: 'Yeni kayıtlı öğrencilerin e-posta hesapları otomatik olarak açılır. @std.maltepe.edu.tr uzantılı e-postanıza webmail.maltepe.edu.tr adresinden OBS şifreniz ile giriş yapabilirsiniz.' },
    { q: 'Laboratuvar yazılım talebi', a: 'Bilgisayar laboratuvarlarına özel yazılım (AutoCAD, SPSS, vb.) kurulumu için bölüm başkanlığı onaylı bir talep açmanız gerekmektedir.' },
    { q: 'Uzaktan erişim (RDP)', a: 'Uzaktan masaüstü bağlantısı için öncelikle VPN bağlantısı kurmalı, ardından yetkilendirildiğiniz makine IP adresine bağlanmalısınız.' },
    { q: 'Microsoft 365 lisansı aktivasyonu', a: 'office.com adresine öğrenci e-posta adresiniz ile giriş yaparak size tanımlanmış olan Microsoft 365 lisansını aktif edebilir ve ofis programlarını indirebilirsiniz.' },
    { q: 'Printer/Yazıcı bağlantısı', a: 'Ortak yazıcılara bağlanmak için ağ üzerinden yazıcı IP adresini girmeniz veya PaperCut istemcisini bilgisayarınıza kurmanız gereklidir.' },
    { q: 'Öğrenci belgesi yazdırma', a: 'E-devlet üzerinden e-imzalı veya E-kampüs sisteminden elektronik imzalı öğrenci belgesi alabilir ve çıktılarını herhangi bir yazıcıdan alabilirsiniz.' },
    { q: 'Antivirüs yazılımı yükleme', a: 'Üniversitemiz tarafından sağlanan lisanslı antivirüs yazılımını destek.maltepe.edu.tr portalındaki "Yazılımlar" sekmesinden indirebilirsiniz.' },
  ];

  const filteredFaqs = faqs.filter(f => f.q.toLowerCase().includes(search.toLowerCase()) || f.a.toLowerCase().includes(search.toLowerCase()));

  const toggleAccordion = (index) => {
    if (openIndex === index) {
      setOpenIndex(null);
    } else {
      setOpenIndex(index);
    }
  };

  return (
    <div className="faq-page fade-in">
      <div className="faq-header">
        <h1>Sıkça Sorulan Sorular</h1>
        <p>Bilgi Bankası</p>
      </div>

      <div className="faq-search-container">
        <input 
          type="text" 
          className="faq-search-input" 
          placeholder="Sorunuzu arayın..." 
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="faq-list">
        {filteredFaqs.length > 0 ? filteredFaqs.map((faq, index) => (
          <div key={index} className={`faq-item ${openIndex === index ? 'open' : ''}`}>
            <button className="faq-question" onClick={() => toggleAccordion(index)}>
              {faq.q}
              <span className="faq-icon">{openIndex === index ? '−' : '+'}</span>
            </button>
            <div className="faq-answer">
              <p>{faq.a}</p>
            </div>
          </div>
        )) : (
          <p className="faq-empty">Aradığınız kriterlere uygun sonuç bulunamadı.</p>
        )}
      </div>

      <div className="faq-footer">
        <p>Cevabınızı bulamadınız mı?</p>
        <button className="mau-btn mau-btn--primary" onClick={() => navigate('/app/yeni-talep')}>Destek talebi açın</button>
      </div>
    </div>
  );
}
