import test from "node:test";
import assert from "node:assert/strict";
import {
  parseJsonBlock,
  parseMarkdownSections,
  parseKeyValueLines,
  sanitizeJsonString,
} from "./index.ts";

test("parseJsonBlock: parses standard markdown JSON code fence", () => {
  const input = `
Here is the tactical formation:
\`\`\`json
{
  "captain": "Leo",
  "formation": "4-3-3",
  "score": 10
}
\`\`\`
Let's win this match!
`;
  const res = parseJsonBlock<{ captain: string; formation: string; score: number }>(input);
  assert.equal(res.captain, "Leo");
  assert.equal(res.formation, "4-3-3");
  assert.equal(res.score, 10);
});

test("parseJsonBlock: sanitizes trailing commas in objects and arrays", () => {
  const input = `
\`\`\`json
{
  "players": [
    "Leo",
    "André",
    "Flash",
  ],
  "bench": {
    "sub1": "Wall",
  },
}
\`\`\`
`;
  const res = parseJsonBlock<{ players: string[]; bench: { sub1: string } }>(input);
  assert.deepEqual(res.players, ["Leo", "André", "Flash"]);
  assert.equal(res.bench.sub1, "Wall");
});

test("parseJsonBlock: strips single-line and multi-line comments without breaking URLs", () => {
  const input = `
\`\`\`json
{
  // Captain assignment
  "captain": "Leo",
  /* Midfield engine */
  "engine": "André",
  "docs_url": "https://github.com/loulanyue/dream-xi-ai", // Official repo
}
\`\`\`
`;
  const res = parseJsonBlock<{ captain: string; engine: string; docs_url: string }>(input);
  assert.equal(res.captain, "Leo");
  assert.equal(res.engine, "André");
  assert.equal(res.docs_url, "https://github.com/loulanyue/dream-xi-ai");
});

test("parseJsonBlock: extracts raw JSON without fences from freeform LLM chatter", () => {
  const input = `
Sure! Here is the JSON you requested:
{
  "status": "ready",
  "count": 4,
}
Hope this helps!
`;
  const res = parseJsonBlock<{ status: string; count: number }>(input);
  assert.equal(res.status, "ready");
  assert.equal(res.count, 4);
});

test("parseMarkdownSections and parseKeyValueLines", () => {
  const md = `
# Match Day
Welcome to the finals.

## Lineup
Leo: 10
André: 8
Flash: 9
Wall: 4

## Tactical Order
Press high and pass quickly.
`;
  const sections = parseMarkdownSections(md);
  assert.equal(sections.length, 3);
  assert.equal(sections[0].title, "Match Day");
  assert.equal(sections[1].title, "Lineup");

  const kv = parseKeyValueLines(sections[1].content);
  assert.equal(kv.Leo, "10");
  assert.equal(kv.André, "8");
  assert.equal(kv.Flash, "9");
  assert.equal(kv.Wall, "4");
});
