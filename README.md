# Mangal Steak House — sayt və daxili rezervasiya sistemi

Restoranın öz domenində işləyən çoxsəhifəli sayt. Bütün səhifələrdə rezervasiya
bölməsi var və forma **heç bir xarici sayta yönləndirmir** — məlumat restoranın
öz serverinə düşür, oradan isə arxa planda **Vilka** sisteminə ötürülür.

Dizayn: **Premium Minimal** — demək olar qara fon, süd rəngi mətn, incə qızılı
xətlər və brendin tünd bordo rəngi (`#4E0007`). Bütün CSS və HTML bu layihəyə
məxsusdur; xarici CSS çərçivəsi və ya ikon kitabxanası istifadə olunmur.

Loqo — restoranın öz loqosu (buğa kəlləsi və şiş, gotik «Mangal» yazısı,
«STEAKHOUSE») vektora çevrilib: `src/brand/logo.svg`. Hər ölçüdə iti görünür,
rəngi CSS-dən gəlir. Başlıqda loqo bordo xalça lentindən asılır (qızılı motiv
zolağı və mişar-diş saçaqla), səhifə sürüşəndə başlığın hündürlüyünə yığılır.
Loqonun orijinal vektor faylı (SVG/PDF/AI) tapılsa, `src/brand/logo.svg`-ni
onunla əvəz etmək kifayətdir.

---

## 1. Tez başlanğıc

```bash
npm run build     # HTML səhifələrini yığır (public/ qovluğuna)
npm start         # saytı və rezervasiya API-sini işə salır
```

Sonra: <http://localhost:3000>

```bash
npm test          # uçdan-uca yoxlama (77 test) — saxta Vilka serveri ilə
npm run new-site  # başqa restoran üçün mətnləri sıfırlayır
npm run fonts     # şriftləri Google Fonts-dan yerli yükləyir
```

Saytın məzmunu **`/admin` panelindən** idarə olunur — bax: 4-cü bölmə.

Node.js 18.17+ tələb olunur. **Heç bir xarici paket quraşdırılmır** —
yalnız Node-un öz modulları istifadə olunur (`npm install` lazım deyil).

---

## 2. Səhifələr

| Fayl | Səhifə | Rezervasiya forması |
|---|---|---|
| `index.html` | Ana səhifə | ✅ |
| `menyu.html` | Menyu: zalların PDF menyuları + 7 bölmə | ✅ |
| `zallar.html` | Zallar: Steak, Ocakbaşı, Milli — hər birinin şəkilləri və menyusu | ✅ |
| `haqqimizda.html` | Haqqımızda | ✅ |
| `qalereya.html` | Qalereya | ✅ |
| `tedbirler.html` | Tədbirlər və banket | ✅ |
| `rezervasiya.html` | Rezervasiya (əsas səhifə) | ✅ |
| `elaqe.html` | Əlaqə + xəritə | ✅ |
| `404.html` | Səhifə tapılmadı | — |

Hər səhifə üç dildə yığılır: Azərbaycan dili kökdə (`/menyu.html`),
rus və ingilis dili öz qovluğunda (`/ru/menyu.html`, `/en/menyu.html`).

---

## 2.1. Dillər, zallar və PDF menyular

### Üç dil (AZ · RU · EN)

Başlıqda dil seçimi var (telefonda — açılan menyunun altında). Dil dəyişəndə
qonaq **eyni səhifənin** digər dildəki nüsxəsinə keçir: menyu səhifəsində
dili dəyişən müştəri dərhal həmin dildəki menyunu görür.

| Nə | Harada |
|---|---|
| Dillərin siyahısı | `site.config.json` → `site.languages` (birinci — əsas dil) |
| Menyu, zallar, səhifə mətnləri, ünvan, saatlar | admin → **Tərcümələr** (`i18n.config.json`) |
| Düymələr, forma, xəta mesajları | `src/i18n/az.json`, `ru.json`, `en.json` |

Tərcümə faylında yalnız mətnlər saxlanılır — şəkil, qiymət, telefon həmişə
əsas bölmələrdən gəlir. Tərcüməsi olmayan (boş) xana saytda Azərbaycan dilində
görünür, ona görə yeni yemək əlavə edəndə sayt heç vaxt «sınmır».

Rus səhifələri üçün kiril hərfləri ayrıca şriftlə gəlir
(`public/assets/css/fonts-cyrillic.css`, yalnız `/ru/`-da yüklənir).
Rezervasiya Vilka-ya düşəndə qeyddə `Dil: RU` / `Dil: EN` yazılır ki, heyət
geri zəngdə hansı dildə danışacağını bilsin.

### Zallar

Admin → **Zallar və PDF menyular**: hər zalın adı, təsviri, telefonları, tutumu,
şəkilləri (birinci şəkil böyük göstərilir) və menyusu. Şəkillər əvvəlcə **Şəkillər**
bölməsinə yüklənir, sonra zalda seçilir. Saytda şəkilə basanda böyüyür
(oxlar / sürüşdürmə ilə yalnız həmin zalın şəkilləri arasında keçilir).

Zalın **kodu** (`steak`, `ocakbasi`, `milli`) rezervasiya zonasının kodu ilə
eynidir — «Bu zalda masa ayır» düyməsi formada həmin zalı özü seçir.

**Zalın telefonları** («+ Nömrə əlavə et», istənilən sayda): hər nömrə Zallar
səhifəsində zalın bölməsində və Əlaqə səhifəsindəki «Zalların telefonları»
siyahısında zəng keçidi olur. Həmin zalda masa ayıran qonağın təsdiq ekranında
ümumi nömrənin yerinə zalın **birinci** nömrəsi göstərilir. Nömrəsi olmayan zal
üçün heç nə göstərilmir; başlıqda və footer-də həmişə ümumi nömrə qalır
(Restoran məlumatları → Əlaqə).

### PDF menyular — hər zal × hər dil

Zalın kartında hər dil üçün ayrıca yer var: **PDF yüklə / Əvəz et / Bax / Sil**.
Fayl `public/assets/menus/<zal>-<dil>.pdf` adı ilə saxlanılır
(məs. `steak-az.pdf`, `ocakbasi-ru.pdf`, `milli-en.pdf`).

- Saytda: «Menyunu aç» (brauzerdə açılır) və «PDF yüklə» düymələri.
- O dildə PDF hələ yoxdursa: «tezliklə» yazısı və digər dillərdə olan menyulara keçid.
- Faylı əvəz edəndə ünvan dəyişir (`?v=...`) — qonaq köhnə menyunu görmür.

**Ölçü:** yerli serverdə 20 MB-a qədər. **Vercel-də 3 MB-a qədər** — Vercel
sorğu gövdəsini ~4.5 MB ilə məhdudlaşdırır. Daha böyük PDF-i sıxın
(«Reduced size PDF» və ya ilovepdf.com/compress_pdf) və ya GitHub-da
`public/assets/menus/` qovluğuna eyni adla birbaşa yükləyin
(Add file → Upload files) — Vercel saytı özü yeniləyəcək.

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

Ən rahat yol — **idarəetmə panelindəki «Rezervasiya sistemi» bölməsi**:
orada API ünvanını, açarı, filial kodunu və sahə uyğunluğunu doldurub
yadda saxlayırsınız. Serveri yenidən başlatmaq lazım deyil.
Parametrlər `data/integration.json` faylında saxlanılır (git-ə düşmür,
açar panelə bir daha göstərilmir).

Panel həm də iki düymə verir:

- **Göndəriləcək məlumatı göstər** — heç nə göndərmədən, tam JSON-u və
  başlıqları göstərir (açar gizlədilmiş halda). Vilka tərəfi ilə
  razılaşdırmaq üçün ən sürətli yol.
- **Sınaq rezervasiyası göndər** — real sorğu göndərir və cavabı göstərir.
  Tətbiqdə sınaq qeydi yarada bilər, sonra silin.

Alternativ olaraq `.env` faylından da təyin etmək olar (server ilk
qurulanda əlverişlidir; panel dəyəri onu üstələyir):

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
VILKA_API_URL=https://mqirnsmgnymjnyabvurr.supabase.co/functions/v1/api-v1/r/mangal-steak-house/reservations
VILKA_API_KEY=vk_live_...   # Vilka super-admin → İnteqrasiyalar (API)
```

### Sahə adlarının uyğunlaşdırılması

`api` rejimində sayt Vilka Partner API-sinin öz adlarını **avtomatik**
göndərir — heç nə yazmaq lazım deyil. Rezerv Vilka-da birbaşa Mangal Steak
House-un jurnalına düşür (restoranı açar müəyyən edir):

```json
{
  "external_ref": "MS-260916-4821",
  "guest_name": "Aysel Quliyeva",
  "guest_phone": "+994501234567",
  "party_size": 4,
  "date": "2026-09-19",
  "time": "19:30",
  "starts_at": "2026-09-19T19:30:00+04:00",
  "note": "Zona: Yay terrası · Səbəb: Ad günü · Ad günü tortu gətirəcəyik · Sayt kodu: MS-260916-4821",
  "source": "website",
  "created_at": "2026-09-16T12:00:00.000Z"
}
```

`external_ref` sayəsində təkrar cəhd ikinci rezerv yaratmır. Vilka-nın
cavabındakı `ref` (paneldə görünən kod) jurnala yazılır.

`webhook` rejimində isə saytın öz adları gedir (`name`, `phone`, `guests`,
`area`, `occasion`, `comment` …). Başqa adlar lazımdırsa, **kodu dəyişmədən**
`.env`-dən uyğunlaşdırın (bu, avtomatik adların da üstünə yazılır):

```env
VILKA_FIELD_MAP={"name":"customer","phone":"tel"}
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

## 4. İdarəetmə paneli — `/admin`

```env
ADMIN_USER=admin
ADMIN_PASSWORD=güclü-şifrə
```

> Şifrə boş olarsa panel **tamamilə söndürülür**. Mütləq təyin edin.

Saytdakı demək olar hər şey buradan idarə olunur — kodu açmağa ehtiyac yoxdur.
Hər dəyişiklikdən sonra sayt avtomatik yenidən yığılır.

| Bölmə | Nə edir |
|---|---|
| **Rezervasiya sistemi** | Vilka API bağlantısı (ünvan, açar, filial kodu, sahə uyğunluğu), göndəriləcək məlumatın önizləməsi, sınaq göndərişi və **çatdırılma jurnalı** |
| **Restoran məlumatları** | Ad, domen, telefon, ünvan, e-mail, iş saatları, sosial şəbəkələr, rezervasiya qaydaları (zonalar, saat aralığı, nəfər limiti) |
| **Menyu** | Kateqoriya və yemək əlavə et/sil/sırala, qiymət, nişan (Bestseller və s.), təsvir |
| **Səhifə mətnləri** | Slayder, haqqımızda, şefin seçimi, üstünlüklər, tədbirlər, qalereya, banket paketləri, rezervasiya addımları və qaydaları — bütün səhifələrin mətnləri |
| **Şəkillər** | Yüklə, əvəz et, sil. Eyni adla yükləmək saytdakı şəkli dərhal dəyişir |
| **Dizayn** | Rənglər, şriftlər, bölmə boşluqları, loqo (Mangal loqosu / nişan / yazı / yüklənmiş şəkil), loqonun hündürlüyü və bordo lent — canlı önizləmə ilə |
| **Sistem** | Sistemin vəziyyəti, son əməliyyatın jurnalı, saytı yenidən yığma |

> **Rezervasiyalar bu paneldən idarə olunmur.** Masaların təsdiqi, ləğvi və
> yerləşdirilməsi Vilka tətbiqində aparılır — sayt yalnız sorğunu ora ötürür.
> Paneldəki jurnal göndərişin baş tutub-tutmadığını izləmək üçündür:
> çatdırılmayan sorğunu yenidən göndərmək və ya «əl ilə həll olundu»
> kimi işarələmək olar.

### Panel canlı saytda

Panel həm öz serverinizdə, həm də Vercel-də işləyir — fərq yalnız dəyişikliyin
hara yazılmasındadır:

| | Öz serveriniz | Vercel |
|---|---|---|
| Dəyişiklik hara yazılır | birbaşa fayllara | GitHub reposuna commit |
| Sayta nə vaxt çıxır | dərhal | 1–2 dəqiqə (Vercel özü yığır) |
| Rezervasiya jurnalı | ✅ | ❌ (əvəzinə Telegram) |
| Bağlantı parametrləri | paneldən | Vercel mühit dəyişənlərindən |

Panel hansı rejimdə olduğunu özü başa düşür: işləyən sahələr açıq qalır,
işləməyənlər gizlədilir və səbəbi yazılır.

Vercel-də cəmi **iki dəyişən** lazımdır — `ADMIN_PASSWORD` və `GITHUB_TOKEN`.
Repo və budaq Vercel-in öz dəyişənlərindən avtomatik tapılır, ona görə panel
həmişə saytın yığıldığı budağa yazır. Ətraflı: [DEPLOY.md](DEPLOY.md).

### Təhlükəsizlik və geri qaytarma

- Bütün panel Basic Auth arxasındadır; şəkil formatları yoxlanılır, SVG-dən skript təmizlənir.
- Hər yaddasaxlamadan əvvəl köhnə konfiqurasiya `data/backups/` qovluğuna yazılır.
- Yadda saxlamadan sonra sayt yenidən yığılır; **yığılma uğursuz olarsa dəyişiklik avtomatik geri qaytarılır** və panel xətanı göstərir.

> Qeyd: panel `site.config.json`, `content.config.json` və `theme.config.json`
> fayllarını dəyişir. Serverdə git istifadə edirsinizsə, `git pull` etməzdən əvvəl
> bu dəyişiklikləri commit edin.

---

## 5. Məzmunun dəyişdirilməsi

**Adi halda bunun üçün `/admin` panelindən istifadə edin** — orada hər sahənin
izahı var və dəyişiklik dərhal sayta düşür.

Faylları birbaşa redaktə etmək istəsəniz, bütün məzmun üç JSON faylındadır:

| Fayl | Nə var |
|---|---|
| `site.config.json` | Ad, domen, ünvan, telefon, e-mail, iş saatları, sosial şəbəkələr, rezervasiya qaydaları |
| `content.config.json` | Menyu və qiymətlər, zallar (telefonları ilə), slayder, haqqımızda, tədbirlər, qalereya, banket paketləri |
| `theme.config.json` | Rənglər, şriftlər, ölçülər, loqo |

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

> Vercel və VPS variantlarının müqayisəsi və addım-addım təlimat:
> **[DEPLOY.md](DEPLOY.md)**

### Vacib

Rezervasiya forması **Node tələb edir** — ya öz serveriniz, ya da Vercel-in
serverless funksiyaları. Saytı sadəcə statik hostinqə (`public/` qovluğunu)
atsanız, səhifələr açılacaq, amma forma işləməyəcək.

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
theme.config.json       rənglər, şriftlər, loqo
src/
  partials/             təkrarlanan hissələr (header, footer, rezervasiya forması)
  pages/                səhifə şablonları
  brand/logo.svg        restoranın loqosu (vektor)
scripts/
  build.mjs             statik səhifələri yığır
  fetch-fonts.mjs       şriftləri Google Fonts-dan yerli yükləyir
  new-site.mjs          başqa restoran üçün sıfırlama
  test.mjs              uçdan-uca yoxlamalar
public/                 hazır sayt (build nəticəsi)
  assets/css/site.css   dizayn sistemi (bütün stillər)
  assets/css/fonts.css  yerli şriftlər (avtomatik yaradılır)
  assets/fonts/         woff2 şrift faylları
  assets/js/script.js   menyu, slayder, animasiyalar
  assets/js/reservation.js  rezervasiya formasının məntiqi
server/
  index.mjs             HTTP server: statik sayt + API + admin
  admin/                idarəetmə paneli (html + css + js)
  lib/config.mjs        .env oxunması
  lib/store.mjs         fayl əsaslı anbar
  lib/validate.mjs      server tərəfi yoxlama
  lib/vilka.mjs         Vilka inteqrasiyası
  lib/notify.mjs        Telegram bildirişi
  lib/cms.mjs           konfiqurasiya, şəkil və yığma əməliyyatları
  lib/integration.mjs   Vilka bağlantısının parametrləri
data/                   rezervasiyalar, bağlantı açarı və ehtiyat nüsxələr (git-ə düşmür)
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
| `/api/admin/integration` | GET / POST | Vilka bağlantısını oxu / yadda saxla |
| `/api/admin/integration/preview` | GET | Göndəriləcək JSON-un önizləməsi |
| `/api/admin/integration/test` | POST | Sınaq göndərişi |
| `/api/admin/resolve` | POST | «Əl ilə həll olundu» işarəsi |
| `/api/admin/config` | GET / POST | Konfiqurasiyanı oxu / yadda saxla |
| `/api/admin/build` | POST | Saytı yenidən yığ |
| `/api/admin/images` | GET / POST | Şəkil siyahısı / yükləmə |
| `/api/admin/images/delete` | POST | Şəkil silmə |

Qoruma: bot tələsi, IP üzrə saatlıq limit (`RATE_LIMIT_PER_HOUR`), sorğu
həcmi limiti, admin üçün Basic Auth, qovluqdan kənara çıxışın bağlanması.

---

## 9. Bu reponu başqa restoran üçün istifadə

Sayt tam olaraq konfiqurasiya ilə işləyir — kod restorana bağlı deyil.

```bash
git clone <repo> yeni-restoran
cd yeni-restoran
npm run new-site -- --yes     # mətnləri boş şablona qaytarır
cp .env.example .env          # ADMIN_PASSWORD təyin edin
npm run build && npm start
```

Sonra `/admin` panelindən:

1. **Restoran məlumatları** — ad, domen, telefon, ünvan, iş saatları
2. **Dizayn** — brend rəngi, şriftlər, loqo növü (nişan seçimləri: buğa kəlləsi, alov, çəngəl-bıçaq, yarpaq — və ya öz şəkliniz)
3. **Şəkillər** — restoranın fotolarını yükləyin
4. **Menyu** və **Səhifə mətnləri** — məzmunu doldurun

`npm run new-site` köhnə məlumatları silmir — hamısını `data/backups/` qovluğuna köçürür.

Yalnız bunlar kod tələb edir: yeni səhifə növü əlavə etmək
(`src/pages/`), bölmələrin düzülüşünü dəyişmək (`src/partials/`),
yeni şrift gətirmək (`npm run fonts`).

---

## 10. Dizaynın tənzimlənməsi

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
