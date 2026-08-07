import { erase, type ErasedWidget } from "./contract";
import runSummary from "./runSummary";
import storyMoments from "./storyMoments";
import timeline from "./timeline";
import routeMap from "./routeMap";
import activityStrip from "./activityStrip";
import zoneBubbles from "./zoneBubbles";
import zoneTimeline from "./zoneTimeline";
import heartRateTimeline from "./heartRateTimeline";
import heartRateDrift from "./heartRateDrift";
import heartRateRecovery from "./heartRateRecovery";
import paceStory from "./paceStory";
import paceZones from "./paceZones";
import paceConsistency from "./paceConsistency";
import fastStart from "./fastStart";
import strongFinish from "./strongFinish";
import cadenceSummary from "./cadenceSummary";
import cadenceTimeline from "./cadenceTimeline";
import cadenceDistribution from "./cadenceDistribution";
import cadenceStability from "./cadenceStability";
import cadenceBySplit from "./cadenceBySplit";
import cadenceVsPace from "./cadenceVsPace";
import cadenceVsHeartRate from "./cadenceVsHeartRate";
import cadenceVsGradient from "./cadenceVsGradient";
import cadenceDrops from "./cadenceDrops";
import cadenceRecovery from "./cadenceRecovery";
import cadenceMeaning from "./cadenceMeaning";
import powerStory from "./powerStory";
import elevationStory from "./elevationStory";
import gradientZones from "./gradientZones";
import effortVersusTerrain from "./effortVersusTerrain";
import splits from "./splits";
import stopsAndWalking from "./stopsAndWalking";
import bestSections from "./bestSections";
import metricRelationships from "./metricRelationships";
import learningSummary from "./learningSummary";
import durability from "./durability";
import powerEfficiency from "./powerEfficiency";
import mechanicalEfficiency from "./mechanicalEfficiency";
import cadenceDurability from "./cadenceDurability";
import strideDrift from "./strideDrift";
import fatigueOnset from "./fatigueOnset";
import terrainResponse from "./terrainResponse";
import rhythmStability from "./rhythmStability";
import windOnRoute from "./windOnRoute";
import whatChanged from "./whatChanged";
import dataConfidence from "./dataConfidence";

/**
 * The reading order of the page.
 *
 * The sequence is the argument: overview first, then the story and the
 * instrument to explore it with, then each metric in turn, then the sections
 * that tie metrics together, and finally what the run teaches. Widgets whose
 * metrics are missing drop out silently, so a run without cadence simply has no
 * cadence section.
 */
export const WIDGETS: ErasedWidget[] = [
  // Overview
  erase(runSummary),
  erase(storyMoments),
  erase(timeline),
  erase(routeMap),
  erase(activityStrip),

  // Effort
  erase(zoneBubbles),
  erase(zoneTimeline),
  erase(heartRateTimeline),
  erase(heartRateDrift),
  erase(heartRateRecovery),

  // Pace
  erase(paceStory),
  erase(paceZones),
  erase(paceConsistency),
  erase(fastStart),
  erase(strongFinish),

  // Cadence. The order is the argument the section makes: the figure, then its
  // shape over the run, then what it was steady against, then what it moved
  // with, then where it failed — and only at the end what any of it means.
  erase(cadenceSummary),
  erase(cadenceTimeline),
  erase(cadenceDistribution),
  erase(cadenceStability),
  erase(cadenceBySplit),
  erase(cadenceVsPace),
  erase(cadenceVsHeartRate),
  erase(cadenceVsGradient),
  erase(cadenceDrops),
  erase(cadenceRecovery),
  erase(cadenceMeaning),

  // Output
  erase(powerStory),

  // Terrain
  erase(elevationStory),
  erase(gradientZones),
  erase(effortVersusTerrain),

  // Structure
  erase(splits),
  erase(stopsAndWalking),
  erase(bestSections),

  // Synthesis
  erase(metricRelationships),
  erase(learningSummary),

  // Experimental lab. Last on purpose: these apply methods from recent running
  // research to data they were not validated on, so they follow the run's own
  // account rather than interrupting it. Every one is beta, which means the
  // whole section stays hidden until a reader asks for it. The order is the
  // argument again — what the run cost the heart, what the output cost and what
  // it bought, what happened to the stride, when it all changed, how the ground
  // was answered, what the air was doing, then the section's own conclusion —
  // and finally what the file could support at all, which is the appendix the
  // rest of it rests on.
  erase(durability),
  erase(powerEfficiency),
  erase(mechanicalEfficiency),
  erase(cadenceDurability),
  erase(strideDrift),
  erase(rhythmStability),
  erase(fatigueOnset),
  erase(terrainResponse),
  erase(windOnRoute),
  erase(whatChanged),
  erase(dataConfidence),
];
