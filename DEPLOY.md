# Yerləşdirmə (deployment)

Sayt iki cür işlədilə bilər. Hər ikisində **idarəetmə paneli canlı saytda açılır**.

| | Vercel | Öz serveriniz (VPS) |
|---|---|---|
| Qiymət | Pulsuz (hobby) | ~4–5 $/ay |
| Sayt sürəti | CDN — çox sürətli | Yaxşı |
| Rezervasiya → Vilka | ✅ | ✅ |
| Panel canlı saytda | ✅ (dəyişiklik GitHub-a yazılır) | ✅ (birbaşa) |
| Dəyişikliyin sayta çıxması | 1–2 dəqiqə | dərhal |
| Rezervasiya jurnalı | ❌ (Telegram əvəzinə) | ✅ |
| Çatdırılmayanın avtomatik təkrarı | ❌ | ✅ |
| Bağlantı parametrləri | Vercel mühit dəyişənləri | Paneldən |

---

## A. Vercel

Sayt CDN-dən verilir, rezervasiya və panel serverless funksiyalarda işləyir.
Paneldə etdiyiniz dəyişiklik GitHub reposuna commit olunur, Vercel isə push-u
görüb saytı özü yenidən yığır.

```
Panel (canlı saytda)
   │  dəyişiklik
   ▼
GitHub repo ──push──► Vercel ──► sayt yeniləndi  (1–2 dəqiqə)
```

### 1. Vercel-i GitHub-a bağlayın

Bu addımı yalnız hesab sahibi edə bilər:

1. <https://vercel.com> → komandanızı seçin
2. **Add New → Project → Import Git Repository**
3. GitHub qoşulu deyilsə **Connect GitHub Account** → icazə verin
4. **Install Vercel** ilə GitHub App-i quraşdırın və
   `Farhadbabayev/MANGALSTEAK` reposuna giriş verin
5. Reponu seçib **Import** edin

> Qoşduğunuz GitHub hesabının bu repoda yazma icazəsi olmalıdır.

Build parametrlərini `vercel.json` özü təyin edir — əl ilə dəyişmək lazım deyil.

### 2. GitHub token yaradın (panelin yaza bilməsi üçün)

Panel dəyişikliyi repoya yazdığı üçün ona token lazımdır:

1. GitHub → **Settings → Developer settings → Personal access tokens →
   Fine-grained tokens → Generate new token**
2. **Repository access:** yalnız `MANGALSTEAK`
3. **Permissions → Repository permissions → Contents: Read and write**
4. Tokeni kopyalayın (bir daha göstərilmir)

> **Repo və budaq avtomatik tapılır.** Vercel funksiyalara `VERCEL_GIT_REPO_OWNER`,
> `VERCEL_GIT_REPO_SLUG` və `VERCEL_GIT_COMMIT_REF` dəyişənlərini özü verir.
> Panel onlardan istifadə edir, ona görə həmişə **saytın yığıldığı budağa** yazır —
> «panel bir budağa yazdı, Vercel başqasını yığdı» səhvi mümkün deyil.
> Başqa budağa yazmaq istəsəniz `GITHUB_BRANCH` təyin edin, o üstələyir.

### 3. Mühit dəyişənləri

Vercel → **Settings → Environment Variables**:

**Panel üçün cəmi iki dəyişən lazımdır** — hər ikisi sirrdir, ona görə
yalnız siz yarada bilərsiniz:

| Dəyişən | Nə üçün | Vacibliyi |
|---|---|---|
| `ADMIN_PASSWORD` | Panelə giriş şifrəsi | **mütləq** (boşdursa panel bağlıdır) |
| `GITHUB_TOKEN` | Panelin dəyişikliyi repoya yazması | yazma üçün mütləq |

Qalanları istəyə bağlıdır:

| Dəyişən | Nə üçün | Vacibliyi |
|---|---|---|
| `ADMIN_USER` | Panelə giriş adı | standart: `admin` |
| `GITHUB_REPO` | `sahib/repo` | **lazım deyil** — Vercel özü tapır |
| `GITHUB_BRANCH` | Hansı budağa yazılsın | **lazım deyil** — saytın yığıldığı budaq |
| `SITE_URL` | `https://mangalsteakhouse.az` | tövsiyə |
| `VILKA_MODE` | `api` və ya `webhook` | rezervasiya üçün |
| `VILKA_API_URL` | Vilka-nın rezervasiya ünvanı | rezervasiya üçün |
| `VILKA_API_KEY` | Vilka açarı | rezervasiya üçün |
| `VILKA_RESTAURANT_ID` | Filial kodu | Vilka üçün lazım deyil (açar restoranı özü bilir) |
| `VILKA_FIELD_MAP` | Sahə uyğunluğu, JSON | Vilka üçün **lazım deyil** — aşağıya baxın |
| `VILKA_EXTRA_FIELDS` | Əlavə sabit sahələr, JSON | lazım olsa |
| `TELEGRAM_BOT_TOKEN` | Ehtiyat kanal | **çox tövsiyə olunur** |
| `TELEGRAM_CHAT_ID` | Telegram qrupunun ID-si | **çox tövsiyə olunur** |

> **Vacib:** bu quruluşda rezervasiya jurnalı saxlanılmır. Heç bir kanal
> (Vilka və ya Telegram) təyin olunmayıbsa, forma müştəriyə «qəbul olundu»
> demir — telefonla əlaqə saxlamağı təklif edir və sorğu Vercel-in
> jurnalına yazılır. **Ən azı Telegram-ı qoşun.**

> **Lazım olmayan dəyişəni boş əlavə etməyin — sadəcə əlavə etməyin.**
> Boş dəyər «təyin olunmayıb» sayılır və standart dəyər işə düşür, amma
> siyahını təmiz saxlamaq sonradan nəyin həqiqətən qoşulduğunu göstərir.

#### Vilka-ya qoşulma (rezerv birbaşa Mangal Steak House-un səhifəsinə düşür)

1. Vilka super-admin panelində **İnteqrasiyalar (API)** → restoran: **Mangal Steak House** → yeni açar (yazma icazəsi,
   `reservations:write`). Açar `vk_live_…` ilə başlayır və bir dəfə göstərilir.
2. Vercel-ə yazın:

```env
VILKA_MODE=api
VILKA_API_URL=https://mqirnsmgnymjnyabvurr.supabase.co/functions/v1/api-v1/r/mangal-steak-house/reservations
VILKA_API_KEY=vk_live_...
```

`VILKA_AUTH_HEADER` / `VILKA_AUTH_SCHEME` standart qalır (`Authorization: Bearer …`).
Ünvandakı `mangal-steak-house` restoranın Vilka-dakı slug-udur: açar başqa
restoranındırsa Vilka `403` qaytarır — səhv restorana rezerv düşə bilməz.

#### Sahə uyğunluğu (`VILKA_FIELD_MAP`)

`api` rejimində sayt Vilka Partner API-sinin öz adlarını **avtomatik** göndərir —
`VILKA_FIELD_MAP` yazmaq lazım deyil:

| Saytda | Vilka-ya gedir |
|---|---|
| ad | `guest_name` |
| telefon | `guest_phone` (`+994…` formatında) |
| nəfər sayı | `party_size` (rəqəm) |
| tarix, saat | `date`, `time`, `starts_at` (`…+04:00`, Bakı vaxtı) |
| rezervasiya kodu (`MS-…`) | `external_ref` — təkrar göndəriş ikinci rezerv yaratmır |
| zona, səbəb, qeyd | `note` — «Zona: Yay terrası · Səbəb: Ad günü · … · Sayt kodu: MS-…» |

Vilka-nın cavabındakı `ref` (paneldə görünən kod) saytın jurnalına yazılır.
`VILKA_FIELD_MAP` yalnız başqa sistemə (webhook, Make, n8n) göndərəndə və ya
bu adları üstələmək lazım olanda doldurulur.

#### Rezervasiya işləmirsə

Müştəri «Onlayn rezervasiya hazırda işləmir» görürsə, səbəb Vercel-in
jurnalındadır: **Deployments → son deployment → Runtime Logs**, sətir
`[rezervasiya] ÇATDIRILMADI` ilə başlayır və sonunda əsl səbəb yazılır.

| Jurnalda görünən | Nə deməkdir |
|---|---|
| `vilka: skipped` | `VILKA_MODE` `api`/`webhook` deyil |
| `vilka: failed (HTTP 401 …)` | Açar və ya sxem yanlışdır — `VILKA_AUTH_SCHEME` (`none` da ola bilər) |
| `vilka: failed (HTTP 404 …)` | `VILKA_API_URL` yanlış ünvandır |
| `vilka: failed (HTTP 403 … FORBIDDEN)` | Açar ünvandakı restoranın deyil (slug uyğun gəlmir) |
| `vilka: failed (HTTP 409 NO_TABLE / CLOSED_AT_TIME …)` | Vilka-da həmin saata boş masa yoxdur və ya restoran bağlıdır |
| `vilka: failed (Vaxt bitdi)` | Vilka cavab vermir |
| `telegram: sönülü` | `TELEGRAM_BOT_TOKEN` / `TELEGRAM_CHAT_ID` yoxdur |

Panelin **Rezervasiya sistemi → Sınaq göndərişi** düyməsi eyni cavabı
dərhal göstərir — müştərini gözlətmədən yoxlamaq üçün.

### 4. Domen

**Settings → Domains** → `mangalsteakhouse.az` əlavə edin və göstərilən DNS
qeydlərini domen panelinizdə yazın. SSL avtomatik qoşulur.

Sonra paneldə **Restoran məlumatları → Tam ünvan** sahəsini eyni domenlə
yeniləyin.

### 5. Panel: `https://sizin-domen/admin`

Bu quruluşda paneldə:

- ✅ Restoran məlumatları, menyu, səhifə mətnləri, şəkillər, dizayn
- ✅ Rezervasiya sisteminin sınağı və göndəriləcək məlumatın önizləməsi
- ❌ Rezervasiya jurnalı (əvəzinə Telegram)
- ❌ Bağlantı parametrlərinin dəyişdirilməsi (Vercel dəyişənlərindən)

Hər dəyişiklikdən sonra sayt 1–2 dəqiqəyə yenilənir.

---

## B. Öz serveriniz (VPS)

Heç bir məhdudiyyət yoxdur: panel birbaşa fayllara yazır, dəyişiklik dərhal
görünür, rezervasiya jurnalı saxlanılır, çatdırılmayan sorğular avtomatik
təkrar göndərilir, bağlantı parametrləri də paneldən idarə olunur.

Quraşdırma (systemd + nginx + certbot) README-nin «Yerləşdirmə» bölməsindədir.

---

## Yerli işləmə

Hər iki halda kompüterinizdə də işlədə bilərsiniz:

```bash
git clone https://github.com/Farhadbabayev/MANGALSTEAK.git
cd MANGALSTEAK
cp .env.example .env     # ADMIN_PASSWORD təyin edin
npm start                # http://localhost:3000  və  /admin
```
