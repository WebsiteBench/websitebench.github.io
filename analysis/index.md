---
title: "Analysis: why AI agents fall short · WebsiteBench"
url: https://website-bench.com/analysis
updated: 2026-11-06
type: analysis
---

# Analysis

The best agent, Claude Opus 5.5, passes 26.2% of 46,916 hidden tests, about one test in four. Agents fall short in three ways.

## Findings

- Underexploration: by their first code edit, agents had visited nearly every core page and started nearly every core workflow, but had followed only a few to their final result.
- A human trace, a log of browser actions without page content, raised scores.
- Failure to implement observed behavior: almost none of the checked requirements that agents had observed were implemented the way the reference behaved. In an AMC Theatres run the agent opened /movies?tab=coming-soon, but its server ignores the tab query; in a PetSmart run the category cards keep their labels but show the wrong artwork.
- Early stopping: most runs ended well before the 16-hour limit. With Claude Code's /goal hook reviewing each attempt to stop, a Kimi K3 run on Lowe's continued from 1.0 to 10.9 hours and its score rose from 0% to 31.3%.
