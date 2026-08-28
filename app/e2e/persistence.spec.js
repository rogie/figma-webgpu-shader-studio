import { expect, test } from "@playwright/test";

async function openAnonymousEditor(page) {
  await page.addInitScript(() => {
    localStorage.clear();
    Object.defineProperty(Navigator.prototype, "gpu", {
      configurable: true,
      value: undefined,
    });
  });
  await page.goto("/dither");
  await expect(page.locator("propskit-slider[label=Brightness]")).toHaveCount(1);
}

async function setBrightness(page, value) {
  const slider = page.locator("propskit-slider[label=Brightness]");
  await slider.evaluate((element, next) => {
    element.dispatchEvent(
      new CustomEvent("change", {
        bubbles: true,
        detail: { value: next },
      }),
    );
  }, value);
  await expect(slider).toHaveAttribute("value", String(value));
}

async function appendSourceMarker(page, marker) {
  const editor = page.locator(".cm-content").first();
  await editor.click();
  await page.keyboard.press("Control+End");
  await page.keyboard.press("Enter");
  await page.keyboard.insertText(`// ${marker}`);
  await expect(editor).toContainText(marker);
  return editor;
}

test("Reset to default preserves the current source and document identity", async ({
  page,
}) => {
  await openAnonymousEditor(page);
  const editor = await appendSourceMarker(page, "reset-keeps-current-source");
  await setBrightness(page, 150);

  await page
    .locator('fig-button[aria-label="More effect property actions"]')
    .click();
  await page.locator('fig-menu-item[value="reset"]:visible').click();

  await expect(
    page.locator("propskit-slider[label=Brightness]"),
  ).toHaveAttribute("value", "100");
  await expect(editor).toContainText("reset-keeps-current-source");
  await expect(page).toHaveURL(/\/dither$/);
});

test("anonymous duplication carries editor state, plan, and chat continuity", async ({
  page,
}) => {
  await openAnonymousEditor(page);
  await page.waitForTimeout(500);
  await page.evaluate(() => {
    localStorage.setItem(
      "shader-studio.chatPlans.v1",
      JSON.stringify({ "preset:dither": "# Keep this plan\n\n- Preserve it" }),
    );
    localStorage.setItem(
      "shader-studio.chatThreads.v1",
      JSON.stringify({
        "preset:dither": [
          { role: "user", content: "Keep this conversation" },
          { role: "assistant", content: "It will be copied" },
        ],
      }),
    );
    localStorage.setItem(
      "shader-studio.cursorAgents.v2",
      JSON.stringify({
        version: 2,
        lastBindingKey: "preset:dither",
        bindings: {
          "preset:dither": {
            agentId: "bc-11111111-2222-3333-4444-555555555555",
            modelId: "composer-2.5",
            threadId: "preset:dither",
            sourceFingerprint: "1:1",
          },
        },
      }),
    );
  });
  await appendSourceMarker(page, "duplicate-keeps-current-source");
  await setBrightness(page, 135);

  await page.getByRole("button", { name: "More shader actions" }).click();
  await page.locator('fig-menu-item[value="duplicate"]:visible').click();
  await expect(page).toHaveURL(/\/shader\/draft%3A/);

  const persisted = await expect
    .poll(() =>
      page.evaluate(() => {
        const drafts = JSON.parse(
          localStorage.getItem("figma-shader-studio:drafts") || "[]",
        );
        if (drafts.length !== 1) return null;
        const draft = drafts[0];
        const threadKey = `preset:${draft.id}`;
        const plans = JSON.parse(
          localStorage.getItem("shader-studio.chatPlans.v1") || "{}",
        );
        const threads = JSON.parse(
          localStorage.getItem("shader-studio.chatThreads.v1") || "{}",
        );
        return {
          id: draft.id,
          source: draft.source,
          brightness: draft.values?.brightness,
          effectFillCount: draft.composition?.effectFills?.length || 0,
          plan: plans[threadKey],
          messages: threads[threadKey],
        };
      }),
    )
    .not.toBeNull();
  void persisted;

  const duplicate = await page.evaluate(() => {
    const [draft] = JSON.parse(
      localStorage.getItem("figma-shader-studio:drafts") || "[]",
    );
    const threadKey = `preset:${draft.id}`;
    const plans = JSON.parse(
      localStorage.getItem("shader-studio.chatPlans.v1") || "{}",
    );
    const threads = JSON.parse(
      localStorage.getItem("shader-studio.chatThreads.v1") || "{}",
    );
    const cursorAgents = JSON.parse(
      localStorage.getItem("shader-studio.cursorAgents.v2") || "{}",
    );
    return {
      source: draft.source,
      brightness: draft.values.brightness,
      effectFillCount: draft.composition.effectFills.length,
      plan: plans[threadKey],
      messages: threads[threadKey],
      sourceAgent: cursorAgents.bindings?.["preset:dither"],
      targetAgent: cursorAgents.bindings?.[threadKey],
    };
  });
  expect(duplicate.source).toContain("duplicate-keeps-current-source");
  expect(duplicate.brightness).toBe(135);
  expect(duplicate.effectFillCount).toBeGreaterThan(0);
  expect(duplicate.plan).toContain("Keep this plan");
  expect(duplicate.messages.slice(0, 2).map((message) => message.content)).toEqual([
    "Keep this conversation",
    "It will be copied",
  ]);
  expect(duplicate.messages.at(-1).content).toContain("Keep this plan");
  expect(duplicate.sourceAgent.agentId).toBe(
    "bc-11111111-2222-3333-4444-555555555555",
  );
  expect(duplicate.targetAgent.agentId).toBe(duplicate.sourceAgent.agentId);
});

test("IndexedDB media survives a browser document reload", async ({ page }) => {
  await page.goto("/e2e/fixtures/persistence.html");
  const draftId = `draft:e2e-${Date.now()}`;
  await page.evaluate(async (id) => {
    const {
      annotatePersistedFillMedia,
      createDraftMediaStore,
    } = await import("/src/lib/draftMediaStorage.js");
    const store = createDraftMediaStore();
    await store.put({
      draftId: id,
      roleId: "photo",
      blob: new Blob(["durable pixels"], { type: "image/png" }),
      fileName: "photo.png",
      lastModified: 123,
    });
    const fill = annotatePersistedFillMedia(
      {
        id: "photo",
        type: "image",
        paint: {
          type: "image",
          image: { url: "blob:old-document", scaleMode: "fit" },
        },
      },
      { draftId: id, roleId: "photo" },
    );
    localStorage.setItem("e2e-persisted-fill", JSON.stringify(fill));
  }, draftId);

  await page.reload();
  const hydrated = await page.evaluate(async () => {
    const {
      createDraftMediaStore,
      hydratePersistedFillMedia,
      parseDraftMediaAssetKey,
    } = await import("/src/lib/draftMediaStorage.js");
    const store = createDraftMediaStore();
    const fill = JSON.parse(localStorage.getItem("e2e-persisted-fill"));
    const next = await hydratePersistedFillMedia(fill, store);
    return {
      localAssetKey: next.paint.image.localAssetKey,
      parsedAssetKey: parseDraftMediaAssetKey(
        next.paint.image.localAssetKey,
      ),
      scaleMode: next.paint.image.scaleMode,
      contents: await (await fetch(next.paint.image.url)).text(),
    };
  });

  expect(hydrated.localAssetKey).toContain("local-draft-media:v1:");
  expect(hydrated.parsedAssetKey).toEqual({
    draftId,
    roleId: "photo",
  });
  expect(hydrated.scaleMode).toBe("fit");
  expect(hydrated.contents).toBe("durable pixels");
});

test("browser save decisions carry checkpoint and dependency state", async ({
  page,
}) => {
  await page.goto("/e2e/fixtures/persistence.html");
  const result = await page.evaluate(async () => {
    const { getAutosaveDisposition } = await import(
      "/src/lib/autosaveDisposition.js"
    );
    const {
      buildShaderDocumentPayload,
      buildShaderDocumentSnapshot,
    } = await import("/src/lib/shaderDocument.js");
    const {
      buildCompositionDependencySnapshots,
      dependencyLayerSourceOverrides,
    } = await import("/src/lib/compositionDependencies.js");
    const { buildSaveShaderStateRpcArgs } = await import(
      "/src/services/shaders.js"
    );
    const graph = {
      fills: [
        {
          id: "base",
          type: "shader",
          shaderId: "cloud:fill-one",
          values: { scale: 2 },
        },
      ],
      effects: [],
    };
    const pins = buildCompositionDependencySnapshots({
      graph,
      existingSnapshots: {
        "cloud:fill-one": {
          shader_id: "fill-one",
          state_revision: 3,
          source: "pinned source",
          kind: "fill",
          input_path: "owner/fill-one/assets/input.png",
        },
      },
      resolvedByKey: new Map([
        [
          "cloud:fill-one",
          {
            id: "fill-one",
            state_revision: 9,
            source: "latest source",
            kind: "fill",
          },
        ],
      ]),
    });
    const snapshot = buildShaderDocumentSnapshot({
      kind: "composition",
      composition: graph,
      dependencySnapshots: pins,
    });
    const payload = buildShaderDocumentPayload(snapshot);
    return {
      blocked: getAutosaveDisposition({
        dirty: true,
        isOwner: true,
        queueBusy: true,
        currentFingerprint: "new",
        savedFingerprint: "old",
      }),
      ready: getAutosaveDisposition({
        dirty: true,
        isOwner: true,
        currentFingerprint: "new",
        savedFingerprint: "old",
      }),
      rpc: buildSaveShaderStateRpcArgs({
        shaderId: "composition-one",
        expectedStateRevision: 4,
        source: payload.source,
        kind: payload.kind,
        parameterValues: payload.parameter_values,
        features: payload.features,
        composition: payload.composition,
        dependencySnapshots: payload.dependency_snapshots,
        checkpointDependencySnapshots: payload.dependency_snapshots,
        checkpointKind: "manual",
      }),
      overrides: [...dependencyLayerSourceOverrides(graph, pins).entries()],
    };
  });

  expect(result.blocked).toEqual({
    disposition: "skip-retry",
    reason: "save-queue-busy",
  });
  expect(result.ready.disposition).toBe("save");
  expect(result.rpc.p_checkpoint_kind).toBe("manual");
  expect(result.rpc.p_composition.fills[0].id).toBe("base");
  expect(
    result.rpc.p_checkpoint_dependency_snapshots["cloud:fill-one"]
      .state_revision,
  ).toBe(3);
  expect(result.overrides).toEqual([["base", "pinned source"]]);
});

test("two tabs surface a stale revision and block follow-up autosave", async ({
  browser,
}) => {
  const context = await browser.newContext();
  const first = await context.newPage();
  const second = await context.newPage();
  await first.goto("/e2e/fixtures/persistence.html");
  await second.goto("/e2e/fixtures/persistence.html");
  await first.evaluate(() => {
    localStorage.setItem("e2e-shader-state-revision", "1");
  });

  const attemptUpdate = async (page, expectedStateRevision, source) =>
    page.evaluate(
      async ({ expectedRevision, nextSource }) => {
        const { updateShader } = await import("/src/services/shaders.js");
        const client = {
          from() {
            return {
              update(payload) {
                let expected = null;
                const query = {
                  eq(column, value) {
                    if (column === "state_revision") expected = Number(value);
                    return query;
                  },
                  select() {
                    return query;
                  },
                  async maybeSingle() {
                    const current = Number(
                      localStorage.getItem("e2e-shader-state-revision"),
                    );
                    if (expected != null && expected !== current) {
                      return { data: null, error: null };
                    }
                    const revision = current + 1;
                    localStorage.setItem(
                      "e2e-shader-state-revision",
                      String(revision),
                    );
                    return {
                      data: { ...payload, state_revision: revision },
                      error: null,
                    };
                  },
                };
                return query;
              },
            };
          },
        };
        try {
          const row = await updateShader(
            "shared-shader",
            { source: nextSource },
            {
              expectedStateRevision: expectedRevision,
              client,
            },
          );
          return { ok: true, revision: row.state_revision };
        } catch (error) {
          const { getAutosaveDisposition } = await import(
            "/src/lib/autosaveDisposition.js"
          );
          return {
            ok: false,
            code: error.code,
            message: error.message,
            disposition: getAutosaveDisposition({
              dirty: true,
              isOwner: true,
              conflictBlocked: true,
              currentFingerprint: "tab-two",
              savedFingerprint: "tab-one",
            }),
          };
        }
      },
      { expectedRevision: expectedStateRevision, nextSource: source },
    );

  const firstResult = await attemptUpdate(first, 1, "tab one source");
  const secondResult = await attemptUpdate(second, 1, "tab two source");

  expect(firstResult).toEqual({ ok: true, revision: 2 });
  expect(secondResult).toEqual({
    ok: false,
    code: "40001",
    message: "shader_state_conflict",
    disposition: {
      disposition: "skip-retry",
      reason: "state-conflict-requires-explicit-save",
    },
  });
  await context.close();
});
