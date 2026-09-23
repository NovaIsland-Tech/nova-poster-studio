import { mkdir, writeFile } from "node:fs/promises";
import { db, check } from "./db";
const email = process.argv[2];
if (!email || !email.includes("@"))
  throw new Error(
    "Usage: node --env-file=.env.local --import tsx scripts/bootstrap-admin.ts email",
  );
const client = db();
const { data: existing, error: queryError } = await client
  .from("nova_profiles")
  .select("id")
  .eq("email", email)
  .maybeSingle();
check(queryError);
if (!existing)
  throw new Error(
    "此脚本仅为现有管理员生成恢复链接。新增成员请使用网站邀请功能。",
  );
const { data, error } = await client.auth.admin.generateLink({
  type: "recovery",
  email,
});
check(error);
const url = `${process.env.APP_URL}/auth/confirm?token_hash=${encodeURIComponent(data.properties!.hashed_token)}&type=${existing ? "recovery" : "invite"}`;
await mkdir(".nova", { recursive: true });
await writeFile(
  ".nova/admin-activation.txt",
  `管理员：${email}\n打开以下一次性链接，设置你自己的密码：\n${url}\n\n请勿转发此文件。激活后可删除。\n`,
  { mode: 0o600 },
);
console.log(
  "Admin prepared. Activation link saved to .nova/admin-activation.txt (not printed).",
);
