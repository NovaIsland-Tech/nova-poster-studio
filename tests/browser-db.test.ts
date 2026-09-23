import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { fixture, cleanup, service, publicClient, checked } from "./helpers";
const enabled = process.env.NOVA_INTEGRATION === "true";
test(
  "browser RLS, admin writes, atomic quota and one-time claim",
  { skip: !enabled },
  async () => {
    const db = service(),
      admin = await fixture("admin"),
      member = await fixture(),
      other = await fixture();
    let model = "",
      asset = randomUUID();
    try {
      const active = await db
        .from("nova_models")
        .select("id")
        .eq("enabled", true);
      assert.equal(
        active.data?.length,
        0,
        "No live models allowed during test",
      );
      const api = (action: string, data = {}) =>
        admin.client.rpc("nova_browser_action", {
          p_action: action,
          p_data: data,
        });
      checked(
        (
          await api("models", {
            mode: "value",
            provider: "QA browser",
            model: "mock",
            endpoint: "https://example.com/images",
            adapter: "openai-edit",
            enabled: true,
            credit_cost: 2,
            estimated_cost: 0.01,
            apiKey: "fake-test-key",
          })
        ).error,
      );
      const modelResult = await member.client
        .from("nova_models")
        .select("*")
        .single();
      checked(modelResult.error);
      model = modelResult.data!.id;
      assert.equal(modelResult.data!.api_key, "fake-test-key");
      const anon = publicClient();
      assert.ok((await anon.from("nova_models").select("*")).error);
      assert.ok(
        (
          await member.client.rpc("nova_browser_action", {
            p_action: "settings",
            p_data: { paused: true, daily_budget: 100 },
          })
        ).error,
      );
      assert.ok(
        (
          await member.client
            .from("nova_profiles")
            .update({ role: "admin" })
            .eq("id", member.id)
        ).error,
      );
      assert.equal(
        (await member.client.from("nova_profiles").select("*")).data?.length,
        1,
      );
      checked(
        (
          await member.client
            .from("nova_assets")
            .insert({
              id: asset,
              user_id: member.id,
              path: `${member.id}/assets/${asset}.png`,
              name: "test",
            })
        ).error,
      );
      assert.equal(
        (await other.client.from("nova_assets").select("*").eq("id", asset))
          .data?.length,
        0,
      );
      const draft = {
          assetId: asset,
          templateId: "product-new",
          title: "Test",
          subtitle: "",
          details: "",
          cta: "",
          brand: "",
          mode: "value",
          ratio: "1:1",
        },
        key = randomUUID();
      const enqueue = () =>
        member.client.rpc("nova_browser_action", {
          p_action: "enqueue",
          p_data: { draft, key, prompt: "test" },
        });
      const [a, b] = await Promise.all([enqueue(), enqueue()]);
      checked(a.error);
      checked(b.error);
      assert.equal(a.data.id, b.data.id);
      const claim = () =>
        member.client.rpc("nova_browser_action", {
          p_action: "claim",
          p_data: { id: a.data.id },
        });
      const [c, d] = await Promise.all([claim(), claim()]);
      checked(c.error);
      checked(d.error);
      assert.equal([c.data, d.data].filter(Boolean).length, 1);
      assert.ok(
        (
          await other.client.rpc("nova_browser_action", {
            p_action: "finish",
            p_data: { id: a.data.id, status: "failed" },
          })
        ).error,
      );
      for (let i = 0; i < 2; i++)
        checked(
          (
            await member.client.rpc("nova_browser_action", {
              p_action: "finish",
              p_data: { id: a.data.id, status: "failed", error: "QA" },
            })
          ).error,
        );
      assert.equal(
        (
          await db
            .from("nova_profiles")
            .select("credits")
            .eq("id", member.id)
            .single()
        ).data!.credits,
        20,
      );
      checked(
        (
          await db
            .from("nova_profiles")
            .update({ active: false })
            .eq("id", member.id)
        ).error,
      );
      assert.equal(
        (await member.client.from("nova_models").select("*")).data?.length,
        0,
      );
    } finally {
      await cleanup(member);
      await cleanup(other);
      await cleanup(admin);
      if (model)
        checked((await db.from("nova_models").delete().eq("id", model)).error);
    }
  },
);
