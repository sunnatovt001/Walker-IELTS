# Walker IELTS

Ustoz va o‘quvchilar uchun IELTS uy vazifalari portali.

## Ishga tushirish

Node.js 24 va Poppler `pdftotext` kerak. Ubuntu/Debian paketining nomi `poppler-utils`. npm orqali qo‘shimcha paketlar o‘rnatish talab qilinmaydi.

```sh
npm run check
WALKER_DEMO=1 npm start
```

Brauzerda `http://localhost:3000` manzilini oching. Demo ekranida ustoz yoki o‘quvchi hisobini tanlang.

Haqiqiy guruh uchun server muhitida `WALKER_TEACHER_EMAIL` va kamida 12 belgili `WALKER_TEACHER_PASSWORD` ni sozlang va `npm start` buyrug‘ini ishlating. Bu ma’lumotlar bo‘sh bazada ilk ustoz hisobini yaratadi. Ustoz **O‘quvchilar** sahifasida o‘quvchining emaili uchun taklif kodi yaratadi va uni o‘quvchiga shaxsan beradi. O‘quvchi kirish ekranida **Taklif kodi bilan hisob ochish** tugmasini bosib, o‘z emailini, kodni va yangi parolni kiritadi. Kod bir marta ishlatiladi va 7 kun amal qiladi. Avval ochilgan hisoblar avvalgi email va paroli bilan ishlaydi. Internetga joylashda HTTPS reverse proxy va `WALKER_SECURE_COOKIE=1` ishlating.

SQLite bazasi odatda `data/live` da, demo bazasi `data/demo` da saqlanadi. Deploymentda `WALKER_DATA` ni zaxiralanadigan doimiy diskdagi papkaga sozlang. `PORT` standart qiymati 3000.

## Vazifalar va baholash

- **Reading va Listening.** Ustoz PDF fayl va javob kalitini yuklaydi. Sayt PDF matnini chiqarib, faylni va raqamlangan javob maydonlarini vazifaga biriktiradi. Skanerlangan PDF faylning o‘zi ochiladi. Listening uchun audio ham yuklanadi. Kalitda har qator bitta savolga mos keladi va muqobil javoblar `|` orqali ko‘rsatiladi.
- **Reading va Listening natijasi.** O‘quvchi topshirgandan keyin to‘g‘ri javoblar soni hisoblanadi. To‘liq 40 savolli vazifa uchun Listening yoki tanlangan Reading turi bo‘yicha taxminiy band ko‘rsatiladi. Test versiyasiga qarab IELTS band chegaralari o‘zgarishi mumkin.
- **Writing.** Ustoz topshiriq matnini kiritadi. O‘quvchi matn yozib topshiradi. Ustoz IELTSning to‘rtta mezoni bo‘yicha ball va izoh beradi. Sayt shu vazifa uchun o‘rtacha bandni yarim bandgacha yaxlitlaydi.
- **Speaking.** Ustoz savollarni yozadi. O‘quvchi audio fayl yuklaydi. Ustoz audio javobni tinglab, band va izoh yozishi mumkin.
