-- Starting content: exactly what the homepage showed before the admin existed
-- (previously hard-coded in assets/app.js and index.html).

INSERT INTO videos (kind, youtube_id, title, series, page_path, sort_order) VALUES
  ('reel', 'rfFDI1QtsoA', 'Symbols of Allah', 'Darse Quran · 1441H', '/darse-quran-5th-ramadhan-1441h/', 1),
  ('reel', 'IpKhKAsqs2E', 'Trust in Allah “Tawakkul” – Part 1', 'Darse Hadith · 1441H', '/darse-hadith-2nd-ramadhan-1441h/', 2),
  ('reel', 'fTqfUNLP_i0', 'Life of a Man through the Qur’an', 'Darse Quran · 1441H', '/darse-quran-6-ramadhan-1441h/', 3),
  ('reel', 'JSTLZSpem-A', 'Do’s & Don’ts of a Muslim’s Life', 'Post-Juma Speech · 1441H', '/post-juma-speech-14th-ramadhan-1441h/', 4),
  ('reel', 'i3iTOrEDGfk', 'Chapter of Piety “Taqwa” – Part 1', 'Darse Hadith · 1441H', '/darse-hadith-10th-ramadhan-1441h/', 5),
  ('reel', 'wDGDm61yU1Q', 'Surah Ankaboot (The Spider), Ayat 1–5', 'Darse Quran · 1441H', '/darse-quran-8-ramadhan-1441h/', 6),
  ('reel', 'mQSuYLfH-jY', 'Surah Ya-Seen, Ayah 1–19', 'Darse Quran · 1441H', '/darse-quran-20th-ramadhan-1441h/', 7),
  ('reel', 'BSv_SFGU8sc', 'Explanation of Lectures on Hadith', 'Darse Hadith · 1441H', '/darse-hadith-ramadhan-1-1441-moulana-sayyid-bilal-abdul-hai-hasani/', 8),
  ('reel', 'mpMxbXSXHds', 'Options Given by Allah & the Importance of Arabic', 'Maulana Rabey Hasani Nadwi', '/sayyed-muhammed-rabey-hasani-videos/', 9),
  ('reel', '61nJsvrMb8k', 'Message of Humanity – Part 1', 'Maulana Bilal Abdul Hai Hasani Nadwi', '/other-videos/', 10),
  ('reel', 'gvM_ngdR6sg', 'Syria & Egypt: Political and Cultural Conditions', 'Maulana Wazeh Rashid Hasani Nadwi', '/sayyed-molana-wazeh-rashid-nadwi-videos/', 11),
  ('reel', 'FSOvee7cWK0', 'Post-Juma Speech, 21st Ramadhan', 'Post-Juma Speech · 1441H', '/post-juma-speech-21st-ramadhan-1441h/', 12);

INSERT INTO videos (kind, youtube_id, title, series, page_path, duration_seconds, uploaded_on, sort_order) VALUES
  ('video', 'McHB7nkO4SY', 'Surah Ankaboot (The Spider), Ayat 19–27', 'Darse Quran · 1441H', '/darse-quran-12th-ramadhan-1441h/', 1537, '2020-05-06', 1),
  ('video', '2o1y6ReEz1c', 'Chapter of Piety “Taqwa” – Part 3', 'Darse Hadith · 1441H', '/darse-hadith-12th-ramadhan-1441h/', 1260, '2020-05-06', 2),
  ('video', 'AH-6p8uN9qY', 'Surah Ya-Seen, Ayah 20–36', 'Darse Quran · 1441H', '/darse-quran-22nd-ramadhan-1441h/', 1303, '2020-05-16', 3),
  ('video', 'JrxVd_KuYRY', 'Surah Ankaboot (The Spider), Ayah 45–51', 'Darse Quran · 1441H', '/darse-quran-16th-ramadhan-1441h/', 1895, '2020-05-10', 4),
  ('video', 'c-krblBfWXY', 'Trust in Allah “Tawakkul” – Part 6', 'Darse Hadith · 1441H', '/darse-hadith-8th-ramadhan-1441h/', 1166, '2020-05-02', 5),
  ('video', 'D9NKHKLewLk', 'Address to the Fazeelat Students, 2012', 'Maulana Rabey Hasani Nadwi', '/munazarah/', 2772, '2012-06-04', 6),
  ('video', '3i8IIMQ8Z2Q', 'Annual Function of the Nadwi Center, 2011', 'Abul Hasan Ali Nadwi Center', '/annual-function/', 3537, '2011-07-28', 7),
  ('video', 'hRIyDctFL2c', 'Maulana Salman Husaini Nadwi at Rabita Adab Islami', 'Seminar', '/seminars/', 892, '2011-04-20', 8);

INSERT INTO magazines (slug, name, native_name, language, lang_code, text_dir, issue_label, cover_url, pdf_url, archive_path, since_year, sort_order) VALUES
  ('payam-e-arafat', 'Payam-e-Arafat', 'پیام عرفات', 'Urdu', 'ur', 'rtl', 'October 2026',
   'https://abulhasanalinadwi.org/wp-content/uploads/2026/10/10.-Payam-Oct-2026.jpg',
   'https://abulhasanalinadwi.org/wp-content/uploads/2026/10/10.-Payam-Oct-2026.pdf',
   '/category/payam-e-arafat-urdu/', '2009', 1),
  ('arafat-kiran', 'Arafat Kiran', 'अरफ़ात किरण', 'Hindi', 'hi', 'ltr', 'October 2026',
   'https://abulhasanalinadwi.org/wp-content/uploads/2026/10/10.-Kiran-Oct-2026.jpg',
   'https://abulhasanalinadwi.org/wp-content/uploads/2026/10/10.-Kiran-Oct-2026.pdf',
   '/category/arafat-kiran-hindi/', '2011', 2);

INSERT INTO settings (key, value) VALUES
  ('contact_email', 'askus@abulhasanalinadwi.org'),
  ('contact_phone', '9807240512'),
  ('contact_address', 'Abul Hasan Ali Nadwi Center, Dar-e-Arafat, Takiya Kalan, Raebareli (U.P.) 229001. INDIA'),
  ('youtube_url', 'https://www.youtube.com/user/DareArafat'),
  ('questions_open', 'true');
