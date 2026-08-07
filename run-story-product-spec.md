# Run Story

## Open-Source Visual Run Explorer

**Status:** Product concept  
**Format:** Web-based, local-first, widget-driven  
**Primary experience:** Upload one run and understand its story from start to finish

---

## 1. Product vision

Run Story is a free, open-source web application that helps runners understand the data recorded during a run.

Most running applications display totals, charts, and raw metrics, but leave the user to interpret them. Run Story should turn the same information into a guided visual explanation:

> Upload a run, move through it, see what changed, understand why it may have changed, and learn what the metric means.

The product is not intended to be:

- a social network;
- a training-plan platform;
- a segment leaderboard;
- a replacement for the Apple Workout app;
- or a full Strava clone.

The product focuses on one thing:

> **Helping someone understand a particular run.**

---

## 2. Core product promise

For every run, the application should answer:

1. What happened?
2. Where did it happen?
3. Which metrics changed together?
4. What might explain the change?
5. What does that metric mean?

The experience should feel more like reading a visual article about the run than opening a traditional analytics dashboard.

---

## 3. Main experience

The primary screen should be a narrow, vertically centred column similar to a well-designed blog article.

The user scrolls through the run in a deliberate order:

1. Run overview
2. Run story
3. Effort
4. Pace
5. Heart rate
6. Zones
7. Cadence
8. Elevation
9. Splits
10. Key observations
11. What the runner can learn

Each section is represented by a focused widget.

The page should not present every chart at once. It should progressively reveal the run and guide the user through it.

### Suggested page structure

```text
┌──────────────────────────────────────────────┐
│                 Run title                    │
│       Date · distance · duration · pace      │
└──────────────────────────────────────────────┘

┌──────────────────────────────────────────────┐
│             Run story summary                │
│  Three important moments from the activity   │
└──────────────────────────────────────────────┘

┌──────────────────────────────────────────────┐
│          Interactive run timeline            │
│   Drag through distance or elapsed time      │
└──────────────────────────────────────────────┘

┌──────────────────────────────────────────────┐
│              Effort and zones                │
└──────────────────────────────────────────────┘

┌──────────────────────────────────────────────┐
│                Pace story                    │
└──────────────────────────────────────────────┘

┌──────────────────────────────────────────────┐
│             Heart-rate story                 │
└──────────────────────────────────────────────┘

┌──────────────────────────────────────────────┐
│               Cadence story                  │
└──────────────────────────────────────────────┘

┌──────────────────────────────────────────────┐
│              Elevation story                 │
└──────────────────────────────────────────────┘

┌──────────────────────────────────────────────┐
│                 Run splits                   │
└──────────────────────────────────────────────┘

┌──────────────────────────────────────────────┐
│             What this run teaches            │
└──────────────────────────────────────────────┘
```

---

## 4. Widget framework

Every widget should follow the same five-part structure.

### 4.1 Information

Show the important values without overwhelming the user.

Examples:

- average cadence;
- time in Zone 3;
- fastest kilometre;
- total elevation gain;
- average heart rate;
- pace consistency.

### 4.2 Visualisation

Present the metric in a form that makes its pattern understandable.

The visualisation does not always need to be a conventional chart. It may be:

- a timeline;
- bubbles;
- bands;
- blocks;
- activity squares;
- annotated splits;
- coloured route sections;
- distribution dots;
- comparison strips;
- a progression ladder;
- or a compact heatmap.

### 4.3 Observation

State what happened in clear, factual language.

Example:

> Your cadence stayed close to 162 steps per minute for the first 6 km, then fell to approximately 156.

The observation should describe the data without interpreting it too strongly.

### 4.4 Explanation

Connect the observation to the wider run.

Example:

> The cadence reduction happened during the largest climb, while heart rate increased and pace slowed. Terrain probably contributed to the change.

The explanation may include uncertainty:

- likely;
- possibly;
- may be related to;
- consistent with;
- not enough data to determine.

### 4.5 Teaching

Explain the metric and why it matters.

Example:

> Cadence is the number of steps taken per minute. It often changes with pace, gradient, fatigue, height, and running style. A higher number is not automatically better.

Teaching should remain specific to the current run rather than becoming a generic article.

---

## 5. Widget feature format

Every widget should be described and implemented using the following template:

```markdown
### Widget name

**Feature story:**  
As a runner, I want to understand [metric or event] so that I can understand what happened during my run.

**Information:**  
The important values displayed by the widget.

**Visualisation:**  
The visual method used to communicate the pattern.

**Observation:**  
The factual statement generated from the data.

**Explanation:**  
The likely context or relationship between metrics.

**Teaching:**  
The concise explanation of what the metric means.
```

---

# 6. Core widget catalogue

## 6.1 Run summary

**Feature story:**  
As a runner, I want a simple overview so that I can understand the basic shape of the run before exploring the details.

**Information:**

- distance;
- elapsed time;
- moving time;
- average pace;
- average heart rate;
- elevation gain;
- average cadence;
- calories, when available.

**Visualisation:**

- compact metric row;
- one highlighted statement describing the run;
- small run-type badge such as Easy Run, Long Run, Race, or Unknown.

**Observation:**

> This was a 10 km run completed at an average pace of 7:16 per kilometre.

**Explanation:**

> Most of the run was completed at a steady effort, with the largest change occurring during the climb after 6 km.

**Teaching:**

> Summary values provide context, but they do not explain where or why the run changed.

---

## 6.2 Run story summary

**Feature story:**  
As a runner, I want the main moments identified so that I know where to focus my attention.

**Information:**

- three to five detected moments;
- distance or elapsed-time position;
- metrics involved;
- confidence level.

**Visualisation:**

- vertical story cards;
- numbered narrative moments;
- short event labels;
- connected story line running down the page.

**Example moments:**

1. Fast opening
2. Settled rhythm
3. Main climb
4. Cadence reduction
5. Strong finish

**Observation:**

> The largest change occurred between 6.2 km and 7.1 km.

**Explanation:**

> Elevation increased while pace slowed and heart rate rose.

**Teaching:**

> Important running moments are often better understood by combining several metrics instead of looking at one value alone.

---

## 6.3 Interactive run timeline

**Feature story:**  
As a runner, I want to move through the activity so that I can inspect what was happening at any moment.

**Information:**

At the selected position:

- elapsed time;
- distance;
- pace;
- heart rate;
- zone;
- cadence;
- elevation;
- gradient;
- speed;
- moving or stopped state.

**Visualisation:**

- horizontal timeline;
- draggable cursor;
- selectable time or distance mode;
- event markers;
- metric bands rather than several full charts;
- highlighted current section;
- synchronized update of all widgets.

**Interaction:**

- drag the cursor;
- click an event;
- click a split;
- select a zone bubble;
- move between detected moments.

**Observation:**

> At 6.7 km, heart rate was 164 bpm, pace was 7:34/km, and cadence was 158 spm.

**Explanation:**

> This position was inside the main climb.

**Teaching:**

> A synchronized timeline makes relationships visible because every metric is examined at the same point in the run.

---

## 6.4 Activity strip

**Feature story:**  
As a runner, I want a compact visual overview so that I can see the character of the entire run at a glance.

**Information:**

- intensity through the activity;
- movement;
- stops;
- zones;
- elevation changes;
- notable moments.

**Visualisation:**

Use a GitHub-contribution-style sequence of small blocks.

Each block represents:

- 15 seconds;
- 30 seconds;
- 100 metres;
- or another configurable interval.

Block colour or intensity can represent:

- heart-rate zone;
- pace zone;
- gradient;
- cadence stability;
- effort;
- or detected event type.

Example:

```text
Z1  ░░
Z2  ▒▒▒▒▒▒
Z3  ▓▓▓▓▓▓▓▓▓▓
Z4  █████
Z5  ██
```

Alternative single-run strip:

```text
0 km  ▒▒▒▓▓▓▓▓▓▓▓▓██████▓▓▒▒  10 km
```

**Observation:**

> Most of the activity was completed in Zone 3, with two shorter Zone 4 sections.

**Explanation:**

> The first Zone 4 section occurred on the main climb. The second occurred during the final kilometre.

**Teaching:**

> Intensity blocks reveal how effort was distributed without requiring the runner to interpret a detailed line chart.

---

## 6.5 Heart-rate zone bubbles

**Feature story:**  
As a runner, I want to see how much of the run was spent in each zone so that I can understand the effort distribution.

**Information:**

- time in each heart-rate zone;
- percentage of run;
- number of entries into each zone;
- longest continuous period;
- first and last occurrence.

**Visualisation:**

Use proportional bubbles:

- bubble size represents time in zone;
- bubble label shows zone and duration;
- selecting a bubble highlights those sections on the main timeline;
- bubbles can be arranged from low to high intensity.

Example:

```text
      ( Zone 4 )
  (      Zone 3      )
    (   Zone 2   )
       (Zone 1)
```

Alternative:

- horizontal zone capsules;
- circular rings;
- stacked zone blocks.

**Observation:**

> You spent 46% of the run in Zone 3 and 24% in Zone 4.

**Explanation:**

> Zone 4 appeared mostly during the uphill section and final effort.

**Teaching:**

> Heart-rate zones group effort into ranges. Their meaning depends on how accurately the runner's maximum or threshold heart rate has been configured.

---

## 6.6 Zone timeline

**Feature story:**  
As a runner, I want to see when I entered and left each zone so that I can understand how effort changed through the run.

**Information:**

- zone changes;
- duration of each zone section;
- pace and terrain context;
- recovery periods.

**Visualisation:**

- coloured horizontal bands;
- one row spanning the full run;
- zone transitions shown as blocks;
- event labels above important transitions.

Example:

```text
Distance  0 ───────────────────────────────── 10 km
Zone      Z2 Z2 Z3 Z3 Z3 Z4 Z4 Z3 Z4 Z4
Terrain             flat    climb   flat
```

**Observation:**

> Heart rate entered Zone 4 at 6.4 km and remained there for 5 minutes.

**Explanation:**

> This transition aligned with the longest climb.

**Teaching:**

> Zone changes are more meaningful when examined alongside terrain, pace, heat, and workout purpose.

---

## 6.7 Heart-rate timeline

**Feature story:**  
As a runner, I want to follow heart rate through the activity so that I can understand how effort developed.

**Information:**

- heart rate at every sample;
- average;
- maximum;
- zone;
- rolling average;
- first-half versus second-half average;
- recovery after harder sections.

**Visualisation:**

- smooth timeline;
- draggable position;
- zone background bands;
- event markers;
- optional comparison with pace or elevation;
- heart-rate trail that becomes thicker where the rate changes quickly.

**Observation:**

> Heart rate rose gradually from 145 bpm to 162 bpm through the middle of the run.

**Explanation:**

> Pace remained similar, so the rise may reflect duration, heat, elevation, or accumulating fatigue.

**Teaching:**

> Heart rate is a measure of cardiovascular response, not a direct measurement of speed or performance.

---

## 6.8 Heart-rate drift

**Feature story:**  
As a runner, I want to understand whether effort increased at the same pace so that I can recognise cardiovascular drift.

**Information:**

- first-half heart rate;
- second-half heart rate;
- first-half pace;
- second-half pace;
- drift percentage;
- flat-section drift;
- confidence level.

**Visualisation:**

- two balanced comparison panels;
- start versus finish;
- arrows showing direction of change;
- compact relationship diagram rather than a full graph.

Example:

```text
First half              Second half
7:14/km · 153 bpm   →   7:17/km · 162 bpm
```

**Observation:**

> Heart rate increased by 9 bpm while pace remained nearly unchanged.

**Explanation:**

> This pattern is consistent with moderate heart-rate drift.

**Teaching:**

> Drift can be affected by duration, temperature, hydration, fatigue, terrain, and aerobic conditioning.

---

## 6.9 Pace story

**Feature story:**  
As a runner, I want to understand where pace changed so that I can distinguish intentional changes from terrain or fatigue.

**Information:**

- average pace;
- moving pace;
- fastest and slowest sustained sections;
- pace variability;
- pace by split;
- rolling pace.

**Visualisation:**

- pace ribbon;
- faster sections narrow or rise;
- slower sections widen or fall;
- event annotations;
- optional overlay with gradient.

Alternative visualisations:

- kilometre pace cards;
- pace bands;
- pace distribution dots;
- fast-to-slow colour strip.

**Observation:**

> Pace was stable between 2 km and 6 km, then slowed by approximately 28 seconds per kilometre.

**Explanation:**

> Most of the slowdown occurred during the main climb.

**Teaching:**

> Pace describes movement speed but does not account for gradient, wind, surface, or effort.

---

## 6.10 Pace zones

**Feature story:**  
As a runner, I want to see the distribution of pace so that I can understand whether the run was steady or variable.

**Information:**

- time in pace ranges;
- average pace;
- threshold pace, when configured;
- time faster or slower than target;
- longest stable section.

**Visualisation:**

- proportional bubbles;
- pace buckets;
- stacked capsules;
- GitHub-style pace activity blocks.

**Observation:**

> Most of the run was between 7:00 and 7:30 per kilometre.

**Explanation:**

> The slower pace range was concentrated on uphill sections.

**Teaching:**

> Pace zones should be based on the runner's current ability and the purpose of the run.

---

## 6.11 Pace consistency

**Feature story:**  
As a runner, I want to understand how steady my pace was so that I can evaluate pacing control.

**Information:**

- pace variance;
- median pace;
- time within a chosen range;
- number of surges;
- number of slowdowns.

**Visualisation:**

- central target band;
- dots showing each interval;
- tighter grouping indicates consistency;
- annotated outliers.

**Observation:**

> Seventy-two percent of the moving run stayed within 15 seconds per kilometre of the median pace.

**Explanation:**

> Most variation occurred on the climb rather than on flat terrain.

**Teaching:**

> Consistency is useful for steady and easy runs, but variation may be intentional during intervals, hills, or races.

---

## 6.12 Cadence story

**Feature story:**  
As a runner, I want to understand how cadence changed so that I can see how step rhythm responded to pace, terrain, and fatigue.

**Information:**

- average cadence;
- cadence range;
- cadence by split;
- stable sections;
- sudden changes;
- relationship with pace and gradient.

**Visualisation:**

- rhythm dots;
- evenly spaced dots represent stable cadence;
- compressed or expanded dots indicate change;
- cadence activity strip;
- cadence distribution bubbles;
- comparison cards for flat, uphill, and downhill sections.

Example:

```text
Stable      • • • • • • • •
Faster      •••••••••••••••
Slower      •  •  •  •  •
```

**Observation:**

> Cadence remained between 160 and 164 spm until 6.4 km, then decreased to approximately 156 spm.

**Explanation:**

> The reduction occurred during the main climb while pace slowed and heart rate rose.

**Teaching:**

> Cadence is the number of steps per minute. It naturally changes with pace, terrain, fatigue, body dimensions, and running technique.

---

## 6.13 Cadence stability

**Feature story:**  
As a runner, I want to see whether my step rhythm remained stable so that I can identify major changes in form or effort.

**Information:**

- cadence variability;
- longest stable section;
- largest change;
- cadence recovery;
- cadence by terrain.

**Visualisation:**

- stability score represented as a compact band;
- dots grouped by section;
- calm versus variable sections;
- no universal target score.

**Observation:**

> Cadence was highly stable during the middle 4 km.

**Explanation:**

> The greatest variation occurred on the climb and immediately after it.

**Teaching:**

> Stable cadence may indicate consistent rhythm, but variability is not automatically a problem when terrain or pace changes.

---

## 6.14 Elevation story

**Feature story:**  
As a runner, I want to understand the terrain so that I can see how climbs and descents affected the run.

**Information:**

- elevation gain;
- elevation loss;
- highest and lowest points;
- detected climbs;
- average and maximum gradient;
- time climbing and descending.

**Visualisation:**

- simplified elevation silhouette;
- climb cards;
- gradient blocks;
- terrain timeline;
- annotated peak and descent points.

**Observation:**

> The largest climb began at 6.2 km and gained 34 metres over 900 metres.

**Explanation:**

> Heart rate increased and pace slowed through the same section.

**Teaching:**

> A slower uphill pace can represent equal or greater effort than a faster flat pace.

---

## 6.15 Gradient zones

**Feature story:**  
As a runner, I want terrain grouped into simple categories so that I can understand where the run was flat, uphill, or downhill.

**Information:**

- distance flat;
- distance uphill;
- distance downhill;
- steepest section;
- average pace and heart rate by gradient category.

**Visualisation:**

- terrain blocks;
- uphill, flat, and downhill capsules;
- proportional bubbles;
- distance strip.

Example:

```text
Flat      █████████████
Uphill    █████
Downhill  ████
```

**Observation:**

> Twenty-one percent of the run was uphill.

**Explanation:**

> The majority of high-heart-rate time occurred in uphill sections.

**Teaching:**

> Gradient describes how quickly elevation changes across horizontal distance.

---

## 6.16 Effort versus terrain

**Feature story:**  
As a runner, I want to compare terrain with effort so that I can understand whether hills explain changes in pace and heart rate.

**Information:**

- heart rate by gradient;
- pace by gradient;
- cadence by gradient;
- climb efficiency;
- flat versus hill comparison.

**Visualisation:**

- relationship cards;
- three terrain columns: downhill, flat, uphill;
- bubbles sized by time;
- directional arrows.

**Observation:**

> Average pace was 34 seconds per kilometre slower uphill, while heart rate was 8 bpm higher.

**Explanation:**

> The pace difference is consistent with the increased effort required by the terrain.

**Teaching:**

> Comparing similar terrain is more useful than comparing every kilometre directly.

---

## 6.17 Splits

**Feature story:**  
As a runner, I want each kilometre explained so that I can understand the context behind faster and slower splits.

**Information:**

For each split:

- pace;
- elapsed time;
- heart rate;
- zone;
- cadence;
- elevation gain;
- elevation loss;
- gradient;
- notable event.

**Visualisation:**

- vertical split cards;
- small bars for pace, effort, and elevation;
- contextual labels such as Climb, Recovery, Stop, or Strong Finish;
- avoid ranking splits only from fastest to slowest.

**Observation:**

> Kilometre 7 was the slowest split.

**Explanation:**

> It also contained the largest elevation gain and highest average heart rate.

**Teaching:**

> A slower split is not necessarily a worse split when terrain and effort differ.

---

## 6.18 Fast start

**Feature story:**  
As a runner, I want to know whether I started too quickly so that I can understand how the opening affected the rest of the run.

**Information:**

- first kilometre pace;
- median pace;
- first kilometre heart rate;
- later pace;
- percentage difference.

**Visualisation:**

- opening-versus-middle comparison;
- two metric cards;
- simple direction arrow.

**Observation:**

> The first kilometre was 7% faster than the median pace.

**Explanation:**

> Pace settled after approximately 1.4 km.

**Teaching:**

> Starting quickly can increase early effort and make later pacing more difficult, depending on the workout goal.

---

## 6.19 Strong finish

**Feature story:**  
As a runner, I want to understand my final section so that I can see whether I maintained or increased effort.

**Information:**

- final kilometre pace;
- final heart rate;
- cadence change;
- comparison with middle section;
- finishing surge duration.

**Visualisation:**

- finishing arrow;
- final-section highlight;
- before-and-after cards.

**Observation:**

> Pace improved during the final 600 metres.

**Explanation:**

> Heart rate and cadence also increased, indicating an intentional finishing effort.

**Teaching:**

> A strong finish can indicate remaining capacity, but it does not automatically mean the earlier pace was too easy.

---

## 6.20 Stops and walking

**Feature story:**  
As a runner, I want stops and walking periods identified so that I can understand their effect on pace and heart rate.

**Information:**

- number of stops;
- stopped duration;
- walking sections;
- heart-rate recovery;
- moving versus elapsed pace.

**Visualisation:**

- timeline gaps;
- pause markers;
- walking blocks;
- elapsed-versus-moving comparison.

**Observation:**

> The activity included two stops totalling 1 minute 18 seconds.

**Explanation:**

> Heart rate fell by 12 bpm during the longest stop.

**Teaching:**

> Elapsed pace includes stopped time, while moving pace excludes it.

---

## 6.21 Heart-rate recovery

**Feature story:**  
As a runner, I want to see how quickly heart rate fell after harder sections so that I can understand recovery within the run.

**Information:**

- peak heart rate;
- heart rate after 30 seconds;
- heart rate after 60 seconds;
- recovery amount;
- associated pace reduction or stop.

**Visualisation:**

- descending recovery card;
- before-and-after bubbles;
- compact arrow sequence.

**Observation:**

> Heart rate fell from 169 bpm to 155 bpm within one minute after the climb.

**Explanation:**

> Pace also reduced during this period.

**Teaching:**

> Heart-rate recovery is affected by effort, movement, temperature, fitness, measurement quality, and whether the runner stopped completely.

---

## 6.22 Best sustained sections

**Feature story:**  
As a runner, I want the strongest sustained sections identified so that I can see where I performed consistently.

**Information:**

- fastest 30 seconds;
- fastest 1 minute;
- fastest 400 metres;
- fastest 1 kilometre;
- most stable sustained section;
- strongest hill section.

**Visualisation:**

- ranked cards;
- highlighted timeline regions;
- no leaderboard required.

**Observation:**

> The fastest sustained kilometre occurred between 2.1 km and 3.1 km.

**Explanation:**

> This section was mostly flat and occurred before the largest increase in heart rate.

**Teaching:**

> Rolling efforts can be more informative than fixed kilometre splits because they are not restricted by split boundaries.

---

## 6.23 Metric relationships

**Feature story:**  
As a runner, I want to see which metrics changed together so that I can understand cause and context more clearly.

**Information:**

Relationships such as:

- elevation up, pace down, heart rate up;
- pace up, cadence up, heart rate up;
- pace stable, heart rate up;
- cadence down, heart rate up;
- stop begins, heart rate recovers.

**Visualisation:**

- simple cause-and-context diagrams;
- arrows;
- linked metric cards;
- relationship sentences;
- event clusters.

Example:

```text
Elevation ↑
     ↓
Effort ↑ → Heart rate ↑
     ↓
Pace ↓ and cadence slightly ↓
```

**Observation:**

> Four metrics changed together during the main climb.

**Explanation:**

> Terrain is the strongest available explanation for the pace reduction.

**Teaching:**

> Correlation does not prove cause, but aligned metric changes can provide useful context.

---

## 6.24 Run learning summary

**Feature story:**  
As a runner, I want a concise conclusion so that I leave the page understanding the most important lessons from the run.

**Information:**

- two or three strong observations;
- one uncertainty;
- one practical focus;
- confidence level.

**Visualisation:**

- final narrative cards;
- observation, explanation, and teaching sections;
- no generic score required.

**Example:**

### What went well

Your pace and cadence remained consistent through the middle 4 km.

### What changed

The largest slowdown occurred during the main climb and was accompanied by a higher heart rate.

### What this means

The slow split is better explained by terrain than by poor pacing alone.

### What to notice next time

Compare cadence and effort on a similar climb rather than trying to maintain flat-ground pace.

---

# 7. Cross-widget interaction

All widgets should use one shared activity state.

When the user selects a point or section in one widget:

- the main timeline moves to that position;
- the relevant split is highlighted;
- the route position updates;
- the active heart-rate zone is shown;
- cadence and elevation widgets highlight the same section;
- the explanation panel updates.

Examples:

- selecting the Zone 4 bubble highlights every Zone 4 section;
- selecting kilometre 7 moves the timeline to that split;
- selecting Main Climb highlights the relevant elevation, heart rate, pace, and cadence data;
- selecting a cadence drop shows the matching gradient and heart-rate change.

---

# 8. Visual design principles

## 8.1 Minimal, not empty

Use enough information to explain the run, but avoid presenting every metric simultaneously.

## 8.2 Visual variety with consistency

Different metrics may use different visual forms, but every widget should retain the same narrative structure:

1. Information
2. Visualisation
3. Observation
4. Explanation
5. Teaching

## 8.3 Prefer meaningful visual forms

Do not default to a line chart.

Use:

- bubbles for proportional categories;
- blocks for zones and activity intensity;
- strips for time or distance sequences;
- cards for comparisons;
- dots for cadence rhythm and distributions;
- bands for thresholds and stable ranges;
- silhouettes for elevation;
- arrows for metric relationships;
- vertical narrative cards for key moments.

## 8.4 Explain before advising

The application should first describe the data, then explain the context, then teach the concept.

## 8.5 Make uncertainty visible

Use labels such as:

- Observed
- Likely explanation
- Possible explanation
- Insufficient data

## 8.6 Personal context over universal targets

Avoid statements such as:

- everyone should run at 180 spm;
- Zone 2 is always best;
- slower pace always means worse performance.

Prefer comparisons with:

- the same run;
- similar terrain;
- similar pace;
- previous activities;
- the runner's own configured zones.

## 8.7 Desktop-first, responsive web

The product should take advantage of a larger screen while remaining usable on mobile.

Desktop should provide:

- a centred reading column;
- generous spacing;
- expandable widgets;
- synchronized interactions;
- detailed explanations.

Mobile should provide:

- the same vertical story;
- reduced metric density;
- touch-friendly timeline controls;
- collapsible teaching sections.

---

# 9. Suggested first implementation

## Phase 0: One real run

Use one exported FIT or TCX activity as the reference dataset.

Implement:

- file parsing;
- normalized activity model;
- summary;
- interactive timeline;
- heart-rate zones;
- cadence;
- elevation;
- splits;
- three detected moments.

## Phase 1: Core run story

Implement the first production widgets:

1. Run summary
2. Run story summary
3. Interactive timeline
4. Activity strip
5. Heart-rate zone bubbles
6. Zone timeline
7. Heart-rate timeline
8. Pace story
9. Cadence story
10. Elevation story
11. Splits
12. Run learning summary

## Phase 2: Deeper single-run insight

Add:

- heart-rate drift;
- pace consistency;
- cadence stability;
- gradient zones;
- effort versus terrain;
- stops and walking;
- heart-rate recovery;
- best sustained sections;
- metric relationships.

## Phase 3: Multiple-run context

Later, add:

- comparisons with previous runs;
- matched routes;
- personal cadence ranges;
- pace-versus-heart-rate trends;
- best efforts;
- weekly and monthly activity heatmaps;
- training volume;
- fitness and fatigue models.

---

# 10. Data model requirements

The visualisation layer should use a source-independent activity model.

```json
{
  "activity": {
    "id": "run-001",
    "type": "running",
    "startedAt": "2026-08-07T07:30:00+10:00",
    "distanceMetres": 10020,
    "elapsedSeconds": 4360,
    "movingSeconds": 4284
  },
  "samples": [
    {
      "elapsedSeconds": 180,
      "distanceMetres": 420,
      "heartRateBpm": 146,
      "cadenceSpm": 161,
      "speedMetresPerSecond": 2.31,
      "paceSecondsPerKilometre": 433,
      "elevationMetres": 38.2,
      "gradientPercent": 1.8,
      "latitude": -37.8101,
      "longitude": 144.9602,
      "moving": true
    }
  ],
  "events": [
    {
      "type": "climb",
      "startDistanceMetres": 6200,
      "endDistanceMetres": 7100,
      "confidence": 0.91
    }
  ]
}
```

Every widget should consume this common model rather than reading FIT, TCX, Apple Health, or another source directly.

---

# 11. Widget implementation contract

Each widget should expose:

```ts
interface RunWidget {
  id: string;
  title: string;
  description: string;
  requiredMetrics: MetricType[];
  calculate(activity: Activity): WidgetResult;
  visualise(result: WidgetResult): WidgetView;
  observe(result: WidgetResult): Observation[];
  explain(result: WidgetResult, context: RunContext): Explanation[];
  teach(result: WidgetResult): TeachingPoint[];
}
```

The output should distinguish facts from interpretation:

```ts
interface Observation {
  text: string;
  evidence: EvidenceReference[];
}

interface Explanation {
  text: string;
  confidence: "high" | "medium" | "low";
  relatedMetrics: MetricType[];
}

interface TeachingPoint {
  title: string;
  text: string;
}
```

---

# 12. MVP success criteria

The first version is successful when a runner can:

1. Upload one activity file.
2. Understand the basic run summary.
3. Drag through the run timeline.
4. See heart rate, pace, cadence, elevation, and zones at the same position.
5. Identify at least three meaningful moments.
6. Understand why a slow or difficult section may have occurred.
7. Learn what at least three metrics mean.
8. Finish the page with a clearer understanding of the run than they received from a standard activity summary.

---

# 13. Product positioning

> **Run Story is an open-source visual run explorer that turns wearable activity data into a clear, interactive explanation of what happened during a run.**

Alternative:

> **Upload a run. Explore the moments. Understand the data.**

The key differentiation is not the amount of data displayed.

It is the combination of:

- thoughtful information;
- meaningful visualisation;
- factual observation;
- contextual explanation;
- and concise teaching.
