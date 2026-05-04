import { beforeEach, describe, expect, it, vi } from "vitest";
import { SimilarityPane } from "./SimilarityPane";

function mockElement(tag = "div") {
  const children: any[] = [];
  const listeners: Record<string, Function[]> = {};
  return {
    tagName: tag.toUpperCase(),
    style: {} as Record<string, string>,
    textContent: "",
    placeholder: "",
    value: "",
    type: "",
    appendChild(child: any) {
      children.push(child);
    },
    replaceChildren(...nextChildren: any[]) {
      children.length = 0;
      children.push(...nextChildren);
    },
    addEventListener(event: string, handler: Function) {
      (listeners[event] ??= []).push(handler);
    },
    focus: vi.fn(),
    _children: children,
    _listeners: listeners,
    _fire(event: string) {
      for (const handler of listeners[event] ?? []) handler();
    },
  };
}

let created: any[] = [];

beforeEach(() => {
  created = [];
  vi.stubGlobal("document", {
    createElement: (tag: string) => {
      const el = mockElement(tag);
      created.push(el);
      return el;
    },
  });
});

describe("SimilarityPane", () => {
  it("opens and renders helper text for an empty query", async () => {
    const host = mockElement("div") as any;
    const onOpenChange = vi.fn();
    const pane = new SimilarityPane(host, {
      search: vi.fn().mockResolvedValue([]),
      onOpenChange,
    });

    await pane.show();

    expect(pane.isOpen()).toBe(true);
    expect(onOpenChange).toHaveBeenCalledWith(true);
    expect(host.style.display).toBe("block");
    expect(created[1]._children[0].textContent).toContain("Type to search");
  });

  it("renders search results returned by the callback", async () => {
    const host = mockElement("div") as any;
    const pane = new SimilarityPane(host, {
      search: vi.fn().mockResolvedValue([
        {
          id: "block-auth",
          source: "block",
          title: "CODE typescript",
          snippet: "const token = sessionStorage.getItem('auth-token');",
          score: 11,
          matchedTerms: ["auth", "token", "session"],
          blockType: "code",
          language: "typescript",
        },
      ]),
      onOpenChange: vi.fn(),
    });

    await pane.show("auth");

    const resultsHost = created[1];
    expect(resultsHost._children).toHaveLength(1);
    expect(resultsHost._children[0]._children[1].textContent).toBe("CODE typescript");
  });

  it("hides and notifies when closed", async () => {
    const host = mockElement("div") as any;
    const onOpenChange = vi.fn();
    const pane = new SimilarityPane(host, {
      search: vi.fn().mockResolvedValue([]),
      onOpenChange,
    });

    await pane.show("auth");
    pane.hide();

    expect(pane.isOpen()).toBe(false);
    expect(host.style.display).toBe("none");
    expect(onOpenChange).toHaveBeenLastCalledWith(false);
  });

  it("calls onSelect callback when result row is clicked", async () => {
    const host = mockElement("div") as any;
    const onSelect = vi.fn();
    const mockResult = {
      id: "block-auth",
      source: "block" as const,
      title: "CODE typescript",
      snippet: "const token = sessionStorage.getItem('auth-token');",
      score: 11,
      matchedTerms: ["auth", "token", "session"],
      blockType: "code" as const,
      language: "typescript",
    };

    const pane = new SimilarityPane(host, {
      search: vi.fn().mockResolvedValue([mockResult]),
      onOpenChange: vi.fn(),
      onSelect,
    });

    await pane.show("auth");

    const resultsHost = created[1];
    const resultRow = resultsHost._children[0];
    resultRow._fire("click");

    expect(onSelect).toHaveBeenCalledWith(mockResult);
  });
});
