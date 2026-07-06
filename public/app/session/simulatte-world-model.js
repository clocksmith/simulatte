import { clamp } from '../utils/math.js';
import { SYSTEM_COPY } from '../strings/system-copy.js';

function feedItem(kind, title, text) {
  return {
    id: `${kind}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    kind,
    title,
    text,
    createdAt: new Date().toISOString()
  };
}

export class WorldModel {
  constructor(config) {
    this.config = config;
    this.regionById = new Map(config.regions.map((region) => [region.id, region]));
    this.regionByTile = new Map(config.regions.map((region) => [`${region.tile.x},${region.tile.y}`, region.id]));
    this.landmarkByTile = new Map(config.landmarks.map((mark) => [`${mark.tile.x},${mark.tile.y}`, mark.id]));
    this.landmarkById = new Map(config.landmarks.map((mark) => [mark.id, mark]));

    this.cursor = { ...config.startTile };
    this.statusText = SYSTEM_COPY.status.cursorOnline;

    this.selectedRegionId = null;
    this.activeChallenge = null;
    this.challengeFeedback = '';

    this.completedRegions = new Set();
    this.unlockedRegions = new Set();
    this.discoveredLandmarks = new Set();
    this.feed = [];

    this.summaryUnlocked = false;

    this._unlockAvailableRegions();
    const startRegion = this._regionAt(this.cursor.x, this.cursor.y);
    if (startRegion && this.unlockedRegions.has(startRegion.id)) {
      this.selectedRegionId = startRegion.id;
      this.statusText = SYSTEM_COPY.status.regionLockConfirmed(startRegion.name);
    }
    this._seedInitialFeed();
  }

  _seedInitialFeed() {
    this._pushFeed(
      feedItem(
        'system',
        SYSTEM_COPY.feed.worldBoot.title,
        SYSTEM_COPY.feed.worldBoot.text
      )
    );
    this._pushFeed(
      feedItem(
        'system',
        SYSTEM_COPY.feed.companyMap.title,
        SYSTEM_COPY.feed.companyMap.text
      )
    );
    this._pushFeed(
      feedItem(
        'system',
        SYSTEM_COPY.feed.controls.title,
        SYSTEM_COPY.feed.controls.text
      )
    );
  }

  _pushFeed(item) {
    this.feed.unshift(item);
    if (this.feed.length > 32) {
      this.feed.length = 32;
    }
  }

  _unlockAvailableRegions() {
    const newlyUnlocked = [];

    for (const region of this.config.regions) {
      if (this.unlockedRegions.has(region.id)) {
        continue;
      }

      const open = region.unlockRequires.every((req) => this.completedRegions.has(req));
      if (open) {
        this.unlockedRegions.add(region.id);
        newlyUnlocked.push(region.id);
      }
    }

    return newlyUnlocked;
  }

  _allPublicRegionsCompleted() {
    const publicRegions = this.config.regions.filter((region) => region.kind === 'public');
    return publicRegions.every((region) => this.completedRegions.has(region.id));
  }

  _regionAt(x, y) {
    const key = `${x},${y}`;
    const regionId = this.regionByTile.get(key);
    return regionId ? this.regionById.get(regionId) : null;
  }

  _landmarkAt(x, y) {
    const key = `${x},${y}`;
    const landmarkId = this.landmarkByTile.get(key);
    return landmarkId ? this.landmarkById.get(landmarkId) : null;
  }

  _lockedReason(region) {
    const missing = region.unlockRequires.filter((req) => !this.completedRegions.has(req));
    if (missing.length === 0) {
      return null;
    }
    const names = missing.map((id) => this.regionById.get(id)?.name || id).join(', ');
    return SYSTEM_COPY.locks.lockedUntil(names);
  }

  _buildObjectiveText(viewState) {
    const regions = viewState.regions;
    const selected = regions.find((region) => region.id === viewState.selectedRegionId) || null;

    if (!this.completedRegions.has('origin-gate')) {
      return SYSTEM_COPY.objective.completeOriginGate;
    }

    if (selected && selected.unlocked && !selected.completed) {
      return SYSTEM_COPY.objective.runInteraction(selected.name);
    }

    const unlockedPublicPending = regions.filter((region) => region.kind === 'public' && region.unlocked && !region.completed);
    if (unlockedPublicPending.length > 0) {
      const names = unlockedPublicPending.slice(0, 2).map((region) => region.name).join(' / ');
      return SYSTEM_COPY.objective.explorePublic(names);
    }

    if (!this.summaryUnlocked) {
      return SYSTEM_COPY.objective.unlockAtlas;
    }

    const unlockedPrivatePending = regions.filter((region) => region.kind === 'private' && region.unlocked && !region.completed);
    if (unlockedPrivatePending.length > 0) {
      const names = unlockedPrivatePending.slice(0, 2).map((region) => region.name).join(' / ');
      return SYSTEM_COPY.objective.explorePrivate(names);
    }

    return SYSTEM_COPY.objective.worldMapped;
  }

  moveCursor(dx, dy) {
    return this.setCursor(this.cursor.x + dx, this.cursor.y + dy);
  }

  setCursor(x, y) {
    const nx = clamp(x, 0, this.config.map.width - 1);
    const ny = clamp(y, 0, this.config.map.height - 1);

    if (nx === this.cursor.x && ny === this.cursor.y) {
      return this._buildResult();
    }

    this.cursor = { x: nx, y: ny };

    const result = this._buildResult();
    const region = this._regionAt(nx, ny);

    if (region) {
      if (this.unlockedRegions.has(region.id)) {
        result.status = SYSTEM_COPY.status.regionInRange(region.name);
      } else {
        result.status = SYSTEM_COPY.status.regionSealed(this._lockedReason(region));
      }
    } else {
      result.status = SYSTEM_COPY.status.cursorOnline;
    }

    const mark = this._landmarkAt(nx, ny);
    if (mark && !this.discoveredLandmarks.has(mark.id)) {
      this.discoveredLandmarks.add(mark.id);
      const item = feedItem('easter', mark.title, mark.text);
      this._pushFeed(item);
      result.feed.push(item);
      result.status = SYSTEM_COPY.status.discovery(mark.title);
      result.landmarkPulse = true;
    }

    this.statusText = result.status;
    return result;
  }

  lockSelectionAtCursor() {
    const result = this._buildResult();
    const region = this._regionAt(this.cursor.x, this.cursor.y);

    if (!region) {
      result.status = SYSTEM_COPY.status.noRegionAtCursor;
      this.statusText = result.status;
      return result;
    }

    if (!this.unlockedRegions.has(region.id)) {
      result.status = SYSTEM_COPY.status.regionSealed(this._lockedReason(region));
      this.statusText = result.status;
      return result;
    }

    const changed = this.selectedRegionId !== region.id;
    this.selectedRegionId = region.id;

    if (changed) {
      this.activeChallenge = null;
      this.challengeFeedback = '';
    }

    result.status = SYSTEM_COPY.status.regionLockConfirmed(region.name);
    result.selectedChanged = changed;
    this.statusText = result.status;
    return result;
  }

  beginInteraction() {
    const result = this._buildResult();
    let region = this.getSelectedRegion();

    if (!region) {
      const cursorRegion = this.getCursorRegion();
      if (cursorRegion && this.unlockedRegions.has(cursorRegion.id)) {
        this.selectedRegionId = cursorRegion.id;
        result.selectedChanged = true;
        region = cursorRegion;
      }
    }

    if (!region) {
      result.status = SYSTEM_COPY.status.selectRegionFirst;
      this.statusText = result.status;
      return result;
    }

    if (!this.unlockedRegions.has(region.id)) {
      result.status = SYSTEM_COPY.status.regionSealed(this._lockedReason(region));
      this.statusText = result.status;
      return result;
    }

    this.activeChallenge = {
      regionId: region.id,
      review: this.completedRegions.has(region.id)
    };

    this.challengeFeedback = this.activeChallenge.review
      ? SYSTEM_COPY.interaction.reviewHint
      : SYSTEM_COPY.interaction.chooseBestAnswer;

    result.challengeOpened = true;
    result.status = SYSTEM_COPY.status.interactionReady(region.name);
    this.statusText = result.status;
    return result;
  }

  answerInteraction(optionIndex) {
    const result = this._buildResult();

    if (!this.activeChallenge) {
      result.status = SYSTEM_COPY.status.noActiveInteraction;
      this.statusText = result.status;
      return result;
    }

    const region = this.regionById.get(this.activeChallenge.regionId);
    if (!region) {
      result.status = SYSTEM_COPY.status.interactionContextMissing;
      this.statusText = result.status;
      return result;
    }

    const isCorrect = optionIndex === region.challenge.correctIndex;
    if (!isCorrect) {
      this.challengeFeedback = region.challenge.failure;
      result.status = SYSTEM_COPY.status.incorrect(region.name);
      result.challengeResolved = false;
      this.statusText = result.status;
      return result;
    }

    const wasCompleted = this.completedRegions.has(region.id);
    this.challengeFeedback = region.challenge.success;

    if (!wasCompleted) {
      this.completedRegions.add(region.id);
      result.challengeResolved = true;
      result.musicChanges = [...region.musicUnlocks];

      const rewardCard = feedItem(
        region.reward.type,
        `${region.name} unlocked`,
        `${region.reward.title}: ${region.reward.text}`
      );
      this._pushFeed(rewardCard);
      result.feed.push(rewardCard);

      const newlyUnlocked = this._unlockAvailableRegions();
      result.regionUnlocked = newlyUnlocked;
      for (const unlockedId of newlyUnlocked) {
        const unlockedRegion = this.regionById.get(unlockedId);
        if (!unlockedRegion || unlockedRegion.id === region.id) {
          continue;
        }
        const unlockFeed = feedItem(
          'unlock',
          SYSTEM_COPY.feed.routeKeyTitle,
          SYSTEM_COPY.feed.routeKeyText(unlockedRegion.name)
        );
        this._pushFeed(unlockFeed);
        result.feed.push(unlockFeed);
      }

      if (!this.summaryUnlocked && this._allPublicRegionsCompleted()) {
        this.summaryUnlocked = true;
        const summaryFeed = feedItem(
          'atlas',
          SYSTEM_COPY.feed.stackAtlasReady.title,
          SYSTEM_COPY.feed.stackAtlasReady.text
        );
        this._pushFeed(summaryFeed);
        result.feed.push(summaryFeed);
      }

      result.status = SYSTEM_COPY.status.regionComplete(region.name);
    } else {
      result.challengeResolved = true;
      result.status = SYSTEM_COPY.status.reviewComplete(region.name);
    }

    this.activeChallenge.review = true;
    this.statusText = result.status;
    return result;
  }

  clearChallenge() {
    this.activeChallenge = null;
    this.challengeFeedback = '';
  }

  getSelectedRegion() {
    return this.selectedRegionId ? this.regionById.get(this.selectedRegionId) : null;
  }

  getCursorRegion() {
    return this._regionAt(this.cursor.x, this.cursor.y);
  }

  getChallengeView() {
    if (!this.activeChallenge) {
      return null;
    }

    const region = this.regionById.get(this.activeChallenge.regionId);
    if (!region) {
      return null;
    }

    return {
      regionId: region.id,
      title: region.challenge.title,
      prompt: region.challenge.prompt,
      options: [...region.challenge.options],
      feedback: this.challengeFeedback,
      review: this.activeChallenge.review
    };
  }

  getViewModel() {
    const regions = this.config.regions.map((region) => ({
      ...region,
      unlocked: this.unlockedRegions.has(region.id),
      completed: this.completedRegions.has(region.id),
      selected: this.selectedRegionId === region.id,
      lockedReason: this._lockedReason(region)
    }));

    const regionsById = new Map(regions.map((region) => [region.id, region]));
    const cursorRegionRaw = this.getCursorRegion();
    const cursorRegion = cursorRegionRaw ? regionsById.get(cursorRegionRaw.id) || null : null;
    const selectedRegion = this.selectedRegionId ? regionsById.get(this.selectedRegionId) || null : null;
    const focusRegion = selectedRegion || cursorRegion;

    const publicTotal = regions.filter((region) => region.kind === 'public').length;
    const publicCompleted = regions.filter((region) => region.kind === 'public' && region.completed).length;

    const objectiveText = this._buildObjectiveText({
      selectedRegionId: this.selectedRegionId,
      regions
    });

    return {
      statusText: this.statusText,
      objectiveText,
      cursor: { ...this.cursor },
      selectedRegionId: this.selectedRegionId,
      focusRegion,
      challenge: this.getChallengeView(),
      summaryUnlocked: this.summaryUnlocked,
      regions,
      discoveredLandmarks: new Set(this.discoveredLandmarks),
      feed: [...this.feed],
      progress: {
        completed: this.completedRegions.size,
        total: this.config.regions.length,
        publicCompleted,
        publicTotal
      }
    };
  }

  _buildResult() {
    return {
      status: this.statusText,
      feed: [],
      musicChanges: [],
      regionUnlocked: [],
      selectedChanged: false,
      challengeOpened: false,
      challengeResolved: false,
      landmarkPulse: false
    };
  }
}
