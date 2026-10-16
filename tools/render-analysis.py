#!/usr/bin/env python3
"""Render the reported early-stopping comparison with matplotlib.

This is a website visualization of the previous site's reported values,
not an image extracted from the current paper. See data/analysis.json.
"""
import json
from pathlib import Path

import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt

ROOT = Path(__file__).resolve().parents[1]
data = json.loads((ROOT / 'data/analysis.json').read_text())
analysis = data['early_stopping']
case = analysis['case']

plt.rcParams.update({'font.family': 'DejaVu Sans', 'font.size': 12,
                     'svg.fonttype': 'none', 'svg.hashsalt': 'websitebench-analysis'})
fig, ax = plt.subplots(figsize=(11.2, 3.4), facecolor='white')
fig.subplots_adjust(left=.235, right=.97, bottom=.21, top=.94)
y = [2.6, 1, 0]
values = [analysis['reported_median_hours'], case['baseline_hours'], case['review_hours']]
labels = ['Reported median run', 'Kimi K3 · Lowe’s', 'Same task + /goal']
colors = ['#7d7d76', '#262624', '#47663b']

ax.barh(y, [analysis['budget_hours']] * 3, color='#f0f0ec', height=.45, zorder=1)
ax.barh(y, values, color=colors, height=.45, zorder=3)
ax.set_yticks(y, labels)
ax.set_xlim(0, analysis['budget_hours'])
ax.set_ylim(-.55, 3.1)
ax.set_xticks([0, 4, 8, 12, 16], ['0 h', '4 h', '8 h', '12 h', '16 h'])
ax.set_xlabel('Run duration · 16-hour limit', labelpad=12)
ax.grid(axis='x', color='#dcdcd5', linewidth=.6, zorder=0)
ax.tick_params(axis='both', length=0, pad=10, colors='#62625b')
for spine in ax.spines.values():
    spine.set_visible(False)
annotations = [f"{values[0]:.2f} h", f"{values[1]:.1f} h · {case['baseline_score_percent']}% score",
               f"{values[2]:.1f} h · {case['review_score_percent']}% score"]
for row, value, text in zip(y, values, annotations):
    ax.text(value + .18, row, text, va='center', color='#262624', fontsize=12)
ax.axhline(1.9, color='#dcdcd5', linewidth=.7)
output = ROOT / analysis['figure']
fig.savefig(output, metadata={'Date': None, 'Title': 'Reported early stopping and a single stop-review case',
    'Description': 'Previous project website: median duration 3.57 of 16 hours. Kimi K3 on Lowe’s: 1.0 hours and 0% score; with /goal, 10.9 hours and 31.3% score. The intervention is a single case.'})
plt.close(fig)
output.write_text('\n'.join(line.rstrip() for line in output.read_text().splitlines()) + '\n')
print(f'Rendered {output.relative_to(ROOT)}')
