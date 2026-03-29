# Destek MAU

Maltepe Üniversitesi tarzı basit bir destek talep portalı: React (Vite) arayüz, C++ (cpp-httplib + SQLite) API.

## Özellikler

- Giriş (demo kullanıcılar otomatik oluşur)
- Talep oluşturma, kişiye özel talep listesi
- Superuser: tüm talepler, durum değiştirme, personele atama

## Demo hesaplar

| E-posta | Şifre | Rol |
|---------|-------|-----|
| `ogrenci@maltepe.edu.tr` | `maltepe2026` | Kullanıcı |
| `destek@maltepe.edu.tr` | `super2026` | Superuser |

## Backend (C++)

Gereksinimler: CMake 3.16+, C++17 derleyici, SQLite3 geliştirme kütüphanesi (macOS’ta genelde Xcode CLT ile gelir).

```bash
cd backend
mkdir -p build && cd build
cmake ..
cmake --build .
./destek_api
```

Sunucu varsayılan: `http://127.0.0.1:8080`. Veritabanı dosyası: `backend/build/destek_mau.db` (ilk argüman olarak yol verilebilir: `./destek_api /tmp/destek.db`).

> **Not:** `cpp-httplib` ve `nlohmann/json` CMake `FetchContent` ile indirilir; ilk yapılandırmada ağ gerekir.

## Frontend

```bash
cd frontend
npm install
npm run dev
```

Vite, `/api` isteklerini `127.0.0.1:8080` adresine yönlendirir. Önce API’yi çalıştırın.

## Üretim

Şifreler şu an düz metin (yalnızca prototip). Canlı ortamda hash + HTTPS + gerçek kimlik doğrulama kullanın.
