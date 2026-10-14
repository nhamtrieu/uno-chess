# Uno Chess — Grandmaster Gambit

Cờ vua gặp bài Uno: mỗi lượt bạn lật một lá bài, và lá bài quyết định bạn được làm gì. Ai ăn được Vua đối thủ trước sẽ thắng (không có chiếu hết).

## Luật chơi

Hai người dùng chung một bộ bài Uno 108 lá. Mỗi lượt bắt đầu bằng việc lật một lá:

| Lá bài | Tác dụng |
| --- | --- |
| Số 1–9 | Có tổng cộng tối đa **N nước đi**, chia cho bất kỳ quân nào tùy ý, có thể dừng sớm. Ăn quân không kết thúc lượt. |
| 0 | Mất lượt. |
| Skip | Lật thêm một lá nữa. |
| Reverse | Xoay bàn cờ 180°, hai người đổi phe, kết thúc lượt. |
| +2 / +4 | Hồi sinh tối đa 2 / 4 quân đã bị ăn về hàng nhà. |
| Wild | Tự chọn số nước đi từ 1 đến 9. |

Ăn Vua là thắng ngay. Mỗi người có đồng hồ Blitz 5 phút cho cả ván; hết giờ là thua.

## Cờ vua thường

Ngoài Uno Chess, trang chủ có tab **Cờ vua thường** (luật quốc tế: chiếu hết, nhập thành, bắt tốt qua đường, phong cấp, hòa do pat / thiếu lực lượng / lặp thế / luật 50 nước, 10 phút mỗi bên). Cũng có đấu online, đấu máy và phòng bạn bè, kèm xin hòa và đầu hàng. Luật cờ dùng thư viện [chess.js](https://github.com/jhlywa/chess.js); máy tính chơi bằng tìm kiếm alpha-beta tối đa 5 nước (giới hạn 1,5 giây mỗi nước, chạy trong worker riêng để không làm chậm các phòng khác). Mỗi chế độ có Elo riêng: Uno Chess, và cờ vua thường chia theo nhóm thời gian là Bullet (1+0, 1+1, 2+1), Blitz (3+0, 3+2, 5+0) và Rapid (10+0, 10+5, 15+10). Ván giao hữu (tắt "Tính Elo") không đổi Elo. Ván được lưu để xem lại.

## Cấu trúc

pnpm monorepo:

- `packages/core` — luật chơi thuần TypeScript (Uno Chess: bàn cờ, bộ bài, trạng thái ván, bot; cờ vua thường: bọc chess.js, bot), không phụ thuộc framework.
- `apps/server` — máy chủ [Colyseus](https://colyseus.io) (phòng chơi realtime, đồng hồ) cộng API tài khoản; lưu dữ liệu vào MongoDB.
- `apps/web` — giao diện Next.js: sảnh, phòng chơi, tài khoản, thống kê, xem lại ván.

## Chạy thử

Cần Node 22+ (khuyến nghị 24), pnpm và Docker (cho MongoDB cục bộ).

```bash
pnpm install
docker compose up -d        # MongoDB tại localhost:27017
cp apps/server/.env.example apps/server/.env
cp apps/web/.env.example apps/web/.env.local
pnpm dev                    # server :2567, web :3000
```

Mở http://localhost:3000. Có ba chế độ: đấu online (ghép ngẫu nhiên), đấu máy, và phòng tùy chỉnh (mời bạn bằng link hoặc mã phòng). Chơi như khách không cần tài khoản, nhưng Elo và lịch sử chỉ được lưu khi đăng nhập.

Chạy kiểm thử (cần MongoDB đang chạy; mỗi lần chạy tạo và xóa một database riêng):

```bash
pnpm test
```

## Chạy và triển khai bằng Docker

`Dockerfile` build hai image (server và web), `docker-compose.yml` chạy cả hệ thống:

```bash
cp apps/server/.env.example apps/server/.env   # điền MONGODB_URI, AUTH_SECRET, GOOGLE_CLIENT_ID
cp .env.example .env                           # địa chỉ công khai cho web (xem dưới)
docker compose up -d --build                   # web :3000, server :2567
```

- **Phát triển có hot reload:** `docker-compose.yml` là bản chạy thật (code được đóng vào image, không tự reload). Khi đang code hãy dùng `docker compose -f docker-compose.dev.yml up --build`: mã nguồn được gắn từ máy bạn vào container, sửa file là web và server tự cập nhật. Web dev chạy bằng webpack vì Turbopack không nhận diện thay đổi file qua volume trên một số hệ điều hành.
- **Database:** server đọc `MONGODB_URI` trong `apps/server/.env`. Dùng DB của bạn (Atlas hoặc tự host) thì cứ điền vào đó. Nhớ rằng trong container, `localhost` là chính container, không phải máy bạn. Muốn dùng MongoDB đi kèm thì chạy `docker compose --profile local-db up -d --build` và đặt `MONGODB_URI=mongodb://mongo:27017/uno-chess`.
- **Địa chỉ cho trình duyệt:** web gọi server trực tiếp từ trình duyệt, nên các biến `NEXT_PUBLIC_*` trong `.env` ở thư mục gốc phải là địa chỉ mà người chơi truy cập được, và chúng được ghi cứng vào image lúc build (đổi giá trị thì phải build lại). Để trống thì mặc định là `<host hiện tại>:2567`, đủ dùng khi mở cổng 2567 trên cùng máy chủ. Khi có tên miền và HTTPS: `NEXT_PUBLIC_SERVER_URL=wss://api.example.com`, `NEXT_PUBLIC_API_URL=https://api.example.com`, đặt reverse proxy (Caddy, Nginx) phía trước và nhớ cho phép WebSocket.
- **Đăng nhập Google:** thêm tên miền thật vào *Authorized JavaScript origins*, và truyền `NEXT_PUBLIC_GOOGLE_CLIENT_ID` trong `.env` gốc để web build có nút Google.
- **Chỉ chạy một bản server:** phòng chơi nằm trong bộ nhớ của tiến trình server nên chưa mở rộng ngang được.

## Cấu hình

`apps/server/.env`:

| Biến | Ý nghĩa |
| --- | --- |
| `MONGODB_URI` | Chuỗi kết nối MongoDB. Mặc định `mongodb://localhost:27017/uno-chess`. Dùng Atlas hoặc DB tự host thì đặt tại đây. |
| `AUTH_SECRET` | Chuỗi ngẫu nhiên dài để ký token đăng nhập. Bỏ trống thì token mất hiệu lực mỗi lần khởi động lại server. |
| `GOOGLE_CLIENT_ID` | Tùy chọn. Bật đăng nhập bằng Google. |
| `PORT` | Cổng server, mặc định 2567. |

`apps/web/.env.local`:

| Biến | Ý nghĩa |
| --- | --- |
| `NEXT_PUBLIC_GOOGLE_CLIENT_ID` | Cùng Client ID như phía server. |
| `NEXT_PUBLIC_SERVER_URL` | Địa chỉ WebSocket của server nếu khác `ws://<host>:2567`. |
| `NEXT_PUBLIC_API_URL` | Địa chỉ HTTP của API nếu khác `http://<host>:2567`. |

### Đăng nhập Google

Chỉ cần **Client ID**, không cần Client Secret. Trong Google Cloud Console, tạo OAuth client loại *Web application* và thêm địa chỉ web của bạn (ví dụ `http://localhost:3000`) vào *Authorized JavaScript origins*. Không cần redirect URI.

## Tính năng

- Kéo thả quân cờ hoặc bấm để đi; chuột phải để vẽ mũi tên và đánh dấu ô (Shift / Ctrl / Alt đổi màu).
- Elo theo từng tài khoản, bảng xếp hạng, thống kê theo chế độ chơi.
- Lịch sử ván và xem lại từng bước (phím ← → để lùi/tiến, Space để phát).
- Đa ngôn ngữ: Tiếng Việt và English (tự nhận theo trình duyệt, đổi trong Cài đặt). Thêm ngôn ngữ mới bằng cách thêm một bảng dịch trong `apps/web/lib/i18n.tsx`.
- Cài đặt: tên hiển thị, giao diện bàn cờ, âm thanh, gợi ý nước đi.

## Lưu ý khi triển khai

- Đặt `AUTH_SECRET` cố định và `MONGODB_URI` trỏ tới DB thật.
- API cho phép mọi origin (CORS) theo mặc định của Colyseus; nên giới hạn lại khi chạy thật.
- Elo của khách chỉ lưu trong trình duyệt; đối thủ là máy tính tính 1500, đối thủ khách tính 1200.
