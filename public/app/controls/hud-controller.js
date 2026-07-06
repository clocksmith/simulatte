import { UI_LABELS } from '../strings/ui-labels.js';

const STEM_LABELS = {
  drums: 'Drums',
  bass: 'Bass',
  harmony: 'Harmony',
  lead: 'Lead'
};

export class HudController {
  constructor(documentRef) {
    this.document = documentRef;

    this.statusText = this.document.getElementById('statusText');
    this.objectiveText = this.document.getElementById('objectiveText');

    this.bgmToggle = this.document.getElementById('bgmToggle');
    this.sfxToggle = this.document.getElementById('sfxToggle');

    this.interactBtn = this.document.getElementById('interactBtn');
    this.summaryBtn = this.document.getElementById('summaryBtn');

    this.regionTitle = this.document.getElementById('regionTitle');
    this.regionMeta = this.document.getElementById('regionMeta');
    this.regionSummary = this.document.getElementById('regionSummary');
    this.regionBullets = this.document.getElementById('regionBullets');
    this.openLink = this.document.getElementById('openLink');

    this.challengeTitle = this.document.getElementById('challengeTitle');
    this.challengePrompt = this.document.getElementById('challengePrompt');
    this.challengeOptions = this.document.getElementById('challengeOptions');
    this.challengeFeedback = this.document.getElementById('challengeFeedback');

    this.transport = this.document.getElementById('transport');
    this.musicStatus = this.document.getElementById('musicStatus');
    this.stemDrums = this.document.getElementById('stemDrums');
    this.stemBass = this.document.getElementById('stemBass');
    this.stemHarmony = this.document.getElementById('stemHarmony');
    this.stemLead = this.document.getElementById('stemLead');
    this.queuedText = this.document.getElementById('queuedText');

    this.feedList = this.document.getElementById('feedList');

    this.callbacks = {
      onDirection: null,
      onInteract: null,
      onSummary: null,
      onAnswer: null,
      onToggleBgm: null,
      onToggleSfx: null
    };

    this.currentChallengeKey = null;

    this._bindStaticControls();
  }

  setCallbacks(callbacks) {
    this.callbacks = {
      ...this.callbacks,
      ...callbacks
    };
  }

  _bindStaticControls() {
    for (const button of this.document.querySelectorAll('[data-dir]')) {
      button.addEventListener('pointerdown', (event) => {
        event.preventDefault();
        if (typeof this.callbacks.onDirection === 'function') {
          this.callbacks.onDirection(button.dataset.dir);
        }
      });
    }

    if (this.interactBtn) {
      this.interactBtn.addEventListener('click', () => {
        if (typeof this.callbacks.onInteract === 'function') {
          this.callbacks.onInteract();
        }
      });
    }

    if (this.summaryBtn) {
      this.summaryBtn.addEventListener('click', () => {
        if (typeof this.callbacks.onSummary === 'function') {
          this.callbacks.onSummary();
        }
      });
    }

    if (this.bgmToggle) {
      this.bgmToggle.addEventListener('click', () => {
        if (typeof this.callbacks.onToggleBgm === 'function') {
          this.callbacks.onToggleBgm();
        }
      });
    }

    if (this.sfxToggle) {
      this.sfxToggle.addEventListener('click', () => {
        if (typeof this.callbacks.onToggleSfx === 'function') {
          this.callbacks.onToggleSfx();
        }
      });
    }
  }

  render(worldView, musicView) {
    this._renderStatus(worldView.statusText, worldView.progress, worldView.objectiveText);
    this._renderRegion(worldView.focusRegion, worldView);
    this._renderChallenge(worldView.challenge);
    this._renderFeed(worldView.feed);
    this._renderMusic(musicView);

    if (this.summaryBtn) {
      this.summaryBtn.hidden = !worldView.summaryUnlocked;
      this.summaryBtn.disabled = !worldView.summaryUnlocked;
    }
  }

  _renderStatus(statusText, progress, objectiveText) {
    if (this.statusText) {
      this.statusText.textContent = `${statusText} | public ${progress.publicCompleted}/${progress.publicTotal}`;
    }
    if (this.objectiveText) {
      this.objectiveText.textContent = objectiveText || UI_LABELS.status.fallbackObjective;
    }
  }

  _renderRegion(region, worldView) {
    if (!region) {
      this.regionTitle.textContent = UI_LABELS.region.defaultTitle;
      this.regionMeta.textContent = UI_LABELS.region.defaultMeta;
      this.regionSummary.textContent = UI_LABELS.region.defaultSummary;
      this.regionBullets.innerHTML = '';
      if (this.interactBtn) {
        this.interactBtn.disabled = true;
        this.interactBtn.textContent = UI_LABELS.buttons.runInteraction;
      }
      this._setPortalDisabled(UI_LABELS.buttons.openRegionPortal);
      return;
    }

    const lockTag = region.unlocked ? UI_LABELS.region.lockOpen : UI_LABELS.region.lockLocked;
    const doneTag = region.completed ? UI_LABELS.region.stateDone : UI_LABELS.region.stateNew;
    this.regionTitle.textContent = region.name;
    this.regionMeta.textContent = `${lockTag} | ${doneTag} | ${region.kind}`;
    const selected = worldView.selectedRegionId === region.id;
    if (!region.unlocked && region.lockedReason) {
      this.regionSummary.textContent = region.lockedReason;
    } else {
      this.regionSummary.textContent = selected ? region.summary : UI_LABELS.region.hoverSummary;
    }

    this.regionBullets.innerHTML = '';
    const bullets = Array.isArray(region.bullets) ? region.bullets.slice(0, 1) : [];
    for (const bullet of bullets) {
      const item = this.document.createElement('li');
      item.textContent = bullet;
      this.regionBullets.appendChild(item);
    }

    if (this.interactBtn) {
      this.interactBtn.disabled = !region.unlocked;
      this.interactBtn.textContent = region.completed
        ? UI_LABELS.buttons.reviewInteraction
        : UI_LABELS.buttons.runInteraction;
    }

    if (region.portal && region.kind === 'public' && region.unlocked) {
      if (this.openLink) {
        this.openLink.href = region.portal;
        this.openLink.textContent = UI_LABELS.buttons.openSite;
        this.openLink.classList.remove('muted');
        this.openLink.setAttribute('aria-disabled', 'false');
        this.openLink.hidden = false;
      }
    } else if (region.kind === 'private') {
      this._setPortalDisabled(UI_LABELS.buttons.portalPrivate);
      if (this.openLink) {
        this.openLink.hidden = true;
      }
    } else if (region.unlocked && region.kind === 'public') {
      this._setPortalDisabled(UI_LABELS.buttons.portalNoLink);
      if (this.openLink) {
        this.openLink.hidden = true;
      }
    } else {
      this._setPortalDisabled(UI_LABELS.buttons.portalLocked);
      if (this.openLink) {
        this.openLink.hidden = true;
      }
    }

    if (!selected && region.unlocked && this.interactBtn) {
      this.interactBtn.textContent = region.completed
        ? UI_LABELS.buttons.reviewInteraction
        : UI_LABELS.buttons.runInteraction;
    }
  }

  _renderChallenge(challenge) {
    if (!challenge) {
      this.challengeTitle.textContent = UI_LABELS.challenge.defaultTitle;
      this.challengePrompt.textContent = UI_LABELS.challenge.defaultPrompt;
      this.challengeFeedback.textContent = '';
      this.challengeOptions.innerHTML = '';
      this.currentChallengeKey = null;
      return;
    }

    this.challengeTitle.textContent = challenge.review ? `${challenge.title} (Review)` : challenge.title;
    this.challengePrompt.textContent = challenge.prompt;
    this.challengeFeedback.textContent = challenge.feedback || '';

    const key = `${challenge.regionId}:${challenge.options.join('|')}`;
    if (key === this.currentChallengeKey) {
      return;
    }

    this.currentChallengeKey = key;
    this.challengeOptions.innerHTML = '';

    challenge.options.forEach((optionText, index) => {
      const option = this.document.createElement('button');
      option.type = 'button';
      option.className = 'btn option';
      option.textContent = `${index + 1}. ${optionText}`;
      option.addEventListener('click', () => {
        if (typeof this.callbacks.onAnswer === 'function') {
          this.callbacks.onAnswer(index);
        }
      });
      this.challengeOptions.appendChild(option);
    });
  }

  _renderMusic(musicView) {
    if (this.transport) {
      this.transport.textContent = UI_LABELS.music.transport(musicView.bar, musicView.step);
    }
    if (this.stemDrums) {
      this.stemDrums.textContent = UI_LABELS.music.level(musicView.stemLevels.drums);
    }
    if (this.stemBass) {
      this.stemBass.textContent = UI_LABELS.music.level(musicView.stemLevels.bass);
    }
    if (this.stemHarmony) {
      this.stemHarmony.textContent = UI_LABELS.music.level(musicView.stemLevels.harmony);
    }
    if (this.stemLead) {
      this.stemLead.textContent = UI_LABELS.music.level(musicView.stemLevels.lead);
    }
    if (this.queuedText) {
      this.queuedText.textContent = UI_LABELS.music.queued(musicView.queuedCount);
    }

    const activeLayers = Object.entries(musicView.stemLevels)
      .filter(([, level]) => level > 0)
      .map(([stem, level]) => `${STEM_LABELS[stem] || stem} L${level}`);

    const activeText = activeLayers.length > 0 ? activeLayers.join(' + ') : UI_LABELS.music.none;
    const queueText = UI_LABELS.music.queueSuffix(musicView.queuedCount);

    if (this.musicStatus) {
      this.musicStatus.textContent = UI_LABELS.music.status(activeText, queueText);
    }

    if (this.bgmToggle) {
      this.bgmToggle.textContent = musicView.enabled ? UI_LABELS.buttons.bgmOn : UI_LABELS.buttons.bgmOff;
    }
    if (this.sfxToggle) {
      this.sfxToggle.textContent = musicView.sfxEnabled ? UI_LABELS.buttons.sfxOn : UI_LABELS.buttons.sfxOff;
    }
  }

  _renderFeed(feedItems) {
    if (!this.feedList) {
      return;
    }

    const next = feedItems.slice(0, 3);
    this.feedList.innerHTML = '';

    for (const item of next) {
      const li = this.document.createElement('li');
      li.className = 'feed-item';
      li.innerHTML = `<strong>${item.title}</strong><span>${item.text}</span>`;
      this.feedList.appendChild(li);
    }
  }

  _setPortalDisabled(label) {
    if (!this.openLink) {
      return;
    }
    this.openLink.href = '#';
    this.openLink.textContent = label;
    this.openLink.classList.add('muted');
    this.openLink.setAttribute('aria-disabled', 'true');
  }
}
