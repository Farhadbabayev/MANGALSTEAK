# Mangal Steak House — sayt və daxili rezervasiya sistemi

Restoranın öz domenində işləyən çoxsəhifəli sayt. Bütün səhifələrdə rezervasiya
bölməsi var və forma **heç bir xarici sayta yönləndirmir** — məlumat restoranın
öz serverinə düşür, oradan isə arxa planda **Vilka** sisteminə ötürülür.

Dizayn: **Premium Minimal** — demək olar qara fon, süd rəngi mətn, incə qızılı
xətlər və brendin tünd bordo rəngi (`#4E0007`). Bütün CSS və HTML bu layihəyə
məxsusdur; xarici CSS çərçivəsi və ya ikon kitabxanası istifadə olunmur.

Loqo (buğa kəlləsi + şiş) vektor SVG kimi çəkilib, "Mangal" yazısı
Grenze Gotisch şrifti ilə verilir — beləliklə hər ölçüdə iti görünür və
rəngi CSS-dən dəyişdirilə bilir. Loqonun orijinal faylı varsa,
`src/partials/logo.html` içindəki SVG-ni onunla əvəz etmək kifayətdir.

---

## 1. Tez başlanğıc

```bash
npm run build     # HTML səhifələrini yığır (public/ qovluğuna)
npm start         # saytı və rezervasiya API-sini işə salır
```

Sonra: <http://localhost:3000>

```bash
npm test          # uçdan-uca yoxlama (38 test) — saxta Vilka serveri ilə
```

Node.js 18.17+ tələb olunur. **Heç bir xarici paket quraşdırılmır** —
yalnız Node-un öz modulları istifadə olunur (`npm install` lazım deyil).

---

## 2. Səhifələr

| Fayl | Səhifə | Rezervasiya forması |
|---|---|---|
| `index.html` | Ana səhifə | ✅ |
| `menyu.html` | Menyu (7 bölmə) | ✅ |
| `haqqimizda.html` | Haqqımızda | ✅ |
| `qalereya.html` | Qalereya | ✅ |
| `tedbirler.html` | Tədbirlər və banket | ✅ |
| `rezervasiya.html` | Rezervasiya (əsas səhifə) | ✅ |
| `elaqe.html` | Əlaqə + xəritə | ✅ |
| `404.html` | Səhifə tapılmadı | — |

---

## 3. Vilka inteqrasiyası

### Necə işləyir

```
Müştəri (saytda forma)
      │  POST /api/reservations
      ▼
Bizim server ──► 1. yoxlayır (telefon, tarix, saat, bot tələsi)
                 2. daxili anbara yazır  (data/reservations.jsonl)
                 3. müştəriyə rezervasiya kodu qaytarır   MS-260916-4821
                 4. arxa planda Vilka-ya göndərir
                 5. alınmasa — hər 5 dəqiqədən bir təkrar cəhd edir
```

Vilka cavab vermirsə belə **rezervasiya itmir**: sifariş bizdə qalır, admin
panelində "Vilka-ya düşməyib" kimi görünür və avtomatik təkrar göndərilir.
Müştəri bunu hiss etmir.

### Konfiqurasiya

```bash
cp .env.example .env
```

`.env` faylında üç rejimdən birini seçin:

| `VILKA_MODE` | Nə edir | Nə vaxt |
|---|---|---|
| `off` | Yalnız daxili anbar | Açılışdan əvvəl, sınaq üçün |
| `api` | Vilka API-sinə birbaşa POST | Vilka-dan API açarı alınıbsa |
| `webhook` | Aralıq webhook-a POST | Make / n8n / Zapier ilə |

```env
VILKA_MODE=api
VILKA_API_URL=https://api.vilka.az/v1/reservations   # Vilka-dan alınacaq
VILKA_API_KEY=sizin_acar
VILKA_RESTAURANT_ID=123
```

### Sahə adlarının uyğunlaşdırılması

Standart olaraq belə JSON göndərilir:

```json
{
  "external_id": "MS-260916-4821",
  "restaurant_id": "123",
  "name": "Aysel Quliyeva",
  "phone": "+994501234567",
  "guests": 4,
  "date": "2026-09-19",
  "time": "19:30",
  "datetime": "2026-09-19T19:30:00+04:00",
  "area": "terrace",
  "comment": "Ad günü tortu gətirəcəyik",
  "source": "website",
  "created_at": "2026-09-16T12:00:00.000Z"
}
```

Vilka başqa adlar gözləyirsə, **kodu dəyişmədən** `.env`-dən uyğunlaşdırın:

```env
VILKA_FIELD_MAP={"name":"guest_name","phone":"guest_phone","guests":"persons","comment":"note"}
VILKA_EXTRA_FIELDS={"branch_id":3,"channel":"website"}
```

Açar başqa başlıqda göndərilirsə:

```env
VILKA_AUTH_HEADER=X-Api-Key
VILKA_AUTH_SCHEME=
```

### Vilka açarı hələ yoxdursa

`VILKA_MODE=off` qoyun — sayt tam işləyir, rezervasiyalar admin panelində
toplanır. Açar alındıqdan sonra `.env`-i doldurub serveri yenidən başladın;
həmin ana qədər yığılmış rezervasiyaları paneldən "Vilka-ya göndər" düyməsi
ilə ötürə bilərsiniz.

### Telegram bildirişi (tövsiyə olunur)

```env
TELEGRAM_BOT_TOKEN=...
TELEGRAM_CHAT_ID=-1001234567890
```

Hər rezervasiya heyətin Telegram qrupuna düşür — Vilka ilə əlaqə kəsilsə belə
sifariş gözdən qaçmır.

---

## 4. Admin paneli — `/admin`

```env
ADMIN_USER=admin
ADMIN_PASSWORD=güclü-şifrə
```

> Şifrə boş olarsa panel **tamamilə söndürülür**. Mütləq təyin edin.

Panel imkanları: günün rezervasiyaları və qonaq sayı, tarix/status/axtarış
filtri, təsdiq və ləğv, Vilka-ya təkrar göndərmə, CSV ixracı.

---

## 5. Məzmunun dəyişdirilməsi

Bütün mətnlər iki JSON faylındadır — HTML-ə toxunmaq lazım deyil:

| Fayl | Nə var |
|---|---|
| `site.config.json` | Ad, domen, ünvan, telefon, e-mail, iş saatları, sosial şəbəkələr, rezervasiya qaydaları |
| `content.config.json` | Menyu və qiymətlər, slayder, haqqımızda, tədbirlər, qalereya, banket paketləri |

Dəyişikdən sonra:

```bash
npm run build
```

### Mütləq dəyişdirilməli olan yerlər

`site.config.json` faylında hazırda **nümunə məlumatlar** var:

- `contact.phone`, `contact.mobile`, `contact.whatsapp` — real nömrələr
- `contact.addressFull`, `contact.addressOneLine` — real ünvan
- `contact.email` — real e-mail
- `contact.mapEmbed`, `contact.mapLink` — Google Maps ünvanı
- `social.*` — real Instagram / Facebook / TikTok / YouTube
- `site.domain`, `site.url` — real domen

### Şəkillər

`public/assets/images/` qovluğundakı şəkillər **şablondan gələn nümunələrdir**
(suşi, əriştə, pancake var) və restoranın öz fotoları ilə əvəz olunmalıdır.
Faylı eyni adla üzərinə yazsanız, kod dəyişikliyi lazım deyil:

| Fayl | Harada görünür | Tövsiyə olunan ölçü |
|---|---|---|
| `hero-slider-1/2/3.jpg` | Ana səhifə slayderi | 1920×1080 |
| `special-dish-banner.jpg` | Şefin seçimi bölməsi | 800×900 |
| `about-banner.jpg` | Hekayə bölməsi (ana səhifə + haqqımızda) | 800×900 |
| `about-abs-image.jpg` | Qalereya | 800×800 |
| `event-1/2/3.jpg` | Tədbir kartları, səhifə başlıqları | 800×700 |
| `service-1/2/3.jpg` | Qalereya, əlaqə səhifəsinin başlığı | 800×800 |
| `testimonial-bg.jpg` | Rəy zolağının fonu | 1920×1080 |

Bütün şəkillər tünd fonun üzərində yarı-şəffaf göstərilir, ona görə
kontrastlı və tünd fotolar daha yaxşı oturur.

Qalereya şəkillərinin siyahısı `content.config.json` → `gallery.images`
hissəsindədir.

---

## 6. Yerləşdirmə (deployment)

### Vacib

Rezervasiya forması **Node serveri tələb edir**. Saytı sadəcə statik hostinqə
(`public/` qovluğunu) atsanız, səhifələr açılacaq, amma forma işləməyəcək.

### VPS (Ubuntu) nümunəsi

```bash
git clone <repo> /var/www/mangal
cd /var/www/mangal
cp .env.example .env && nano .env      # dəyərləri doldurun
npm run build
```

`/etc/systemd/system/mangal.service`:

```ini
[Unit]
Description=Mangal Steak House
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=/var/www/mangal
ExecStart=/usr/bin/node server/index.mjs
Restart=always
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl enable --now mangal
```

Nginx (domen + SSL):

```nginx
server {
    server_name mangalsteakhouse.az www.mangalsteakhouse.az;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

```bash
sudo certbot --nginx -d mangalsteakhouse.az -d www.mangalsteakhouse.az
```

Nginx arxasında işlədiyi üçün `.env`-də `TRUST_PROXY=true` qoyun.

### Ehtiyat nüsxə

Bütün rezervasiyalar `data/reservations.jsonl` faylındadır. Gündəlik
ehtiyat nüsxəsini götürün:

```bash
0 4 * * * cp /var/www/mangal/data/reservations.jsonl /backup/rez-$(date +\%F).jsonl
```

---

## 7. Layihənin quruluşu

```
site.config.json        restoran məlumatları
content.config.json     menyu və səhifə mətnləri
src/
  partials/             təkrarlanan hissələr (header, footer, rezervasiya forması)
  pages/                səhifə şablonları
scripts/
  build.mjs             statik səhifələri yığır
  fetch-fonts.mjs       şriftləri Google Fonts-dan yerli yükləyir
  test.mjs              uçdan-uca yoxlamalar
public/                 hazır sayt (build nəticəsi)
  assets/css/site.css   dizayn sistemi (bütün stillər)
  assets/css/fonts.css  yerli şriftlər (avtomatik yaradılır)
  assets/fonts/         woff2 şrift faylları
  assets/js/script.js   menyu, slayder, animasiyalar
  assets/js/reservation.js  rezervasiya formasının məntiqi
server/
  index.mjs             HTTP server: statik sayt + API + admin
  admin.html            rezervasiya paneli
  lib/config.mjs        .env oxunması
  lib/store.mjs         fayl əsaslı anbar
  lib/validate.mjs      server tərəfi yoxlama
  lib/vilka.mjs         Vilka inteqrasiyası
  lib/notify.mjs        Telegram bildirişi
data/                   rezervasiyalar (git-ə düşmür)
```

> `public/` qovluğu `npm run build` ilə yenidən yaradılır — HTML faylları
> birbaşa orada redaktə etməyin, `src/` və JSON konfiqurasiyaları dəyişin.

---

## 8. API

| Ünvan | Metod | Təyinat |
|---|---|---|
| `/api/reservations` | POST | Yeni rezervasiya (açıq) |
| `/api/newsletter` | POST | Abunəlik (açıq) |
| `/api/health` | GET | Sistemin vəziyyəti |
| `/api/admin/reservations` | GET | Siyahı (şifrə tələb edir) |
| `/api/admin/status` | POST | Statusun dəyişdirilməsi |
| `/api/admin/retry` | POST | Vilka-ya təkrar göndərmə |
| `/api/admin/export.csv` | GET | CSV ixracı |

Qoruma: bot tələsi, IP üzrə saatlıq limit (`RATE_LIMIT_PER_HOUR`), sorğu
həcmi limiti, admin üçün Basic Auth, qovluqdan kənara çıxışın bağlanması.

---

## 9. Dizaynın tənzimlənməsi

Bütün rənglər və ölçülər `public/assets/css/site.css` faylının başındakı
`:root` bölməsindədir:

```css
--black:     #121212;   /* əsas fon */
--black-2:   #181817;   /* növbələşən bölmələrin fonu */
--cream:     #FAF8F5;   /* mətn */
--cream-dim: #A9A49C;   /* ikinci dərəcəli mətn */
--gold:      #B99B6B;   /* vurğu rəngi (xətlər, etiketlər, qiymətlər) */
--brand:     #4E0007;   /* loqodakı bordo (üst zolaq, dolu düymələr) */
--brand-2:   #6B0A12;   /* açıq bordo (keçidlər, çalarlar) */
--space:     130px;     /* bölmələr arası boşluq */
```

Şriftlər CDN-dən deyil, `public/assets/fonts/` qovluğundan yüklənir.
Şrifti dəyişmək üçün `scripts/fetch-fonts.mjs` faylındakı siyahını
redaktə edib `node scripts/fetch-fonts.mjs` işlədin, sonra `site.css`
içindəki `--display` / `--body` dəyərlərini yeniləyin.


## Lisenziya

Sayt kodu və dizaynı bu layihəyə məxsusdur.
Şriftlər: Cormorant Garamond və Inter — SIL Open Font License.
`public/assets/images/` qovluğundakı nümunə şəkillər
[grilli](https://github.com/codewithsadee/grilli) şablonundan (MIT © Sadee)
götürülüb və istehsalata çıxmazdan əvvəl restoranın öz fotoları ilə əvəz
olunmalıdır.
