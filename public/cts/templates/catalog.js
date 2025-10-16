import { generateId } from '../utils.js';
import { getStageDefinition } from '../engine/stages/index.js';

const templateStages = (items) => {
  return items.map((item) => {
    const def = getStageDefinition(item.type);
    const defaults = def?.defaults ? def.defaults() : {};
    return {
      id: generateId('stage'),
      type: item.type,
      name: item.name || def?.label || item.type,
      params: { ...defaults, ...(item.params || {}) },
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
  });
};

export const TEMPLATES = [
  {
    id: 'template_yc_safe',
    name: 'YC Post-Money SAFE Path',
    description: 'Founding with two co-founders, YC post-money SAFE, Series A with option pool refresh, and standard exit.',
    buildScenario() {
      const scenarioId = generateId('scenario');
      const timeline = templateStages([
        {
          type: 'FOUNDING'
        },
        {
          type: 'POST_MONEY_SAFE',
          params: {
            investorName: 'YC SAFE',
            investment: 125000,
            postMoneyValuation: 3000000,
            specialRights: { superProRata: { enabled: true, rounds: 2, amount: 375000 } }
          }
        },
        {
          type: 'PRICED_ROUND',
          params: {
            roundName: 'Series A',
            investorName: 'A16Z',
            investment: 8000000,
            postMoneyValuation: 32000000,
            optionPoolRefresh: { enabled: true, targetPercent: 0.15 }
          }
        },
        {
          type: 'EXIT',
          params: {
            salePrice: 250000000,
            mode: 'M&A'
          }
        }
      ]);
      return {
        id: scenarioId,
        name: 'YC SAFE Template',
        description: 'YC standard SAFE followed by Series A.',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        timeline
      };
    }
  },
  {
    id: 'template_bootstrap',
    name: 'SaaS Bootstrapper',
    description: 'Founding with 3 co-founders, small note, steady Series B, and IPO.',
    buildScenario() {
      const scenarioId = generateId('scenario');
      const timeline = templateStages([
        {
          type: 'FOUNDING',
          params: {
            companyName: 'Bootstrap SaaS',
            founders: [
              { id: generateId('founder'), name: 'Dev', shares: 4500000 },
              { id: generateId('founder'), name: 'Ops', shares: 3500000 },
              { id: generateId('founder'), name: 'Growth', shares: 1500000 }
            ],
            esopPercent: 0.1
          }
        },
        {
          type: 'CONVERTIBLE_NOTE',
          params: {
            investorName: 'Angel Syndicate',
            principal: 300000,
            interestRate: 0.06,
            accrualYears: 1.5,
            valuationCap: 7000000,
            discount: 0.2
          }
        },
        {
          type: 'PRICED_ROUND',
          params: {
            roundName: 'Series Seed',
            investorName: 'Seed Fund',
            investment: 1000000,
            postMoneyValuation: 8000000,
            optionPoolRefresh: { enabled: true, targetPercent: 0.12 }
          }
        },
        {
          type: 'PRICED_ROUND',
          params: {
            roundName: 'Series B',
            investorName: 'Growth Fund',
            investment: 12000000,
            postMoneyValuation: 60000000,
            optionPoolRefresh: { enabled: false }
          }
        },
        {
          type: 'EXIT',
          params: {
            mode: 'IPO',
            salePrice: 0,
            ipoPricePerShare: 35
          }
        }
      ]);
      return {
        id: scenarioId,
        name: 'Bootstrap SaaS Template',
        description: 'Convertible note, seed, growth, and IPO reference.',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        timeline
      };
    }
  }
];

export function listTemplates() {
  return TEMPLATES.map((template) => ({
    id: template.id,
    name: template.name,
    description: template.description
  }));
}

export function instantiateTemplate(templateId) {
  const template = TEMPLATES.find((entry) => entry.id === templateId);
  if (!template) return null;
  return template.buildScenario();
}
