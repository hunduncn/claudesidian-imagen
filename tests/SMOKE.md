# Smoke Test — claudesidian-imagen

> Run after Phase 5 complete. Requires a real OpenAI-compatible relay account
> with sufficient credit (~¥2 should cover this run).

## Prereq

- [ ] A test Claudesidian vault with at least one .md article
- [ ] A relay platform account (gpt-best / OpenRouter / official Gemini)
- [ ] API Key copied to clipboard

## Run

1. [ ] `cd /path/to/test-vault && bun run /repo/src/server.ts`
   - Browser auto-opens to `http://127.0.0.1:5173`
   - Settings overlay visible
2. [ ] Pick "platform template", fill API key, click Save
3. [ ] Settings closes, vault tree visible
4. [ ] Click into a folder, then a .md file
5. [ ] Article preview appears
6. [ ] Click "小红书封面"
7. [ ] Click "提取 prompt" — fields appear within ~5s
8. [ ] Tweak the title field
9. [ ] Click "生成 4 张" — 2x2 grid populates within ~30s
10. [ ] Click one variant — it gets blue border
11. [ ] Click "采纳并保存" — toast shows wikilink, file exists
12. [ ] Verify file exists: `ls 05_Attachments/Organized/<article-name>/`
13. [ ] Paste wikilink into a .md note in Obsidian — image renders

## Acceptance

- [ ] Total time from launch to saved image: ≤ 3 minutes
- [ ] Total cost: ≤ ¥1.5 (check platform billing)
- [ ] At least 2 of the 4 variants are visually usable

## If anything fails

Open an issue with:
- Step number that failed
- Console output (server)
- Browser DevTools network tab screenshot
