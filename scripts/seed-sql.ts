import { appendFileSync } from "node:fs";
import { templates } from "../src/lib/domain";
const quote = (v: string) => "'" + v.replaceAll("'", "''") + "'";
const sql = templates
  .map(
    (t) =>
      `insert into public.nova_templates (${Object.keys(t).join(",")}) values (${Object.values(
        t,
      )
        .map((v) => (typeof v === "boolean" ? String(v) : quote(v)))
        .join(",")});`,
  )
  .join("\n");
appendFileSync(
  "supabase/migrations/20260922093919_nova_initial.sql",
  "\n" + sql + "\n",
);
