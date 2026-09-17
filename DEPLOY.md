# Yerləşdirmə (deployment)

Saytın iki hissəsi var və onların tələbləri fərqlidir:

| Hissə | Nə tələb edir |
|---|---|
| Sayt səhifələri | Sadəcə statik fayl hostinqi |
| Rezervasiya forması | Sorğunu Vilka-ya ötürən kiçik funksiya |
| İdarəetmə paneli (`/admin`) | **Yazıla bilən fayl sistemi** — konfiqurasiyanı dəyişib saytı yenidən yığır |

Buna görə iki yol var.

---

## A. Vercel (statik + serverless)

Sayt CDN-dən verilir, rezervasiya funksiyası serverless işləyir.
**Panel bu ünvanda işləmir** — o, öz kompüterinizdə işə salınır, dəyişiklik
`git push` ilə sayta çıxır.

### 1. Vercel-i GitHub-a bağlayın

Bu addımı yalnız hesab sahibi edə bilər:

1. <https://vercel.com> → komandanızı seçin
2. **Add New → Project → Import Git Repository**
3. GitHub qoşulu deyilsə **Connect GitHub Account** → icazə verin
4. **Install Vercel** düyməsi ilə GitHub App-i quraşdırın və
   `Farhadbabayev/MANGALSTEAK` reposuna giriş verin
5. Reponu seçib **Import** edin

> Qoşduğunuz GitHub hesabının bu repoda yazma icazəsi olmalıdır.

### 2. Build parametrləri

`vercel.json` faylı hər şeyi özü təyin edir — Vercel-də əl ilə dəyişmək
lazım deyil:

```
Build Command      node scripts/build.mjs
Output Directory   public
Install Command    (paket yoxdur)
```

### 3. Mühit dəyişənləri

**Settings → Environment Variables** bölməsində:

| Dəyişən | Nə üçün |
|---|---|
| `VILKA_MODE` | `api` (və ya `webhook`) |
| `VILKA_API_URL` | Vilka-nın rezervasiya ünvanı |
| `VILKA_API_KEY` | Vilka açarı |
| `VILKA_RESTAURANT_ID` | Filial kodu (tələb olunursa) |
| `VILKA_FIELD_MAP` | Sahə uyğunluğu, JSON |
| `VILKA_EXTRA_FIELDS` | Əlavə sabit sahələr, JSON |
| `TELEGRAM_BOT_TOKEN` | Ehtiyat kanal (çox tövsiyə olunur) |
| `TELEGRAM_CHAT_ID` | Telegram qrupunun ID-si |

> **Vacib:** heç bir kanal təyin olunmayıbsa, forma müştəriyə
> «rezervasiya qəbul olundu» demir — telefonla əlaqə saxlamağı təklif edir.
> Beləliklə sorğu səssizcə itmir. Ən azı Telegram-ı qoşun.

### 4. Domen

**Settings → Domains** → `mangalsteakhouse.az` əlavə edin və göstərilən
DNS qeydlərini domen panelinizdə yazın. SSL avtomatik qoşulur.

Sonra `site.config.json` → `site.url` dəyərini eyni domenlə yeniləyin
(panel → Restoran məlumatları → Tam ünvan) və dəyişikliyi push edin.

### 5. Məzmunu dəyişmək

```bash
git clone https://github.com/Farhadbabayev/MANGALSTEAK.git
cd MANGALSTEAK
cp .env.example .env        # ADMIN_PASSWORD təyin edin
npm start                   # http://localhost:3000/admin
```

Paneldə dəyişikliyi edin → `git push` → Vercel saytı 1 dəqiqəyə yeniləyir.

---

## B. Kiçik server (VPS) — hər şey işləyir

Aylıq 4–5 dollarlıq serverdə (Hetzner, DigitalOcean, Contabo) heç bir
məhdudiyyət yoxdur: panel canlı saytda açılır, rezervasiya jurnalı saxlanılır,
çatdırılmayan sorğular avtomatik təkrar göndərilir.

Quraşdırma addımları README-nin «Yerləşdirmə» bölməsindədir
(systemd + nginx + certbot).

---

## Müqayisə

| | Vercel | VPS |
|---|---|---|
| Qiymət | Pulsuz (hobby) | ~4–5 $/ay |
| Sayt sürəti | CDN — çox sürətli | Yaxşı |
| Rezervasiya → Vilka | ✅ | ✅ |
| Rezervasiya jurnalı | ❌ (yalnız Telegram) | ✅ |
| Çatdırılmayanın təkrarı | ❌ | ✅ |
| Panel canlı saytda | ❌ (yerli işləyir) | ✅ |
| Şəkil yükləmə paneldən | ❌ | ✅ |

İkisini birləşdirmək də olar: sayt Vercel-də, panel isə yalnız sizin
kompüterinizdə. Bu halda rezervasiyaların Telegram-a düşməsi mütləqdir.
