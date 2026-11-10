---
title: "Eval: how a rebuilt website is tested · WebsiteBench"
url: https://website-bench.com/eval
updated: 2026-11-06
type: method
---

# Eval

The WebsiteBench score is a pass rate: 100 × passed tests ÷ total tests over 46,916 hidden tests in 70 tasks. A test scores 1 only if its functional checks pass and every visual checkpoint reaches the similarity threshold. The run below is Qwen 3.8 Max on Uber Eats, which passes 39 of 338 tests.

## How a rebuild is tested

- A user workflow is a sequence of actions that completes a user goal and ends in an observable result, such as browsing products, adding an item to a cart, checking out and seeing an order confirmation.
- An agent explores a locally hosted reference website through a browser: screenshots, interface state, navigation, clicks, typing and media downloads.
- It builds a full-stack site that runs offline, within 16 hours, and may revisit the reference while coding and testing.
- Hidden tests then compare rebuild and reference. Request (T1) tests check page responses and form submissions. Browser (T2) tests check interface behavior at three levels: immediate responses (L1), state changes read back (L2), and persistence, other users and recovery (L3). System (T3) tests check builds, restarts, process health and security.
- A test scores 1 only if its functional checks pass and every visual checkpoint reaches the similarity threshold. Browser workflow tests repeat a sequence of user actions and check its result. Each must pass with two independent executors, Playwright and Browser Use.
- Scores are pass rates: 100 × sum(passed tests) / sum(total tests), for Overall and for each test group. Cost, tokens and turns are per-task means.

## The Uber Eats run

- Model: Qwen 3.8 Max
- Score: 11.5% (39 of 338 hidden tests)
- Request / Browser / System tests passed: 9/50 / 17/209 / 13/79

## Tests shown on the page

- Request: GET /?view=feed answers like the reference
- Request: GET /?view=store answers like the reference
- Browser L1: Home page looks the same at 1,440 px
- Browser L1: /api/me looks the same at 1,440 px
- Browser L2: Restaurant feed: open Health from the side menu
- Browser L2: Search results: filter to Under 30 min
- Browser L2: Restaurant page: open Soups from the menu
- Browser L3: Send a sign-up code, restart the server, reopen the form
- System: compile.sh produces one executable
- System: Session cookie is host-only and scoped to its owner
