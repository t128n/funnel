import { describe, expect, test } from "bun:test";
import { renderMarkdown } from "./render";

describe("renderMarkdown", () => {
	test("renders GFM prose", () => {
		const html = renderMarkdown("**bold** and _em_ and ~~gone~~");
		expect(html.trim()).toBe(
			"<p><strong>bold</strong> and <em>em</em> and <del>gone</del></p>",
		);
	});

	test("renders tables with column alignment intact", () => {
		const html = renderMarkdown("| a | b |\n| :--- | ---: |\n| 1 | 2 |");
		expect(html).toContain("<table>");
		expect(html).toContain('<th style="text-align:left">a</th>');
		expect(html).toContain('<td style="text-align:right">2</td>');
	});

	test("renders task lists as disabled checkboxes", () => {
		const html = renderMarkdown("- [x] done\n- [ ] todo");
		expect(html).toContain('class="contains-task-list"');
		expect(html).toContain('class="task-list-item"');
		expect(html).toContain('<input type="checkbox" checked disabled />');
		expect(html).toContain('<input type="checkbox" disabled />');
	});

	test("highlights fenced code while keeping the language class", () => {
		const html = renderMarkdown("```js\nconst x = 1;\n```");
		expect(html).toContain('<code class="hljs language-js">');
		expect(html).toContain('class="hljs-keyword">const</span>');
		expect(html).toContain('class="hljs-number">1</span>');
	});

	test("leaves unlabelled or unknown fences as plain code", () => {
		expect(renderMarkdown("```\nplain\n```")).toContain("<code>plain");
		expect(renderMarkdown("```nope\nplain\n```")).toContain('class="language-nope"');
	});

	test("keeps mermaid fences unhighlighted for the client renderer", () => {
		const html = renderMarkdown("```mermaid\nflowchart LR\n  A --> B\n```");
		expect(html).toContain('<code class="language-mermaid">');
		expect(html).toContain("flowchart LR");
		// `#lib/client/mermaid` reads the raw text back; no token spans here.
		expect(html).not.toContain("hljs");
	});

	test("keeps mention text intact", () => {
		const html = renderMarkdown("Thanks @alice and @bob-2, see you.");
		expect(html).toContain("@alice");
		expect(html).toContain("@bob-2");
		expect(html).not.toContain("&amp;");
	});

	test("autolinks bare URLs", () => {
		const html = renderMarkdown("see https://example.com now");
		expect(html).toContain(
			'<a href="https://example.com" rel="noopener noreferrer" target="_blank">https://example.com</a>',
		);
	});

	test("keeps allowlisted raw HTML from reporters", () => {
		const html = renderMarkdown(
			"<details><summary>log</summary>\n\n**boom**\n\n</details>\n\n<sub>s</sub> `<kbd>`",
		);
		expect(html).toContain("<details>");
		expect(html).toContain("<summary>log</summary>");
		expect(html).toContain("<strong>boom</strong>");
		expect(html).toContain("<sub>s</sub>");
	});

	test("adds security attributes to links", () => {
		const html = renderMarkdown(
			'<a href="https://x.com" rel="opener" target="_self">raw</a>',
		);
		expect(html).toContain('href="https://x.com"');
		expect(html).toContain('rel="noopener noreferrer"');
		expect(html).toContain('target="_blank"');
		// Raw author attributes do not survive the transform.
		expect(html).not.toContain('rel="opener"');
		expect(html).not.toContain('target="_self"');
	});

	test("lazy-loads images and keeps the source", () => {
		const html = renderMarkdown("![shot](https://example.com/x.png)");
		expect(html).toContain('loading="lazy"');
		expect(html).toContain('src="https://example.com/x.png"');
		expect(html).toContain('alt="shot"');
	});
});

describe("renderMarkdown sanitization", () => {
	test("drops script and style blocks", () => {
		const html = renderMarkdown(
			"<script>alert(1)</script>\n\n<style>body{display:none}</style>\n\nok",
		);
		expect(html).not.toContain("<script");
		expect(html).not.toContain("<style");
		expect(html).not.toContain("alert(1)");
		expect(html).toContain("ok");
	});

	test("strips event handlers and unknown tags", () => {
		const html = renderMarkdown(
			'<img src="x" onerror="alert(1)">\n\n<iframe src="https://evil.example"></iframe>\n\n<custom-thing>kept text</custom-thing>',
		);
		expect(html).not.toContain("onerror");
		expect(html).not.toContain("<iframe");
		expect(html).not.toContain("custom-thing");
		expect(html).toContain("kept text");
	});

	test("keeps bare spans but strips their attributes", () => {
		// `span` is allowlisted for syntax highlighting; only `hljs-*` classes
		// survive, so reportable raw spans cannot smuggle handlers or styles.
		const html = renderMarkdown(
			'<span onclick="alert(1)" style="color:red">plain</span>',
		);
		expect(html).toContain("<span>plain</span>");
		expect(html).not.toContain("onclick");
		expect(html).not.toContain("color:red");
	});

	test("neutralizes dangerous URL schemes", () => {
		const html = renderMarkdown(
			"[js](javascript:alert(1)) [vb](vbscript:alert(1)) [data](data:text/html,x)",
		);
		expect(html).not.toContain("javascript:");
		expect(html).not.toContain("vbscript:");
		expect(html).not.toContain("data:");
		expect(html).toContain("js");
		expect(html).toContain("vb");
		expect(html).toContain("data");
	});

	test("strips inline styles except table alignment", () => {
		const html = renderMarkdown(
			'<p style="background:url(javascript:alert(1))">x</p>\n\n| a |\n| :--- |\n| 1 |',
		);
		expect(html).not.toContain("background");
		expect(html).toContain('style="text-align:left"');
	});

	test("keeps scheme-less relative links", () => {
		const html = renderMarkdown("[rel](/foo) [hash](#bar)");
		expect(html).toContain('href="/foo"');
		expect(html).toContain('href="#bar"');
	});

	test("treats a leading frontmatter block as ordinary content", () => {
		// GitHub issue bodies have no frontmatter, so `---` stays a rule.
		const html = renderMarkdown("---\n\nbody text");
		expect(html).toContain("<hr");
		expect(html).toContain("body text");
	});
});
