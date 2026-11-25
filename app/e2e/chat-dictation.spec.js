import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const microphone = { stop: () => { window.testMicStopped = true; } };
    window.testMicLevel = 0;
    navigator.mediaDevices.getUserMedia = async () => ({
      getAudioTracks: () => [microphone],
      getTracks: () => [microphone],
    });
    window.AudioContext = class {
      createAnalyser() {
        return {
          getFloatTimeDomainData(samples) {
            for (let i = 0; i < samples.length; i++) {
              samples[i] = i % 2 ? window.testMicLevel : -window.testMicLevel;
            }
          },
          disconnect() {},
        };
      }
      createMediaStreamSource() {
        return { connect() {}, disconnect() {} };
      }
      async resume() {}
      async close() {}
    };
    window.SpeechRecognition = class {
      start(track) {
        if (track !== microphone) throw new Error("Recognition must use the captured microphone.");
        window.testDictation = this;
        this.onaudiostart?.();
      }

      stop() {
        this.onresult?.({ results: [[{ transcript: "add a soft glow" }]] });
        this.onend?.();
      }

      abort() {
        this.onend?.();
      }
    };
  });
  await page.goto("/shader/dither");
});

test("dictation replaces the chat footer and inserts text without sending", async ({ page }) => {
  const input = page.locator("fig-input-text.chat-input textarea");
  const footer = page.locator("fig-ai-prompt > fig-footer");
  await input.fill("Please sharpen the edges");
  await input.evaluate((textarea) => textarea.setSelectionRange(7, 7));
  await footer.getByRole("button", { name: "Dictate", exact: true }).click();

  await expect(footer.getByRole("status", { name: "Recording dictation" })).toBeVisible();
  await expect(footer.getByRole("button", { name: "Send", exact: true })).toHaveCount(0);
  await expect(footer.getByRole("button", { name: "Attach media" })).toHaveCount(0);
  await expect(footer.locator(".chat-model-select")).toHaveCount(0);
  await expect(footer.getByRole("button", { name: "Cancel dictation" })).toHaveCount(0);
  await expect(input).not.toBeEditable();
  await expect(page.locator("fig-input-text.chat-input")).toHaveCSS("box-shadow", "none");

  const wave = footer.locator("canvas.chat-dictation-wave");
  const waveformHeight = () => wave.evaluate((canvas) => {
    const { width, height } = canvas;
    const lastBars = 24;
    if (width < lastBars) return 0;
    const { data } = canvas.getContext("2d").getImageData(width - lastBars, 0, lastBars, height);
    let paintedRows = 0;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < lastBars; x++) {
        if (data[(y * lastBars + x) * 4 + 3] < 128) continue;
        paintedRows++;
        break;
      }
    }
    return paintedRows / devicePixelRatio;
  });
  await expect.poll(waveformHeight).toBeGreaterThan(0);
  expect(await waveformHeight()).toBeLessThan(5);
  await page.evaluate(() => { window.testMicLevel = 0.2; });
  await expect.poll(waveformHeight).toBeGreaterThan(8);
  await page.evaluate(() => { window.testMicLevel = 0; });
  await expect.poll(waveformHeight).toBeLessThan(5);

  await page.evaluate(() => window.testDictation.onresult({
    results: [[{ transcript: "add a" }]],
  }));
  await expect(input).toHaveValue("Please add a sharpen the edges");
  await footer.getByRole("button", { name: "Stop dictation" }).click();

  await expect(footer.getByRole("button", { name: "Send", exact: true })).toBeVisible();
  await expect(input).toBeEditable();
  await expect(input).toHaveValue("Please add a soft glow sharpen the edges");
  await expect(input).toBeFocused();
  await expect(page.locator("fig-chat-message")).toHaveCount(0);
  expect(await page.evaluate(() => window.testMicStopped)).toBe(true);
});

test("Escape stops dictation and late results leave the draft alone", async ({ page }) => {
  const input = page.locator("fig-input-text.chat-input textarea");
  await input.fill("Original draft");
  await page.getByRole("button", { name: "Dictate", exact: true }).click();
  await page.evaluate(() => window.testDictation.onresult({
    results: [[{ transcript: "tentative words" }]],
  }));
  await expect(input).toHaveValue("Original draft tentative words");
  await page.keyboard.press("Escape");
  await expect(input).toHaveValue("Original draft add a soft glow");
  await page.evaluate(() => window.testDictation.onresult({
    results: [[{ transcript: "late words" }]],
  }));
  await expect(input).toHaveValue("Original draft add a soft glow");
  await expect(page.getByRole("button", { name: "Dictate", exact: true })).toBeVisible();
});

test("stopping while permission is pending releases the microphone when it arrives", async ({ page }) => {
  await page.evaluate(() => {
    const getMicrophone = navigator.mediaDevices.getUserMedia;
    navigator.mediaDevices.getUserMedia = () => new Promise((resolve) => {
      window.completeMicrophoneRequest = () => resolve(getMicrophone());
    });
  });
  await page.getByRole("button", { name: "Dictate", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Waiting for microphone" })).toBeVisible();
  await page.getByRole("button", { name: "Stop dictation" }).click();
  await expect(page.getByRole("button", { name: "Dictate", exact: true })).toBeVisible();
  await page.evaluate(() => window.completeMicrophoneRequest());
  await expect.poll(() => page.evaluate(() => window.testMicStopped)).toBe(true);
  expect(await page.evaluate(() => window.testDictation)).toBeUndefined();
});
