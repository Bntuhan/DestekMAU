-- Test verisi: kullanıcılar ve talepler
-- Tüm test hesapları şifre: test2026

-- Rol ve durum kısıtlarını güncelle (eski DB'ler)
PRAGMA foreign_keys=OFF;
CREATE TABLE IF NOT EXISTS users_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  password TEXT NOT NULL,
  display_name TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('user','superuser','support','manager')),
  user_type TEXT DEFAULT ''
);
INSERT OR IGNORE INTO users_new SELECT id, email, password, display_name, role, user_type FROM users;
DROP TABLE IF EXISTS users_backup;
ALTER TABLE users RENAME TO users_backup;
ALTER TABLE users_new RENAME TO users;
DROP TABLE users_backup;

-- pending_close durumu için şema güncellemesi
CREATE TABLE IF NOT EXISTS tickets_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','assigned','closed','pending_close')),
  priority TEXT NOT NULL DEFAULT 'normal' CHECK(priority IN ('low','normal','high')),
  assignee_id INTEGER,
  photo_path TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  resolved_at TEXT,
  rating INTEGER,
  FOREIGN KEY(user_id) REFERENCES users(id),
  FOREIGN KEY(assignee_id) REFERENCES users(id)
);
INSERT INTO tickets_new SELECT id, user_id, title, description, status, priority, assignee_id, photo_path, created_at, updated_at, resolved_at, rating FROM tickets;
DROP TABLE tickets;
ALTER TABLE tickets_new RENAME TO tickets;
PRAGMA foreign_keys=ON;

INSERT OR IGNORE INTO users (email, password, display_name, role, user_type) VALUES
  ('yonetici@maltepe.edu.tr', 'test2026', 'Yönetici Demo', 'manager', 'Akademik Personel'),
  ('personel1@maltepe.edu.tr', 'test2026', 'Ahmet Yılmaz', 'support', 'Destek Personeli'),
  ('personel2@maltepe.edu.tr', 'test2026', 'Ayşe Kaya', 'support', 'Destek Personeli'),
  ('ogrenci2@maltepe.edu.tr', 'test2026', 'Zeynep Arslan', 'user', 'Öğrenci'),
  ('ogrenci3@maltepe.edu.tr', 'test2026', 'Mehmet Demir', 'user', 'Öğrenci');

-- Talep 2: 1/2 personel tamamladı (ilerleme testi)
INSERT INTO tickets (user_id, title, description, status, priority, assignee_id, photo_path, created_at, updated_at)
SELECT id, 'Projeksiyon çalışmıyor', 'D-201 dersliğinde projeksiyon görüntü vermiyor.', 'assigned', 'high', NULL, NULL,
  '2026-05-18T09:00:00Z', '2026-05-19T10:00:00Z'
FROM users WHERE email = 'ogrenci2@maltepe.edu.tr';

INSERT INTO ticket_assignees (ticket_id, user_id, is_completed)
SELECT (SELECT id FROM tickets WHERE title = 'Projeksiyon çalışmıyor'), id, 1
FROM users WHERE email = 'personel1@maltepe.edu.tr';
INSERT INTO ticket_assignees (ticket_id, user_id, is_completed)
SELECT (SELECT id FROM tickets WHERE title = 'Projeksiyon çalışmıyor'), id, 0
FROM users WHERE email = 'personel2@maltepe.edu.tr';

-- Talep 3: İki personel atandı, kimse tamamlamadı
INSERT INTO tickets (user_id, title, description, status, priority, assignee_id, photo_path, created_at, updated_at)
SELECT id, 'Kampüs Wi-Fi bağlantı sorunu', 'Yurt binasında sürekli kopma var.', 'assigned', 'normal', NULL, NULL,
  '2026-05-19T08:30:00Z', '2026-05-19T11:00:00Z'
FROM users WHERE email = 'ogrenci3@maltepe.edu.tr';

INSERT INTO ticket_assignees (ticket_id, user_id, is_completed)
SELECT (SELECT id FROM tickets WHERE title = 'Kampüs Wi-Fi bağlantı sorunu'), id, 0
FROM users WHERE email IN ('personel1@maltepe.edu.tr', 'personel2@maltepe.edu.tr');

-- Talep 4: Herkes tamamladı, onay bekliyor
INSERT INTO tickets (user_id, title, description, status, priority, assignee_id, photo_path, created_at, updated_at)
SELECT id, 'Laboratuvar yazıcı arızası', 'Kimya lab yazıcısı kağıt sıkıştırıyor.', 'pending_close', 'normal', NULL, NULL,
  '2026-05-17T14:00:00Z', '2026-05-19T12:00:00Z'
FROM users WHERE email = 'ogrenci2@maltepe.edu.tr';

INSERT INTO ticket_assignees (ticket_id, user_id, is_completed)
SELECT (SELECT id FROM tickets WHERE title = 'Laboratuvar yazıcı arızası'), id, 1
FROM users WHERE email IN ('personel1@maltepe.edu.tr', 'personel2@maltepe.edu.tr');

-- Talep 5: Açık, atanmamış
INSERT INTO tickets (user_id, title, description, status, priority, assignee_id, photo_path, created_at, updated_at)
SELECT id, 'Sınav salonu klima', 'A-102 salonunda klima soğutmuyor.', 'open', 'low', NULL, NULL,
  '2026-05-19T13:00:00Z', '2026-05-19T13:00:00Z'
FROM users WHERE email = 'ogrenci3@maltepe.edu.tr';

-- Talep 6: Kapalı (tamamlanmış örnek)
INSERT INTO tickets (user_id, title, description, status, priority, assignee_id, photo_path, created_at, updated_at, resolved_at)
SELECT id, 'Öğrenci kartı basım hatası', 'Kart okuyucuda tanınmıyordu, yenilendi.', 'closed', 'normal', NULL, NULL,
  '2026-05-10T10:00:00Z', '2026-05-15T16:00:00Z', '2026-05-15T16:00:00Z'
FROM users WHERE email = 'ogrenci2@maltepe.edu.tr';

INSERT INTO ticket_assignees (ticket_id, user_id, is_completed)
SELECT (SELECT id FROM tickets WHERE title = 'Öğrenci kartı basım hatası'), id, 1
FROM users WHERE email = 'personel1@maltepe.edu.tr';

-- Süreç geçmişi örnekleri
INSERT INTO ticket_history (ticket_id, user_id, action, created_at)
SELECT t.id, u.id, 'Talep oluşturuldu', '2026-05-18T09:00:00Z'
FROM tickets t, users u WHERE t.title = 'Projeksiyon çalışmıyor' AND u.email = 'ogrenci2@maltepe.edu.tr';

INSERT INTO ticket_history (ticket_id, user_id, action, created_at)
SELECT t.id, u.id, 'Personel Atamaları Güncellendi', '2026-05-18T10:00:00Z'
FROM tickets t, users u WHERE t.title = 'Projeksiyon çalışmıyor' AND u.email = 'yonetici@maltepe.edu.tr';

INSERT INTO ticket_history (ticket_id, user_id, action, created_at)
SELECT t.id, u.id, 'Kendi görev bölümünü tamamladı', '2026-05-19T09:30:00Z'
FROM tickets t, users u WHERE t.title = 'Projeksiyon çalışmıyor' AND u.email = 'personel1@maltepe.edu.tr';

INSERT INTO ticket_history (ticket_id, user_id, action, created_at)
SELECT t.id, u.id, 'Tüm atanan personel görevlerini tamamladı — yönetici onayı bekleniyor', '2026-05-19T12:00:00Z'
FROM tickets t, users u WHERE t.title = 'Laboratuvar yazıcı arızası' AND u.email = 'personel2@maltepe.edu.tr';
