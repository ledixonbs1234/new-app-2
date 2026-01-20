# Skill Template (Markdown)

## Overview
A **skill** is a reusable piece of functionality that can be invoked by the assistant through the `skill` tool. This document describes how to define a skill, its required fields, and provides a template you can copy and modify for your own needs.

---

## Skill Definition Structure
```
{
  "name": "<skill-identifier>",
  "description": "<short description of what the skill does>",
  "inputs": {
    "type": "object",
    "properties": {
      "<param1>": { "type": "<type>", "description": "<description>" },
      "<param2>": { "type": "<type>", "description": "<description>" }
    },
    "required": ["<param1>"]
  },
  "outputs": {
    "type": "object",
    "properties": {
      "result": { "type": "<type>", "description": "<description>" }
    }
  },
  "example": {
    "input": { "<param1>": "value" },
    "output": { "result": "..." }
  }
}
```

---

## Creating a New Skill
1. **Choose a unique name** – lowercase, hyphen‑separated (e.g., `web-scrape`).
2. **Write a concise description** – one sentence explaining the purpose.
3. **Define input schema** – list all parameters the skill needs.
4. **Define output schema** – describe what the skill returns.
5. **Provide an example** – helpful for developers and documentation.
6. **Save the definition** – typically in a `skills/` folder as a JSON or YAML file, or directly embed in a markdown file for reference.

---

## Example: Simple Web‑Scraping Skill
```json
{
  "name": "web-scrape",
  "description": "Fetches a web page and extracts text matching a CSS selector.",
  "inputs": {
    "type": "object",
    "properties": {
      "url": { "type": "string", "description": "The page URL to fetch" },
      "selector": { "type": "string", "description": "CSS selector for the desired element(s)" }
    },
    "required": ["url", "selector"]
  },
  "outputs": {
    "type": "object",
    "properties": {
      "content": { "type": "array", "items": { "type": "string" }, "description": "Extracted text content" }
    }
  },
  "example": {
    "input": { "url": "https://example.com", "selector": "h1" },
    "output": { "content": ["Example Domain"] }
  }
}
```

---

## How to Register the Skill (Conceptual)
- Place the JSON file in the `skills/` directory of the project.
- Ensure the runtime that powers the assistant loads all JSON definitions on startup.
- Implement the handler logic in code (e.g., Python, Node.js) that reads the definition and performs the described action.

---

## Tips & Best Practices
- Keep definitions **small** and **focused** – one skill should do one thing.
- Use **clear naming** and **rich documentation** for maintainability.
- Validate input/output against the JSON schema at runtime.
- Write **unit tests** for each skill implementation.

---

## Further Reading
- [OpenAI Function Calling Guide](https://platform.openai.com/docs/guides/function-calling)
- [JSON Schema Specification](https://json-schema.org/)
- [Web Scraping with Python (BeautifulSoup)](https://www.crummy.com/software/BeautifulSoup/bs4/doc/)
- [Cheerio – Fast, flexible, and lean implementation of core jQuery for the server](https://cheerio.js.org/)

---

*Save this file as `SKILL.md` in the repository root for easy reference.*