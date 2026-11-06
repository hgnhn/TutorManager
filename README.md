# TutorManager — lịch học gia sư

Web quản lý dạy kèm: gia sư đăng lịch rảnh, học viên chọn giờ và gửi yêu cầu, gia sư duyệt và gửi link Google Meet,
hệ thống tự tính học phí (mặc định 100.000 đ/buổi) kèm mã VietQR, và có mục tài liệu/bài tập để học viên tải về.

- Giao diện: Vite + React, chạy tĩnh trên GitHub Pages (tên miền `bananalab.id.vn`).
- Dữ liệu, đăng nhập, phân quyền, file: Supabase (gói miễn phí). Toàn bộ quyền nằm trong
  [supabase/migrations/20261106000000_init.sql](supabase/migrations/20261106000000_init.sql) (Row Level Security),
  nên code để công khai trên GitHub vẫn an toàn.

## 1. Tạo Supabase

1. Vào supabase.com, đăng nhập bằng GitHub, **New project** (region Singapore).
2. **SQL Editor**: dán toàn bộ file migration ở trên, bấm **Run**.
3. **Authentication > Sign In / Providers > Email**: tắt **Confirm email** (gói miễn phí chỉ gửi vài email mỗi giờ),
   và tắt **Allow new users to sign up** để người lạ không tự tạo tài khoản được.
4. **Authentication > URL Configuration**: Site URL = `https://bananalab.id.vn`.
5. **Project Settings > API**: lấy **Project URL** và **anon / publishable key**.
   Không bao giờ đưa `service_role` key vào code hay GitHub.

## 2. Chạy thử trên máy

```bash
npm install
```

Tạo file `.env.local` (đã được .gitignore bỏ qua):

```
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
```

```bash
npm run dev
```

Tạo tài khoản của bạn ở **Authentication > Users > Add user > Create new user** (bật **Auto Confirm User**), rồi trong **SQL Editor** chạy (thay email):

```sql
update public.profiles set role = 'tutor'
where id = (select id from auth.users where email = 'email-cua-ban@gmail.com');
```

Đăng nhập lại là thấy mục **Cài đặt**: nhập giá mỗi buổi, mã ngân hàng (BIN hoặc tên viết tắt, ví dụ `970436`/`vcb`),
số tài khoản, tên chủ tài khoản và link Meet mặc định.

### Cấp tài khoản cho học viên

Web không cho tự đăng ký. Mỗi học viên: **Authentication > Users > Add user > Create new user**, nhập email và mật khẩu,
bật **Auto Confirm User**, rồi đặt tên trong **SQL Editor** (tên này hiện trong lịch, học phí và nội dung chuyển khoản):

```sql
update public.profiles set full_name = 'Nguyễn Văn A'
where id = (select id from auth.users where email = 'email-hoc-vien@gmail.com');
```

Gửi email và mật khẩu cho học viên để họ đăng nhập.

## 3. Đưa lên GitHub Pages

1. Đẩy code lên một repo **public** trên GitHub (Pages miễn phí cần repo public), nhánh `main`.
2. Repo **Settings > Secrets and variables > Actions > Variables**: thêm `VITE_SUPABASE_URL` và `VITE_SUPABASE_ANON_KEY`.
3. Repo **Settings > Pages > Source**: chọn **GitHub Actions**. Mỗi lần push lên `main` web tự build và đăng.
4. **Settings > Pages > Custom domain**: `bananalab.id.vn`, sau khi DNS chạy thì bật **Enforce HTTPS**.

## 4. Trỏ tên miền ở Long Vân

Khi tên miền hết trạng thái "Đang xử lý", vào phần quản lý DNS của tên miền, xoá các bản ghi đang trỏ về trình tạo web
của Long Vân, rồi thêm:

| Loại  | Tên   | Giá trị                      |
|-------|-------|------------------------------|
| A     | @     | 185.199.108.153              |
| A     | @     | 185.199.109.153              |
| A     | @     | 185.199.110.153              |
| A     | @     | 185.199.111.153              |
| CNAME | www   | `<tên-github-của-bạn>.github.io` |

DNS có thể mất từ vài phút đến vài giờ.

## Cách hệ thống hoạt động

- **Lịch rảnh**: gia sư kéo trên lịch để tô giờ rảnh (màu vàng), "Chép lịch tuần trước" để lặp lại theo tuần.
- **Đặt lịch**: học viên kéo hoặc bấm vào vùng vàng, gửi yêu cầu. Máy chủ chỉ nhận yêu cầu nằm trong giờ rảnh,
  chưa qua và chưa có người học.
- **Duyệt**: gia sư duyệt ở mục Buổi học, nhập link Meet, chọn có tính tiền buổi đó hay không. Hai buổi đã duyệt không
  thể trùng giờ.
- **Link Meet**: học viên chỉ thấy nút "Vào lớp" từ 15 phút trước giờ học đến hết buổi (máy chủ chặn, không chỉ ẩn).
- **Học phí**: tính các buổi đã duyệt, đã bắt đầu, có tính tiền và chưa thu. Học viên thấy mã VietQR đúng số tiền
  với nội dung `HOCPHI TEN HOC VIEN`. Gia sư bấm "Đã thu đủ" / "Đã thu tháng này", hoặc tick "Đã thu" từng buổi
  (bỏ tick nếu ghi nhầm).
- **Tài liệu**: gia sư gửi file (tối đa 50 MB) hoặc link Google Drive/YouTube (cho file lớn hơn 50 MB) cho tất cả hoặc một học viên;
  học viên chỉ tải/mở được tài liệu của mình.
- **Thông báo**: gia sư soạn ở mục Thông báo, cho tất cả hoặc một học viên. Học viên thấy chuông ở góc phải với số
  thông báo chưa đọc; bấm chuông hiện danh sách tiêu đề, bấm một tiêu đề để đọc chi tiết. Mỗi thông báo cũng được gửi email cho học viên.
- **Email nhắc tự động** (giờ Việt Nam): buổi học lúc 20:00 tối hôm trước và 1 tiếng trước giờ học; học phí 3 ngày
  trước cuối tháng, và ngày 1 tháng sau nếu tháng trước còn nợ. Mỗi email chỉ gửi một lần (bảng `email_log`).

## 5. Bật email (Resend + Supabase Edge Functions)

Email gửi từ tên miền riêng qua [Resend](https://resend.com) (miễn phí 100 email/ngày, 3.000/tháng). DNS của
`bananalab.id.vn` đang ở **Cloudflare**; hộp thư Zoho không bị ảnh hưởng vì Resend dùng tên con `send`.

1. **Migration**: Supabase **SQL Editor**, dán toàn bộ
   [supabase/migrations/20261108000000_announcements_email.sql](supabase/migrations/20261108000000_announcements_email.sql), bấm **Run**.
2. **Resend**: tạo tài khoản ở resend.com. **Domains > Add Domain**: `bananalab.id.vn`, region **Tokyo (ap-northeast-1)**.
   Resend hiện 3 bản ghi (TXT `resend._domainkey`, MX `send`, TXT `send`). Vào **Cloudflare > bananalab.id.vn > DNS >
   Records**, thêm đúng từng bản ghi, **Proxy status: DNS only** (đám mây xám). Thêm luôn TXT tên `_dmarc`, giá trị
   `v=DMARC1; p=none;` (đỡ vào Spam). Quay lại Resend bấm **Verify DNS records**, chờ trạng thái **Verified**.
3. **API key**: Resend **API Keys > Create API Key**, quyền **Sending access**, chép key `re_...` (chỉ hiện một lần).
4. **Secrets**: Supabase **Edge Functions > Secrets**, thêm 3 secret:
   - `RESEND_API_KEY` = key `re_...` ở bước 3
   - `MAIL_FROM` = `Hoàng Việt Nhân <hoangvietnhan@bananalab.id.vn>` (học viên bấm Trả lời là về hộp thư Zoho)
   - `CRON_SECRET` = một chuỗi ngẫu nhiên, ví dụ kết quả của `select gen_random_uuid();` trong SQL Editor. Giữ lại để dùng ở bước 6.
5. **Đưa function lên** (trong thư mục dự án, cần Node.js; không cần Docker):

   ```bash
   npx supabase login
   ```

   ```bash
   npx supabase functions deploy --remote=rdnrojtblfmrjhbqlzrk --use-api
   ```

   Lệnh thứ hai đưa lên 2 function: `announce` (email thông báo) và `reminders` (email nhắc).
6. **Lịch chạy 15 phút/lần**: mở [supabase/cron.sql](supabase/cron.sql), dán vào SQL Editor, thay
   `DAN_CRON_SECRET_VAO_DAY` bằng đúng `CRON_SECRET` ở bước 4, bấm **Run**. Không lưu giá trị thật vào file trên GitHub.
7. **Thử**: mục Thông báo, gửi một thông báo cho học viên thử; thông báo hiện "đã gửi email cho 1 học viên".
   Lỗi gửi email hiện ngay trong thông báo đỏ. Nhật ký: Supabase **Edge Functions > reminders > Logs**, và
   Resend **Emails**.

## Kiểm tra

```bash
npm test
```

Kiểm tra phân quyền cơ sở dữ liệu (chạy migration trên Postgres giả lập PGlite, không cần Docker):

```bash
npm run test:db
```
