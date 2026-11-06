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
3. **Authentication > Sign In / Providers > Email**: tắt **Confirm email** (gói miễn phí chỉ gửi vài email mỗi giờ).
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

Đăng ký tài khoản của bạn trên web, rồi trong **SQL Editor** chạy (thay email):

```sql
update public.profiles set role = 'tutor'
where id = (select id from auth.users where email = 'email-cua-ban@gmail.com');
```

Đăng nhập lại là thấy mục **Cài đặt**: nhập giá mỗi buổi, mã ngân hàng (BIN hoặc tên viết tắt, ví dụ `970436`/`vcb`),
số tài khoản, tên chủ tài khoản và link Meet mặc định.

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
  với nội dung `HOCPHI TEN HOC VIEN`. Gia sư bấm "Đã thu đủ" sau khi nhận tiền.
- **Tài liệu**: gia sư gửi file (tối đa 50 MB) hoặc link Google Drive/YouTube (cho file lớn hơn 50 MB) cho tất cả hoặc một học viên;
  học viên chỉ tải/mở được tài liệu của mình.
- **Thông báo**: hiện ngay trong web (trạng thái buổi học, số yêu cầu chờ duyệt). Chưa gửi email/Zalo.

## Kiểm tra

```bash
npm test
```

Kiểm tra phân quyền cơ sở dữ liệu (chạy migration trên Postgres giả lập PGlite, không cần Docker):

```bash
npm run test:db
```
