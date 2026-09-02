import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseJsonBlock, parseKeyValueLines, parseMarkdownSections } from "./index.js";

describe("@dream-xi/parser", () => {
  it("parses clean json block in markdown", () => {
    const raw = 'Here is the response:\n```json\n{"status": "ok", "count": 42}\n```\nThanks!';
    const result = parseJsonBlock<{ status: string; count: number }>(raw);
    assert.deepEqual(result, { status: "ok", count: 42 });
  });

  it("sanitizes trailing commas in json block", () => {
    const raw = '```json\n{\n  "items": ["a", "b", ],\n  "enabled": true,\n}\n```';
    const result = parseJsonBlock<{ items: string[]; enabled: boolean }>(raw);
    assert.deepEqual(result, { items: ["a", "b"], enabled: true });
  });

  it("sanitizes single-line comments in json block", () => {
    const raw = '```json\n{\n  // User identifier\n  "id": 101,\n  "name": "dream-agent"\n}\n```';
    const result = parseJsonBlock<{ id: number; name: string }>(raw);
    assert.deepEqual(result, { id: 101, name: "dream-agent" });
  });

  it("parses markdown sections by heading level", () => {
    const text =
      "# Overview\nThis is platform overview.\n\n## Agent Architecture\nMulti-agent setup.\n\n## Tactics\nFormations.";
    const sections = parseMarkdownSections(text);
    assert.equal(sections.length, 3);
    assert.equal(sections[0]?.title, "Overview");
    assert.equal(sections[0]?.level, 1);
    assert.equal(sections[1]?.title, "Agent Architecture");
    assert.equal(sections[1]?.level, 2);
  });

  it("parses key-value lines with comments ignored", () => {
    const text =
      "# Config file\nmodel: claude-3-5-sonnet\nmax_tokens = 4096\n// note line\ntemperature: 0.7";
    const kv = parseKeyValueLines(text);
    assert.equal(kv["model"], "claude-3-5-sonnet");
    assert.equal(kv["max_tokens"], "4096");
    assert.equal(kv["temperature"], "0.7");
  });
});
