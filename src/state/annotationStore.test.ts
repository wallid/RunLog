// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DerivedActivity } from "@/model/activity";

/**
 * The events readers add, and the storage they survive in.
 *
 * Two things are being defended here. Storage is not trusted, because a browser
 * holds whatever an older build, a newer build or a broken write left there.
 * And `attach` is called from an effect that watches the very object it
 * replaces, so it has to be a no-op once there is nothing left to do.
 */

const STORAGE_KEY = "runlog.annotations";

/**
 * Loads a fresh copy of the store against whatever is in storage now.
 *
 * The activity store comes back from the same reset, because resetting the
 * modules gives the annotation store a new copy of everything it imports — and
 * `attach` would otherwise be writing into a different singleton than the one
 * the assertions read.
 */
async function freshStores() {
  vi.resetModules();
  const { useAnnotationStore } = await import("./annotationStore");
  const { useActivityStore } = await import("./activityStore");
  return { useAnnotationStore, useActivityStore };
}

async function freshStore() {
  return (await freshStores()).useAnnotationStore;
}

function stub(id: string, annotations?: unknown): DerivedActivity {
  return { id, samples: [], annotations } as unknown as DerivedActivity;
}

beforeEach(() => {
  localStorage.clear();
});

describe("reading what is already stored", () => {
  it("starts empty when there is nothing", async () => {
    const store = await freshStore();
    expect(store.getState().byRun).toEqual({});
  });

  it("starts empty rather than throwing on unreadable storage", async () => {
    localStorage.setItem(STORAGE_KEY, "{not json");
    const store = await freshStore();
    expect(store.getState().byRun).toEqual({});
  });

  it("ignores a stored shape that is not a record of runs", async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(["gel"]));
    const store = await freshStore();
    expect(store.getState().byRun).toEqual({});
  });

  it("keeps the entries it recognises and drops the rest", async () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        "fit-1": [
          { id: "a", t: 600, kind: "gel", createdAt: "2026-05-02T08:10:00.000Z" },
          { id: "b", t: 900, kind: "beer", createdAt: "2026-05-02T08:15:00.000Z" },
        ],
        "fit-2": [{ id: "c", t: -5, kind: "gel", createdAt: "2026-05-02T08:15:00.000Z" }],
      }),
    );
    const store = await freshStore();
    expect(store.getState().byRun["fit-1"].map((entry) => entry.id)).toEqual(["a"]);
    // A run left with nothing valid is not kept as an empty list.
    expect(store.getState().byRun).not.toHaveProperty("fit-2");
  });
});

describe("adding, changing and removing", () => {
  it("writes an added event straight through to storage", async () => {
    const store = await freshStore();
    store.getState().add("fit-1", { t: 600, kind: "gel", note: "  caffeine  " });

    const [entry] = store.getState().byRun["fit-1"];
    expect(entry.kind).toBe("gel");
    expect(entry.t).toBe(600);
    expect(entry.note).toBe("caffeine");

    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}") as Record<
      string,
      unknown[]
    >;
    expect(stored["fit-1"]).toHaveLength(1);
  });

  it("refuses a kind it does not know and a position before the start", async () => {
    const store = await freshStore();
    store.getState().add("fit-1", { t: 600, kind: "beer" });
    store.getState().add("fit-1", { t: -1, kind: "gel" });
    expect(store.getState().byRun).toEqual({});
  });

  it("keeps them in the order they happened", async () => {
    const store = await freshStore();
    store.getState().add("fit-1", { t: 1200, kind: "gel" });
    store.getState().add("fit-1", { t: 300, kind: "drink" });
    expect(store.getState().byRun["fit-1"].map((entry) => entry.t)).toEqual([300, 1200]);
  });

  it("changes only what it was given", async () => {
    const store = await freshStore();
    store.getState().add("fit-1", { t: 600, kind: "gel", note: "caffeine" });
    const { id } = store.getState().byRun["fit-1"][0];

    store.getState().update("fit-1", id, { t: 900 });
    const entry = store.getState().byRun["fit-1"][0];
    expect(entry.t).toBe(900);
    expect(entry.kind).toBe("gel");
    expect(entry.note).toBe("caffeine");
  });

  it("clears a note that has been emptied rather than storing a blank", async () => {
    const store = await freshStore();
    store.getState().add("fit-1", { t: 600, kind: "gel", note: "caffeine" });
    const { id } = store.getState().byRun["fit-1"][0];

    store.getState().update("fit-1", id, { note: "  " });
    expect(store.getState().byRun["fit-1"][0]).not.toHaveProperty("note");
  });

  it("forgets a run entirely once its last event is removed", async () => {
    const store = await freshStore();
    store.getState().add("fit-1", { t: 600, kind: "gel" });
    const { id } = store.getState().byRun["fit-1"][0];

    store.getState().remove("fit-1", id);
    expect(store.getState().byRun).not.toHaveProperty("fit-1");
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}")).toEqual({});
  });

  it("stops adding once a run has as many as it can hold", async () => {
    const store = await freshStore();
    for (let i = 0; i < 60; i++) store.getState().add("fit-1", { t: i * 60, kind: "gel" });
    expect(store.getState().byRun["fit-1"]).toHaveLength(50);
  });
});

describe("readings, which are their figure", () => {
  it("stores a lactate reading with its value", async () => {
    const store = await freshStore();
    store.getState().add("fit-1", { t: 1800, kind: "lactate", value: 3.84 });
    expect(store.getState().byRun["fit-1"][0].value).toBe(3.8);
  });

  it("refuses a reading with no figure, or one no meter could produce", async () => {
    const store = await freshStore();
    store.getState().add("fit-1", { t: 1800, kind: "lactate" });
    store.getState().add("fit-1", { t: 1800, kind: "lactate", value: 380 });
    expect(store.getState().byRun).toEqual({});
  });

  it("changes a figure without touching the rest of the entry", async () => {
    const store = await freshStore();
    store
      .getState()
      .add("fit-1", { t: 1800, kind: "lactate", value: 3.8, note: "end of step 3" });
    const { id } = store.getState().byRun["fit-1"][0];

    store.getState().update("fit-1", id, { value: 5.2 });
    const entry = store.getState().byRun["fit-1"][0];
    expect(entry.value).toBe(5.2);
    expect(entry.note).toBe("end of step 3");
  });

  it("leaves the figure behind when the entry stops being a reading", async () => {
    const store = await freshStore();
    store.getState().add("fit-1", { t: 1800, kind: "lactate", value: 3.8 });
    const { id } = store.getState().byRun["fit-1"][0];

    store.getState().update("fit-1", id, { kind: "gel" });
    const entry = store.getState().byRun["fit-1"][0];
    expect(entry.kind).toBe("gel");
    expect(entry).not.toHaveProperty("value");
  });

  it("refuses to turn an event into a reading without one", async () => {
    const store = await freshStore();
    store.getState().add("fit-1", { t: 1800, kind: "gel" });
    const { id } = store.getState().byRun["fit-1"][0];

    store.getState().update("fit-1", id, { kind: "lactate" });
    expect(store.getState().byRun["fit-1"][0].kind).toBe("gel");
  });
});

describe("putting them back on the run being read", () => {
  it("attaches to the matching run and leaves any other alone", async () => {
    const { useAnnotationStore, useActivityStore } = await freshStores();
    useActivityStore.setState({ activity: stub("fit-1") });
    useAnnotationStore.getState().add("fit-1", { t: 600, kind: "gel" });

    expect(useActivityStore.getState().activity?.annotations).toHaveLength(1);

    useActivityStore.setState({ activity: stub("fit-2") });
    useAnnotationStore.getState().attach("fit-1");
    expect(useActivityStore.getState().activity?.annotations).toBeUndefined();
  });

  it("does nothing at all when the annotations are already on", async () => {
    const { useAnnotationStore, useActivityStore } = await freshStores();
    useActivityStore.setState({ activity: stub("fit-1") });
    useAnnotationStore.getState().add("fit-1", { t: 600, kind: "gel" });

    // The effect that calls this watches the object it would replace, so a
    // second call has to leave the identity alone or the page never settles.
    const attached = useActivityStore.getState().activity;
    useAnnotationStore.getState().attach("fit-1");
    expect(useActivityStore.getState().activity).toBe(attached);
  });

  it("does nothing when the run has never had an event", async () => {
    const { useAnnotationStore, useActivityStore } = await freshStores();
    useActivityStore.setState({ activity: stub("fit-1") });
    const untouched = useActivityStore.getState().activity;
    useAnnotationStore.getState().attach("fit-1");
    expect(useActivityStore.getState().activity).toBe(untouched);
  });
});
