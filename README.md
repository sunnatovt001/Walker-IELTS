# Walker IELTS

Ustoz va o‘quvchilar uchun IELTS uy vazifalari portali.

## Ishga tushirish

Node.js 24 kerak. PDF matni npm paketi orqali o‘qiladi.

```sh
npm ci
npm run check
WALKER_DEMO=1 npm start
```

Brauzerda `http://localhost:3000` manzilini oching. Demo ekranida ustoz yoki o‘quvchi hisobini tanlang.

Haqiqiy guruh uchun server muhitida `WALKER_TEACHER_EMAIL` va kamida 12 belgili `WALKER_TEACHER_PASSWORD` ni sozlang va `npm start` buyrug‘ini ishlating. Bu ma’lumotlar bo‘sh bazada ilk ustoz hisobini yaratadi. Ustoz **O‘quvchilar** sahifasida o‘quvchining emaili uchun taklif kodi yaratadi va uni o‘quvchiga shaxsan beradi. O‘quvchi kirish ekranida **Taklif kodi bilan hisob ochish** tugmasini bosib, o‘z emailini, kodni va yangi parolni kiritadi. Kod bir marta ishlatiladi va 7 kun amal qiladi. Avval ochilgan hisoblar avvalgi email va paroli bilan ishlaydi. Internetga joylashda HTTPS reverse proxy va `WALKER_SECURE_COOKIE=1` ishlating.

SQLite bazasi odatda `data/live` da, demo bazasi `data/demo` da saqlanadi. Deploymentda `WALKER_DATA` ni zaxiralanadigan doimiy diskdagi papkaga sozlang. `PORT` standart qiymati 3000.

## Vercel’da joylash

1. Turso’da baza yarating va bazaning URL manzili hamda yozish huquqiga ega tokenini oling.
2. Vercel loyihasining **Settings → Environment Variables** bo‘limiga Production uchun quyidagilarni kiriting:

   | O‘zgaruvchi | Qiymat |
   | --- | --- |
   | `TURSO_DATABASE_URL` | Turso bergan `libsql://…` manzili |
   | `TURSO_AUTH_TOKEN` | Turso bergan token |
   | `WALKER_TEACHER_EMAIL` | Ustozning shaxsiy emaili |
   | `WALKER_TEACHER_PASSWORD` | Ustoz tanlagan 12–200 belgili parol |

3. `main` branchidagi so‘nggi deployni **Redeploy** qiling. Node.js versiyasi 24.x va loyiha ildizi repo ildizi bo‘lishi kerak. `vercel.json` sayt fayllari va API marshrutlarini sozlaydi.
4. Saytni ochib, ustoz emaili bilan kiring. Birinchi API so‘rovida jadvallar va ustoz hisobi yaratiladi.

Vercel’da hisoblar, topshiriqlar va yuklangan fayllar Turso bazasida saqlanadi. Vercel Functions so‘rov hajmi chegarasi sababli Reading PDF, Speaking audio va Listening PDF + audio mos ravishda jami 3 MB gacha bo‘lishi mumkin. Lokal SQLite bazasidagi ma’lumotlar avtomatik ko‘chirilmaydi.

## Google va Telegram orqali kirish

Vercel → **Settings → Environment Variables** bo‘limida **Production** uchun quyidagi qiymatlarni sozlang va qayta deploy qiling:

| O‘zgaruvchi | Qiymati |
| --- | --- |
| `WALKER_PUBLIC_ORIGIN` | `https://walker-ielts.vercel.app` |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Google Cloud Console’da yaratilgan **Web application** OAuth client ma’lumotlari |
| `TELEGRAM_CLIENT_ID`, `TELEGRAM_CLIENT_SECRET` | Telegram BotFather’da **Bot Settings → Web Login** orqali olingan OIDC client ma’lumotlari |

Google OAuth client’ning **Authorized redirect URIs** ro‘yxatiga `https://walker-ielts.vercel.app/api/oauth/google/callback` ni qo‘shing. Telegram Web Login’da loyiha domenini va `https://walker-ielts.vercel.app/api/oauth/telegram/callback` ni ruxsat etilgan qaytish manzili qilib qo‘shing. Client secret qiymatlarini Vercel’ga kiriting. Telegram bot tokeni o‘rniga Web Login client secret’ini ishlating.

Google tasdiqlagan Gmail yoki Google Workspace emaili mavjud Walker hisobiga mos kelsa, hisob avtomatik bog‘lanadi. Boshqa email va Telegram orqali birinchi marta kirishda Walker hisobining o‘z email-paroli bilan bog‘lash talab qilinadi. Yangi o‘quvchi avval ustoz bergan taklif kodi orqali Walker hisobini ochadi. Login formasidagi parol Walker IELTS hisobiga tegishli.

## Admin panel

Vercel → **Settings → Environment Variables** bo‘limida **Production** uchun `WALKER_ADMIN_PASSWORD` ni (12–200 belgi) maxfiy qiymat sifatida qo‘shing va `main` deployini qayta ishga tushiring. Admin username standarti `walkerielts`. Birinchi ishga tushirishda uni `WALKER_ADMIN_USERNAME` bilan belgilash mumkin. Lokal sinovda shu o‘zgaruvchilarni server muhitiga bering.

`/admin` alohida login ishlatadi. **Change password** orqali parol almashtirilsa, yangi parol bazada xesh ko‘rinishida saqlanadi va boshqa admin sessiyalari tugaydi. Vercel’dagi qiymat faqat boshlang‘ich sozlash uchun ishlatiladi. Admin paroli ustoz yoki o‘quvchining kabinet parolidan alohida.

Testlarni faqat admin qo‘shishi, tahrirlashi va o‘chirishi mumkin. Ustoz avvalgidek o‘quvchilarni taklif qiladi va natijalarni baholaydi. Javoblar topshirilgach test turi va javob kaliti saqlanadi, sarlavha, muddat va kontentni tahrirlash mumkin. O‘chirish test va uning topshirilgan javoblarini bazadan olib tashlaydi.

## Vazifalar va baholash

- **Reading va Listening.** Ustoz PDF fayl va javob kalitini yuklaydi. Sayt PDF matnini chiqarib, faylni va raqamlangan javob maydonlarini vazifaga biriktiradi. Skanerlangan PDF faylning o‘zi ochiladi. Listening uchun audio ham yuklanadi. Kalitda har qator bitta savolga mos keladi va muqobil javoblar `|` orqali ko‘rsatiladi.
- **Reading va Listening natijasi.** O‘quvchi topshirgandan keyin to‘g‘ri javoblar soni hisoblanadi. To‘liq 40 savolli vazifa uchun Listening yoki tanlangan Reading turi bo‘yicha taxminiy band ko‘rsatiladi. Test versiyasiga qarab IELTS band chegaralari o‘zgarishi mumkin.
- **Writing.** Ustoz topshiriq matnini kiritadi. O‘quvchi matn yozib topshiradi. Ustoz IELTSning to‘rtta mezoni bo‘yicha ball va izoh beradi. Sayt shu vazifa uchun o‘rtacha bandni yarim bandgacha yaxlitlaydi.
- **Speaking.** Ustoz savollarni yozadi. O‘quvchi audio fayl yuklaydi. Ustoz audio javobni tinglab, band va izoh yozishi mumkin.
