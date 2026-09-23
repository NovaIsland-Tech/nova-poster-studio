# Nova · 海报工作室

Next.js 静态导出 + React + TypeScript + Supabase Free + 浏览器 Canvas。

**静态前端 + 按需成员管理函数，无常驻服务器或生成进程。** 浏览器直接调用管理员配置的模型接口；账号、配置、额度、生成记录和图片存放在 Supabase。Cloudflare 构建后只部署 `out/` 静态文件；Supabase 免费 Edge Function `nova-members` 专门负责管理员开户、重置密码和删除成员。

## 正式站点

- 工作台：https://nova-poster-studio.pages.dev/
- 管理后台：https://nova-poster-studio.pages.dev/admin/
- 托管：Cloudflare Pages 纯静态站点，无 Functions 或 Worker。
- 现有账号与本机共用同一个 Supabase 项目，直接用原邮箱和密码登录。

## 本机使用

```sh
npm ci
npm run build
npm start
```

访问 http://localhost:3000 ，管理员后台 http://localhost:3000/admin/ 。`npm start` 仅启动本机静态文件预览，不处理模型调用。开发时可用 `npm run dev`。

当前 Supabase 项目 `nova-poster`（新加坡，`reuuczinkfadrctkmjmb`）保持 Free。初始管理员 `yuhou24@gmail.com`，本地一次性激活链接在 `.nova/admin-activation.txt`。

网站仅使用两项公开构建变量：

```dotenv
NEXT_PUBLIC_SUPABASE_URL=你的项目地址
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=你的公开密钥
```

`SUPABASE_SECRET_KEY` 只供本机维护脚本使用，不需要上传到静态托管平台。模型 Key 由后台页面写入数据库，并由已启用成员的浏览器读取，用于直连供应商。旧版服务端加密方式不再用于模型配置。

## 使用流程

1. 管理员登录 `/admin/`，在「模型配置」保存供应商、完整 HTTPS 接口地址、模型 ID、API Key、额度消耗与估算价格。
2. 「检查配置与请求格式」只做静态校验。
3. 「浏览器直连测试」使用真实密钥发送空参数 POST，检查浏览器是否可读取该接口响应；HTTP 400 通常表示缺少生图参数，不能代表模型可正常出图。实际请求由供应商处理，费用规则以供应商为准。
4. 在工作台上传单张素材，选择人物/课程/产品模板，修改预设文案，选择比例和模式，查看提示词并生成。
5. **生成期间保持页面打开、不刷新；手机保持前台。** 页面关闭后无法继续处理响应。应用不会自动重发可能收费的请求。
6. 中文文案由浏览器 Canvas 按输入准确叠加。成品上传 Supabase 私有桶，支持历史查看、下载 PNG 和删除图片。

支持两类接口：OpenAI 图片编辑 multipart、Seedream JSON 图生图。接口需要返回 `data[0].b64_json`。模型名称由管理员自行填写；其他响应协议需要适配。供应商必须允许站点来源的 CORS、POST 和 Authorization 请求头。纯前端无法绕过供应商的跨域限制。

生图沿用管理员已配置的供应商。本次成员管理验证不调用收费生图接口。

## 成员管理与认证

管理员在「成员与额度」通过邮箱添加成员，默认密码 `123456`、额度 2 点，可设置到期时间和旗舰权限。首次登录可修改密码或跳过；之后可在「账号设置」修改，密码仅要求至少 6 个字符。

后台支持调整额度、停用、重置密码和删除普通成员。只显示初始密码和密码状态；用户修改后的密码不会明文保存，也不能查看。重置后使用 `123456` 重新登录，再次提示修改。

删除前若有正在生成或待核对的任务，需先处理任务。删除会停用成员、清理其私有图片、不可逆删除登录凭据；保留匿名账号记录及额度账目。中途失败显示「删除待完成」，可继续删除。管理员账号不能通过此入口删除。

云端继续保持公开注册关闭、邮箱确认开启。`nova-members` 在服务端验证管理员身份，通过 Auth Admin API 创建指定账号，不需要开放公众注册。

函数源码位于 `supabase/functions/nova-members/`，使用 Supabase 内置服务端环境变量；服务密钥不进入浏览器。函数和数据库迁移需要单独部署，Cloudflare 静态部署不会更新它们。

## Cloudflare 部署

已发布至 Cloudflare Pages 项目 `nova-poster-studio`，生产分支标识 `main`。本项目采用本地构建后直接上传，无需 Git 仓库或云端构建密钥。

后续更新：

```sh
npx wrangler login  # 仅登录过期时需要
npm run deploy
```

`npm run deploy` 重新构建后仅上传 `out/`。`wrangler.jsonc` 声明静态发布目录，不含函数或私密凭据。不要上传 `.env.local`、`.nova/` 或整个工程目录。

Supabase Site URL 与正式 `/auth/confirm/`、`/account/` 回调地址已更新；保留本机回调便于开发。公开注册保持关闭，指定成员由管理员开户。

首次生产部署：`https://b97dd11e.nova-poster-studio.pages.dev`。日常使用上方稳定的正式站点地址。

## 免费方案与限制

- Supabase 只使用 Free 的 Auth、Postgres、Storage 与 Edge Functions 免费额度；不启用付费算力、分支、备份或图片转换。
- 数据库安全顾问仅余 [泄露密码检测未开启](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection) 提示；按免费方案约束不启用该付费功能。
- 当前核对的 Free 配额：500 MB 数据库、1 GB 图片存储、5 GB egress 与 5 GB cached egress；长期闲置可能暂停。实际以 [Supabase 控制台与价格页](https://supabase.com/pricing) 为准。
- 网站在图片空间接近 800 MiB 时阻止正常流程继续新增；这是软限制，并发或绕过前端可突破，不是供应商用量上限。
- 模型调用费用不属于 Supabase 免费额度。浏览器已获得模型 Key，网站额度与暂停开关不能阻止成员绕过网站直接调用供应商。
- 图片仅自己可读；API Key 可被已启用成员读取，这是当前选择的运行模式。
- 默认没有自动清理作品。请下载重要作品，按需删除图片释放空间。
- 生成最长等待 4 分钟。未完成的数据库记录在后续页面读取时检查；超过 6 分钟的已执行任务转为待核对，不自动重复调用模型。
- 模板示例为生成的原创海报参考；没有自动抠图或完整拖拽编辑器，也不保证模型完全保留产品细节或人物身份。

## 验证

```sh
npm test
npm run typecheck
npm run build
# 仅在没有真实模型配置和活跃任务的测试项目运行：
NOVA_INTEGRATION=true node --env-file=.env.local --import tsx --test tests/browser-db.test.ts
# 启动本机页面后，使用真实 Supabase 临时账号验证成员生命周期（不生图）：
npx playwright test tests/e2e/members.spec.ts
# 不要在生产数据库运行会改动模型配置的旧版 browser.spec.ts
```

旧版服务器代码、Docker 配置和旧测试已保存在 `.nova/legacy-server/`，可回溯，但不参与构建和部署。
