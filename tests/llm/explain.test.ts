import { Prisma } from "@prisma/client";
import { llmConfig, type LlmConfig } from "@/lib/llm/client";
import { generateExplanation } from "@/lib/llm/explain";
import { explanationInput } from "@/lib/llm/input";
import { templateExplanation } from "@/lib/llm/template";

const FROM = "00952-8139F54E0";
const TO = "01588-8006ECDD0";

const flag = {
  ruleId: "pass-through",
  details: {
    account: FROM,
    inboundTransactionId: "cmin",
    inboundAmountUsd: "1000.00",
    outboundAmountUsd: "950.00",
    hoursBetween: 10,
    relatedTransactionIds: ["cmin"],
  },
  transaction: {
    timestamp: new Date("2022-09-01T05:14:00Z"),
    fromAccount: FROM,
    toAccount: TO,
    amount: new Prisma.Decimal("950"),
    currency: "US Dollar",
    amountUsd: new Prisma.Decimal("950"),
    paymentType: "ACH",
  },
};
const input = explanationInput(flag);

const CONFIG: LlmConfig = {
  provider: "openai-compatible",
  baseUrl: "https://llm.example/v1",
  model: "test-model",
  apiKey: "secret-key",
  timeoutMs: 50,
};

const reply = (content: unknown, status = 200) =>
  jest.fn(async () => Response.json({ choices: [{ message: { content } }] }, { status }));

beforeEach(() => jest.spyOn(console, "warn").mockImplementation(() => {}));
afterEach(() => jest.restoreAllMocks());

describe("explanation input", () => {
  it("masks every account number and drops internal ids", () => {
    const json = JSON.stringify(input);

    expect(json).not.toContain(FROM);
    expect(json).not.toContain(TO);
    expect(json).not.toContain("cmin");
    expect(input.transaction).toMatchObject({ from: "****F54E0", to: "****ECDD0" });
    expect(input.evidence.account).toBe("****F54E0");
  });
});

describe("generateExplanation", () => {
  it("uses the LLM's text, sending only masked, structured fields", async () => {
    const fetchMock = reply("  Account ****F54E0 passed   $950 onward.  ");

    const result = await generateExplanation(input, CONFIG, fetchMock);

    expect(result).toEqual({ text: "Account ****F54E0 passed $950 onward.", source: "LLM" });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://llm.example/v1/chat/completions");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer secret-key");
    expect(String(init.body)).not.toContain(FROM);
    expect(String(init.body)).toContain("Do not say the transaction is fraud");
  });

  it("falls back to the template when the API throws", async () => {
    const fetchMock = jest.fn(async () => {
      throw new Error("connect ECONNREFUSED");
    });

    const result = await generateExplanation(input, CONFIG, fetchMock);

    expect(result).toEqual({ text: templateExplanation(input), source: "TEMPLATE" });
  });

  it("falls back on an HTTP error or an empty reply", async () => {
    expect((await generateExplanation(input, CONFIG, reply("x", 429))).source).toBe("TEMPLATE");
    expect((await generateExplanation(input, CONFIG, reply("   "))).source).toBe("TEMPLATE");
    expect((await generateExplanation(input, CONFIG, reply(42))).source).toBe("TEMPLATE");
  });

  it("falls back when the call takes longer than the timeout", async () => {
    const hanging = jest.fn(
      (_url: string, init?: RequestInit) =>
        new Promise<Response>((_, reject) =>
          init?.signal?.addEventListener("abort", () => reject(init.signal?.reason)),
        ),
    );

    const result = await generateExplanation(input, CONFIG, hanging as unknown as typeof fetch);

    expect(result.source).toBe("TEMPLATE");
  });

  it("never calls the API when LLM_PROVIDER=none", async () => {
    const fetchMock = reply("unused");

    const result = await generateExplanation(input, { ...CONFIG, provider: "none" }, fetchMock);

    expect(result.source).toBe("TEMPLATE");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("llmConfig", () => {
  it("defaults to templates only, and to Ollama's local URL for ollama", () => {
    expect(llmConfig({}).provider).toBe("none");
    expect(llmConfig({ LLM_PROVIDER: "ollama", LLM_MODEL: "qwen2.5:3b" })).toMatchObject({
      baseUrl: "http://localhost:11434/v1",
      timeoutMs: 8000,
    });
  });
});

describe("templates", () => {
  it.each([
    [
      "fan-out",
      {
        account: FROM,
        counterpartyCount: 7,
        windowStart: "2022-09-01T00:00:00Z",
        windowEnd: "2022-09-05T00:00:00Z",
      },
      "paid 7 different accounts between 2022-09-01 and 2022-09-05",
    ],
    [
      "fan-in",
      {
        account: FROM,
        counterpartyCount: 6,
        windowStart: "2022-09-01T00:00:00Z",
        windowEnd: "2022-09-02T00:00:00Z",
      },
      "received money from 6 different accounts",
    ],
    ["pass-through", flag.details, "received $1,000.00 and sent $950.00 onward 10 hours later"],
    [
      "large-amount",
      { amountUsd: "5000000.00", thresholdUsd: "1200000.00", percentile: 99 },
      "above $1,200,000.00, the 99th percentile",
    ],
    [
      "duplicate",
      { amountUsd: "250.00", minutesBetween: 30, duplicateOfTransactionId: "x" },
      "sent the same payee $250.00 30 minutes earlier",
    ],
  ])("%s states the evidence with masked accounts", (ruleId, details, expected) => {
    const text = templateExplanation(explanationInput({ ...flag, ruleId, details }));

    expect(text).toContain(expected);
    expect(text).not.toContain(FROM);
    expect(text.toLowerCase()).not.toMatch(/fraud|launder/);
  });
});
