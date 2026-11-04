import { afterAll, afterEach, beforeAll, beforeEach } from "bun:test";
import { formatChordText } from "@localixai/kit/keybindings";
import { registerDom } from "@localixai/kit/testing";
import type { PublishedMessageContext } from "@localixai/mini-app-sdk/ui";
import {
  bindMiniAppUiRuntime,
  type MiniAppComposerInsert,
  type MiniAppUiRuntime,
  type MiniAppWorkItemRequest,
} from "@localixai/mini-app-sdk/ui/runtime";
import { bindMiniAppUiTestDoubles } from "@localixai/mini-app-sdk/ui/testing";
import { bindMiniAppUiTransport } from "@localixai/mini-app-sdk/ui/transport";
import { API_BASE, api, type RouteName } from "../shared/api";
import type { Review } from "../shared/model";
import type {
  CheckAnswerResult,
  LibraryRow,
  Placement,
  SimilarHit,
  StudyCard,
} from "../shared/payloads";
import type { ImportFilePreview, ImportPreview, ImportResult } from "../shared/payloads-more";
import { DEBOUNCE } from "./data";
import * as fx from "./test-fixtures";
import { click } from "./test-dom";

export * from "./test-dom";

/** Cmd+Enter or Ctrl+Enter, whichever the host's platform counts as the primary modifier. */
export const PRIMARY: KeyboardEventInit = formatChordText("mod+enter").startsWith("Ctrl")
  ? { ctrlKey: true }
  : { metaKey: true };
export * as fx from "./test-fixtures";

let domRegisteredOnce = false;

/**
 * React DOM decides what the page can do (inputs, events) when it is first loaded. Loaded before any
 * DOM exists, it stays that way for every later file in the run: typing then fails in files that
 * have nothing to do with the one that loaded it. So the first file registers the DOM, then loads it.
 */
function assertReactDomLoadsAfterTheDom(): void {
  if (domRegisteredOnce) return;
  domRegisteredOnce = true;
  const early = Object.keys(require.cache ?? {}).filter((path) => /react-dom[-\\/]client/.test(path));
  if (early.length > 0) {
    throw new Error(
      "react-dom was loaded before the DOM existed (a static import of react-dom/client in a test file). " +
        "Load it inside the test with `await import(...)`, as mount() does, so every later file types normally.",
    );
  }
}

/** Register a DOM, the host's doubles and React's act environment for the file's tests. */
export function setupDom(): void {
  let teardown: () => Promise<void>;
  let unbindDoubles: () => void;
  const env = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
  const prior = env.IS_REACT_ACT_ENVIRONMENT;
  beforeAll(() => {
    assertReactDomLoadsAfterTheDom();
    teardown = registerDom();
    unbindDoubles = bindMiniAppUiTestDoubles();
    env.IS_REACT_ACT_ENVIRONMENT = true;
    DEBOUNCE.ms = 0;
  });
  afterAll(async () => {
    unbindDoubles();
    await teardown();
    if (prior === undefined) delete env.IS_REACT_ACT_ENVIRONMENT;
    else env.IS_REACT_ACT_ENVIRONMENT = prior;
  });
}

/** An `Audio` that plays nothing and remembers what it was asked: sources, plays and pauses. */
export class FakeAudio {
  static instances: FakeAudio[] = []
  paused = true
  plays = 0
  currentTime = 0
  private readonly listeners = new Map<string, (() => void)[]>()
  constructor(readonly src: string) {
    FakeAudio.instances.push(this)
  }
  play(): Promise<void> {
    this.paused = false
    this.plays += 1
    return Promise.resolve()
  }
  pause(): void {
    this.paused = true
  }
  addEventListener(type: string, listener: () => void): void {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener])
  }
  removeEventListener(): void {}
  /** The sound ran to its end. */
  end(): void {
    this.paused = true
    for (const listener of this.listeners.get('ended') ?? []) listener()
  }
  /** The files played so far, in order, by the name after `media/`. */
  static played(): string[] {
    return FakeAudio.instances.filter((audio) => audio.plays > 0).map((audio) => audio.src.split('/media/')[1] ?? audio.src)
  }
}

/** Put the fake in place of the page's `Audio` for the file's tests; each test starts with no sounds. */
export function setupFakeAudio(): void {
  const env = globalThis as unknown as { Audio: unknown }
  let original: unknown
  beforeAll(() => {
    original = env.Audio
  })
  beforeEach(() => {
    FakeAudio.instances = []
    env.Audio = FakeAudio
  })
  afterEach(() => {
    env.Audio = original
  })
}

export interface Call {
  method: string;
  name: RouteName;
  path: string;
  query: URLSearchParams;
  body: any;
}

/** The backend as the screen sees it: every route of the contract, over a small in-memory state. */
export interface Fake {
  revision: number;
  today: ReturnType<typeof fx.today>;
  decks: ReturnType<typeof fx.deck>[];
  settings: ReturnType<typeof fx.settingsResult>;
  stats: ReturnType<typeof fx.stats>;
  rows: LibraryRow[];
  queue: StudyCard[];
  similar: SimilarHit[];
  placement: Placement[];
  check: CheckAnswerResult;
  preview: ImportPreview;
  imported: ImportResult;
  /** What an Anki file on disk holds, and what importing it does. */
  filePreview: ImportFilePreview;
  fileImported: ImportResult;
  /** The work items the screen asked the host to open. */
  opened: MiniAppWorkItemRequest[];
  /** While set, importing a file waits for it. */
  hold: Promise<void> | null;
  becameHard: boolean;
  undo?: StudyCard;
  /** What the screen put in the chat composer, and the files it saved. */
  composer: MiniAppComposerInsert[];
  saved: string[];
  /** Every request, and the writes among them. */
  calls: Call[];
  writes: Call[];
  failReads: boolean;
  /** Answer one named route with this status and sentence. */
  refuse: Partial<Record<RouteName, string>>;
  unbind: () => void;
}

const routes = (Object.keys(api) as RouteName[]).map((name) => ({
  name,
  method: api[name].method as string,
  re: new RegExp(`^${api[name].path.replace(/:\w+/g, "([^/]+)")}$`),
}));

const NO_SESSIONS: never[] = [];
const ASKS: RouteName[] = ["similar", "placement", "studyCheck", "importPreview", "importFilePreview"];
const json = (status: number, body: unknown) => Response.json(body, { status });
const review = (card: StudyCard, rating: 1 | 2 | 3 | 4): Review => ({
  id: `r-${card.card.id}`,
  cardId: card.card.id,
  noteId: card.note.id,
  rating,
  state: 2,
  due: "2026-11-07T09:00:00.000Z",
  stability: 5,
  difficulty: 5,
  scheduledDays: 3,
  elapsedDays: 1,
  reviewedAt: "2026-11-04T09:00:00.000Z",
  durationMs: 4000,
  source: "screen",
  prev: null,
});

export function bindBackend(init: Partial<Fake> = {}): Fake {
  const rows = [
    fx.row("a", "Hola means hello"),
    fx.row("b", "Gracias means thanks", { tags: ["basics"] }),
    fx.row("c", "Mitosis", { deckId: "d2" }),
  ];
  const fake: Fake = {
    revision: 1,
    today: fx.today(),
    decks: [fx.deck("d1", "Spanish"), fx.deck("d2", "Biology", { color: 2 })],
    settings: fx.settingsResult(),
    stats: fx.stats(),
    rows,
    queue: [
      fx.studyCard("s1", "What is the capital of France?", {}, { back: "Paris" }),
      fx.studyCard("s2", "Hola"),
    ],
    similar: [],
    placement: [],
    check: { verdict: "correct", rating: 3, by: "exact", expected: "Paris" },
    preview: {
      source: "spanish.csv",
      format: "csv",
      notes: 3,
      cards: 3,
      decks: [{ name: "Spanish", notes: 3, exists: true }],
      duplicates: 1,
      withProgress: 0,
      media: 0,
      pictures: 0,
      sounds: 0,
      notices: [],
      warnings: ["One row had no back."],
      sample: [{ kind: "basic", front: "Hola", back: "Hello" }],
    },
    imported: {
      source: "spanish.csv",
      added: 2,
      cards: 2,
      skippedDuplicates: 1,
      decksCreated: [],
      status: "draft",
      reviewsReplayed: 0,
      notices: [],
      warnings: [],
      decks: [{ id: "d1", name: "Spanish", color: 1, notes: 2 }],
    },
    filePreview: { ...fx.ankiPreview(), bytes: 103 * 1024 * 1024 },
    fileImported: fx.ankiImported(),
    opened: [],
    hold: null,
    becameHard: false,
    composer: [],
    saved: [],
    calls: [],
    writes: [],
    failReads: false,
    refuse: {},
    unbind: () => {},
    ...init,
  };
  const handlers: Partial<Record<RouteName, (c: Call, p: string[]) => unknown>> = {
    revision: () => ({ revision: fake.revision }),
    today: () => fake.today,
    heatmap: (c) => fx.heatmap(Number(c.query.get("weeks") ?? 12)),
    decks: () => ({ decks: fake.decks }),
    settings: () => fake.settings,
    settingsUpdate: (c) => (
      (fake.settings = { ...fake.settings, settings: { ...fake.settings.settings, ...c.body } }),
      fake.settings
    ),
    stats: () => fake.stats,
    library: (c) => {
      const q = c.query;
      const text = q.get("q")?.toLowerCase();
      const states = q.get("states")?.split(",") ?? [];
      const deck = q.get("deckIds")?.split(",");
      const all = fake.rows.filter(
        (r) =>
          (!text || r.note.front.toLowerCase().includes(text)) &&
          (!states.includes("draft") || r.note.status === "draft") &&
          (!deck || deck.includes(r.note.deckId ?? "inbox")),
      );
      const offset = Number(q.get("offset") ?? 0);
      const limit = Number(q.get("limit") ?? 50);
      const next = offset + limit < all.length ? offset + limit : null;
      return {
        rows: all.slice(offset, offset + limit),
        total: all.length,
        offset,
        limit,
        nextOffset: next,
        by: text && q.get("mode") === "meaning" ? "meaning" : "text",
      };
    },
    noteGet: (_c, p) => {
      const r = fake.rows.find((x) => x.note.id === p[0]);
      return r
        ? fx.detail(r)
        : json(404, { error: { code: "not_found", message: "That card is gone." } });
    },
    noteUpdate: (c, p) => {
      const r = fake.rows.find((x) => x.note.id === p[0])!;
      r.note = { ...r.note, ...c.body, updatedAt: `2026-11-04T10:0${fake.revision % 10}:00.000Z` };
      return { note: r.note, cards: [], similar: [] };
    },
    noteCreate: (c) => {
      const r = fx.row(`new-${fake.rows.length}`, c.body.front, { ...c.body, status: "active" });
      fake.rows.unshift(r);
      return { note: r.note, cards: [], similar: fake.similar };
    },
    bulk: (c) => {
      if (c.body.match) {
        const affected = c.body.expect;
        if (c.body.action === "delete") fake.rows = [];
        return { affected, message: `Done: ${c.body.action}.` };
      }
      if (c.body.action === "delete")
        fake.rows = fake.rows.filter((r) => !c.body.ids.includes(r.note.id));
      return { affected: c.body.ids.length, message: `Done: ${c.body.action}.` };
    },
    drafts: (c) => (
      fake.rows.forEach(
        (r) => c.body.ids?.includes(r.note.id) && (r.note = { ...r.note, status: "active" }),
      ),
      { affected: 1, message: "Accepted." }
    ),
    similar: () => ({ similar: fake.similar, by: "exact" }),
    placement: () => ({ suggestions: fake.placement }),
    studyNext: () => ({
      card: fake.queue[0] ?? null,
      counts: { learning: 0, review: fake.queue.length, new: 0, total: fake.queue.length },
      nextDueAt: fake.queue.length ? null : (fake.today.nextDueAt ?? "2026-11-04T18:40:00.000Z"),
      reviewedToday: 0,
    }),
    studyCard: (_c, p) =>
      fake.queue.find((x) => x.card.id === p[0]) ??
      json(404, { error: { code: "not_found", message: "Gone." } }),
    studyGrade: (c) => {
      const done = fake.queue.shift()!;
      fake.undo = done;
      return {
        review: review(done, c.body.rating),
        label: "3 d",
        becameHard: fake.becameHard,
        next: handlers.studyNext!(c, []),
      };
    },
    studyUndo: (c) => {
      const back = fake.undo;
      if (!back) return { card: null, undone: null };
      fake.queue.unshift(back);
      fake.undo = undefined;
      return { card: back, undone: { cardId: back.card.id, rating: 1 } };
    },
    studyCheck: () => fake.check,
    studyPause: (c) => (fake.queue.shift(), handlers.studyNext!(c, [])),
    studySkip: (c) => (fake.queue.shift(), handlers.studyNext!(c, [])),
    importPreview: () => fake.preview,
    importCommit: () => fake.imported,
    importFilePreview: () => fake.filePreview,
    importFileCommit: async () => (await fake.hold, fake.fileImported),
    deckCreate: (c) => fx.deck("d9", c.body.name, { color: c.body.color }),
    deckRemove: (_c, p) => ({ removed: p[0]!, moved: 1, deleted: 0 }),
  };
  const unbindRuntime = bindMiniAppUiRuntime({
    composer: { insert: (request: MiniAppComposerInsert) => void fake.composer.push(request) },
    sessions: { list: () => NO_SESSIONS, subscribe: () => () => {} },
    files: { saveBlob: (name: string) => void fake.saved.push(name) },
    workspace: { openWorkItem: (request: MiniAppWorkItemRequest) => void fake.opened.push(request) },
  } as unknown as MiniAppUiRuntime);
  const unbindTransport = bindMiniAppUiTransport({
    url: (path) => path,
    request: async (path, request) => {
      const method = request?.method ?? "GET";
      const [pathname, search = ""] = path.slice(API_BASE.length).split("?");
      const hit = routes.find((r) => r.method === method && r.re.test(pathname!));
      if (!hit)
        return json(404, {
          error: { code: "no_route", message: `No route ${method} ${pathname}` },
        });
      const raw = request?.body;
      const body =
        typeof raw === "string"
          ? JSON.parse(raw)
          : raw
            ? { bytes: true, name: (raw as File).name }
            : undefined;
      const call: Call = { method, name: hit.name, path, query: new URLSearchParams(search), body };
      fake.calls.push(call);
      // These POSTs only ask; every other non-GET changes something.
      if (method !== "GET" && !ASKS.includes(hit.name)) {
        fake.writes.push(call);
        fake.revision += 1;
      }
      if (fake.failReads && method === "GET")
        return json(500, { error: { code: "down", message: "Backend is down." } });
      const refusal = fake.refuse[hit.name];
      if (refusal) return json(409, { error: { code: "refused", message: refusal } });
      const answer = await handlers[hit.name]?.(call, hit.re.exec(pathname!)!.slice(1));
      return answer instanceof Response ? answer : json(200, answer ?? {});
    },
  });
  fake.unbind = () => (unbindTransport(), unbindRuntime());
  return fake;
}

export interface Mounted {
  container: HTMLElement;
  fake: Fake;
  contexts: (PublishedMessageContext | null)[];
  act: (callback: () => unknown) => Promise<void>;
  settle: () => Promise<void>;
  unmount: () => Promise<void>;
}

/**
 * A screen a test left mounted, say after it timed out before its `finally`. Each is unmounted
 * after the test, so one hung test fails alone instead of leaving its root and backend behind for
 * every test after it (one timeout in CI once failed 22 more).
 */
const leftovers = new Set<() => Promise<void>>();

/** Timers a test started and nothing has cleared: where they were started and how long they wait. */
const pendingTimers = new Map<unknown, string>();
const realTimers = {
  setTimeout: globalThis.setTimeout,
  setInterval: globalThis.setInterval,
  clearTimeout: globalThis.clearTimeout,
  clearInterval: globalThis.clearInterval,
};

function whereStarted(): string {
  const frames = (new Error().stack ?? "").split("\n").slice(2);
  return (frames.find((line) => !line.includes("test-support")) ?? "").trim();
}

beforeEach(() => {
  pendingTimers.clear();
  const track = (kind: "setTimeout" | "setInterval") =>
    ((handler: TimerHandler, delay?: number, ...rest: unknown[]) => {
      const wrapped =
        kind === "setTimeout" && typeof handler === "function"
          ? (...args: unknown[]) => {
              pendingTimers.delete(id);
              return (handler as (...a: unknown[]) => unknown)(...args);
            }
          : handler;
      const id = (realTimers[kind] as any)(wrapped, delay, ...rest);
      pendingTimers.set(id, `${kind}(${delay ?? 0} ms) from ${whereStarted()}`);
      return id;
    }) as unknown as typeof setTimeout;
  const untrack = (kind: "clearTimeout" | "clearInterval") =>
    ((id?: unknown) => {
      pendingTimers.delete(id);
      return (realTimers[kind] as any)(id);
    }) as unknown as typeof clearTimeout;
  globalThis.setTimeout = track("setTimeout");
  globalThis.setInterval = track("setInterval") as unknown as typeof setInterval;
  globalThis.clearTimeout = untrack("clearTimeout");
  globalThis.clearInterval = untrack("clearInterval") as unknown as typeof clearInterval;
});

afterEach(async () => {
  for (const unmount of [...leftovers]) await unmount().catch(() => {});
  leftovers.clear();
  const leaked = [...pendingTimers.values()];
  for (const id of pendingTimers.keys()) {
    realTimers.clearTimeout(id as never);
    realTimers.clearInterval(id as never);
  }
  pendingTimers.clear();
  Object.assign(globalThis, realTimers);
  // Whatever the screen started is gone with it; a timer left over would run inside the next test.
  if (leaked.length > 0) {
    throw new Error(`The test left ${leaked.length} timer(s) running after the screen was unmounted:\n${leaked.join("\n")}`);
  }
});

/** How long one act may take before the test names the step that hung, not just "timed out". */
const ACT_LIMIT_MS = 3000;

async function within<T>(work: Promise<T>, step: string): Promise<T> {
  const where = new Error(`${step} did not finish within ${ACT_LIMIT_MS} ms`);
  let timer: ReturnType<typeof setTimeout> | undefined;
  const limit = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(where), ACT_LIMIT_MS);
  });
  try {
    return await Promise.race([work, limit]);
  } finally {
    clearTimeout(timer);
  }
}

/** Mount the whole screen against the fake backend, as the host does. */
export async function mount(
  init: Partial<Fake> = {},
  options: { file?: string } = {},
): Promise<Mounted> {
  const { act } = await import("react");
  const { createRoot } = await import("react-dom/client");
  const { App } = await import("./App");
  const { AnkiFileTab } = await import("./import/AnkiFileTab");
  try {
    localStorage.clear();
  } catch {
    // a DOM without storage starts clean anyway
  }
  const fake = bindBackend(init);
  const contexts: Mounted["contexts"] = [];
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const settle = async () => {
    for (let i = 0; i < 3; i += 1)
      await within(
        act(async () => void (await new Promise((resolve) => setTimeout(resolve, 0)))),
        "settling the screen",
      );
  };
  let mounted = true;
  const unmount = async () => {
    if (!mounted) return;
    mounted = false;
    leftovers.delete(unmount);
    await within(
      act(async () => root.unmount()),
      "unmounting the screen",
    ).catch(() => {});
    container.remove();
    fake.unbind();
  };
  leftovers.add(unmount);
  await within(
    act(async () =>
      root.render(
        options.file ? (
          <AnkiFileTab
            sessionId="s1"
            path={options.file}
            publishMessageContext={(context) => contexts.push(context)}
          />
        ) : (
          <App active publishMessageContext={(context) => contexts.push(context)} />
        ),
      ),
    ),
    "rendering the screen",
  );
  await settle();
  return {
    container,
    fake,
    contexts,
    act: (callback) =>
      within(
        act(async () => void (await callback())),
        "an act in the test",
      ),
    settle,
    unmount,
  };
}

/** Press a tab of the screen's tab bar. */
export async function openTab(screen: Mounted, label: string): Promise<void> {
  const tab = [...screen.container.querySelectorAll<HTMLElement>('[role="tab"]')].find((t) =>
    t.textContent?.startsWith(label),
  );
  if (!tab) throw new Error(`No tab ${label}`);
  await screen.act(async () => click(tab));
  await screen.settle();
}
